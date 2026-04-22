import { createContext, useContext } from "react";

/**
 * Toast context + useToast hook.
 *
 * Use case:
 *   Co-located with Toast.tsx's <ToastProvider>. Split into its own file
 *   because Vite's Fast Refresh (react-refresh/only-export-components ESLint
 *   rule) requires that component files export ONLY components — mixing in a
 *   hook or plain context object breaks HMR and yields a lint error.
 *
 * By keeping the provider in Toast.tsx (components-only) and the context +
 * hook in this file (non-component module), both files satisfy the rule.
 */

export type ToastKind = "info" | "error" | "success";
export type Toast = { id: number; kind: ToastKind; message: string };

/**
 * The actual context. `null` default is a sentinel — reading it means
 * "no provider above me in the tree", which the hook below catches.
 */
export const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void } | null>(null);

/**
 * Consumer hook.
 *
 * Why we throw when there's no provider:
 *   Returning a no-op would hide the wiring bug — a toast that silently
 *   fails to appear is harder to debug than one that throws. The throw
 *   fires on first call, at render time, so the stack trace points straight
 *   to the component that forgot to be wrapped in <ToastProvider>.
 */
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx.push;
}
