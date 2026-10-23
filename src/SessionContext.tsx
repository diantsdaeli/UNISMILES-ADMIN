import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from './components/AuthProvider';
import { useKiosk } from './KioskContext';
import { 
  SessionItem, 
  SessionPhoto, 
  fetchSessionsService, 
  filterSessionsByRole, 
  SEED_SESSIONS 
} from './lib/sessionService';
import { DataSourceMode, getDataSourceMode, setDataSourceMode as setConfigMode } from './lib/dataSourceConfig';

// Kompatibilitas mundur dengan tipe legacy
export type Session = SessionItem;
export type { SessionPhoto };

interface SessionContextType {
  sessions: SessionItem[];
  allSessions: SessionItem[]; // Koleksi mentah sebelum filter role
  loading: boolean;
  error: string | null;
  isSimulated: boolean;
  dataSourceMode: DataSourceMode;
  setDataSourceMode: (mode: DataSourceMode) => void;
  fetchSessions: (mode?: DataSourceMode) => Promise<void>;
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
  const [dataSourceMode, setDataSourceModeState] = useState<DataSourceMode>(getDataSourceMode());
  const activeRequestIdRef = useRef<number>(0);

  const fetchSessions = useCallback(async (overrideMode?: DataSourceMode) => {
    const activeMode = overrideMode || getDataSourceMode();
    const requestId = ++activeRequestIdRef.current;

    // Reset error dan bersihkan data lama segera jika mode berubah untuk mencegah cache bleed
    setLoading(true);
    setError(null);
    if (overrideMode) {
      setRawSessions([]);
      setFilteredSessions([]);
    }

    try {
      const loaded = await fetchSessionsService({ mode: activeMode });
      if (requestId !== activeRequestIdRef.current) {
        return; // Discard respons lama jika ada request baru yang lebih mutakhir
      }

      const hasSimulatedMarker = loaded.some(s => s.isSimulated);
      setIsSimulated(activeMode === 'SAFE_SIMULATION' || hasSimulatedMarker);
      setRawSessions(loaded);
    } catch (err: any) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      console.error('[SessionContext] Error loading sessions:', err);
      const status = err?.response?.status || err?.status;
      if (status === 401 || status === 403) {
        // DILARANG fallback ke mock saat 401/403 (FAIL-CLOSED)
        setError(`Akses ditolak atau sesi login kedaluwarsa (HTTP ${status}). Silakan login kembali.`);
        setRawSessions([]);
        setFilteredSessions([]);
        setIsSimulated(false);
      } else {
        // Kegagalan jaringan pada mode live ditampilkan sebagai error yang jelas (bukan diam-diam menyajikan mock)
        setError(err?.message || 'Gagal memuat daftar sesi dari server backend.');
        setRawSessions([]);
        setFilteredSessions([]);
        setIsSimulated(false);
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const updateMode = useCallback((newMode: DataSourceMode) => {
    setConfigMode(newMode);
    setDataSourceModeState(newMode);
    fetchSessions(newMode);
  }, [fetchSessions]);

  useEffect(() => {
    const handleModeChange = (e: any) => {
      const newMode = e.detail as DataSourceMode;
      if (newMode && newMode !== dataSourceMode) {
        setDataSourceModeState(newMode);
        fetchSessions(newMode);
      }
    };
    window.addEventListener('unismiles:datasource-change', handleModeChange);
    return () => window.removeEventListener('unismiles:datasource-change', handleModeChange);
  }, [dataSourceMode, fetchSessions]);

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
        dataSourceMode,
        setDataSourceMode: updateMode,
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
