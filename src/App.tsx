import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, UseAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Vault from './pages/Vault';
import './index.css';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = UseAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppContent() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
