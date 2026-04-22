import { useState } from "react";
import { useAuth } from "../../auth/context/AuthContext";
import { useToast } from "../../../shared/components/toastContext";
import ConfirmDialog from "../../../shared/components/ConfirmDialog";
import { useVaultItems } from "../hooks/useVaultItems";
import { useClipboardWithClear } from "../../../shared/hooks/useClipboardWithClear";
import { VaultItemCard } from "../components/VaultItemCard";
import { AddItemModal } from "../components/AddItemModal";

/**
 * Clipboard auto-clear delay.
 *
 * Concept — "clipboard hygiene":
 *   OS clipboards persist until the next copy. A user who copies a password
 *   and forgets leaves plaintext readable by any other app (including
 *   browser extensions). 30 s is the compromise between paste-friendliness
 *   and exposure window.
 */
const CLIPBOARD_CLEAR_MS = 30_000;

/**
 * Vault page — container component.
 *
 * ── Design pattern: Container / Presentational split ──────────────────────
 * This file is the "smart" container. It owns no DOM — only orchestration:
 *   - `useAuth()`                   — identity + logout.
 *   - `useVaultItems(encryptionKey)` — fetch/decrypt/add/remove lifecycle.
 *   - `useClipboardWithClear(ms)`   — copy-with-auto-wipe.
 *   - Local UI state:
 *       showAddForm       — is the add-modal open?
 *       pendingDeleteId   — which row is awaiting delete confirmation?
 *
 * Every piece of rendering is delegated to a dumb component
 * (`VaultItemCard`, `AddItemModal`, `ConfirmDialog`) that receives plain
 * data plus callbacks. That split keeps the complex effects out of the
 * render tree and makes the presentational pieces trivially testable.
 */
export default function Vault() {
    const { encryptionKey, logout } = useAuth();
    const toast = useToast();
    const { items, loading, error, add, remove } = useVaultItems(encryptionKey);
    const { copy } = useClipboardWithClear(CLIPBOARD_CLEAR_MS);

    const [showAddForm, setShowAddForm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const handleCopy = async (password: string) => {
        const ok = await copy(password);
        if (ok) {
            toast("info", `Copied — clipboard clears in ${CLIPBOARD_CLEAR_MS / 1000}s`);
        } else {
            toast("error", "Clipboard access denied");
        }
    };

    const handleAdd = async (plaintext: { website: string; username: string; password: string }) => {
        try {
            await add(plaintext);
            toast("success", "Credential saved");
            setShowAddForm(false);
        } catch (err) {
            toast("error", err instanceof Error ? err.message : "Error adding item");
            throw err;
        }
    };

    const handleConfirmDelete = async () => {
        if (!pendingDeleteId) return;
        try {
            await remove(pendingDeleteId);
            toast("success", "Credential deleted");
        } catch (err) {
            toast("error", err instanceof Error ? err.message : "Error deleting item");
        } finally {
            setPendingDeleteId(null);
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

            <AddItemModal
                open={showAddForm}
                onSubmit={handleAdd}
                onCancel={() => setShowAddForm(false)}
            />

            <ConfirmDialog
                open={pendingDeleteId !== null}
                title="Delete credential?"
                message="This cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => { void handleConfirmDelete(); }}
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
                        <VaultItemCard
                            key={item.id}
                            item={item}
                            onCopy={(pwd) => void handleCopy(pwd)}
                            onDelete={(id) => setPendingDeleteId(id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
