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
  sessionVerified: boolean;
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
  sessionVerified: false,
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
  const [sessionVerified, setSessionVerified] = useState<boolean>(false);

  // Verifikasi sesi token dengan backend (/api/v1/auth/me)
  const verifySession = useCallback(async () => {
    const storedToken = localStorage.getItem('unismiles_token') || sessionStorage.getItem('unismiles_token');

    if (!storedToken) {
      setToken(null);
      setUser(null);
      setSessionVerified(false);
      setLoading(false);
      return;
    }

    setToken(storedToken);
    setLoading(true);

    try {
      // Gunakan timeout singkat (4 detik) agar tidak blocking jika server lambat
      const response = await api.get('/auth/me', { timeout: 4000 });
      const rawUser = getAuthUser(response.data);
      if (!rawUser) {
        throw new Error('Data profil user tidak ditemukan pada respons /auth/me');
      }

      const formatted = formatUserProfile(rawUser);
      setUser(formatted);
      setSessionVerified(true);
      localStorage.setItem('unismiles_user', JSON.stringify(formatted));
    } catch (err: any) {
      console.warn('Verifikasi sesi /auth/me gagal atau sesi kedaluwarsa:', err?.message || err);

      // Tutup akses terlindungi seketika untuk mencegah flash konten atau bypass sesi tidak sah
      localStorage.removeItem('unismiles_token');
      localStorage.removeItem('unismiles_user');
      sessionStorage.removeItem('unismiles_token');
      sessionStorage.removeItem('unismiles_user');
      setToken(null);
      setUser(null);
      setSessionVerified(false);
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
    setSessionVerified(true);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('unismiles_token');
    localStorage.removeItem('unismiles_user');
    sessionStorage.removeItem('unismiles_token');
    sessionStorage.removeItem('unismiles_user');

    setToken(null);
    setUser(null);
    setSessionVerified(false);
    setLoading(false);
  };

  const currentRole = user?.role || null;
  // Super Admin HANYA aktif jika sesi telah diverifikasi secara sah oleh server
  const isSuperAdmin = Boolean(
    sessionVerified && 
    (currentRole === 'Super Admin' || currentRole === 'admin' || currentRole === 'super_admin')
  );
  const isAdminMitra = Boolean(
    sessionVerified && 
    (currentRole === 'Admin Mitra' || currentRole === 'owner' || currentRole === 'operator' || currentRole === 'admin_mitra')
  );
  const isAuthenticated = Boolean(sessionVerified && token && user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: currentRole,
        token,
        loading,
        isAuthenticated,
        sessionVerified,
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
