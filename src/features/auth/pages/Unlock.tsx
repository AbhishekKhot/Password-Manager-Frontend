import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { deriveKeys } from "../../../shared/utils/crypto";
import { authApi } from "../../../api";

/**
 * Unlock page.
 *
 * Use case:
 *   Reached via ProtectedRoute when `authed === true` but `encryptionKey`
 *   is null. Two scenarios lead here:
 *     (a) Auto-lock fired after 5 min of inactivity — session still alive,
 *         but the key was cleared from memory.
 *     (b) The user reloaded the tab. React state evaporates on reload;
 *         cookies don't. So we have a session but no key.
 *
 * Why /unlock differs from /login:
 *   - No call to /auth/login. We already have a valid JWT cookie (or the
 *     refresh cookie that apiFetch will swap for one on the next 401).
 *   - We skip issuing new tokens, which would revoke the user's other
 *     active sessions (on other devices) — hostile UX for a "I just need
 *     to re-enter my password" flow.
 *
 * The password is still required because the AES key is derived from it;
 * there is no way to reconstruct the key without the master password.
 */
export default function Unlock() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { login, logout } = useAuth();
    const navigate = useNavigate();

    /**
     * Unlock submit handler.
     *
     * Same KDF steps as Login, but WITHOUT hitting /auth/login. On success
     * we just call `login(encryptionKey)` to write the key into context,
     * which satisfies ProtectedRoute and renders /vault.
     */
    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            let salt: string;
            let iterations: number;
            try {
                ({ salt, iterations } = await authApi.getSalt(email));
            } catch {
                throw new Error("Could not fetch salt for this account");
            }

            const { encryptionKey } = await deriveKeys(password, salt, iterations);
            login(encryptionKey);
            navigate("/vault");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to unlock");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-card">
            <div className="auth-header">
                <h2>Unlock your vault</h2>
                <p>Your session is active but the vault was locked. Re-enter your master password.</p>
            </div>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleUnlock} className="auth-form">
                <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Master Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="modal-actions">
                    {/* Escape hatch: user at a shared computer can log out fully instead of unlocking. */}
                    <button type="button" className="auth-button secondary" onClick={() => { logout(); navigate("/login"); }}>
                        Sign out instead
                    </button>
                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? "Unlocking..." : "Unlock"}
                    </button>
                </div>
            </form>
        </div>
    );
}
