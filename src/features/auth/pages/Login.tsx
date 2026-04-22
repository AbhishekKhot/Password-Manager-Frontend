import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { deriveKeys } from "../../../shared/utils/crypto";
import { authApi, ApiError } from "../../../api";

/**
 * Login page.
 *
 * Flow (why it's in this order):
 *   1. GET /auth/salt?email=... — the server returns this user's salt and
 *      iteration count. We need both to re-derive the exact same AES key
 *      they had at registration.
 *   2. deriveKeys(password, salt, iterations) — runs PBKDF2 in a Web Worker.
 *      Takes 300-800 ms; that's why the button flips to "Authenticating...".
 *   3. POST /auth/login with `{ email, auth_hash }` — auth_hash is the
 *      SHA-256 of the derived key; the server argon2.verify's it.
 *   4. On 200: stash the encryptionKey in React state (via login()) and
 *      navigate to /vault. Cookies are already set by the server response.
 *
 * Why the KDF step is between two network calls (not parallel):
 *   We can't derive until we know the salt, and we shouldn't login until
 *   we know we have the right authHash. The sequential flow is forced by
 *   the zero-knowledge protocol, not by ergonomics.
 *
 * Why we surface "User not found" as a distinct message:
 *   Privacy-vs-UX trade-off. A password manager is different from a social
 *   network: the user *already owns* the account, so telling them "no such
 *   email" is helpful, not an info leak. The rate limit on /auth/salt
 *   handles the enumeration risk.
 */
export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    /**
     * Form submit handler.
     *
     * Error-handling strategy:
     *   - Network / unexpected errors → caught and rendered to the error banner.
     *   - 404 on /auth/salt → specific "User not found" message (registration hint).
     *   - 401 on /auth/login → server's message (typically "Invalid credentials").
     *   - `finally { setLoading(false) }` guarantees the button re-enables
     *     even if a step throws.
     */
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            let salt: string;
            let iterations: number;
            try {
                ({ salt, iterations } = await authApi.getSalt(email));
            } catch (err) {
                if (err instanceof ApiError && err.is(404)) {
                    throw new Error("User not found. Please register first.");
                }
                throw new Error("Failed to fetch salt");
            }

            const { encryptionKey, authHash } = await deriveKeys(password, salt, iterations);

            try {
                await authApi.login({ email, auth_hash: authHash });
                login(encryptionKey);
                navigate("/vault");
            } catch (err) {
                // ApiError.message already carries the server's `{ error }` payload.
                if (err instanceof ApiError) {
                    setError(err.message || "Invalid credentials.");
                } else {
                    throw err;
                }
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Error during login");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-card">
            <div className="auth-header">
                <h2>Welcome Back</h2>
                <p>Enter your credentials to access your vault</p>
            </div>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleLogin} className="auth-form">
                <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Master Password</label>
                    <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="auth-button">
                    {loading ? "Authenticating..." : "Login to Vault"}
                </button>
            </form>

            <div className="auth-footer">
                Don't have an account? <Link to="/register">Register here</Link>
            </div>
        </div>
    );
}
