import { http } from "./client";
import type {
    AuthUserResponse,
    LoginBody,
    RegisterBody,
    SaltResponse,
} from "./types";

/**
 * Auth API client.
 *
 * ── Design pattern: Repository / Gateway ──────────────────────────────────
 * One class per resource, each method is a single HTTP verb. Components
 * stay transport-agnostic — a page never constructs a URL or knows the
 * HTTP method, it just calls `authApi.login(body)`.
 *
 * Why a class and not a bag of functions:
 *   - The class is the natural unit for dependency-injecting an alternative
 *     http layer in tests (`new AuthApi(fakeHttp)`).
 *   - Keeps related endpoints visually grouped and makes the public surface
 *     of the auth API discoverable via autocomplete on `authApi.`.
 *
 * Note on `LoginResponse`:
 *   The server sets auth cookies on login — the response body currently
 *   carries `{ user }`. We return `void` from `login()` because no component
 *   reads the user payload yet; tighten this later if a page needs it.
 */
export class AuthApi {
    /** GET /auth/salt?email=... — fetch the per-user KDF parameters. */
    getSalt(email: string): Promise<SaltResponse> {
        const qs = new URLSearchParams({ email }).toString();
        return http.get<SaltResponse>(`/auth/salt?${qs}`);
    }

    /** POST /auth/register — create an account. Returns the server's `{ user }` envelope. */
    register(body: RegisterBody): Promise<{ user: AuthUserResponse }> {
        return http.post<{ user: AuthUserResponse }>("/auth/register", body);
    }

    /** POST /auth/login — exchange credentials for auth cookies. */
    login(body: LoginBody): Promise<{ user: AuthUserResponse }> {
        return http.post<{ user: AuthUserResponse }>("/auth/login", body);
    }

    /**
     * POST /auth/refresh — rotate the refresh token cookie.
     *
     * Intentionally returns a boolean (success vs failure) instead of the
     * 401-throwing default: probing the session on mount shouldn't raise,
     * it should resolve true/false so the caller can set `authed` cleanly.
     */
    async refresh(): Promise<boolean> {
        try {
            await http.post<void>("/auth/refresh");
            return true;
        } catch {
            return false;
        }
    }

    /**
     * POST /auth/logout — server-side revoke.
     *
     * Swallows errors: a user clicking "logout" expects local state cleared
     * regardless of network availability. The AuthContext also clears its
     * own state after this resolves.
     */
    async logout(): Promise<void> {
        try {
            await http.post<void>("/auth/logout");
        } catch {
            /* best-effort */
        }
    }
}

/**
 * Singleton instance — components import `authApi`, tests can new up their own.
 */
export const authApi = new AuthApi();
