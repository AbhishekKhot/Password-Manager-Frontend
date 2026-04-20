import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { deriveKeys, generateSalt } from "../utils/crypto";
import { validateMasterPassword } from "../utils/passwordPolicy";
import { apiFetch } from "../utils/api";
import { useToast } from "../components/toastContext";

/**
 * Default PBKDF2 iteration count for newly-registered users.
 *
 * The server also accepts the registration regardless of client-sent value
 * and stores whatever iteration count is sent. Keeping this constant here
 * (rather than reading it from config) means we know exactly what a new
 * account was derived with, even if the server defaults change later.
 */
const DEFAULT_PBKDF2_ITERATIONS = 600_000;

/**
 * Registration page.
 *
 * Flow:
 *   1. validateMasterPassword — client-side policy check BEFORE running
 *      PBKDF2. No point spending 600 ms deriving a key if we're about to
 *      reject "password123".
 *   2. generateSalt() — 16 bytes of CSPRNG output.
 *   3. deriveKeys(password, salt, iterations) — produces the AES key AND
 *      the authHash. We discard the AES key here; the user will re-derive
 *      it at first login. (We *could* keep it and skip /login, but
 *      registration-to-vault redirects often fail on email verification
 *      flows; saving one login keeps the UX uniform.)
 *   4. POST /auth/register with { email, auth_hash, kdf_salt }.
 *   5. Toast "Account created" and navigate to /login.
 *
 * What the server stores:
 *   - email, kdf_salt (public), kdf_iterations (public).
 *   - argon2id(auth_hash) — the proof material. The server cannot derive
 *     the AES key from any stored column.
 */
export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();

    /**
     * Registration submit handler.
     *
     * Why the early policy return:
     *   Gives immediate feedback ("password too common") without waiting
     *   on the network or the KDF. Leaves `loading` false so the button
     *   stays clickable for correction.
     */
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const policyError = validateMasterPassword(password);
        if (policyError) {
            setError(policyError);
            return;
        }

        setLoading(true);

        try {
            const salt = generateSalt();
            const { authHash } = await deriveKeys(password, salt, DEFAULT_PBKDF2_ITERATIONS);

            const res = await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, auth_hash: authHash, kdf_salt: salt }),
            });

            if (res.ok) {
                // Toast instead of inline success because we navigate away immediately.
                toast("success", "Account created. Please log in.");
                navigate("/login");
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Registration failed");
            }
        } catch (err) {
            console.error(err);
            setError("Error during registration. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-card">
            <div className="auth-header">
                <h2>Create Account</h2>
                <p>Set up your secure password manager vault</p>
            </div>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Master Password</label>
                    <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="auth-button">
                    {loading ? "Creating Vault..." : "Register"}
                </button>
            </form>

            <div className="auth-footer">
                Already have an account? <Link to="/login">Login here</Link>
            </div>
        </div>
    );
}
