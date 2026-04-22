import { useEffect, useState, type ReactNode } from "react";
import { ToastContext, type Toast, type ToastKind } from "./toastContext";

/**
 * Toast notification system.
 *
 * Use case:
 *   Replaces `alert()` / `confirm()` for transient feedback (save succeeded,
 *   copy failed, clipboard will clear, etc.). Non-blocking, auto-dismissing,
 *   and stylable — unlike the browser dialog primitives which block the
 *   event loop and cannot be themed.
 *
 * Why provider/context instead of a singleton module:
 *   Toasts need to mount into the React tree to render (so they participate
 *   in CSS, portals, and unmount cleanup). A module-level array + DOM
 *   manipulation would fight React's reconciliation.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    /**
     * Enqueue a new toast.
     *
     * ID choice — Date.now() + Math.random():
     *   We need a unique key for React's list reconciler. Date.now() alone
     *   can collide when two toasts are pushed in the same millisecond
     *   (e.g. two failed operations). Mixing in Math.random() is good
     *   enough — we don't need cryptographic uniqueness, just "no React
     *   warning about duplicate keys".
     *
     * Auto-dismiss:
     *   4 s is long enough to read a short line, short enough that a
     *   stream of toasts won't pile up visually.
     */
    const push = (kind: ToastKind, message: string) => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, kind, message }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    };

    return (
        <ToastContext.Provider value={{ push }}>
            {children}
            <div className="toast-stack">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/**
 * Inline countdown chip — "clears in Xs".
 *
 * Use case:
 *   Can be shown next to a copied password to signal how long before the
 *   clipboard is wiped. Currently unused (Vault.tsx relies on the toast
 *   message alone) but kept here so a future UI that needs a visible
 *   countdown can drop it in.
 *
 * Why a separate effect per tick:
 *   Each `setLeft(n - 1)` change re-runs the effect, which schedules the
 *   next timeout. Cleaner than a single setInterval with a ref because
 *   React handles the tear-down automatically.
 *
 * Concept — effect cleanup:
 *   The returned `() => window.clearTimeout(h)` runs before the next
 *   effect AND on unmount. Without it a quickly-unmounted chip would
 *   fire its onDone callback on a dead component.
 */
export function CountdownChip({ seconds, onDone }: { seconds: number; onDone?: () => void }) {
    const [left, setLeft] = useState(seconds);
    useEffect(() => {
        if (left <= 0) {
            onDone?.();
            return;
        }
        const h = window.setTimeout(() => setLeft((n) => n - 1), 1000);
        return () => window.clearTimeout(h);
    }, [left, onDone]);
    return left > 0 ? <span className="countdown-chip">clears in {left}s</span> : null;
}
