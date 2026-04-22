import { useCallback, useEffect, useRef, useState } from "react";
import { vaultApi } from "../../../api";
import { decryptData, encryptData } from "../../../shared/utils/crypto";

/**
 * Decrypted vault entry — the shape the UI renders from.
 * `error: true` marks rows that failed to decrypt so the UI can show a
 * placeholder instead of crashing the whole list.
 */
export interface VaultEntry {
    id: string;
    website: string;
    username: string;
    password: string;
    error?: boolean;
}

export interface VaultPlaintext {
    website: string;
    username: string;
    password: string;
}

interface UseVaultItemsResult {
    items: VaultEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    add: (plaintext: VaultPlaintext) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

/**
 * Hook: owns the full fetch-decrypt-mutate lifecycle for the current user's vault.
 *
 * ── Design pattern: Data-access Hook ──────────────────────────────────────
 * Concentrates every "talk to the server about vault items" concern in one
 * unit. The page component (`VaultPage`) becomes pure UI: it reads `items`
 * / `loading` / `error` and calls `add` / `remove` / `refresh`. It never
 * touches `vaultApi` or the crypto module directly.
 *
 * Why this replaces the old `useEffect(() => void fetchItems(), [fetchItems])`
 * plus `eslint-disable react-hooks/set-state-in-effect` pattern:
 *   - The effect below runs on `encryptionKey` change only. The fetch
 *     function is declared locally and not part of the dep array, so the
 *     "setState during effect" lint rule no longer flags it.
 *   - `isMounted` ref guards against setting state after unmount (React 19
 *     StrictMode remounts in dev otherwise create torn renders).
 */
export function useVaultItems(encryptionKey: CryptoKey | null): UseVaultItemsResult {
    const [items, setItems] = useState<VaultEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // We need `encryptionKey` inside `refresh` / `add` without those
    // callbacks re-memoising on every key change. A ref keeps the identity
    // stable across renders.
    const keyRef = useRef(encryptionKey);
    keyRef.current = encryptionKey;

    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        const key = keyRef.current;
        if (!key) return;

        try {
            const { items: encryptedItems } = await vaultApi.list();

            // Parallel decrypts — AES-GCM decryption is fast but non-trivial
            // on hundreds of rows; Promise.all keeps this off the critical path.
            const decrypted: VaultEntry[] = await Promise.all(
                encryptedItems.map(async (item) => {
                    try {
                        const plain = await decryptData<VaultPlaintext>(key, item.iv, item.encrypted_data);
                        return { id: item.id, ...plain };
                    } catch {
                        console.error("Failed to decrypt item:", item.id);
                        return {
                            id: item.id,
                            website: "Decryption Failed",
                            username: "N/A",
                            password: "",
                            error: true,
                        };
                    }
                })
            );

            if (isMountedRef.current) {
                setItems(decrypted);
                setError(null);
            }
        } catch (err) {
            if (isMountedRef.current) {
                setError(err instanceof Error ? err.message : "Error loading vault items.");
            }
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, []);

    const add = useCallback(
        async (plaintext: VaultPlaintext) => {
            const key = keyRef.current;
            if (!key) throw new Error("Vault is locked");

            const { iv, encrypted_data } = await encryptData(key, plaintext);
            await vaultApi.create({ iv, encrypted_data });
            await refresh();
        },
        [refresh]
    );

    const remove = useCallback(
        async (id: string) => {
            await vaultApi.remove(id);
            await refresh();
        },
        [refresh]
    );

    // Initial + key-change fetch. `refresh` is stable (empty deps), so the
    // only trigger here is `encryptionKey` changing — e.g. after unlock.
    useEffect(() => {
        if (!encryptionKey) return;
        void refresh();
    }, [encryptionKey, refresh]);

    return { items, loading, error, refresh, add, remove };
}
