import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UseAuth } from "../context/AuthContext";
import { deriveKeys } from "../utils/crypto";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = UseAuth();
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            //1 Fetch the user's salt from the server
            const saltRes = await fetch(import.meta.env.VITE_API_BASE_URL + `/auth/salt?email=${email}`);
            if (!saltRes.ok) {
                if (saltRes.status === 404) {
                    throw new Error("User not found. Please register first.");
                }
                throw new Error("Failed to fetch salt");
            }

            const { salt } = await saltRes.json();

            //2 Derive the Auth Hash AND the Encryption key
            const { encryptionKey, authHash } = await deriveKeys(password, salt);

            //3 Login with the Auth Hash
            const loginRes = await fetch(import.meta.env.VITE_API_BASE_URL + "/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, auth_hash: authHash })
            });

            if (loginRes.ok) {
                const { token } = await loginRes.json();

                //4 Save both the JWT and the raw encryption key in our Context
                login(token, encryptionKey);

                navigate("/vault");
            } else {
                const data = await loginRes.json();
                setError(data.error || "Invalid credentials.");
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Error during login");
        } finally {
            setLoading(false);
        }
    }

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