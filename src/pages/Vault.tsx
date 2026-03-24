import { useState, useEffect } from "react";
import { UseAuth } from "../context/AuthContext";
import { encryptData, decryptData } from "../utils/crypto";
import PasswordGenerator from "../components/PasswordGenerator";

export default function Vault() {
    const { token, encryptionKey, logout } = UseAuth();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    // Add form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [website, setWebsite] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [addLoading, setAddLoading] = useState(false);

    // Visibility state for passwords
    const [visiblePasswords, setVisiblePasswords] = useState<{[key: string]: boolean}>({});

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        if (!encryptionKey || !token) return;
        
        try {
            const res = await fetch(import.meta.env.VITE_API_BASE_URL + "/vault", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error("Failed to fetch vault items");
            
            const encryptedItems = await res.json();
            
            // Decrypt each item
            const decryptedItems = await Promise.all(
                encryptedItems.map(async (item: any) => {
                    try {
                        const decrypted = await decryptData(encryptionKey, item.iv, item.encrypted_data);
                        return { id: item.id, ...decrypted };
                    } catch (err) {
                        console.error("Failed to decrypt item:", item.id);
                        return { id: item.id, website: "Decryption Failed", username: "N/A", password: "N/A", error: true };
                    }
                })
            );
            
            setItems(decryptedItems);
        } catch (err: any) {
            setError(err.message || "Error loading vault items.");
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!encryptionKey || !token) return;
        
        setAddLoading(true);
        try {
            // Encrypt the payload
            const payload = { website, username, password };
            const { iv, encrypted_data } = await encryptData(encryptionKey, payload);
            
            const res = await fetch(import.meta.env.VITE_API_BASE_URL + "/vault", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` 
                },
                body: JSON.stringify({ iv, encrypted_data })
            });

            if (!res.ok) throw new Error("Failed to add credential.");
            
            // Reset form and refresh list
            setWebsite("");
            setUsername("");
            setPassword("");
            setShowAddForm(false);
            fetchItems();
        } catch (err: any) {
            alert(err.message || "Error adding item");
        } finally {
            setAddLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!token) return;
        if (!confirm("Are you sure you want to delete this credential?")) return;

        try {
            const res = await fetch(import.meta.env.VITE_API_BASE_URL + `/vault/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to delete item.");
            fetchItems();
        } catch (err: any) {
            alert(err.message || "Error deleting item");
        }
    };

    const togglePasswordVisibility = (id: string) => {
        setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
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
                    <button onClick={logout} className="auth-button secondary">Secure Logout</button>
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
                                <input type="text" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <PasswordGenerator onGenerate={setPassword} />
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowAddForm(false)} className="auth-button secondary">Cancel</button>
                                <button type="submit" disabled={addLoading} className="auth-button">
                                    {addLoading ? "Saving..." : "Save Encrypted Credential"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="vault-items-list">
                {loading ? (
                    <p className="empty-state">Decrypting your vault...</p>
                ) : items.length === 0 ? (
                    <div className="empty-state">
                        <p>Your vault is empty. Add a credential to get started!</p>
                    </div>
                ) : (
                    items.map(item => (
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
                                    <button onClick={() => copyToClipboard(item.password)} title="Copy Password">Copy</button>
                                </div>
                            </div>
                            <button onClick={() => handleDelete(item.id)} className="delete-btn" title="Delete Credential">Delete</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
