/// <reference lib="webworker" />

/**
 * Key-derivation Web Worker.
 *
 * Use case:
 *   Takes the user's master password + server-issued salt + iteration count,
 *   returns a 256-bit AES-GCM key (as raw bytes) and a SHA-256 "auth hash"
 *   that the server can verify without seeing the key.
 *
 * Why this runs in a Worker (not on the main thread):
 *   PBKDF2 with 600,000 iterations takes ~300–800 ms on a modern laptop.
 *   On the main thread that blocks rendering, input, and event handlers —
 *   the whole UI freezes until derivation finishes. Web Workers run in a
 *   separate OS thread, so the spinner keeps spinning while we compute.
 *
 * Concept primer — PBKDF2 (Password-Based Key Derivation Function 2):
 *   Takes a low-entropy password + a random salt, and runs HMAC-SHA256 in
 *   a tight loop `iterations` times. The output is a high-entropy key. The
 *   iteration count is the security knob: higher = slower for both
 *   attackers and us. OWASP 2023 recommends ≥600,000 for SHA-256.
 *
 * Concept primer — salt:
 *   Public random bytes mixed into the derivation. Prevents an attacker
 *   from precomputing a rainbow table: without salt, every user who chose
 *   "password123" would get the same derived key; with a per-user salt,
 *   even identical passwords derive to different keys.
 */

/**
 * Hex string → ArrayBuffer.
 * Local copy (not imported from utils/crypto.ts) because Workers run in an
 * isolated module graph and re-importing main-thread code would pull in
 * react/DOM references the Worker context can't satisfy.
 */
function hexToBuffer(hexString: string): ArrayBuffer {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

/** ArrayBuffer → hex string. Each byte becomes two zero-padded hex chars. */
function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Request message shape.
 * `id` is a monotonically-increasing number from the main thread so we can
 * correlate responses if multiple derivations ever overlap (today they don't,
 * but the field keeps the protocol safe to evolve).
 */
export type KdfRequest = {
    id: number;
    password: string;
    saltHex: string;
    iterations: number;
};

/** Response message shape — discriminated union on `ok`. */
export type KdfResponse =
    | { id: number; ok: true; rawKey: ArrayBuffer; authHash: string }
    | { id: number; ok: false; error: string };

/**
 * Worker message handler.
 *
 * Steps:
 *   1. Import the UTF-8 password bytes as a PBKDF2 "base key" (WebCrypto requirement).
 *   2. Derive a 256-bit AES-GCM key from it, using the salt and iterations.
 *   3. Export the raw key bytes — needed so the main thread can reimport
 *      them as a *non-extractable* CryptoKey.
 *   4. Compute SHA-256(rawKey) = authHash. This is what the server stores
 *      (after its own argon2) and what we send on login.
 *   5. Post the response, transferring ownership of the rawKey ArrayBuffer.
 *
 * Why we transfer `rawKey`:
 *   Structured-clone would deep-copy the ArrayBuffer (extra allocation
 *   while the key sits in two heaps briefly). Transferring detaches it
 *   here and re-parents it on the main thread — zero-copy, and the
 *   Worker heap no longer holds a reference.
 *
 * Why SHA-256 of the raw key, not of the password:
 *   The server must not be able to derive the AES key from what we send.
 *   SHA-256 is one-way, so `authHash` proves "I know the key" without
 *   revealing it. An attacker who steals authHash (from the network or
 *   the DB) cannot decrypt any vault row.
 */
self.addEventListener("message", async (event: MessageEvent<KdfRequest>) => {
    const { id, password, saltHex, iterations } = event.data;
    try {
        const encoder = new TextEncoder();
        // "PBKDF2" pseudo-algorithm: the password becomes a key that only
        // supports `deriveBits` / `deriveKey` — not encrypt/decrypt directly.
        const passwordKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        // deriveKey: run PBKDF2-SHA-256 `iterations` times and wrap the
        // output bytes as an AES-GCM-256 key. `true` = extractable (required
        // because we need to export and SHA-256 it below).
        const encryptionKey = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: hexToBuffer(saltHex),
                iterations,
                hash: "SHA-256",
            },
            passwordKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        const rawKey = await crypto.subtle.exportKey("raw", encryptionKey);
        // `digest("SHA-256", rawKey)` is a single-pass hash — fast, no salt.
        // Safe because rawKey is already 256 bits of random — brute force is infeasible.
        const hashBuffer = await crypto.subtle.digest("SHA-256", rawKey);

        const response: KdfResponse = {
            id,
            ok: true,
            rawKey,
            authHash: bufferToHex(hashBuffer),
        };
        // Second argument: list of transferables. The rawKey ArrayBuffer
        // is moved (zero-copy) rather than cloned.
        (self as unknown as Worker).postMessage(response, [rawKey]);
    } catch (err) {
        // Never throw out of the worker — main thread wouldn't know.
        // Serialise the error message and report via the response channel.
        const response: KdfResponse = {
            id,
            ok: false,
            error: err instanceof Error ? err.message : "KDF failed",
        };
        (self as unknown as Worker).postMessage(response);
    }
});
