// --- HELPER: Hex String convertions ---
export function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function hexToBuffer(hexString: string): ArrayBuffer {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

// --- 1. Registration: Generate a random salt ---
export function generateSalt(): string {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return bufferToHex(salt);
}

// --- 2. Key Derivation (PBKDF2) ---
// Takes the Master Password and Salt, and spits out two things:
//  - encryptionKey (used to encrypt/decrypt the vault items)
//  - authHash (SHA-256 hash sent to the server for login/registration verification)
export async function deriveKeys(password: string, saltHex: string) {
    const encoder = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );

    const saltBuffer = hexToBuffer(saltHex);

    // Derive Master Encryption Key
    const encryptionKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: 100000,
            hash: "SHA-256",
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        true, // Must be true so we can export it later to generate the auth hash
        ["encrypt", "decrypt"]
    );

    // Export Master Key, and hash it one more time to create the Auth Hash
    const rawKey = await window.crypto.subtle.exportKey("raw", encryptionKey);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", rawKey);
    const authHash = bufferToHex(hashBuffer);

    return { encryptionKey, authHash };
}

// --- 3. Encrypt an Item ---
export async function encryptData(encryptionKey: CryptoKey, data: any) {
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
