import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '../../../api';
import { useAutoLock } from '../../../shared/hooks/useAutoLock';

/**
 * Auth context.
 *
 * ── Design pattern: Provider / Context ────────────────────────────────────
 * Holds "am I logged in?" and "do I have the AES key in memory?" for the
 * whole app. Consumed by ProtectedRoute and every page that needs the
 * encryption key.
 *
 * The two-flag model:
 *   - `authed` — does the server still consider this browser session valid?
 *   - `encryptionKey` — is the derived key loaded into React state?
 *
 *   Both can be true (happy path: user just logged in).
 *   `authed && !encryptionKey` means the session is alive but the key was
 *   cleared — e.g. 5-min auto-lock, or the user reloaded the page (React
 *   state is lost, but the httpOnly refresh cookie survives). We route
 *   those to /unlock instead of /login so they don't pay the full login cost.
 *   `!authed` means no valid session → /login.
 */
interface AuthContextType {
    authed: boolean;
    encryptionKey: CryptoKey | null;
    login: (key: CryptoKey) => void;
    logout: () => Promise<void>;
    clearKey: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 5 minutes of inactivity auto-locks the vault.
// Matches common password manager UX (Bitwarden default is 15 min; we
// chose shorter because the web client is more likely to be used on
// shared machines).
const AUTO_LOCK_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authed, setAuthed] = useState(false);
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    /**
     * On mount: probe the session by calling /auth/refresh. A successful
     * probe rotates the refresh token — fine, even desirable, since every
     * page load gets a fresh pair.
     */
    useEffect(() => {
        (async () => {
            const ok = await authApi.refresh();
            setAuthed(ok);
        })();
    }, []);

    const login = useCallback((key: CryptoKey) => {
        setAuthed(true);
        setEncryptionKey(key);
    }, []);

    /**
     * Drop the AES key from memory WITHOUT calling /auth/logout. Used by
     * the auto-lock pathway so the user can unlock with just their password
     * instead of going through a full re-login.
     */
    const clearKey = useCallback(() => {
        setEncryptionKey(null);
    }, []);

    const logout = useCallback(async () => {
        await authApi.logout();
        setAuthed(false);
        setEncryptionKey(null);
    }, []);

    // Auto-lock: while the user is authed, run the inactivity timer and
    // logout when it fires. The hook handles listener wiring/cleanup.
    useAutoLock(authed, AUTO_LOCK_MS, useCallback(() => { void logout(); }, [logout]));

    return (
        <AuthContext.Provider value={{ authed, encryptionKey, login, logout, clearKey }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Consumer hook. Throws when called outside the provider so wiring bugs
 * fail loudly at render time instead of surfacing later as undefined reads.
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
