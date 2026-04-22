/**
 * Shared request/response DTOs.
 *
 * ── Design pattern: DTO (Data Transfer Object) ────────────────────────────
 * These types describe the wire format between browser and server. They are
 * deliberately separate from the domain types used by React components
 * (e.g. `VaultEntry` in the vault feature holds *decrypted* fields; the
 * server never sees that shape).
 *
 * Keeping DTOs in one file prevents drift — if the backend renames a field
 * we only update the type in one place.
 */

// ── auth ─────────────────────────────────────────────────────────────────

export interface SaltResponse {
    salt: string;
    iterations: number;
}

export interface RegisterBody {
    email: string;
    auth_hash: string;
    kdf_salt: string;
}

export interface LoginBody {
    email: string;
    auth_hash: string;
}

export interface AuthUserResponse {
    id: string;
    email: string;
}

// ── vault ────────────────────────────────────────────────────────────────

export interface EncryptedVaultItem {
    id: string;
    iv: string;
    encrypted_data: string;
}

export interface VaultListResponse {
    items: EncryptedVaultItem[];
    nextCursor: string | null;
}

export interface VaultCreateBody {
    iv: string;
    encrypted_data: string;
}

export interface VaultUpdateBody {
    iv?: string;
    encrypted_data?: string;
}

export interface VaultListQuery {
    after?: string;
    limit?: number;
}
