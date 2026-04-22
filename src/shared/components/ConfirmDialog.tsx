interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Modal confirmation dialog.
 *
 * Use case:
 *   Destructive actions (delete credential, sign-out-everywhere) go through
 *   this component instead of `window.confirm(...)`. Two reasons:
 *     1. `confirm()` is synchronous and blocks the JS event loop — bad UX
 *        and can't be themed to match the app.
 *     2. Our CLAUDE.md / project policy bans native alert/confirm so the
 *        UI stays consistent.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"` hints to screen readers that
 *     the backdrop is modal and focus should be trapped (browser support
 *     varies; a stricter focus-trap would be a future enhancement).
 *
 * Prop defaults:
 *   `confirmLabel` / `cancelLabel` default to "Confirm" / "Cancel" so the
 *   typical caller can pass just `{ open, title, message, onConfirm, onCancel }`.
 *
 * Render shortcut — `if (!open) return null`:
 *   Rather than CSS-hiding the modal, we unmount it entirely when closed.
 *   This avoids stale state between opens (e.g. residual focus) and keeps
 *   the DOM small.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
}: Props) {
    if (!open) return null;
    return (
        <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="auth-card">
                <div className="auth-header">
                    <h3>{title}</h3>
                    <p>{message}</p>
                </div>
                <div className="modal-actions">
                    <button type="button" className="auth-button secondary" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="auth-button" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
