import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { deriveKeys, generateSalt } from "../utils/crypto";

export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        
        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }

        setLoading(true);

        try {
            const salt = generateSalt();
            const { authHash } = await deriveKeys(password, salt);

            const res = await fetch(import.meta.env.VITE_API_BASE_URL + "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, auth_hash: authHash, kdf_salt: salt })
            });

            if (res.ok) {
                alert("Registered successfully! Please login with your new credentials.");
                navigate("/login")
            }
            else {
                const data = await res.json();
                setError(data.error || "Registration failed");
            }
        } catch (err: any) {
            console.error(err);
            setError("Error during registration. Please try again.");
        } finally {
            setLoading(false);
        }
    }

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
    )
}