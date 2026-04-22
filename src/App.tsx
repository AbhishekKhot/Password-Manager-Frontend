import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/context/AuthContext';
import { ToastProvider } from './shared/components/Toast';
import ErrorBoundary from './shared/components/ErrorBoundary';
import Login from './features/auth/pages/Login';
import Register from './features/auth/pages/Register';
import Vault from './features/vault/pages/Vault';
import Unlock from './features/auth/pages/Unlock';
import './index.css';

/**
 * Gatekeeper wrapper for routes that require an authenticated + unlocked session.
 *
 * Decision table:
 *   | authed | encryptionKey | action                    |
 *   | false  |    (any)      | → /login (no session)     |
 *   | true   |    null       | → /unlock (session alive, |
 *   |        |               |   but key not in memory)  |
 *   | true   |    present    | render children           |
 *
 * Why two separate redirects (not one "login or unlock" path):
 *   The UX is different. /login asks for email + password and issues a
 *   new JWT + refresh pair. /unlock asks for password only and reuses
 *   the existing refresh cookie — no network auth round-trip, faster UX,
 *   and doesn't revoke their other active sessions.
 *
 * `replace` on Navigate: replaces the current history entry instead of
 * pushing a new one, so the back button doesn't bounce users between
 * /vault and /login during an auth failure loop.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authed, encryptionKey } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  if (!encryptionKey) return <Navigate to="/unlock" replace />;
  return <>{children}</>;
}

/**
 * Route table.
 *
 * Why the `<AppContent>` indirection:
 *   `useAuth` must be called under `<AuthProvider>`. Putting <Routes>
 *   directly at the top level would risk ProtectedRoute trying to read
 *   the context before the provider mounts. The wrapper keeps tree depth
 *   explicit: ErrorBoundary > ToastProvider > AuthProvider > BrowserRouter
 *   > AppContent > Routes.
 *
 * Unknown-path fallback: `<Route path="*">` sends any unmatched URL to
 * /login rather than a 404 page — the app only has four routes so a stray
 * URL is almost certainly a user who needs to sign in.
 */
function AppContent() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/unlock" element={<Unlock />} />
        <Route
          path="/vault"
          element={
            <ProtectedRoute>
              <Vault />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}

/**
 * Root component. Provider order is deliberate — outside-in:
 *   1. ErrorBoundary — outermost so a throw in any provider is caught.
 *   2. ToastProvider — independent; wrapping auth means toasts fired
 *      during login flows have somewhere to render.
 *   3. AuthProvider — consumes the axios api layer, provides useAuth.
 *   4. BrowserRouter — innermost; router hooks are only used by routes
 *      and their children, not by the providers above.
 */
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
