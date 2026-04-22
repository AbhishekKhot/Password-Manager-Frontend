import { useState } from "react";
import type { VaultEntry } from "../hooks/useVaultItems";

interface VaultItemCardProps {
    item: VaultEntry;
    onCopy: (password: string) => void;
    onDelete: (id: string) => void;
}

/**
 * A single decrypted vault row.
 *
 * ── Design pattern: Presentational / "Dumb" Component ─────────────────────
 * Owns nothing but local show/hide state. All side-effects (copy to
 * clipboard, delete from server) are passed in as callbacks from the
 * container. This makes the component:
 *   - Easy to test in isolation with React Testing Library (no context, no
 *     mocks for network or clipboard).
 *   - Freely reusable — a future "favourites" page could render the same
 *     card with different `onDelete` semantics.
 *
 * The only piece of state that is genuinely local is "is this row's
 * password currently visible" — that's a pure UI toggle with no
 * implications outside the card, so it doesn't belong in the parent.
 */
export function VaultItemCard({ item, onCopy, onDelete }: VaultItemCardProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="vault-item-card">
            <div className="vault-item-info">
                <h3>{item.website}</h3>
                <p className="username">{item.username}</p>
            </div>
            <div className="vault-item-secret">
                <input
                    type={visible ? "text" : "password"}
                    value={item.password}
                    readOnly
                    className="secret-input"
                />
                <div className="secret-actions">
                    <button onClick={() => setVisible((v) => !v)} title="Show/Hide Password">
                        {visible ? "Hide" : "Show"}
                    </button>
                    <button
                        onClick={() => onCopy(item.password)}
                        title="Copy Password"
                        disabled={item.error}
                    >
                        Copy
                    </button>
                </div>
            </div>
            <button
                onClick={() => onDelete(item.id)}
                className="delete-btn"
                title="Delete Credential"
            >
                Delete
            </button>
        </div>
    );
}
