import axios, {
    AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
} from "axios";

/**
 * HTTP client module — the single seam between React and the backend.
 *
 * ── Design pattern: Facade + Singleton ────────────────────────────────────
 * This module hides axios behind a pre-configured instance. Callers (the
 * `AuthApi` / `VaultApi` classes) never import axios directly, which means
 * we can swap the transport (fetch, ky, native XHR) by changing only this
 * file.
 *
 * ── Design pattern: Interceptor / Chain of Responsibility ────────────────
 * axios interceptors form a pipeline of functions that every request/response
 * passes through. We use them for three cross-cutting concerns:
 *   1. Attaching cookies (`withCredentials: true` on the instance).
 *   2. Translating axios errors into our typed `ApiError` so components can
 *      switch on `err.status` instead of unwrapping `error.response?.status`.
 *   3. Single-flight refresh on 401 — see the response interceptor below.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

/**
 * Typed domain error — one class for the whole app's HTTP failures.
 *
 * Why a dedicated class:
 *   `catch (e)` in React components usually ends up doing `e instanceof Error`
 *   + shape-checking. With `ApiError` a caller can just `if (err instanceof
 *   ApiError && err.status === 404)` — no more untyped `as any` on response
 *   payloads.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly data: unknown;

    constructor(message: string, status: number, data: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
        Object.setPrototypeOf(this, ApiError.prototype);
    }

    /** Convenience narrower — lets callers write `err.is(401)` instead of comparing `.status`. */
    is(status: number): boolean {
        return this.status === status;
    }
}

/**
 * Shared axios instance — every API class constructs with this.
 *
 * `withCredentials: true` tells the browser to attach our httpOnly auth
 * cookies on every request, including cross-origin ones (Vite dev server
 * runs on :5173, API on :3000).
 */
export const httpClient: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
    // Accept any 2xx/3xx; let the response interceptor decide what to do
    // with 4xx/5xx. axios's default `validateStatus` already does this,
    // but being explicit keeps intent obvious.
    validateStatus: (status) => status >= 200 && status < 300,
});

/**
 * Single-flight refresh promise.
 *
 * Concept — "request deduplication":
 *   Imagine the vault page fires 10 parallel requests and the JWT just
 *   expired. Without coordination all 10 responses arrive as 401 and all 10
 *   would trigger /auth/refresh — a stampede that also rotates the refresh
 *   token 10 times and revokes 9 brand-new ones (the server rotates on
 *   every call).
 *
 *   Storing the in-flight promise here means the first caller starts the
 *   refresh and every subsequent caller awaits the same promise. One
 *   network call, many awaiters.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        try {
            // Important: bypass the shared instance so this call doesn't
            // recursively trigger the response interceptor on its own 401.
            const res = await axios.post(
                `${BASE_URL}/auth/refresh`,
                null,
                { withCredentials: true, validateStatus: () => true }
            );
            return res.status >= 200 && res.status < 300;
        } catch {
            return false;
        } finally {
            // Clear the slot so the NEXT stampede (if any) starts a new refresh.
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

/**
 * Marker we stamp onto the request config after a retry so the interceptor
 * can't loop forever on a persistently-failing refresh.
 */
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * Response interceptor — the single place that handles 401-triggered refresh.
 *
 * Behaviour mirrors the old `apiFetch` wrapper exactly:
 *   - Success (2xx): pass through.
 *   - 401 on an /auth/* route: no retry (see `apiFetch` docs for the reason —
 *     avoids infinite loop on bad credentials / expired refresh cookie).
 *   - 401 elsewhere, first time: call refresh, then retry the original request.
 *   - Any other failure: reject with an `ApiError`.
 */
httpClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const original = error.config as RetriableConfig | undefined;
        const status = error.response?.status;

        const isAuthRoute = original?.url?.startsWith("/auth/") ?? false;

        if (status === 401 && original && !original._retry && !isAuthRoute) {
            original._retry = true;
            const ok = await refreshAccessToken();
            if (ok) return httpClient.request(original);
        }

        // Translate to our domain error. Components never see raw AxiosError.
        const message =
            (error.response?.data as { error?: string } | undefined)?.error ??
            error.message ??
            "Request failed";
        throw new ApiError(message, status ?? 0, error.response?.data);
    }
);

/**
 * Small helpers so API classes can stay terse — `this.http.get<T>(url)`
 * instead of repeating `.then((r) => r.data)` everywhere.
 *
 * These are thin adapters, not a repository pattern — the API classes
 * (AuthApi, VaultApi) are the repositories; this is just the axios glue.
 */
export const http = {
    get: <T>(url: string, config?: AxiosRequestConfig) =>
        httpClient.get<T>(url, config).then(unwrap),
    post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
        httpClient.post<T>(url, body, config).then(unwrap),
    put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
        httpClient.put<T>(url, body, config).then(unwrap),
    patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
        httpClient.patch<T>(url, body, config).then(unwrap),
    delete: <T>(url: string, config?: AxiosRequestConfig) =>
        httpClient.delete<T>(url, config).then(unwrap),
};

function unwrap<T>(response: AxiosResponse<T>): T {
    return response.data;
}
