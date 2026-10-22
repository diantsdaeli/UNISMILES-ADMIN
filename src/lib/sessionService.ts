import { ENABLE_BACKEND_MUTATIONS, ServiceExecutionOptions } from './templates';
import { resolvePublicUrl } from './urls';
import api from './api';

export interface SessionPhoto {
  url: string;
  resolvedUrl: string;
  filename: string;
  isFrame: boolean;
  isPrintAsset: boolean;
  index: number;
}

export interface SessionItem {
  id: string; // Misal: '#US-8821' atau 'US-8821'
  rawId: string; // Misal: '8821' atau 'US-8821'
  timestamp: string; // ISO 8601 string
  template: string; // Nama frame template
  photos: string[]; // Daftar URL string mentah
  detailedPhotos: SessionPhoto[]; // Objek foto yang ternormalisasi dengan metadata
  amount: number; // Nilai transaksi sesi (Rp)
  status: 'Success' | 'Failed (Paper Jam)' | 'Pending' | string;
  kiosk_id: string; // ID kiosk pemilik sesi
  kiosk_name: string; // Nama kiosk yang terbaca manusia
  user_id?: string | number; // ID pemilik kiosk (untuk isolasi Admin Mitra)
  isSimulated?: boolean; // Penanda bahwa data berasal dari simulasi lokal yang aman
}

export interface SessionFilters {
  search?: string;
  status?: string;
  template?: string;
  kiosk?: string;
  startDate?: string;
  endDate?: string;
}

export interface CategorizedPhotos {
  framePhoto: SessionPhoto | null;
  singlePhotos: SessionPhoto[];
  allPhotos: SessionPhoto[];
}

/**
 * Parsing JSON string dengan fallback aman
 */
export const safeParseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Memvalidasi apakah URL foto aman (hanya HTTP, HTTPS, path relatif /uploads/, data:image, atau blob:)
 * Menangkal potensi serangan XSS (javascript:, vbscript:, data:text/html)
 */
export const isSafePhotoUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Larang protokol berbahaya
  if (/^(?:javascript|vbscript|file):/i.test(trimmed)) {
    return false;
  }

  // Izinkan path relatif terpercaya
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return true;
  }

  // Izinkan HTTP & HTTPS
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  // Izinkan data URL hanya jika bertipe gambar
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(trimmed)) {
    return true;
  }

  // Izinkan blob URL
  if (/^blob:/i.test(trimmed)) {
    return true;
  }

  return false;
};

/**
 * Normalisasi daftar URL foto dari berbagai kemungkinan struktur backend
 * Mendukung JSON string, array, object values, dan objek nested { url, imageUrl, path }
 */
export const normalizePhotos = (rawPhotosInput: unknown): string[] => {
  const parsed = safeParseJson(rawPhotosInput);

  let rawList: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (typeof parsed === 'string') {
    rawList = parsed.split(',').map(s => s.trim()).filter(Boolean);
  } else if (parsed && typeof parsed === 'object') {
    rawList = Object.values(parsed);
  }

  return rawList
    .map((item: any) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(
        item.url ??
        item.image_url ??
        item.imageUrl ??
        item.photo_url ??
        item.photoUrl ??
        item.path ??
        item.file_url ??
        item.fileUrl ??
        ''
      ).trim();
    })
    .filter(isSafePhotoUrl);
};

/**
 * Parsing satu URL foto menjadi objek SessionPhoto dengan metadata lengkap
 */
export const parseSessionPhoto = (photoUrl: string, index: number, isLast: boolean = false): SessionPhoto => {
  const cleanUrl = String(photoUrl || '').trim();
  if (!isSafePhotoUrl(cleanUrl)) {
    return {
      url: '',
      resolvedUrl: '',
      filename: 'unsafe-blocked.jpg',
      isFrame: false,
      isPrintAsset: false,
      index,
    };
  }

  const resolvedUrl = resolvePublicUrl(cleanUrl);
  
  // Ekstrak nama file sederhana
  let filename = `photo-${index + 1}.jpg`;
  try {
    const parts = cleanUrl.split('?')[0].split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart) filename = lastPart;
  } catch (_) {}

  const isPrintAsset = cleanUrl.includes('/uploads/print/') || cleanUrl.includes('print_asset');
  const isFrame = cleanUrl.includes('_frame') || cleanUrl.includes('frame_result') || (!cleanUrl.includes('raw') && isLast);

  return {
    url: cleanUrl,
    resolvedUrl,
    filename,
    isFrame,
    isPrintAsset,
    index,
  };
};


/**
 * Memisahkan foto hasil frame akhir dengan foto satuan mentah
 * Selaras dengan logika serveDownloadPage pada backend_uni_gateway downloadController
 */
export const categorizeSessionPhotos = (photos: string[]): CategorizedPhotos => {
  const validPhotos = (photos || []).filter(Boolean);
  const total = validPhotos.length;

  if (total === 0) {
    return { framePhoto: null, singlePhotos: [], allPhotos: [] };
  }

  const detailedList = validPhotos.map((url, idx) => parseSessionPhoto(url, idx, idx === total - 1));

  // 1. Cari yang eksplisit memiliki '_frame'
  const explicitFrame = detailedList.find(p => p.url.includes('_frame') || p.url.includes('frame_result'));
  if (explicitFrame) {
    const single = detailedList.filter(p => p !== explicitFrame);
    return {
      framePhoto: { ...explicitFrame, isFrame: true },
      singlePhotos: single.map(p => ({ ...p, isFrame: false })),
      allPhotos: detailedList,
    };
  }

  // 2. Jika lebih dari 1 foto, foto terakhir diasumsikan frame komposit
  if (total > 1) {
    const frame = detailedList[total - 1];
    const single = detailedList.slice(0, total - 1);
    return {
      framePhoto: { ...frame, isFrame: true },
      singlePhotos: single.map(p => ({ ...p, isFrame: false })),
      allPhotos: detailedList,
    };
  }

  // 3. Hanya 1 foto: dianggap frame foto utama
  return {
    framePhoto: { ...detailedList[0], isFrame: true },
    singlePhotos: [],
    allPhotos: detailedList,
  };
};

/**
 * Normalisasi data satu sesi dari respons backend / raw data
 */
export const normalizeSession = (raw: any): SessionItem => {
  const sessionCode = String(raw?.session_code ?? raw?.sessionCode ?? raw?.id ?? '').trim();
  const rawId = sessionCode.replace(/^#/, '').replace(/^US-/, '');
  const id = sessionCode.startsWith('#') 
    ? sessionCode 
    : (sessionCode.startsWith('US-') ? `#${sessionCode}` : `#US-${sessionCode}`);

  const timestamp = raw?.timestamp ?? raw?.created_at ?? raw?.createdAt ?? raw?.started_at ?? new Date().toISOString();
  const template = String(raw?.template ?? raw?.template_name ?? raw?.templateName ?? 'Default');
  
  const rawPhotos = raw?.photos ?? raw?.photo_urls ?? raw?.images ?? [];
  const photos = normalizePhotos(rawPhotos);
  const { allPhotos } = categorizeSessionPhotos(photos);

  const amount = Number(raw?.amount ?? raw?.total_amount ?? raw?.totalAmount ?? 0);
  
  // Normalisasi status
  let status = String(raw?.status ?? 'Unknown');
  if (status === 'completed' || status === 'success') {
    status = 'Success';
  } else if (status === 'failed' || status === 'error') {
    status = 'Failed (Paper Jam)';
  } else if (status === 'pending') {
    status = 'Pending';
  }

  const kiosk_id = String(raw?.kiosk_id ?? raw?.kioskId ?? 'KSK-0001');
  const kiosk_name = String(raw?.kiosk_name ?? raw?.kioskName ?? raw?.kiosk_id ?? 'Kiosk Station');
  const user_id = raw?.user_id ?? raw?.userId;
  const isSimulated = Boolean(raw?.isSimulated);

  return {
    id,
    rawId,
    timestamp,
    template,
    photos,
    detailedPhotos: allPhotos,
    amount,
    status,
    kiosk_id,
    kiosk_name,
    user_id,
    isSimulated,
  };
};

/**
 * Baseline Seed Sessions Deterministik untuk Mode Simulasi Terisolasi
 */
export const SEED_SESSIONS: SessionItem[] = [
  {
    id: '#US-8821',
    rawId: '8821',
    timestamp: '2026-10-22T10:15:00.000Z',
    template: 'Gold Birthday',
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80_frame'
    ],
    detailedPhotos: [],
    amount: 35000,
    status: 'Success',
    kiosk_id: 'KSK-0001',
    kiosk_name: 'Kiosk Central Park Mall',
    user_id: 1,
    isSimulated: true,
  },
  {
    id: '#US-8822',
    rawId: '8822',
    timestamp: '2026-10-22T11:20:00.000Z',
    template: 'Toy Story Kids',
    photos: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80_frame'
    ],
    detailedPhotos: [],
    amount: 25000,
    status: 'Success',
    kiosk_id: 'KSK-0002',
    kiosk_name: 'Kiosk Grand Indonesia',
    user_id: 2,
    isSimulated: true,
  },
  {
    id: '#US-8823',
    rawId: '8823',
    timestamp: '2026-10-22T13:45:00.000Z',
    template: 'Graduation Theme',
    photos: [
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80'
    ],
    detailedPhotos: [],
    amount: 35000,
    status: 'Failed (Paper Jam)',
    kiosk_id: 'KSK-0001',
    kiosk_name: 'Kiosk Central Park Mall',
    user_id: 1,
    isSimulated: true,
  },
  {
    id: '#US-8824',
    rawId: '8824',
    timestamp: '2026-10-22T15:10:00.000Z',
    template: 'Gold Birthday',
    photos: [
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80_frame'
    ],
    detailedPhotos: [],
    amount: 35000,
    status: 'Success',
    kiosk_id: 'KSK-0003',
    kiosk_name: 'Kiosk Senayan City',
    user_id: 1,
    isSimulated: true,
  },
  {
    id: '#US-8825',
    rawId: '8825',
    timestamp: '2026-10-22T16:30:00.000Z',
    template: 'Toy Story Kids',
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80'
    ],
    detailedPhotos: [],
    amount: 25000,
    status: 'Pending',
    kiosk_id: 'KSK-0002',
    kiosk_name: 'Kiosk Grand Indonesia',
    user_id: 2,
    isSimulated: true,
  }
].map(s => {
  const { allPhotos } = categorizeSessionPhotos(s.photos);
  return { ...s, detailedPhotos: allPhotos };
});

/**
 * Filter sesi berdasarkan Role & Kepemilikan Kiosk (RBAC Client Isolation)
 * - Super Admin: Dapat melihat seluruh sesi dari semua kiosk
 * - Admin Mitra: Hanya dapat melihat sesi yang berasal dari kiosk miliknya
 */
export const filterSessionsByRole = (
  sessions: SessionItem[],
  user: { id: string | number; role: string } | null,
  userKiosks?: { id: string; user_id?: string | number }[]
): SessionItem[] => {
  if (!user) return [];
  if (user.role === 'Super Admin') return sessions;

  // Untuk Admin Mitra: Cocokkan ID kiosk milik user
  const allowedKioskIds = new Set(
    (userKiosks || [])
      .filter(k => String(k.user_id) === String(user.id))
      .map(k => k.id)
  );

  return sessions.filter(session => {
    // 1. Jika sesi punya user_id eksplisit
    if (session.user_id !== undefined && String(session.user_id) === String(user.id)) {
      return true;
    }
    // 2. Jika kiosk_id sesi cocok dengan kiosk milik mitra
    if (allowedKioskIds.has(session.kiosk_id)) {
      return true;
    }
    return false;
  });
};

/**
 * Filter koleksi sesi berdasarkan kriteria pencarian UI
 */
export const filterSessions = (sessions: SessionItem[], filters: SessionFilters): SessionItem[] => {
  const searchLower = (filters.search || '').trim().toLowerCase();
  const statusFilter = filters.status || 'All Status';
  const templateFilter = filters.template || 'All Templates';
  const kioskFilter = filters.kiosk || 'All Kiosks';
  const start = filters.startDate ? new Date(filters.startDate) : null;
  const end = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : null;

  return sessions.filter(session => {
    // 1. Search (ID, Template, Kiosk Name, Kiosk ID)
    if (searchLower) {
      const matchId = session.id.toLowerCase().includes(searchLower) || session.rawId.toLowerCase().includes(searchLower);
      const matchTemplate = (session.template || '').toLowerCase().includes(searchLower);
      const matchKiosk = (session.kiosk_name || '').toLowerCase().includes(searchLower) || (session.kiosk_id || '').toLowerCase().includes(searchLower);
      if (!matchId && !matchTemplate && !matchKiosk) return false;
    }

    // 2. Status
    if (statusFilter !== 'All Status' && session.status !== statusFilter) {
      return false;
    }

    // 3. Template
    if (templateFilter !== 'All Templates' && (session.template || 'Default') !== templateFilter) {
      return false;
    }

    // 4. Kiosk
    if (kioskFilter !== 'All Kiosks') {
      const matchesKiosk = session.kiosk_id === kioskFilter || session.kiosk_name === kioskFilter;
      if (!matchesKiosk) return false;
    }

    // 5. Date Range
    if (start || end) {
      const sessionDate = new Date(session.timestamp);
      if (isNaN(sessionDate.getTime())) return true;
      if (start && sessionDate < start) return false;
      if (end && sessionDate > end) return false;
    }

    return true;
  });
};

/**
 * Sanitasi string untuk mencegah CSV Injection (Formula Injection Vulnerability)
 */
export const sanitizeCsvField = (field: string | number | null | undefined): string => {
  if (field === null || field === undefined) return '""';
  let str = String(field).trim();
  // Tangkal karakter formula spreadsheet: =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape quote ganda
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

/**
 * Generate string CSV aman dari daftar sesi yang terfilter
 */
export const generateExportCSV = (sessions: SessionItem[]): string => {
  const headers = ['Session ID', 'Kiosk ID', 'Kiosk Name', 'Date & Time', 'Template', 'Amount (IDR)', 'Status', 'Total Photos'];
  const rows = sessions.map(s => [
    sanitizeCsvField(s.id),
    sanitizeCsvField(s.kiosk_id),
    sanitizeCsvField(s.kiosk_name),
    sanitizeCsvField(new Date(s.timestamp).toLocaleString('id-ID')),
    sanitizeCsvField(s.template),
    sanitizeCsvField(s.amount),
    sanitizeCsvField(s.status),
    sanitizeCsvField(s.photos.length),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

/**
 * Audit Keselamatan Operasi Cetak Ulang (Reprint Guard)
 * Memastikan perintah cetak ulang fisik tidak dipicu ke hardware langsung saat mode simulasi
 */
export const auditReprintSafety = (session: SessionItem, kioskStatus?: string): { allowed: boolean; reason: string } => {
  if (!ENABLE_BACKEND_MUTATIONS) {
    return {
      allowed: false,
      reason: 'SAFEGUARD FAIL-CLOSED: Perintah cetak ulang hardware fisik dinonaktifkan pada mode simulasi untuk melindungi aset produksi.',
    };
  }

  if (kioskStatus === 'offline') {
    return {
      allowed: false,
      reason: 'Kiosk sedang offline. Tidak dapat mengirim perintah cetak ulang.',
    };
  }

  if (session.status === 'Pending') {
    return {
      allowed: false,
      reason: 'Sesi belum selesai. Foto akhir belum tersedia untuk dicetak ulang.',
    };
  }

  return { allowed: true, reason: 'Perintah cetak ulang diizinkan.' };
};

/**
 * Simulasi Pengiriman Email Salinan Digital Foto
 * Memvalidasi format email dan mengembalikan tautan unduhan aman
 */
export const sendDigitalCopySimulation = async (
  sessionCode: string,
  email: string
): Promise<{ success: boolean; message: string; downloadUrl?: string }> => {
  const cleanEmail = String(email || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    throw new Error('Alamat email penerima tidak valid.');
  }

  const cleanCode = sessionCode.replace(/^#/, '');
  const downloadUrl = `https://backend-photobooth.uniinside.net/download/${encodeURIComponent(cleanCode)}`;

  // Simulasi latensi jaringan aman
  await new Promise(r => setTimeout(r, 600));

  return {
    success: true,
    message: `[SIMULASI] Salinan digital foto untuk sesi #${cleanCode} berhasil dikirim ke ${cleanEmail}. (Layanan live dinonaktifkan demi keselamatan).`,
    downloadUrl,
  };
};

/**
 * Service Pembacaan Sesi Utama:
 * Mendukung pembacaan backend nyata (/api/v1/admin/sessions) dengan fallback aman ke seed sessions deterministik.
 */
export const fetchSessionsService = async (options?: ServiceExecutionOptions): Promise<SessionItem[]> => {
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    // Kembalikan seed data terisolasi yang sudah ternormalisasi
    return SEED_SESSIONS;
  }

  try {
    const client = options?.customApi || api;
    const response = await client.get('/admin/sessions');
    const responseData = response.data?.data ?? response.data;
    const rawSessions = Array.isArray(responseData)
      ? responseData
      : (responseData?.sessions || responseData?.items || responseData?.results || []);

    if (Array.isArray(rawSessions) && rawSessions.length > 0) {
      return rawSessions.map(normalizeSession);
    }

    return [];
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    // DILARANG fallback ke data mock saat terjadi error autentikasi / otorisasi (401/403)
    if (status === 401 || status === 403) {
      throw err;
    }
    console.warn('[sessionService] Failed to load from /admin/sessions, falling back to safe local draft:', err?.message || err);
    return SEED_SESSIONS;
  }
};

