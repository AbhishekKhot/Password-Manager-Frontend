import { useState, useEffect, useCallback } from "react";
import { UseAuth } from "../context/AuthContext";
import { encryptData, decryptData } from "../utils/crypto";
import { apiFetch } from "../utils/api";
import { useToast } from "../components/toastContext";
import ConfirmDialog from "../components/ConfirmDialog";
import PasswordGenerator from "../components/PasswordGenerator";

/**
 * Decrypted vault entry — the shape we render from.
 * `error: true` is set on rows that failed to decrypt (e.g. corrupted
 * ciphertext) so the UI can show a placeholder without crashing.
 */
interface VaultEntry {
    id: string;
    website: string;
    username: string;
    password: string;
    error?: boolean;
}

/** Encrypted row exactly as it arrives from the server. */
interface EncryptedVaultItem {
    id: string;
    iv: string;
    encrypted_data: string;
}

/**
 * Clipboard auto-clear delay.
 *
 * Concept — "clipboard hygiene":
 *   macOS/Windows/Linux system clipboards persist indefinitely until the
 *   next copy. A user who copies a password and then forgets leaves that
 *   password sitting in plaintext, readable by any other app (including
 *   browser extensions). 30 s is a compromise: long enough to paste
 *   into most login forms, short enough to limit exposure.
 */
const CLIPBOARD_CLEAR_MS = 30_000;

/**
 * The main vault page.
 *
 * Responsibilities:
 *   - Fetch the encrypted list from the server.
 *   - Decrypt each row client-side using the in-memory AES key.
 *   - Let the user add / delete items; toggle password visibility;
 *     copy to clipboard with auto-clear.
 *
 * State audit:
 *   items            — decrypted list for rendering.
 *   loading          — initial fetch spinner.
 *   error            — inline banner for fetch errors.
 *   showAddForm      — modal open/close.
 *   website/username/password + addPasswordVisible — controlled inputs.
 *   addLoading       — submit spinner.
 *   visiblePasswords — per-row show/hide state.
 *   pendingDeleteId  — which row (if any) is awaiting ConfirmDialog.
 *   clipboardTimer   — timeout handle for the clipboard wipe.
 */
export default function Vault() {
    const { encryptionKey, logout } = UseAuth();
    const toast = useToast();
    const [items, setItems] = useState<VaultEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showAddForm, setShowAddForm] = useState(false);
    const [website, setWebsite] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [addPasswordVisible, setAddPasswordVisible] = useState(false);
    const [addLoading, setAddLoading] = useState(false);

    const [visiblePasswords, setVisiblePasswords] = useState<{ [key: string]: boolean }>({});
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [clipboardTimer, setClipboardTimer] = useState<number | null>(null);

    /**
     * Fetch and decrypt all vault items for the current user.
     *
     * Wrapped in `useCallback` because it's both called from an effect
     * (initial load) AND invoked imperatively after add/delete. Without
     * the memoisation, the effect's dependency array would re-run on
     * every render and refetch in a loop.
     *
     * Per-row try/catch:
     *   If ONE row is corrupted (wrong key, tampered blob) we don't want
     *   to hide the other N-1 behind a single error. We replace the bad
     *   row with a "Decryption Failed" placeholder and keep going.
     *
     * `Promise.all` over the map:
     *   Decryption is I/O-bound on the browser's crypto thread. Firing
     *   all N decrypts in parallel is measurably faster than awaiting
     *   sequentially.
     */
    const fetchItems = useCallback(async () => {
        if (!encryptionKey) return;

        try {
            const res = await apiFetch("/vault");
            if (!res.ok) throw new Error("Failed to fetch vault items");

            const { items: encryptedItems } = (await res.json()) as {
                items: EncryptedVaultItem[];
                nextCursor: string | null;
            };

            const decryptedItems: VaultEntry[] = await Promise.all(
                encryptedItems.map(async (item) => {
                    try {
                        const decrypted = await decryptData(encryptionKey, item.iv, item.encrypted_data);
                        return { id: item.id, ...decrypted } as VaultEntry;
                    } catch {
                        console.error("Failed to decrypt item:", item.id);
                        return { id: item.id, website: "Decryption Failed", username: "N/A", password: "", error: true };
                    }
                })
            );
            setItems(decryptedItems);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error loading vault items.");
        } finally {
            setLoading(false);
        }
    }, [encryptionKey]);

    /**
     * Kick off the initial fetch on mount and when fetchItems changes.
     *
     * The `eslint-disable react-hooks/set-state-in-effect` comment:
     *   fetchItems internally calls setItems. The lint rule flags this
     *   "setState in an effect" pattern because it can cause extra renders.
     *   The proper fix is to move to a data-fetching library (react-query,
     *   SWR) that owns this lifecycle. That's a known deferred refactor,
     *   documented in CLAUDE.md.
     */
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchItems();
    }, [fetchItems]);

    /**
     * Cancel any pending clipboard wipe on unmount.
     *
     * Without this, navigating away would leave a setTimeout queued to
     * call navigator.clipboard.writeText on a dead component tree —
     * annoying console warnings and (in some browsers) a security prompt.
     */
    useEffect(() => {
        return () => {
            if (clipboardTimer !== null) window.clearTimeout(clipboardTimer);
        };
    }, [clipboardTimer]);

    /** Close the add-item modal and reset its inputs. */
    const resetAddForm = () => {
        setWebsite("");
        setUsername("");
        setPassword("");
        setAddPasswordVisible(false);
        setShowAddForm(false);
    };

    /**
     * Handle submission of the add-item modal.
     *
     * Encrypt → POST → refetch.
     *
     * Why we refetch instead of appending the new item to state:
     *   Guarantees the client view matches the server view. The slight
     *   extra network cost is fine at vault sizes (tens to hundreds of
     *   rows).
     */
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!encryptionKey) return;
        if (!website.trim() || !username.trim()) {
            setError("Website and username are required.");
            return;
        }

        setAddLoading(true);
        try {
            const payload = {
                website: website.trim(),
                username: username.trim(),
                password,
            };
            // encryptData returns a fresh IV plus the ciphertext, both hex.
            const { iv, encrypted_data } = await encryptData(encryptionKey, payload);

            const res = await apiFetch("/vault", {
                method: "POST",
                body: JSON.stringify({ iv, encrypted_data }),
            });
            if (!res.ok) throw new Error("Failed to add credential.");

            resetAddForm();
            toast("success", "Credential saved");
            void fetchItems();
        } catch (err) {
            toast("error", err instanceof Error ? err.message : "Error adding item");
        } finally {
            setAddLoading(false);
        }
    };

    /**
     * Delete a single item after confirmation.
     * Called by ConfirmDialog's `onConfirm` — split from the click handler
     * so the user sees a dialog instead of the browser's native confirm().
     */
    const performDelete = async (id: string) => {
        try {
            const res = await apiFetch(`/vault/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete item.");
            toast("success", "Credential deleted");
            void fetchItems();
        } catch (err) {
            toast("error", err instanceof Error ? err.message : "Error deleting item");
        } finally {
            setPendingDeleteId(null);
        }
    };

    /**
     * Flip show/hide for a single row's password field.
     * Functional updater so rapid clicks don't stale-close over the map.
     */
    const togglePasswordVisibility = (id: string) => {
        setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    /**
     * Copy a password to the clipboard and schedule a wipe.
     *
     * Concept — user-gesture requirement:
     *   navigator.clipboard.writeText requires a user-gesture context in
     *   most browsers when writing. The INITIAL call here is triggered by
     *   a click, so it succeeds. The DELAYED wipe (`setTimeout → writeText("")`)
     *   is NOT in a gesture — most browsers still allow it when the tab is
     *   focused, but some will silently no-op. `.catch(() => undefined)`
     *   swallows that harmlessly.
     *
     * We track the latest timer in state so:
     *   - Subsequent copies cancel the previous wipe (only the most
     *     recent clipboard entry matters).
     *   - The unmount effect above can clear a pending timer when the
     *     user navigates away.
     */
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast("info", `Copied — clipboard clears in ${CLIPBOARD_CLEAR_MS / 1000}s`);

            if (clipboardTimer !== null) window.clearTimeout(clipboardTimer);
            const handle = window.setTimeout(() => {
                // Best-effort: some browsers block writes without user gesture; guard.
                navigator.clipboard.writeText("").catch(() => undefined);
                setClipboardTimer(null);
            }, CLIPBOARD_CLEAR_MS);
            setClipboardTimer(handle);
        } catch {
            toast("error", "Clipboard access denied");
        }
    };

    return (
        <div className="vault-container">
            <div className="vault-header">
                <div>
                    <h2>Your Secure Vault</h2>
                    <p>All your passwords are encrypted client-side.</p>
                </div>
                <div className="vault-actions">
                    <button onClick={() => setShowAddForm(true)} className="auth-button">Add Credential</button>
                    <button onClick={() => void logout()} className="auth-button secondary">Secure Logout</button>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {showAddForm && (
                <div className="modal-overlay">
                    <div className="auth-card">
                        <div className="auth-header">
                            <h3>Add New Credential</h3>
                        </div>
                        <form onSubmit={handleAdd} className="auth-form">
                            <div className="form-group">
                                <label>Website / App Name</label>
                                <input placeholder="e.g. Google, Github" value={website} onChange={(e) => setWebsite(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Username / Email</label>
                                <input placeholder="Your username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <div className="vault-item-secret">
                                    <input
                                        type={addPasswordVisible ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="secret-input"
                                    />
                                    <div className="secret-actions">
                                        <button type="button" onClick={() => setAddPasswordVisible((v) => !v)}>
                                            {addPasswordVisible ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <PasswordGenerator onGenerate={setPassword} />
                            <div className="modal-actions">
                                <button type="button" onClick={resetAddForm} className="auth-button secondary">Cancel</button>
                                <button type="submit" disabled={addLoading} className="auth-button">
                                    {addLoading ? "Saving..." : "Save Encrypted Credential"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={pendingDeleteId !== null}
                title="Delete credential?"
                message="This cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => { if (pendingDeleteId) void performDelete(pendingDeleteId); }}
                onCancel={() => setPendingDeleteId(null)}
            />

            <div className="vault-items-list">
                {loading ? (
                    <p className="empty-state">Decrypting your vault...</p>
                ) : items.length === 0 ? (
                    <div className="empty-state">
                        <p>Your vault is empty. Add a credential to get started!</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.id} className="vault-item-card">
                            <div className="vault-item-info">
                                <h3>{item.website}</h3>
                                <p className="username">{item.username}</p>
                            </div>
                            <div className="vault-item-secret">
                                <input
                                    type={visiblePasswords[item.id] ? "text" : "password"}
                                    value={item.password}
                                    readOnly
                                    className="secret-input"
                                />
                                <div className="secret-actions">
                                    <button onClick={() => togglePasswordVisibility(item.id)} title="Show/Hide Password">
                                        {visiblePasswords[item.id] ? "Hide" : "Show"}
                                    </button>
                                    <button onClick={() => void copyToClipboard(item.password)} title="Copy Password" disabled={item.error}>
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setPendingDeleteId(item.id)} className="delete-btn" title="Delete Credential">Delete</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
