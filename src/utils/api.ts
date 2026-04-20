/**
 * Thin `fetch` wrapper with cookie-based auth and single-flight refresh.
 *
 * Every component that talks to the backend goes through `apiFetch`.
 * Two reasons this module exists:
 *   1. To always send `credentials: "include"` so the browser attaches our
 *      httpOnly `access_token` cookie on every request (cross-origin too).
 *   2. To transparently recover from an expired access token by calling
 *      /auth/refresh once per 401, then retrying the original request.
 */

const BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * Single-flight refresh promise.
 *
 * Concept — "single-flight" / "request deduplication":
 *   Say the vault page renders 10 components that all call apiFetch in
 *   parallel, and the JWT just expired. Without coordination, all 10 get
 *   401 and all 10 kick off a refresh — a mini stampede on /auth/refresh
 *   that also rotates the refresh token 10 times and revokes 9 of the
 *   brand-new ones (because our server rotates on every call).
 *
 *   By storing the in-flight promise here, the first caller starts the
 *   refresh and every subsequent caller awaits the same promise. Only one
 *   network call happens.
 */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token cookie.
 *
 * Returns true if the server successfully rotated tokens (cookies now
 * have a fresh pair), false otherwise (session is gone, user must re-login).
 */
async function refresh(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        try {
            const res = await fetch(`${BASE}/auth/refresh`, {
                method: "POST",
                credentials: "include",
            });
            return res.ok;
        } catch {
            // Network error — treat as "refresh failed"; caller will surface login.
            return false;
        } finally {
            // Clear the slot so the NEXT stampede (if any) can start a new refresh.
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

/**
 * The one function the rest of the app uses to call the backend.
 *
 * Behaviour:
 *   - Prepends VITE_API_BASE_URL so callers pass just the path (e.g. "/vault").
 *   - Always includes credentials (cookies).
 *   - Defaults Content-Type to application/json (JSON is our only payload format).
 *   - On 401 for a non-/auth route, runs the single-flight refresh and retries.
 *
 * Why /auth/* calls are NOT retried on 401:
 *   /auth/login returning 401 means "bad credentials" — retrying after a
 *   refresh would be meaningless. /auth/refresh itself returning 401 means
 *   "your refresh token is gone" — another refresh is guaranteed to fail.
 *   Skipping retry on auth paths avoids an infinite loop and a confusing
 *   UX where the user sees two refresh attempts for one wrong password.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const doFetch = () =>
        fetch(`${BASE}${path}`, {
            ...init,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
        });

    let res = await doFetch();
    if (res.status === 401 && !path.startsWith("/auth/")) {
        const ok = await refresh();
        if (ok) res = await doFetch();
    }
    return res;
}
