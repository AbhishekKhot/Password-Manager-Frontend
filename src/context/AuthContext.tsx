import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '../utils/api';

/**
 * Auth context.
 *
 * Use case:
 *   Holds "am I logged in?" and "do I have the AES key in memory?" for the
 *   whole app. Consumed by ProtectedRoute (to redirect unauth'd users) and
 *   every page that needs to call encrypt/decrypt.
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
const TIMEOUT_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authed, setAuthed] = useState(false);
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    /**
     * On mount: probe the session by calling /auth/refresh.
     *
     * Why /auth/refresh and not /auth/me or similar:
     *   We don't have a /auth/me endpoint — and adding one just for this
     *   would mean another route to rate-limit. /auth/refresh already
     *   returns 200 iff the refresh cookie is valid, which is exactly the
     *   question we want to answer at mount ("is my session alive?").
     *
     * Side-effect: a successful probe rotates the refresh token. That's
     * fine — even desirable — since every page load gets a fresh token.
     */
    useEffect(() => {
        (async () => {
            const res = await apiFetch("/auth/refresh", { method: "POST" });
            setAuthed(res.ok);
        })();
    }, []);

    /**
     * Called by Login/Unlock pages after they've derived the AES key.
     * Wrapped in `useCallback` with empty deps so the reference is stable
     * across renders — context consumers that memoise on `login` won't
     * re-run needlessly.
     */
    const login = useCallback((key: CryptoKey) => {
        setAuthed(true);
        setEncryptionKey(key);
    }, []);

    /**
     * Drop the AES key from memory WITHOUT calling /auth/logout.
     *
     * Use case:
     *   Auto-lock after inactivity. The server session is still valid
     *   (refresh cookie is fine), but we remove the key so subsequent
     *   vault renders fail closed and ProtectedRoute bounces to /unlock.
     *   This keeps a user at a coffee shop from having their vault
     *   readable if they walk away from the laptop.
     */
    const clearKey = useCallback(() => {
        setEncryptionKey(null);
    }, []);

    /**
     * Full logout: revoke the refresh token server-side AND clear state.
     *
     * `.catch(() => undefined)` — if the network call fails, we still want
     * local state cleared. A user who clicks "logout" expects to be logged
     * out of this tab even if their Wi-Fi is down.
     */
    const logout = useCallback(async () => {
        await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
        setAuthed(false);
        setEncryptionKey(null);
    }, []);

    /**
     * Auto-lock effect.
     *
     * Listens for common user-activity events. Each event resets a
     * setTimeout; if no event fires for TIMEOUT_MS, the callback runs
     * `logout()` (which also removes the key).
     *
     * Why not use `Page Visibility API`:
     *   We want to detect *user* inactivity, not tab-backgrounded. A user
     *   could be actively reading the vault in a foreground tab without
     *   moving the mouse — that would be wrongly treated as "idle" if we
     *   used visibility. Pointer + keyboard + scroll is a truer proxy.
     *
     * Cleanup function: removes listeners AND clears the pending timer.
     * Without the cleanup, StrictMode's double-mount in dev would stack
     * listeners on top of each other and the lock would fire twice.
     */
    useEffect(() => {
        if (!authed) return;
        let timeoutId: number;

        const resetTimer = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                // Redirect side-effect happens via ProtectedRoute once encryptionKey is null.
                void logout();
            }, TIMEOUT_MS);
        };

        const events = ['mousemove', 'keydown', 'scroll', 'click'];
        events.forEach(event => document.addEventListener(event, resetTimer));
        resetTimer();

        return () => {
            window.clearTimeout(timeoutId);
            events.forEach(event => document.removeEventListener(event, resetTimer));
        };
    }, [authed, logout]);

    return (
        <AuthContext.Provider value={{ authed, encryptionKey, login, logout, clearKey }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook for consumers.
 *
 * Named `UseAuth` (capital U) rather than `useAuth` as a project convention —
 * renaming it across every caller is deferred debt, so this note flags the
 * inconsistency for future contributors.
 *
 * Throws rather than returning null if called outside the provider. That
 * "fail loud" policy catches wiring bugs at render time instead of letting
 * them propagate as "`authed` is undefined".
 */
export function UseAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
