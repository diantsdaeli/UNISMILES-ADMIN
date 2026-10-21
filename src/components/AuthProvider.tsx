import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { getAuthUser } from '../lib/api';

export interface User {
  id: string | number;
  uid?: string; // Kompatibilitas dengan kode Dian
  email: string;
  full_name?: string;
  name?: string;
  displayName: string;
  role: string;
  partner_name?: string;
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  role: string | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdminMitra: boolean;
  login: (token: string, userData: any) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  token: null,
  loading: true,
  isAuthenticated: false,
  isSuperAdmin: false,
  isAdminMitra: false,
  login: () => { },
  logout: () => { },
  refreshUser: async () => { },
});

export const useAuth = () => useContext(AuthContext);

/**
 * Format profil pengguna dari data backend agar 100% kompatibel dengan komponen Dian
 */
export function formatUserProfile(rawUser: any): User {
  const id = rawUser?.id || rawUser?.uid || '1';
  const email = rawUser?.email || '';
  const fullName = rawUser?.full_name || rawUser?.name || rawUser?.displayName || 'Admin User';
  const role = rawUser?.role || 'Super Admin';
  const partnerName = rawUser?.partner_name || 'Uni-Smiles HQ';
  const photo = rawUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || 'unismiles')}`;

  return {
    id,
    uid: String(id),
    email,
    full_name: fullName,
    displayName: fullName,
    role,
    partner_name: partnerName,
    photoURL: photo,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Verifikasi sesi token dengan backend (/api/v1/auth/me)
  const verifySession = useCallback(async () => {
    const storedToken = localStorage.getItem('unismiles_token') || sessionStorage.getItem('unismiles_token');
    const storedUserJson = localStorage.getItem('unismiles_user') || sessionStorage.getItem('unismiles_user');

    if (!storedToken) {
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);

    // Tampilkan data cache sementara agar UI tidak flicker
    if (storedUserJson) {
      try {
        const cachedUser = JSON.parse(storedUserJson);
        setUser(formatUserProfile(cachedUser));
      } catch (_) { }
    }

    try {
      const response = await api.get('/auth/me');
      const rawUser = getAuthUser(response.data);
      if (!rawUser) {
        throw new Error('Data profil user tidak ditemukan pada respons /auth/me');
      }

      const formatted = formatUserProfile(rawUser);
      setUser(formatted);
      localStorage.setItem('unismiles_user', JSON.stringify(formatted));
    } catch (err: any) {
      const status = err?.response?.status;
      const message = String(err?.response?.data?.message || '').toLowerCase();

      // Jika token kedaluwarsa atau akun nonaktif, bersihkan sesi
      if (status === 401 || (status === 403 && (message.includes('inactive') || message.includes('nonaktif')))) {
        localStorage.removeItem('unismiles_token');
        localStorage.removeItem('unismiles_user');
        sessionStorage.removeItem('unismiles_token');
        sessionStorage.removeItem('unismiles_user');
        setToken(null);
        setUser(null);
      } else {
        // Jika offline atau error jaringan, pertahankan sesi lokal dengan peringatan
        console.warn('Gagal memverifikasi sesi dengan backend (mungkin server offline):', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const login = (newToken: string, rawUserData: any) => {
    if (!newToken) return;

    const formatted = formatUserProfile(rawUserData);

    // Simpan token & user
    localStorage.setItem('unismiles_token', newToken);
    localStorage.setItem('unismiles_user', JSON.stringify(formatted));

    setToken(newToken);
    setUser(formatted);
  };

  const logout = () => {
    localStorage.removeItem('unismiles_token');
    localStorage.removeItem('unismiles_user');
    sessionStorage.removeItem('unismiles_token');
    sessionStorage.removeItem('unismiles_user');

    setToken(null);
    setUser(null);
  };

  const currentRole = user?.role || null;
  const isSuperAdmin = currentRole === 'Super Admin' || currentRole === 'admin';
  const isAdminMitra = currentRole === 'Admin Mitra' || currentRole === 'owner' || currentRole === 'operator';
  const isAuthenticated = Boolean(token && user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: currentRole,
        token,
        loading,
        isAuthenticated,
        isSuperAdmin,
        isAdminMitra,
        login,
        logout,
        refreshUser: verifySession,
      }}
    >
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
