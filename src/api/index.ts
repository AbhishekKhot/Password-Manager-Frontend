/**
 * Barrel export for the API layer.
 *
 * Consumers should import from `@/api` (or the relative equivalent) rather
 * than reaching into individual files — makes it trivial to refactor the
 * internal layout later without touching call sites.
 */
export { authApi, AuthApi } from "./auth.api";
export { vaultApi, VaultApi } from "./vault.api";
export { ApiError, http, httpClient } from "./client";
export type * from "./types";
