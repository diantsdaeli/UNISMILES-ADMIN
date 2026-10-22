import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { 
  getComputedStatus, 
  registerKioskSimulation, 
  regenerateCredentialSimulation,
  softDeleteKioskSimulation,
  KioskRegistrationPayload 
} from './lib/kioskService';

export interface KioskHealth {
  printerInk?: number | null;
  storage?: number | null;
  camera?: 'good' | 'bad' | string | null;
  paperStatus?: string;
  printsRemaining?: number | null;
}

export interface Kiosk {
  id: string;
  name: string;
  location: string;
  base_price?: number;
  price?: number;
  status: 'online' | 'offline' | 'idle' | 'restarting' | 'unknown';
  health?: KioskHealth;
  config?: {
    brightness?: number;
    volume?: number;
    maintenanceMode?: boolean;
    filters?: any[];
    stickers?: any[];
    branding?: any;
    operatingHours?: { open: string; close: string };
    autoRestart?: string;
    notifications?: { email: string };
    orientation?: string;
    resolution?: string;
    aspectRatio?: string;
    [key: string]: any;
  };
  lastHeartbeat?: string | null;
  createdAt?: string;
  user_id?: string | number;
  api_key?: string | null;
  isSimulated?: boolean;
  hasCredentials?: boolean;
}

export interface AddKioskResult {
  kiosk: Kiosk;
  credentials: {
    deviceId: string;
    deviceToken: string;
  };
}

interface KioskContextType {
  kiosks: Kiosk[];
  addKiosk: (kioskData: KioskRegistrationPayload, userId?: string | number) => Promise<AddKioskResult>;
  updateKiosk: (id: string, data: Partial<Kiosk>) => Promise<void>;
  restartKiosk: (id: string) => Promise<void>;
  deleteKiosk: (id: string, confirmedName?: string) => Promise<void>;
  regenerateKey: (id: string) => Promise<{ deviceId: string; deviceToken: string }>;
  loading: boolean;
  refreshKiosks: () => void;
}

const KioskContext = createContext<KioskContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'unismiles_kiosks_v2';

// Baseline seed data dengan timestamp deterministik
const DUMMY_KIOSKS: Kiosk[] = [
  {
    id: 'KSK-0001',
    name: 'Kios-K GIAT',
    location: 'TULT Lantai 1',
    base_price: 35000,
    price: 35000,
    status: 'online', // < 2 menit lalu
    health: { printerInk: 85, storage: 45, camera: 'GOOD', paperStatus: 'NORMAL', printsRemaining: 120 },
    config: {
      brightness: 80,
      volume: 50,
      maintenanceMode: false,
      operatingHours: { open: '09:00', close: '22:00' },
      autoRestart: '03:00',
      notifications: { email: 'admin@unismiles.com' },
      orientation: 'portrait',
      resolution: '1080x1920',
      aspectRatio: '9:16'
    },
    lastHeartbeat: new Date(Date.now() - 45_000).toISOString(), // 45 detik lalu
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    user_id: '1',
    isSimulated: true
  },
  {
    id: 'KSK-0002',
    name: 'Kios-K FIT',
    location: 'Telkom University Gedung Tokong Nanas',
    base_price: 35000,
    price: 35000,
    status: 'idle', // 4 menit lalu (antara 2 - 10 menit)
    health: { printerInk: 92, storage: 12, camera: 'GOOD', paperStatus: 'NORMAL', printsRemaining: 240 },
    config: {
      brightness: 80,
      volume: 50,
      maintenanceMode: false,
      operatingHours: { open: '08:00', close: '21:00' },
      autoRestart: '03:00',
      notifications: { email: 'fit@unismiles.com' },
      orientation: 'portrait',
      resolution: '1080x1920',
      aspectRatio: '9:16'
    },
    lastHeartbeat: new Date(Date.now() - 240_000).toISOString(), // 4 menit lalu
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    user_id: '1',
    isSimulated: true
  },
  {
    id: 'KSK-0003',
    name: 'Kios-K Heritage',
    location: 'Jalan Braga No. 12 Bandung',
    base_price: 40000,
    price: 40000,
    status: 'offline', // > 10 menit lalu
    health: { printerInk: null, storage: 88, camera: 'BAD', paperStatus: 'OUT_OF_PAPER', printsRemaining: 0 },
    config: {
      brightness: 70,
      volume: 60,
      maintenanceMode: true,
      operatingHours: { open: '10:00', close: '23:00' },
      autoRestart: '04:00',
      notifications: { email: 'braga@unismiles.com' },
      orientation: 'portrait',
      resolution: '1080x1920',
      aspectRatio: '9:16'
    },
    lastHeartbeat: new Date(Date.now() - 7_200_000).toISOString(), // 2 jam lalu
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    user_id: '2', // Mitra berbeda untuk pengujian RBAC
    isSimulated: true,
    hasCredentials: false // Kredensial tidak tersedia / belum diterbitkan untuk menguji penanganan aman
  }
];

export const KioskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [kiosks, setKiosks] = useState<Kiosk[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Re-komputasi status saat pemuatan awal
          return parsed.map((k: Kiosk) => ({
            ...k,
            status: k.status === 'restarting' ? 'restarting' : getComputedStatus(k.lastHeartbeat)
          }));
        }
      }
    } catch {
      // Fallback
    }
    return DUMMY_KIOSKS.map(k => ({
      ...k,
      status: getComputedStatus(k.lastHeartbeat)
    }));
  });

  const [loading, setLoading] = useState(false);

  // Simpan perubahan ke localStorage dengan sanitasi rahasia (zero secret persistence)
  useEffect(() => {
    try {
      const sanitized = kiosks.map(k => {
        const { api_key, apiKey, credentials, deviceToken, token, secret, ...rest } = k as any;
        return rest;
      });
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore storage quota
    }
  }, [kiosks]);

  // Status recomputing deterministik setiap 30 detik tanpa mengarang data acak
  useEffect(() => {
    const interval = setInterval(() => {
      setKiosks(prev => prev.map(k => {
        if (k.status === 'restarting') return k;
        const computed = getComputedStatus(k.lastHeartbeat);
        return computed !== k.status ? { ...k, status: computed } : k;
      }));
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  const refreshKiosks = useCallback(() => {
    setKiosks(prev => prev.map(k => ({
      ...k,
      status: k.status === 'restarting' ? 'restarting' : getComputedStatus(k.lastHeartbeat)
    })));
  }, []);

  const addKiosk = async (
    kioskData: KioskRegistrationPayload,
    userId?: string | number
  ): Promise<AddKioskResult> => {
    setLoading(true);
    try {
      // Jalankan via service simulasi aman
      const result = await registerKioskSimulation(kioskData, userId);
      setKiosks(prev => [result.kiosk, ...prev]);
      return {
        kiosk: result.kiosk,
        credentials: result.credentials
      };
    } finally {
      setLoading(false);
    }
  };

  const updateKiosk = async (id: string, data: Partial<Kiosk>) => {
    setKiosks(prev => prev.map(k => {
      if (k.id === id) {
        const updatedConfig = data.config ? { ...(k.config || {}), ...data.config } : k.config;
        const updated = {
          ...k,
          ...data,
          config: updatedConfig,
        };
        // Re-evaluasi status bila lastHeartbeat berubah
        if (data.lastHeartbeat !== undefined) {
          updated.status = getComputedStatus(data.lastHeartbeat);
        }
        return updated;
      }
      return k;
    }));
  };

  const restartKiosk = async (id: string) => {
    // 1. Set status to RESTARTING lokal seketika
    setKiosks(prev => prev.map(k => k.id === id ? { ...k, status: 'restarting' } : k));

    // 2. Simulasikan sekuens restart 3 detik lalu kembalikan ke status deterministik
    setTimeout(() => {
      setKiosks(prev => prev.map(k => {
        if (k.id === id) {
          return {
            ...k,
            status: getComputedStatus(k.lastHeartbeat)
          };
        }
        return k;
      }));
    }, 3000);
  };

  const deleteKiosk = async (id: string, confirmedName?: string) => {
    const target = kiosks.find(k => k.id === id);
    if (!target) return;

    if (confirmedName !== undefined) {
      await softDeleteKioskSimulation(id, confirmedName, target.name);
    }

    setKiosks(prev => prev.filter(k => k.id !== id));
    toast.error("Kiosk Berhasil Dihapus (Soft Delete Simulasi)", {
      icon: <Trash2 className="w-5 h-5 text-red-400" />,
      duration: 3500,
      position: 'top-center',
      style: {
        background: 'rgba(239, 68, 68, 0.15)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        color: '#fff',
        borderRadius: '9999px',
        padding: '12px 24px',
        fontWeight: '600',
        fontSize: '14px'
      }
    });
  };

  const regenerateKey = async (id: string): Promise<{ deviceId: string; deviceToken: string }> => {
    const result = await regenerateCredentialSimulation(id);
    return {
      deviceId: result.deviceId,
      deviceToken: result.deviceToken
    };
  };

  return (
    <KioskContext.Provider value={{ 
      kiosks, 
      addKiosk, 
      updateKiosk, 
      restartKiosk, 
      deleteKiosk, 
      regenerateKey,
      loading,
      refreshKiosks
    }}>
      {children}
    </KioskContext.Provider>
  );
};

export const useKiosks = () => {
  const context = useContext(KioskContext);
  if (context === undefined) {
    throw new Error('useKiosks must be used within a KioskProvider');
  }
  return context;
};

export const useKiosk = useKiosks;

