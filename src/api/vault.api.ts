import { http } from "./client";
import type {
    EncryptedVaultItem,
    VaultCreateBody,
    VaultListQuery,
    VaultListResponse,
    VaultUpdateBody,
} from "./types";

/**
 * Vault API client — opaque CRUD over encrypted blobs.
 *
 * ── Design pattern: Repository / Gateway ──────────────────────────────────
 * Same rationale as `AuthApi` — one class per resource, one method per
 * endpoint. The server is a dumb blob store; this class surfaces that
 * contract without any client-side crypto leaking in (encryption lives in
 * the `useVaultItems` hook).
 *
 * Zero-knowledge note:
 *   All request/response bodies are `{ iv, encrypted_data }`. Nothing here
 *   deals with plaintext website/username/password — if you ever find
 *   yourself wanting to add a `search(query)` method, stop: the server
 *   can't read the blobs, so any search must happen client-side.
 */
export class VaultApi {
    /**
     * GET /vault — cursor-paginated list of encrypted items for the user.
     *
     * `after` is the id of the last item from the previous page; the server
     * returns up to `limit` rows sorted by id, plus a `nextCursor` for the
     * next page. When `nextCursor === null` the list is exhausted.
     */
    list(query: VaultListQuery = {}): Promise<VaultListResponse> {
        const params = new URLSearchParams();
        if (query.after) params.set("after", query.after);
        if (query.limit !== undefined) params.set("limit", String(query.limit));
        const qs = params.toString();
        return http.get<VaultListResponse>(qs ? `/vault?${qs}` : "/vault");
    }

    /** POST /vault — store a new encrypted blob. */
    create(body: VaultCreateBody): Promise<EncryptedVaultItem> {
        return http.post<EncryptedVaultItem>("/vault", body);
    }

    /** PATCH /vault/:id — replace ciphertext (and optionally the IV). */
    update(id: string, body: VaultUpdateBody): Promise<EncryptedVaultItem> {
        return http.patch<EncryptedVaultItem>(`/vault/${id}`, body);
    }

    /** DELETE /vault/:id — remove a blob. */
    remove(id: string): Promise<void> {
        return http.delete<void>(`/vault/${id}`);
    }
}

export const vaultApi = new VaultApi();
