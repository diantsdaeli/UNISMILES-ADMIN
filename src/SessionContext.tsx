import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './components/AuthProvider';
import { useKiosk } from './KioskContext';
import { 
  SessionItem, 
  SessionPhoto, 
  fetchSessionsService, 
  filterSessionsByRole, 
  SEED_SESSIONS 
} from './lib/sessionService';

// Kompatibilitas mundur dengan tipe legacy
export type Session = SessionItem;
export type { SessionPhoto };

interface SessionContextType {
  sessions: SessionItem[];
  allSessions: SessionItem[]; // Koleksi mentah sebelum filter role
  loading: boolean;
  error: string | null;
  isSimulated: boolean;
  fetchSessions: () => Promise<void>;
  refreshSessions: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { kiosks } = useKiosk();

  const [rawSessions, setRawSessions] = useState<SessionItem[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const loaded = await fetchSessionsService();
      const hasSimulatedMarker = loaded.some(s => s.isSimulated);
      setIsSimulated(hasSimulatedMarker || loaded.length === 0);
      setRawSessions(loaded);
    } catch (err: any) {
      console.error('[SessionContext] Error loading sessions:', err);
      const status = err?.response?.status || err?.status;
      if (status === 401 || status === 403) {
        // DILARANG fallback ke mock saat 401/403
        setError(`Akses ditolak atau sesi login kedaluwarsa (HTTP ${status}). Silakan login kembali.`);
        setRawSessions([]);
        setFilteredSessions([]);
        setIsSimulated(false);
      } else {
        setError(err?.message || 'Gagal memuat daftar sesi');
        setRawSessions(SEED_SESSIONS);
        setIsSimulated(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Sinkronisasi Sesi saat autentikasi berubah (Logout menghapus state sesi)
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setRawSessions([]);
      setFilteredSessions([]);
      setError(null);
      setLoading(false);
      return;
    }


    fetchSessions();
  }, [isAuthenticated, authLoading, fetchSessions]);

  // Evaluasi RBAC Multi-Kiosk Isolation secara reaktif
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setFilteredSessions([]);
      return;
    }

    const isolated = filterSessionsByRole(rawSessions, user, kiosks);
    setFilteredSessions(isolated);
  }, [rawSessions, user, kiosks, isAuthenticated]);

  const refreshSessions = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <SessionContext.Provider
      value={{
        sessions: filteredSessions,
        allSessions: rawSessions,
        loading,
        error,
        isSimulated,
        fetchSessions,
        refreshSessions,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
