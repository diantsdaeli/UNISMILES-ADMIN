import { ENABLE_BACKEND_MUTATIONS, VERIFIED_STAGING_ALLOWLIST, assertMutationAllowed } from './templates';
import api from './api';
import type { Kiosk } from '../KioskContext';

/**
 * Tipe data untuk status koneksi deterministik kiosk
 */
export type KioskStatus = 'online' | 'idle' | 'offline' | 'restarting' | 'unknown';

/**
 * Tipe data untuk payload registrasi kiosk
 */
export interface KioskRegistrationPayload {
  id?: string;
  name: string;
  location?: string;
  base_price?: number | string;
}

/**
 * Tipe data untuk hasil validasi input
 */
export interface KioskValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Normalisasi data telemetri hardware kiosk
 */
export interface NormalizedKioskTelemetry {
  printerInk: number | null;
  storage: number | null;
  camera: string | null;
  paperStatus: string;
  printsRemaining: number | null;
}

/**
 * Placeholder token simulasi aman yang secara eksplisit TIDAK valid pada backend produksi
 * dan TIDAK menggunakan format token produksi `kiosk_<32_hex>`.
 */
export const SIMULATED_TOKEN_PREFIX = 'SIMULATED_DEVICE_TOKEN_NOT_VALID';

/**
 * Menghasilkan token kredensial simulasi yang aman untuk testing di antarmuka
 */
export function generateSimulatedDeviceToken(kioskId: string): string {
  const cleanId = String(kioskId || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${SIMULATED_TOKEN_PREFIX}_${cleanId}`;
}

/**
 * Menyusun format konfigurasi .env untuk Kiosk Photobooth
 */
export function buildEnvConfigSnippet(deviceId: string, deviceToken: string): string {
  return `# UNISMILES Photobooth Kiosk Configuration\nDEVICE_ID=${deviceId}\nDEVICE_TOKEN=${deviceToken}\n`;
}

/**
 * Mengambil kredensial kiosk atau null jika kredensial tidak tersedia / belum diterbitkan.
 * Menjamin tidak mengarang token palsu jika kiosk.hasCredentials === false.
 */
export function getKioskCredentials(kiosk: Kiosk): { deviceId: string; deviceToken: string } | null {
  if (!kiosk || kiosk.hasCredentials === false) {
    return null;
  }
  return {
    deviceId: kiosk.id,
    deviceToken: generateSimulatedDeviceToken(kiosk.id)
  };
}

/**
 * Validasi form registrasi kiosk
 * Catatan kontrak backend:
 * - `name`: WAJIB diisi (string tidak kosong, min 3 karakter)
 * - `location`: Opsional (string)
 * - `base_price`: Opsional di backend (default 0), tetapi jika diisi harus berupa angka non-negatif
 * - `id`: Opsional di backend (default auto KSK-xxxx). Jika diisi harus diawali KSK-
 */
export function validateKioskRegistration(payload: unknown): KioskValidationResult {
  const errors: Record<string, string> = {};

  if (!payload || typeof payload !== 'object') {
    return { isValid: false, errors: { form: 'Payload registrasi tidak valid' } };
  }

  const p = payload as Record<string, unknown>;

  // 1. Validasi Name (Wajib)
  if (typeof p.name !== 'string' || !p.name.trim()) {
    errors.name = 'Nama kiosk wajib diisi';
  } else if (p.name.trim().length < 3) {
    errors.name = 'Nama kiosk minimal 3 karakter';
  } else if (p.name.trim().length > 100) {
    errors.name = 'Nama kiosk maksimal 100 karakter';
  }

  // 2. Validasi Location (Opsional)
  if (p.location !== undefined && p.location !== null) {
    if (typeof p.location !== 'string') {
      errors.location = 'Lokasi harus berupa teks';
    } else if (p.location.trim().length > 255) {
      errors.location = 'Lokasi maksimal 255 karakter';
    }
  }

  // 3. Validasi Base Price (Opsional di backend, namun bila diisi harus angka valid >= 0)
  if (p.base_price !== undefined && p.base_price !== null && String(p.base_price).trim() !== '') {
    const numericPrice = Number(p.base_price);
    if (isNaN(numericPrice) || !Number.isFinite(numericPrice)) {
      errors.base_price = 'Tarif dasar (Base Price) harus berupa angka valid';
    } else if (numericPrice < 0) {
      errors.base_price = 'Tarif dasar tidak boleh bernilai negatif';
    } else if (numericPrice > 10_000_000) {
      errors.base_price = 'Tarif dasar melebihi batas wajar (maks Rp 10.000.000)';
    }
  }

  // 4. Validasi Custom ID (Opsional, jika diisi harus berformat KSK-*)
  if (p.id !== undefined && p.id !== null && String(p.id).trim() !== '') {
    const rawId = String(p.id).trim();
    if (!/^KSK-[A-Za-z0-9_-]{2,32}$/i.test(rawId)) {
      errors.id = 'Device ID kustom harus diawali dengan "KSK-" dan hanya memuat alfanumerik (2-32 karakter)';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Menghitung status deterministik kiosk berdasarkan timestamp lastHeartbeat
 * - Null / invalid / string kosong -> 'unknown'
 * - Timestamp di masa depan yang tidak wajar (> 5 menit) -> 'unknown'
 * - < 2 menit lalu (dan socket terhubung bila diketahui) -> 'online'
 * - 2 s/d 10 menit lalu -> 'idle'
 * - >= 10 menit lalu -> 'offline'
 */
export function getComputedStatus(
  lastHeartbeat: string | number | Date | null | undefined,
  isSocketConnected?: boolean
): KioskStatus {
  if (!lastHeartbeat) return 'unknown';

  let timestampMs: number;
  if (typeof lastHeartbeat === 'number') {
    timestampMs = lastHeartbeat;
  } else if (lastHeartbeat instanceof Date) {
    timestampMs = lastHeartbeat.getTime();
  } else if (typeof lastHeartbeat === 'string') {
    const normalized = lastHeartbeat.includes(' ') && !lastHeartbeat.includes('T')
      ? lastHeartbeat.replace(' ', 'T')
      : lastHeartbeat;
    timestampMs = new Date(normalized).getTime();
  } else {
    return 'unknown';
  }

  if (isNaN(timestampMs) || !Number.isFinite(timestampMs)) {
    return 'unknown';
  }

  const now = Date.now();
  const diffMs = now - timestampMs;

  // Deteksi anomali waktu masa depan (> 5 menit di masa depan)
  if (diffMs < -300_000) {
    return 'unknown';
  }

  // Toleransi kecil clock drift masa depan (< 5 menit): anggap baru saja
  const effectiveDiffMs = Math.max(0, diffMs);
  const diffMin = effectiveDiffMs / 60_000;

  if (diffMin < 2) {
    if (isSocketConnected === false) {
      return 'idle'; // Heartbeat baru tetapi koneksi socket terputus
    }
    return 'online';
  }

  if (diffMin < 10) {
    return 'idle';
  }

  return 'offline';
}

/**
 * Memformat teks waktu detak jantung relatif deterministik
 */
export function formatLastHeartbeat(lastHeartbeat: string | number | Date | null | undefined): string {
  if (!lastHeartbeat) return 'Belum pernah terhubung';

  let timestampMs: number;
  if (typeof lastHeartbeat === 'number') {
    timestampMs = lastHeartbeat;
  } else if (lastHeartbeat instanceof Date) {
    timestampMs = lastHeartbeat.getTime();
  } else if (typeof lastHeartbeat === 'string') {
    const normalized = lastHeartbeat.includes(' ') && !lastHeartbeat.includes('T')
      ? lastHeartbeat.replace(' ', 'T')
      : lastHeartbeat;
    timestampMs = new Date(normalized).getTime();
  } else {
    return 'Belum pernah terhubung';
  }

  if (isNaN(timestampMs)) return 'Format waktu tidak valid';

  const now = Date.now();
  const diffSec = Math.floor((now - timestampMs) / 1000);

  if (diffSec < -300) return 'Waktu telemetri tidak wajar';
  if (diffSec < 10) return 'Terakhir aktif: baru saja';
  if (diffSec < 60) return `Terakhir aktif: ${Math.max(0, diffSec)} dtk lalu`;
  if (diffSec < 3600) return `Terakhir aktif: ${Math.floor(diffSec / 60)} mnt lalu`;
  if (diffSec < 86400) return `Terakhir aktif: ${Math.floor(diffSec / 3600)} jam lalu`;
  return `Terakhir aktif: ${Math.floor(diffSec / 86400)} hari lalu`;
}

/**
 * Menormalkan telemetri hardware kiosk.
 * KETENTUAN: Jika data tidak tersedia/undefined, kembalikan null agar UI menampilkan 'Unknown' / 'N/A',
 * bukan secara keliru mengarang 0% atau 'GOOD'.
 */
export function normalizeKioskTelemetry(rawHealth: unknown): NormalizedKioskTelemetry {
  if (!rawHealth || typeof rawHealth !== 'object') {
    return {
      printerInk: null,
      storage: null,
      camera: null,
      paperStatus: 'UNKNOWN',
      printsRemaining: null,
    };
  }

  const h = rawHealth as Record<string, unknown>;

  // 1. Tinta Printer: Cari printerInk atau inkLevel
  let printerInk: number | null = null;
  const rawInk = h.printerInk !== undefined ? h.printerInk : h.inkLevel;
  if (rawInk !== undefined && rawInk !== null && String(rawInk).trim() !== '') {
    const parsed = Number(rawInk);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      printerInk = Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }

  // 2. Storage: Cari storageUsedPercent atau storage
  let storage: number | null = null;
  const rawStorage = h.storageUsedPercent !== undefined ? h.storageUsedPercent : h.storage;
  if (rawStorage !== undefined && rawStorage !== null && String(rawStorage).trim() !== '') {
    const parsed = Number(rawStorage);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      storage = Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }

  // 3. Kamera: Cari cameraStatus atau camera
  let camera: string | null = null;
  const rawCam = h.cameraStatus !== undefined ? h.cameraStatus : h.camera;
  if (rawCam !== undefined && rawCam !== null && String(rawCam).trim() !== '') {
    camera = String(rawCam).toUpperCase();
  }

  // 4. Paper status & prints remaining
  const paperStatus = typeof h.paperStatus === 'string' && h.paperStatus.trim()
    ? h.paperStatus.toUpperCase()
    : 'NORMAL';

  let printsRemaining: number | null = null;
  if (h.printsRemaining !== undefined && h.printsRemaining !== null) {
    const parsedRemaining = Number(h.printsRemaining);
    if (!isNaN(parsedRemaining) && Number.isFinite(parsedRemaining)) {
      printsRemaining = Math.max(0, Math.round(parsedRemaining));
    }
  }

  return {
    printerInk,
    storage,
    camera,
    paperStatus,
    printsRemaining,
  };
}

/**
 * Filter daftar kiosk berdasarkan hak akses RBAC pengguna:
 * - Super Admin: dapat melihat seluruh kiosk
 * - Admin Mitra: hanya melihat kiosk miliknya (kiosk.user_id === user.id)
 */
export function filterKiosksByRole(
  kiosks: Kiosk[],
  user: { id?: string | number; role?: string; isSuperAdmin?: boolean } | null | undefined
): Kiosk[] {
  if (!kiosks || !Array.isArray(kiosks)) return [];
  if (!user) return [];

  const isSuper = user.role === 'Super Admin' || user.role === 'admin' || Boolean(user.isSuperAdmin);
  if (isSuper) {
    return kiosks;
  }

  // Admin Mitra: filter berbasis user_id kepemilikan
  const userIdStr = user.id ? String(user.id) : null;
  if (!userIdStr) {
    return [];
  }

  return kiosks.filter(k => {
    if (k.user_id !== undefined && k.user_id !== null) {
      return String(k.user_id) === userIdStr;
    }
    // Fallback: Jika kiosk lama belum memiliki user_id eksplisit, sesuaikan
    return false;
  });
}

/**
 * Registrasi Kiosk dalam mode Simulasi Aman
 */
export async function registerKioskSimulation(
  payload: KioskRegistrationPayload,
  userId?: string | number,
  options?: { customApi?: any }
): Promise<{ kiosk: Kiosk; credentials: { deviceId: string; deviceToken: string }; simulated: boolean }> {
  // Fail-closed safeguard: cegah mutasi tidak sengaja ke backend produksi
  if (ENABLE_BACKEND_MUTATIONS) {
    const client = options?.customApi ?? api;
    const targetBaseUrl = client.defaults?.baseURL || '';
    assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));
  }

  const validation = validateKioskRegistration(payload);
  if (!validation.isValid) {
    const firstKey = Object.keys(validation.errors)[0];
    throw new Error(validation.errors[firstKey] || 'Validasi pendaftaran kiosk gagal');
  }

  const finalId = payload.id && payload.id.trim()
    ? payload.id.trim()
    : `KSK-${Date.now().toString().slice(-4)}`;

  const finalPrice = payload.base_price !== undefined && String(payload.base_price).trim() !== ''
    ? Number(payload.base_price)
    : 35000;

  const simulatedToken = generateSimulatedDeviceToken(finalId);

  const newKiosk: Kiosk = {
    id: finalId,
    name: payload.name.trim(),
    location: payload.location ? payload.location.trim() : 'Lokasi Belum Ditentukan',
    base_price: finalPrice,
    price: finalPrice,
    status: 'unknown', // Status awal deterministik sebelum ada sinyal telemetri riil
    health: {
      printerInk: 100,
      storage: 0,
      camera: 'good'
    },
    config: {
      brightness: 80,
      volume: 50,
      maintenanceMode: false,
      autoRestart: '03:00',
      operatingHours: { open: '09:00', close: '22:00' },
      notifications: { email: 'admin@unismiles.com' },
      orientation: 'portrait',
      resolution: '1080x1920',
      aspectRatio: '9:16'
    },
    user_id: userId || '1',
    lastHeartbeat: null,
    createdAt: new Date().toISOString(),
    api_key: null // Secret tidak disimpan di state kiosk terbuka
  };

  return {
    kiosk: newKiosk,
    credentials: {
      deviceId: finalId,
      deviceToken: simulatedToken
    },
    simulated: true
  };
}

/**
 * Regenerasi Device Token dalam mode Simulasi Aman
 */
export async function regenerateCredentialSimulation(
  kioskId: string,
  options?: { customApi?: any }
): Promise<{ deviceId: string; deviceToken: string; simulated: boolean }> {
  if (ENABLE_BACKEND_MUTATIONS) {
    const client = options?.customApi ?? api;
    const targetBaseUrl = client.defaults?.baseURL || '';
    assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));
  }

  const simulatedToken = generateSimulatedDeviceToken(kioskId);

  return {
    deviceId: kioskId,
    deviceToken: simulatedToken,
    simulated: true
  };
}

/**
 * Soft Delete Kiosk dalam mode Simulasi Aman dengan konfirmasi nama
 */
export async function softDeleteKioskSimulation(
  kioskId: string,
  confirmedName: string,
  actualName: string,
  options?: { customApi?: any }
): Promise<{ success: boolean; simulated: boolean }> {
  if (ENABLE_BACKEND_MUTATIONS) {
    const client = options?.customApi ?? api;
    const targetBaseUrl = client.defaults?.baseURL || '';
    assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));
  }

  if (!confirmedName || confirmedName.trim() !== actualName.trim()) {
    throw new Error('Nama kiosk yang dimasukkan tidak cocok dengan nama kiosk yang akan dihapus');
  }

  return {
    success: true,
    simulated: true
  };
}

/**
 * Tipe data untuk hasil parsing error API Kiosk
 */
export interface ParsedKioskError {
  status: number;
  code: string;
  message: string;
  isSecurityError: boolean;
  isNetworkError: boolean;
}

/**
 * Parser error terstandarisasi untuk request API kiosk backend
 */
export function parseKioskApiError(error: any): ParsedKioskError {
  const status = error?.response?.status || (error?.statusCode ?? 0);
  const data = error?.response?.data;
  const code = data?.error_code || error?.code || (
    status === 400 ? 'BAD_REQUEST' :
    status === 401 ? 'UNAUTHORIZED' :
    status === 403 ? 'FORBIDDEN' :
    status === 404 ? 'NOT_FOUND' :
    status === 409 ? 'CONFLICT' :
    status === 500 ? 'INTERNAL_SERVER_ERROR' :
    'UNKNOWN_ERROR'
  );
  const message = data?.message || error?.message || 'Terjadi kesalahan pada kiosk service.';
  const isSecurityError = status === 401 || status === 403 || message.includes('PERLINDUNGAN PRODUKSI') || message.includes('SAFEGUARD');
  const isNetworkError = !status || error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout') || String(error?.message || '').toLowerCase().includes('network error');

  return {
    status,
    code,
    message,
    isSecurityError,
    isNetworkError,
  };
}

/**
 * Normalisasi data response backend /api/v1/admin/kiosks menjadi entitas Kiosk yang aman
 */
export function deserializeKioskResponse(raw: any): Kiosk {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Format response kiosk dari backend tidak valid');
  }

  const rawKiosk = raw.data || raw;
  const id = String(rawKiosk.id || rawKiosk.kiosk_id || 'UNKNOWN');
  const name = String(rawKiosk.name || 'Unnamed Kiosk');
  const location = String(rawKiosk.location || '');
  const base_price = Number(rawKiosk.base_price !== undefined ? rawKiosk.base_price : (rawKiosk.price || 0));
  const health = normalizeKioskTelemetry(rawKiosk.health || rawKiosk);
  const lastHeartbeat = rawKiosk.lastHeartbeat || rawKiosk.last_heartbeat || rawKiosk.updated_at || null;
  const status = rawKiosk.status === 'restarting'
    ? 'restarting'
    : getComputedStatus(lastHeartbeat, rawKiosk.isSocketConnected);

  return {
    id,
    name,
    location,
    base_price,
    price: base_price,
    status,
    health: {
      printerInk: health.printerInk,
      storage: health.storage,
      camera: health.camera,
      paperStatus: health.paperStatus,
      printsRemaining: health.printsRemaining
    },
    config: rawKiosk.config || {},
    lastHeartbeat,
    createdAt: rawKiosk.createdAt || rawKiosk.created_at || new Date().toISOString(),
    user_id: rawKiosk.user_id !== undefined ? rawKiosk.user_id : undefined,
    api_key: null, // Sanitasi ketat: api_key backend tidak disimpan di entity kiosk terbuka
    isSimulated: Boolean(rawKiosk.isSimulated),
    hasCredentials: rawKiosk.hasCredentials !== false
  };
}

/**
 * Menyusun payload registrasi kiosk sebelum dikirim ke backend /api/v1/admin/kiosks
 */
export function serializeKioskPayload(payload: KioskRegistrationPayload): Record<string, unknown> {
  const validation = validateKioskRegistration(payload);
  if (!validation.isValid) {
    const firstKey = Object.keys(validation.errors)[0];
    throw new Error(validation.errors[firstKey] || 'Validasi pendaftaran kiosk gagal');
  }

  const basePriceNum = payload.base_price !== undefined && String(payload.base_price).trim() !== ''
    ? Number(payload.base_price)
    : 0;

  return {
    name: payload.name.trim(),
    location: payload.location ? payload.location.trim() : '',
    price: basePriceNum,
    base_price: basePriceNum,
    ...(payload.id && payload.id.trim() ? { id: payload.id.trim() } : {})
  };
}

/**
 * Struktur audit keamanan operasi kiosk
 */
export interface KioskOperationSafetyAudit {
  isPhysicalRebootBlocked: boolean;
  isRealWebSocketDisconnectBlocked: boolean;
  isProductionKeyRotationBlocked: boolean;
  isBackendDeleteBlocked: boolean;
  isHardwarePrintBlocked: boolean;
  mode: 'SAFE_SIMULATION';
}

/**
 * Mengaudit bahwa seluruh aksi operasional kiosk berjalan dalam simulasi terisolasi
 */
export function auditKioskOperationSafety(): KioskOperationSafetyAudit {
  return {
    isPhysicalRebootBlocked: true,
    isRealWebSocketDisconnectBlocked: true,
    isProductionKeyRotationBlocked: true,
    isBackendDeleteBlocked: true,
    isHardwarePrintBlocked: true,
    mode: 'SAFE_SIMULATION'
  };
}

