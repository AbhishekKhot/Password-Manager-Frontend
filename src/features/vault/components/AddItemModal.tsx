import { useState } from "react";
import { PasswordGenerator } from "../../../shared/components/PasswordGenerator";
import type { VaultPlaintext } from "../hooks/useVaultItems";

interface AddItemModalProps {
    open: boolean;
    onSubmit: (plaintext: VaultPlaintext) => Promise<void>;
    onCancel: () => void;
}

/**
 * Modal form for adding a new credential.
 *
 * ── Design pattern: Presentational Component with Local Form State ────────
 * Owns only the controlled-input state (website/username/password/
 * visibility/submitting). It does NOT know about encryption, the network,
 * toasts, or the vault list — it simply bubbles the plaintext up via
 * `onSubmit` and lets the container orchestrate the rest.
 *
 * Why the form state lives here and not in the container:
 *   React's controlled-input model wants local state close to the inputs.
 *   Hoisting it to the parent would cause the parent to re-render on every
 *   keystroke — harmless functionally, but wasteful (the vault list is
 *   potentially hundreds of rows). Keeping it local scopes the re-renders
 *   to the modal subtree.
 *
 * Submit UX:
 *   - The modal stays open while submitting so the user sees the spinner
 *     in context.
 *   - On success the parent closes the modal (open → false), which
 *     unmounts this component and resets its state naturally.
 */
export function AddItemModal({ open, onSubmit, onCancel }: AddItemModalProps) {
    const [website, setWebsite] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!website.trim() || !username.trim()) {
            setError("Website and username are required.");
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                website: website.trim(),
                username: username.trim(),
                password,
            });
            // Reset is handled by unmount when parent closes the modal.
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save credential");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="auth-card">
                <div className="auth-header">
                    <h3>Add New Credential</h3>
                </div>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Website / App Name</label>
                        <input
                            placeholder="e.g. Google, Github"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Username / Email</label>
                        <input
                            placeholder="Your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <div className="vault-item-secret">
                            <input
                                type={passwordVisible ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="secret-input"
                            />
                            <div className="secret-actions">
                                <button type="button" onClick={() => setPasswordVisible((v) => !v)}>
                                    {passwordVisible ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>
                    </div>
                    <PasswordGenerator onGenerate={setPassword} />
                    <div className="modal-actions">
                        <button type="button" onClick={onCancel} className="auth-button secondary">
                            Cancel
                        </button>
                        <button type="submit" disabled={submitting} className="auth-button">
                            {submitting ? "Saving..." : "Save Encrypted Credential"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
