import { useEffect } from "react";

/**
 * Hook: inactivity auto-lock timer.
 *
 * ── Design pattern: Custom Hook (separation of concerns) ──────────────────
 * Extracted from AuthContext so the auth context only holds state, and the
 * "inactivity detection" mechanism lives in its own testable unit.
 *
 * Use case:
 *   Call from a component tree that is "locked" when inactive. While
 *   `enabled === true`, the hook watches for pointer/keyboard/scroll
 *   activity. If no such event fires for `timeoutMs` milliseconds, it
 *   invokes `onLock()` exactly once.
 *
 * Why these specific events:
 *   We want to detect *user* inactivity, not tab-backgrounded — the Page
 *   Visibility API would wrongly treat a user reading the vault in a
 *   foreground tab as "idle". Pointer + keyboard + scroll + click is a
 *   truer proxy for "someone is actively using this page".
 *
 * Cleanup:
 *   Removes listeners AND clears the pending timer. Without the cleanup,
 *   StrictMode's double-mount in dev would stack listeners on top of each
 *   other and the lock would fire twice.
 */
export function useAutoLock(enabled: boolean, timeoutMs: number, onLock: () => void) {
    useEffect(() => {
        if (!enabled) return;
        let timeoutId: number;

        const resetTimer = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                onLock();
            }, timeoutMs);
        };

        const events = ["mousemove", "keydown", "scroll", "click"] as const;
        events.forEach((event) => document.addEventListener(event, resetTimer));
        resetTimer();

        return () => {
            window.clearTimeout(timeoutId);
            events.forEach((event) => document.removeEventListener(event, resetTimer));
        };
    }, [enabled, timeoutMs, onLock]);
}
