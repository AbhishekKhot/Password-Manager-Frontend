import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * React error boundary.
 *
 * Use case:
 *   Wraps the whole app in App.tsx. If any descendant render throws
 *   (e.g. we try to decrypt with a stale key and the error bubbles up),
 *   the boundary catches it and renders a fallback UI instead of the
 *   default behaviour — which is unmounting the entire tree and leaving
 *   a blank page. That blank-page mode is disastrous for a password
 *   manager because the user can't even reach the logout button.
 *
 * Why this must be a CLASS component:
 *   React's error-boundary lifecycle (`getDerivedStateFromError`,
 *   `componentDidCatch`) is only available on class components. There is
 *   no hook equivalent as of React 19.
 *
 * What this catches vs. what it doesn't:
 *   - Catches: errors during rendering, in lifecycle methods, in
 *     constructors of descendant components.
 *   - Does NOT catch: event-handler errors, async errors (Promises,
 *     setTimeout), errors in the boundary itself. Those are why
 *     individual handlers still use try/catch + toast.
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    /**
     * Static lifecycle — runs during render after a thrown error.
     * Its job is to produce the new state. We store the error so the
     * render method can decide to show the fallback.
     *
     * Must be static: React calls it without a `this` context.
     */
    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    /**
     * Side-effect lifecycle — runs after render.
     * This is where you'd ship the error to Sentry / Datadog. For now we
     * just log; a future enhancement could POST to a `/report-error`
     * endpoint with the React componentStack in `info`.
     */
    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Uncaught render error", error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="auth-card">
                    <div className="auth-header">
                        <h2>Something went wrong</h2>
                        <p>The app encountered an unexpected error. Reload to continue.</p>
                    </div>
                    <button className="auth-button" onClick={() => window.location.reload()}>
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
