import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthContextType {
    token: string | null;
    encryptionKey: CryptoKey | null; // Keep this strictly in memory!
    login: (token: string, key: CryptoKey) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(localStorage.getItem("jwt"));
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    const login = (newToken: string, key: CryptoKey) => {
        localStorage.setItem("jwt", newToken);
        setToken(newToken);
        setEncryptionKey(key);
    };

    const logout = () => {
        localStorage.removeItem("jwt");
        setToken(null);
        setEncryptionKey(null);
    };

    // Auto-lock feature
    useEffect(() => {
        let timeoutId: number;

        const resetTimer = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                if (token) {
                    logout();
                    alert("Your session has been auto-locked due to inactivity.");
                }
            }, TIMEOUT_MS);
        };

        const events = ['mousemove', 'keydown', 'scroll', 'click'];
        
        if (token) {
            events.forEach(event => document.addEventListener(event, resetTimer));
            resetTimer(); // Start timer initially
        }

        return () => {
            window.clearTimeout(timeoutId);
            events.forEach(event => document.removeEventListener(event, resetTimer));
        };
    }, [token]);

    return (
        <AuthContext.Provider value={{ token, encryptionKey, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function UseAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
