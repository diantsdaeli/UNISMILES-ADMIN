/**
 * UNISMILES DASHBOARD SERVICE & API ADAPTER (MODUL 8B)
 *
 * Menggantikan ketergantungan endpoint legacy /api/analytics dengan kontrak backend resmi:
 * GET /api/v1/admin/dashboard
 *
 * Menghormati aturan:
 * 1. SAFE_SIMULATION: Fixture sintetis terisolasi, konsisten dengan Modul 6 (Gross Rp155.000, Paid Rp70.000, 5 Kiosks).
 * 2. AUTHORIZED_READ_ONLY: Memanggil endpoint resmi GET /api/v1/admin/dashboard via api.ts (Bearer token).
 * 3. Verifikasi Status Pembayaran: Backend GET /admin/dashboard menghitung total_revenue dari
 *    s.status = 'completed' tanpa validasi tabel pembayaran terpisah. Di AUTHORIZED_READ_ONLY,
 *    label secara jujur ditampilkan sebagai "Completed Sessions Revenue (Backend Aggregate)".
 *    Pada SAFE_SIMULATION, Verified Paid Revenue (Rp70.000) hanya menghitung status pembayaran 'paid'.
 *    Sesi yang berstatus completed tetapi payment unknown/unverified (Sesi 8822 Rp25.000) TIDAK dihitung sebagai paid!
 * 4. Fail-Closed: 401/403/Network Error tidak pernah fallback diam-diam ke mock!
 * 5. Multi-Tenant: Admin Mitra hanya melihat metrik kiosk & sesinya sendiri.
 * 6. Request Race Guard: Pembatalan request sebelumnya saat mode atau rentang waktu berganti.
 */

import api from './api';
import { DataSourceMode, getDataSourceMode } from './dataSourceConfig';

export interface DashboardStats {
  totalSessions: { value: number; growth: number; trend: 'up' | 'down' | 'neutral' };
  photosPrinted: { value: number; growth: number; trend: 'up' | 'down' | 'neutral' };
  revenueToday: {
    value: number;
    growth: number;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
    sublabel?: string;
    isVerifiedPaid?: boolean;
  };
  activeKiosks: { online: number; total: number; idle: number; offline: number };
}

export interface RevenueChartPoint {
  name: string; // YYYY-MM-DD
  value: number;
}

export interface PopularityChartPoint {
  name: string;
  value: number;
}

export interface KioskStatusItem {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'idle' | 'offline' | 'restarting';
  lastSeen: string;
  partnerName?: string;
}

export interface TopTemplateInfo {
  name: string;
  usageCount: number;
}

export interface BackendDashboardData {
  total_kiosks: number;
  total_sessions: number;
  total_revenue: number;
  online_kiosks: number;
  idle_kiosks: number;
  offline_kiosks: number;
}

export interface DashboardData {
  hasData: boolean;
  mode: DataSourceMode;
  stats: DashboardStats;
  revenueChart: RevenueChartPoint[];
  popularityChart: PopularityChartPoint[];
  kioskStatus: KioskStatusItem[];
  topTemplate: TopTemplateInfo | null;
  rawBackendData?: BackendDashboardData | null;
  partnerScoped?: boolean;
}

export interface FetchDashboardOptions {
  mode?: DataSourceMode;
  range?: '7' | '30' | '90';
  userRole?: string | null;
  partnerName?: string | null;
  signal?: AbortSignal;
}

// ─── Aturan Perhitungan Pendapatan Terverifikasi ─────────────────────────────
/**
 * Menghitung Verified Paid Revenue secara ketat:
 * Sesi berstatus completed/Success tetapi status pembayaran unknown/unverified/pending/failed
 * DILARANG dimasukkan ke dalam Verified Paid Revenue!
 */
export function calculateVerifiedPaidRevenue(
  sessions: Array<{ amount?: number; status?: string; payment_status?: string }>
): number {
  return sessions
    .filter(s => {
      const ps = String(s.payment_status || '').trim().toLowerCase();
      // Hanya status pembayaran 'paid' atau 'success' yang diakui sebagai pendapatan terverifikasi
      return ps === 'paid' || ps === 'success';
    })
    .reduce((acc, s) => acc + (Math.round(Number(s.amount) || 0)), 0);
}

// ─── Deterministic Fixtures for SAFE_SIMULATION (Modul 6 & 7 Parity) ─────────
// Total 5 Kiosks (KSK-0001 s/d KSK-0005)
// Total 5 Sessions:
// - Sesi 8821: Paid Rp35.000 (status: completed/Success, payment_status: paid) -> Masuk Verified Paid
// - Sesi 8822: Unverified Rp25.000 (status: completed/Success, payment_status: unknown) -> TIDAK masuk Verified Paid
// - Sesi 8823: Failed Rp35.000 (status: failed, payment_status: failed) -> TIDAK masuk
// - Sesi 8824: Paid Rp35.000 (status: completed/Success, payment_status: paid) -> Masuk Verified Paid
// - Sesi 8825: Pending Rp25.000 (status: pending, payment_status: pending) -> TIDAK masuk
// Verified Paid Revenue = Rp 70.000 (hanya 8821 + 8824) | Gross Session Value = Rp 155.000
const FIXTURE_KIOSKS_ALL: KioskStatusItem[] = [
  { id: 'KSK-0001', name: 'Kiosk Central 01', location: 'Grand Indonesia, Lt. 3', status: 'online', lastSeen: 'Baru saja' },
  { id: 'KSK-0002', name: 'Kiosk West 02', location: 'Senayan City, Lt. 2', status: 'online', lastSeen: '2m lalu' },
  { id: 'KSK-0003', name: 'Kiosk North 03 (Mitra)', location: 'Central Park Mall, Lt. 1', status: 'online', lastSeen: '5m lalu', partnerName: 'Studio Senyum' },
  { id: 'KSK-0004', name: 'Kiosk South 04', location: 'Kota Kasablanka, GF', status: 'idle', lastSeen: '12m lalu' },
  { id: 'KSK-0005', name: 'Kiosk East 05', location: 'Pondok Indah Mall 2', status: 'offline', lastSeen: '1 jam lalu' },
];

const FIXTURE_POPULARITY_ALL: PopularityChartPoint[] = [
  { name: 'Graduation Frame', value: 45 },
  { name: 'Vintage Retro', value: 25 },
  { name: 'Minimalist B&W', value: 18 },
  { name: 'Cute Scrapbook', value: 12 },
];

function generateDeterministicRevenueChart(range: '7' | '30' | '90', paidTotal: number): RevenueChartPoint[] {
  const days = range === '7' ? 7 : range === '30' ? 14 : 20;
  const points: RevenueChartPoint[] = [];
  const baseDate = new Date(2026, 9, 23); // 2026-10-23

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Distribusi deterministic: sesi 8821 (Rp35k) pada 2 hari lalu, sesi 8824 (Rp35k) hari ini
    let val = 0;
    if (i === 0) val = 35000;
    else if (i === 2) val = 35000;
    else if (i % 3 === 0 && days > 7) val = 0;

    points.push({ name: dateStr, value: val });
  }
  return points;
}

export function getSyntheticDashboardData(range: '7' | '30' | '90' = '30', isSuperAdmin = true, partnerName?: string | null): DashboardData {
  if (!isSuperAdmin) {
    // Admin Mitra View: Data terisolasi hanya untuk mitra ini (mis. Studio Senyum)
    const partnerKiosks = FIXTURE_KIOSKS_ALL.filter(k => k.partnerName === (partnerName || 'Studio Senyum'));
    const online = partnerKiosks.filter(k => k.status === 'online').length;
    const idle = partnerKiosks.filter(k => k.status === 'idle').length;
    const offline = partnerKiosks.filter(k => k.status === 'offline').length;

    // Pada fixture Modul 6, sesi mitra KSK-0003 adalah 8823 (Failed Rp35.000) -> 0 verified paid revenue
    return {
      hasData: true,
      mode: 'SAFE_SIMULATION',
      partnerScoped: true,
      stats: {
        totalSessions: { value: 1, growth: 0, trend: 'neutral' },
        photosPrinted: { value: 0, growth: 0, trend: 'neutral' },
        revenueToday: {
          value: 0,
          growth: 0,
          trend: 'neutral',
          label: 'Verified Paid Revenue',
          sublabel: 'Tidak ada transaksi berstatus paid untuk mitra ini',
          isVerifiedPaid: true,
        },
        activeKiosks: {
          online,
          total: partnerKiosks.length,
          idle,
          offline,
        },
      },
      revenueChart: [
        { name: '2026-10-21', value: 0 },
        { name: '2026-10-22', value: 0 },
        { name: '2026-10-23', value: 0 },
      ],
      popularityChart: [
        { name: 'Vintage Retro', value: 100 },
      ],
      kioskStatus: partnerKiosks,
      topTemplate: { name: 'Vintage Retro', usageCount: 1 },
      rawBackendData: {
        total_kiosks: partnerKiosks.length,
        total_sessions: 1,
        total_revenue: 0,
        online_kiosks: online,
        idle_kiosks: idle,
        offline_kiosks: offline,
      },
    };
  }

  // Super Admin View: Keseluruhan sistem
  const totalKiosks = FIXTURE_KIOSKS_ALL.length;
  const online = FIXTURE_KIOSKS_ALL.filter(k => k.status === 'online').length;
  const idle = FIXTURE_KIOSKS_ALL.filter(k => k.status === 'idle').length;
  const offline = FIXTURE_KIOSKS_ALL.filter(k => k.status === 'offline').length;

  // Verified Paid Revenue HANYA dari sesi 8821 (Rp 35.000) + sesi 8824 (Rp 35.000).
  // Sesi 8822 (completed tetapi status pembayaran unknown/unverified Rp 25.000) TIDAK dihitung sebagai paid!
  const verifiedPaidRevenue = 70000;

  return {
    hasData: true,
    mode: 'SAFE_SIMULATION',
    partnerScoped: false,
    stats: {
      totalSessions: { value: 5, growth: 12.5, trend: 'up' }, // 5 total sessions
      photosPrinted: { value: 4, growth: 8.0, trend: 'up' },   // 2 completed paid sessions * 2 prints
      revenueToday: {
        value: verifiedPaidRevenue,
        growth: 15.3,
        trend: 'up',
        label: 'Verified Paid Revenue',
        sublabel: 'Status transaksi paid (Sesi 8821 & 8824). Sesi 8822 unverified dikecualikan',
        isVerifiedPaid: true,
      },
      activeKiosks: {
        online,
        total: totalKiosks,
        idle,
        offline,
      },
    },
    revenueChart: generateDeterministicRevenueChart(range, verifiedPaidRevenue),
    popularityChart: FIXTURE_POPULARITY_ALL,
    kioskStatus: FIXTURE_KIOSKS_ALL,
    topTemplate: { name: 'Graduation Frame', usageCount: 24 },
    rawBackendData: {
      total_kiosks: totalKiosks,
      total_sessions: 2, // backend predicate: completed sessions = 2
      total_revenue: verifiedPaidRevenue,
      online_kiosks: online,
      idle_kiosks: idle,
      offline_kiosks: offline,
    },
  };
}

/**
 * Normalisasi data dari respons resmi backend:
 * GET /api/v1/admin/dashboard
 *
 * Catatan Arsitektur:
 * Endpoint backend dashboardController.js menghitung total_revenue dari:
 *   SELECT SUM(payment_required_amount) FROM sessions WHERE s.status = 'completed'
 * Endpoint ini TIDAK mengembalikan record bukti pembayaran terverifikasi maupun status pembayaran per transaksi.
 * Oleh karena itu, pada mode AUTHORIZED_READ_ONLY metrik ini ditampilkan secara transparan sebagai:
 * "Completed Sessions Revenue (Backend Aggregate)", bukan "Verified Paid Revenue".
 */
export function normalizeBackendDashboardResponse(
  raw: any,
  isSuperAdmin = true
): DashboardData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Format response backend dashboard tidak valid.');
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;

  const total_kiosks = Number(data.total_kiosks) || 0;
  const total_sessions = Number(data.total_sessions) || 0;
  const total_revenue = Number(data.total_revenue) || 0;
  const online_kiosks = Number(data.online_kiosks) || 0;
  const idle_kiosks = Number(data.idle_kiosks) || 0;
  const offline_kiosks = Number(data.offline_kiosks) || 0;

  const rawBackendData: BackendDashboardData = {
    total_kiosks,
    total_sessions,
    total_revenue,
    online_kiosks,
    idle_kiosks,
    offline_kiosks,
  };

  const stats: DashboardStats = {
    totalSessions: {
      value: total_sessions,
      growth: 0,
      trend: 'neutral',
    },
    photosPrinted: {
      value: total_sessions * 2,
      growth: 0,
      trend: 'neutral',
    },
    revenueToday: {
      value: total_revenue,
      growth: 0,
      trend: 'neutral',
      label: 'Completed Sessions Revenue',
      sublabel: 'Agregat backend: SUM(payment_required_amount) WHERE status = completed',
      isVerifiedPaid: false, // Menandakan bahwa angka ini adalah agregat sesi selesai, bukan verified payment record terpisah
    },
    activeKiosks: {
      online: online_kiosks,
      total: total_kiosks,
      idle: idle_kiosks,
      offline: offline_kiosks,
    },
  };

  // Representasi revenue chart nyata (titik agregat saat ini)
  const todayStr = new Date().toISOString().split('T')[0];
  const revenueChart: RevenueChartPoint[] = [
    { name: todayStr, value: total_revenue },
  ];

  return {
    hasData: total_kiosks > 0 || total_sessions > 0 || total_revenue > 0,
    mode: 'AUTHORIZED_READ_ONLY',
    partnerScoped: !isSuperAdmin,
    stats,
    revenueChart,
    popularityChart: [], // Backend GET /dashboard tidak mengembalikan rincian popularitas template
    kioskStatus: [
      {
        id: 'online-summary',
        name: 'Kiosks Online',
        location: `${online_kiosks} unit aktif melayani sesi`,
        status: 'online',
        lastSeen: 'Real-time telemetry',
      },
      {
        id: 'idle-summary',
        name: 'Kiosks Idle',
        location: `${idle_kiosks} unit standby`,
        status: 'idle',
        lastSeen: 'Heartbeat < 10m',
      },
      {
        id: 'offline-summary',
        name: 'Kiosks Offline',
        location: `${offline_kiosks} unit tidak merespons`,
        status: 'offline',
        lastSeen: 'Heartbeat > 10m',
      },
    ],
    topTemplate: null, // Backend GET /dashboard tidak mengembalikan topTemplate
    rawBackendData,
  };
}

/**
 * Fetch data Dashboard utama dengan adapter resmi.
 */
export async function fetchDashboardData(options: FetchDashboardOptions = {}): Promise<DashboardData> {
  const activeMode = options.mode || getDataSourceMode();
  const isSuperAdmin = options.userRole === 'Super Admin' || options.userRole === 'admin';

  if (activeMode === 'SAFE_SIMULATION') {
    // Mode simulasi terisolasi: Nol panggilan ke backend
    return getSyntheticDashboardData(options.range || '30', isSuperAdmin, options.partnerName);
  }

  // Mode AUTHORIZED_READ_ONLY: Panggil endpoint resmi GET /api/v1/admin/dashboard
  try {
    const res = await api.get('/admin/dashboard', {
      signal: options.signal,
    });

    if (res.status === 200 && res.data) {
      return normalizeBackendDashboardResponse(res.data, isSuperAdmin);
    }

    throw new Error(`Server mengembalikan status HTTP ${res.status}`);
  } catch (err: any) {
    // Fail-Closed: JANGAN fallback diam-diam ke mock!
    if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
      throw err;
    }
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || err?.message || 'Gagal terhubung ke endpoint /api/v1/admin/dashboard';

    const error = new Error(
      status === 401
        ? 'Autentikasi gagal (401 Unauthorized): Sesi telah berakhir. Silakan login kembali.'
        : status === 403
        ? 'Akses ditolak (403 Forbidden): Anda tidak memiliki izin untuk melihat data dashboard ini.'
        : `Gagal memuat dashboard dari backend (${status || 'Network Error'}): ${msg}`
    );
    (error as any).status = status;
    (error as any).isFailClosed = true;
    throw error;
  }
}
