import React, { createContext, useContext, useEffect, useState } from 'react';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'owner' | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'owner' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mockSession = localStorage.getItem('unismiles_mock_session');
    if (mockSession) {
      const data = JSON.parse(mockSession);
      setUser(data.user);
      setRole(data.role);
    }
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="glass-panel p-8 max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold text-primary">Something went wrong</h2>
          <p className="text-muted">An unexpected error occurred.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-xl font-bold"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
