import { useCallback, useEffect, useRef } from "react";

/**
 * Hook: clipboard copy + automatic wipe after a delay.
 *
 * ── Design pattern: Custom Hook (encapsulation of effectful state) ────────
 * This pattern is the React equivalent of extracting a method — we pull
 * the clipboard-with-timer choreography out of the Vault component so the
 * component becomes pure UI and the hook becomes testable in isolation.
 *
 * Behaviour:
 *   - `copy(text)` writes to the system clipboard and schedules a wipe in
 *     `delayMs` milliseconds.
 *   - A second `copy(...)` cancels the previous wipe (only the most recent
 *     copy matters).
 *   - On unmount, any pending wipe is cleared — avoids writing to the
 *     clipboard from a dead component tree.
 *
 * Why `useRef` instead of `useState` for the timer handle:
 *   We never render from the handle. Using state would trigger useless
 *   re-renders of the consumer every time we schedule or clear a timer.
 *
 * Browser caveat — user-gesture requirement:
 *   The INITIAL `writeText` is inside a click-handler call stack, so it
 *   succeeds. The DELAYED wipe is NOT in a user-gesture context and some
 *   browsers silently no-op. We swallow those rejections — the worst case
 *   is that the clipboard isn't cleared, which matches the pre-refactor
 *   behaviour.
 */
export function useClipboardWithClear(delayMs: number) {
    const timerRef = useRef<number | null>(null);

    const cancelPendingWipe = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const copy = useCallback(
        async (text: string): Promise<boolean> => {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                return false;
            }
            cancelPendingWipe();
            timerRef.current = window.setTimeout(() => {
                navigator.clipboard.writeText("").catch(() => undefined);
                timerRef.current = null;
            }, delayMs);
            return true;
        },
        [delayMs, cancelPendingWipe]
    );

    // Clear any pending wipe when the consumer unmounts.
    useEffect(() => cancelPendingWipe, [cancelPendingWipe]);

    return { copy };
}
