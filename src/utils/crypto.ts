import type { KdfRequest, KdfResponse } from "../workers/kdf.worker";

/**
 * Client-side crypto module.
 *
 * Use case:
 *   Wraps Web Crypto API + the KDF Worker into a small app-facing surface:
 *     - generateSalt   (registration)
 *     - deriveKeys     (registration, login, unlock)
 *     - encryptData    (add / update vault item)
 *     - decryptData    (render vault item)
 *
 * Everything in this file runs in the browser. The server never receives
 * any of these values in their plaintext form — that's the whole point of
 * the zero-knowledge design.
 */

// --- HELPER: Hex String convertions ---

/**
 * Convert bytes → hex string.
 *
 * Why we move on the wire as hex (not base64 or raw binary):
 *   - JSON payloads, no binary-safety concerns across HTTP layers.
 *   - Trivially regex-validatable on the server (`/^[0-9a-f]+$/`).
 *   - Size overhead (2×) is fine at our payload sizes.
 *
 * Accepts both ArrayBuffer and Uint8Array because different Web Crypto
 * APIs return different shapes (exportKey → ArrayBuffer, getRandomValues
 * fills a typed array).
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Convert hex string → ArrayBuffer.
 * The inverse of bufferToHex. Used when decrypting a vault item fetched
 * from the server (both `iv` and `encrypted_data` arrive as hex).
 */
export function hexToBuffer(hexString: string): ArrayBuffer {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

// --- 1. Registration: Generate a random salt ---

/**
 * Generate a fresh 16-byte salt for a new account.
 *
 * Concept — CSPRNG:
 *   `crypto.getRandomValues` is the browser's cryptographically-secure
 *   random source, backed by the OS entropy pool. Do NOT substitute
 *   `Math.random()` — it's a PRNG, not cryptographically secure, and
 *   collisions would let attackers precompute derived keys.
 *
 * Size choice — 16 bytes (128 bits):
 *   128 bits of entropy makes collisions statistically impossible across
 *   any realistic user base. Longer salts wouldn't hurt, but wouldn't help either.
 */
export function generateSalt(): string {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return bufferToHex(salt);
}

// --- 2. Key Derivation (PBKDF2, offloaded to a Web Worker) ---
// Running 600k PBKDF2 iterations on the main thread would freeze the UI for
// hundreds of ms. The worker returns the raw key bytes, which we re-import as
// a non-extractable CryptoKey in the main thread for encrypt/decrypt.

/** Monotonic request counter — correlates worker responses with calls. */
let kdfReqId = 0;

/**
 * Derive the AES-GCM key and the auth hash from a master password.
 *
 * Flow:
 *   1. Spawn a Worker, post { password, saltHex, iterations }.
 *   2. Worker runs PBKDF2 in its own thread, returns rawKey + authHash.
 *   3. We re-import rawKey on the main thread as *non-extractable* —
 *      after this, even `exportKey` will fail. That way a runtime
 *      compromise (XSS) cannot exfiltrate the key material; it can only
 *      ask the browser to encrypt/decrypt with it.
 *   4. Return { encryptionKey, authHash } to the caller. The caller
 *      sends authHash to the server for login; keeps encryptionKey in
 *      React state only (never localStorage, never cookies).
 *
 * Why we terminate the worker in `finally`:
 *   One-shot derivation: we spawn the worker per call. Leaving it alive
 *   would hold its heap (including the password string) around until GC.
 *   Terminating tells the browser to free the thread immediately.
 */
export async function deriveKeys(
    password: string,
    saltHex: string,
    iterations: number
): Promise<{ encryptionKey: CryptoKey; authHash: string }> {
    const worker = new Worker(
        new URL("../workers/kdf.worker.ts", import.meta.url),
        { type: "module" }
    );

    const id = ++kdfReqId;

    try {
        const { rawKey, authHash } = await new Promise<{ rawKey: ArrayBuffer; authHash: string }>((resolve, reject) => {
            worker.addEventListener("message", (event: MessageEvent<KdfResponse>) => {
                // Ignore stray messages from a previous derivation — `id` filters them out.
                if (event.data.id !== id) return;
                if (event.data.ok) {
                    resolve({ rawKey: event.data.rawKey, authHash: event.data.authHash });
                } else {
                    reject(new Error(event.data.error));
                }
            });
            worker.addEventListener("error", (e) => reject(new Error(e.message)));
            const req: KdfRequest = { id, password, saltHex, iterations };
            worker.postMessage(req);
        });

        // `extractable: false` — after this point the browser will refuse
        // any attempt to read the raw bytes back out. The key lives only
        // as a handle usable for encrypt/decrypt. This limits the blast
        // radius of an XSS vulnerability.
        const encryptionKey = await window.crypto.subtle.importKey(
            "raw",
            rawKey,
            { name: "AES-GCM", length: 256 },
            false, // non-extractable once back on the main thread
            ["encrypt", "decrypt"]
        );

        return { encryptionKey, authHash };
    } finally {
        worker.terminate();
    }
}

// --- 3. Encrypt an Item ---

/**
 * Encrypt a JSON-serialisable value under the user's master key.
 *
 * Why a fresh IV per call (and why it's 12 bytes):
 *   AES-GCM's security proof breaks catastrophically if the (key, IV)
 *   pair is ever reused — reuse leaks the XOR of the plaintexts to an
 *   attacker who has both ciphertexts. So we `getRandomValues(12)`
 *   every single call, giving us a new IV. 12 bytes is the NIST-
 *   recommended size for GCM (shorter gets padded; longer loses
 *   efficiency).
 *
 * Why we stringify the data:
 *   AES operates on byte strings. JSON is our canonical serialisation
 *   so {website, username, password} survives the round trip.
 *
 * Output shape:
 *   { iv: hex(12 bytes), encrypted_data: hex(ciphertext + 16-byte auth tag) }.
 *   The auth tag is the "G" in GCM — it detects tampering. Any modification
 *   to the ciphertext causes decryptData to throw.
 */
export async function encryptData(encryptionKey: CryptoKey, data: unknown) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        encryptionKey,
        encoder.encode(JSON.stringify(data))
    );

    return {
        iv: bufferToHex(iv),
        encrypted_data: bufferToHex(ciphertextBuffer)
    };
}

// --- 4. Decrypt an Item ---

/**
 * Decrypt a vault item back to its original JSON value.
 *
 * Throws if:
 *   - The IV or ciphertext aren't valid hex.
 *   - The ciphertext was tampered with (GCM auth-tag mismatch).
 *   - The key is wrong (e.g. user entered the wrong master password).
 *
 * The caller (Vault.tsx) catches the throw and renders the row as
 * "Decryption Failed" so one corrupt item doesn't break the whole list.
 */
export async function decryptData(encryptionKey: CryptoKey, ivHex: string, encryptedHex: string) {
    const ivBuffer = hexToBuffer(ivHex);
    const ciphertextBuffer = hexToBuffer(encryptedHex);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        encryptionKey,
        ciphertextBuffer
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBuffer));
}
