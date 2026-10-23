/**
 * UNISMILES USER & ADMIN MITRA SERVICE
 *
 * Mengelola tata kelola pengguna, pembuatan Admin Mitra, otorisasi RBAC,
 * dan kepemilikan kiosk dengan perlindungan fail-closed untuk produksi.
 *
 * Kontrak Backend:
 * - Pembuatan Admin Mitra: POST /api/v1/admin/admin-mitra (Super Admin Only)
 * - Verifikasi Sesi: GET /api/v1/auth/me
 *
 * Sesuai Audit 7A:
 * - Route GET /api/v1/users belum di-mount di server.js backend.
 * - Mutasi produksi dinonaktifkan (ENABLE_BACKEND_MUTATIONS = false).
 * - Seluruh mutasi pengguna (create, update, toggle status, delete) dijalankan
 *   dalam SAFE SIMULATION memori lokal yang terisolasi.
 */

import api from './api';
import { getDataSourceMode, DataSourceMode } from './dataSourceConfig';
import { ENABLE_BACKEND_MUTATIONS, assertMutationAllowed } from './templates';

// --- Types ---

export type Role = 'Super Admin' | 'Admin Mitra' | 'Viewer';

export type ServiceMode =
  | 'Self-managed'
  | 'Managed by Uni Inside'
  | 'View Only'
  | 'Platform Owner'
  | 'Managed Support';

export type UserStatus = 'Active' | 'Inactive';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  partner: string;
  serviceMode: ServiceMode;
  assignedKiosks: string[]; // Berisi nama kiosk untuk tampilan UI
  assignedKioskIds: string[]; // Berisi ID relational (contoh: 'KSK-001')
  status: UserStatus;
  lastActive: string;
  notes?: string;
  isSimulated?: boolean;
}

export interface CreateAdminMitraPayload {
  full_name: string;
  email: string;
  password?: string;
  partner_name: string;
  assignedKioskIds?: string[];
  serviceMode?: ServiceMode;
  notes?: string;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: Role;
  partner?: string;
  serviceMode?: ServiceMode;
  assignedKiosks?: string[];
  assignedKioskIds?: string[];
  status?: UserStatus;
  notes?: string;
}

export interface UserStats {
  total: number;
  superAdmins: number;
  adminMitra: number;
  activePartners: number;
}

export interface UserListResult {
  users: UserRecord[];
  source: DataSourceMode;
  status: 'ok' | 'unsupported';
  message?: string;
}

export interface KioskOption {
  id: string;
  name: string;
  location: string;
  assignedUserId?: string | null;
}

// --- Kiosk Registry & Relational Mapping ---

export const KIOSK_REGISTRY: KioskOption[] = [
  { id: 'KSK-0001', name: 'Kiosk Senja 01', location: 'Lobi Kafe Senja', assignedUserId: '3' },
  { id: 'KSK-0002', name: 'Kiosk Event 01', location: 'Ballroom Convention', assignedUserId: '4' },
  { id: 'KSK-0003', name: 'Kiosk Event 02', location: 'Exhibition Hall B', assignedUserId: '4' },
  { id: 'KSK-0004', name: 'Kiosk Mall 01', location: 'Grand Atrium Lt. 1', assignedUserId: null },
  { id: 'KSK-0005', name: 'Kiosk Campus 01', location: 'Student Lounge Fasilkom', assignedUserId: null },
];

/**
 * Normalisasi format KSK-001 -> KSK-0001 untuk mencegah mismatch relasional antarmodul
 */
export function normalizeCanonicalKioskId(rawId: string): string {
  if (!rawId || typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  // Normalisasi KSK-1, KSK-01, KSK-001 menjadi KSK-0001
  const match = trimmed.match(/^KSK-(\d+)$/i);
  if (match) {
    const num = match[1];
    return `KSK-${num.padStart(4, '0')}`;
  }
  return trimmed;
}

export function resolveKioskName(kioskId: string): string {
  const canonicalId = normalizeCanonicalKioskId(kioskId);
  const found = KIOSK_REGISTRY.find(k => k.id === canonicalId || k.id === kioskId);
  return found ? found.name : kioskId;
}

export function resolveKioskId(kioskName: string): string {
  const found = KIOSK_REGISTRY.find(k => k.name.toLowerCase() === kioskName.toLowerCase());
  return found ? found.id : normalizeCanonicalKioskId(kioskName);
}

// --- Fixtures / Synthetic Seed Data ---

export const SEED_USERS: UserRecord[] = [
  {
    id: '1',
    name: 'Uni Inside Owner',
    email: 'superadmin@gmail.com',
    role: 'Super Admin',
    partner: 'All Partners',
    serviceMode: 'Platform Owner',
    assignedKiosks: ['All Kiosks'],
    assignedKioskIds: ['KSK-ALL'],
    status: 'Active',
    lastActive: 'Today',
    notes: 'Pemilik akun utama sistem.',
    isSimulated: true
  },
  {
    id: '2',
    name: 'Uni Inside Operator',
    email: 'operator@uniinside.com',
    role: 'Super Admin',
    partner: 'All Partners',
    serviceMode: 'Managed Support',
    assignedKiosks: ['All Kiosks'],
    assignedKioskIds: ['KSK-ALL'],
    status: 'Active',
    lastActive: 'Today',
    notes: 'Tim operasional internal Uni Inside.',
    isSimulated: true
  },
  {
    id: '3',
    name: 'Admin Kafe Senja',
    email: 'admin@gmail.com',
    role: 'Admin Mitra',
    partner: 'Kafe Senja',
    serviceMode: 'Self-managed',
    assignedKiosks: ['Kiosk Senja 01'],
    assignedKioskIds: ['KSK-0001'],
    status: 'Active',
    lastActive: 'Yesterday',
    notes: 'Mitra kafe regional Bandung.',
    isSimulated: true
  },
  {
    id: '4',
    name: 'Admin Wedding Expo',
    email: 'event@weddingexpo.com',
    role: 'Admin Mitra',
    partner: 'Wedding Expo 2026',
    serviceMode: 'Managed by Uni Inside',
    assignedKiosks: ['Kiosk Event 01', 'Kiosk Event 02'],
    assignedKioskIds: ['KSK-0002', 'KSK-0003'],
    status: 'Active',
    lastActive: '2 days ago',
    notes: 'Penyelenggara event wedding expo.',
    isSimulated: true
  },
  {
    id: '5',
    name: 'Report Viewer',
    email: 'viewer@client.com',
    role: 'Viewer',
    partner: 'Kafe Senja',
    serviceMode: 'View Only',
    assignedKiosks: ['Kiosk Senja 01'],
    assignedKioskIds: ['KSK-0001'],
    status: 'Inactive',
    lastActive: 'Last week',
    notes: 'Akun pemantau laporan.',
    isSimulated: true
  }
];

// In-Memory Simulation State (terisolasi per session browser)
let _simulatedUsers: UserRecord[] = [...SEED_USERS];

export function resetSimulationUsers(): void {
  _simulatedUsers = [...SEED_USERS];
}

export function getSimulationUsers(): UserRecord[] {
  return [..._simulatedUsers];
}

// --- Validations & Security Helpers ---

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password wajib diisi.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password minimal 8 karakter.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password maksimal 128 karakter.' };
  }
  return { valid: true };
}

export function validateAdminMitraPayload(payload: CreateAdminMitraPayload): { valid: boolean; error?: string } {
  if (!payload.full_name || !payload.full_name.trim()) {
    return { valid: false, error: 'Nama Lengkap wajib diisi.' };
  }
  if (!payload.email || !validateEmail(payload.email)) {
    return { valid: false, error: 'Format email tidak valid.' };
  }
  if (!payload.partner_name || !payload.partner_name.trim()) {
    return { valid: false, error: 'Nama Mitra / Business Name wajib diisi.' };
  }
  const passCheck = validatePassword(payload.password || '');
  if (!passCheck.valid) {
    return passCheck;
  }
  return { valid: true };
}

/**
 * Generator kata sandi acak berbasis kriptografi aman (Web Crypto API).
 * DILARANG menggunakan Math.random().
 * Jika Web Crypto API tidak tersedia, kembalikan string kosong.
 */
export function generateSecurePassword(length = 12): string {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
    const values = new Uint8Array(length);
    cryptoObj.getRandomValues(values);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[values[i] % charset.length];
    }
    return result;
  }
  return '';
}

// --- Service Implementation ---

export const userService = {
  /**
   * Mengambil daftar pengguna berdasarkan DataSourceMode.
   * - SAFE_SIMULATION: Mengembalikan fixture sintetis yang terisolasi di memori.
   * - AUTHORIZED_READ_ONLY: Mengecek izin dan status endpoint. Karena GET /api/v1/users
   *   belum di-mount di server.js (Audit 7A), endpoint ditandai unsupported secara eksplisit.
   */
  async getUsers(options?: {
    mode?: DataSourceMode;
    currentUserRole?: string | null;
  }): Promise<UserListResult> {
    const currentMode = options?.mode || getDataSourceMode();

    if (currentMode === 'AUTHORIZED_READ_ONLY') {
      // Fail-closed RBAC: Hanya Super Admin yang berhak mengakses User Management
      const isSuperAdmin =
        options?.currentUserRole === 'Super Admin' ||
        options?.currentUserRole === 'admin' ||
        options?.currentUserRole === 'super_admin';

      if (!isSuperAdmin) {
        const err = new Error('403 Forbidden: Hanya Super Admin yang dapat mengakses direktori pengguna.');
        (err as any).status = 403;
        throw err;
      }

      // Sesuai temuan Audit Modul 7A: Endpoint GET /api/v1/users belum di-mount di server.js
      return {
        users: [],
        source: 'AUTHORIZED_READ_ONLY',
        status: 'unsupported',
        message:
          'UNSUPPORTED ENDPOINT: Endpoint GET /api/v1/users belum tersedia pada server backend (Audit Modul 7A). Beralihlah ke mode SAFE SIMULATION untuk mengevaluasi fitur manajemen pengguna.'
      };
    }

    // Default: SAFE_SIMULATION
    return {
      users: [..._simulatedUsers],
      source: 'SAFE_SIMULATION',
      status: 'ok',
      message: 'Menampilkan data pengguna SAFE SIMULATION (memori lokal terisolasi).'
    };
  },

  /**
   * Membuat Admin Mitra baru.
   * - Mematuhi RBAC: Hanya Super Admin yang berwenang.
   * - Mematuhi SAFEGUARD: Saat ENABLE_BACKEND_MUTATIONS=false, proses dijalankan
   *   sebagai simulasi lokal dan password TIDAK PERNAH disimpan atau di-log.
   */
  async createAdminMitra(
    payload: CreateAdminMitraPayload,
    currentUserRole?: string | null
  ): Promise<{
    success: boolean;
    user: UserRecord;
    isSimulated: boolean;
    message: string;
  }> {
    // 1. RBAC Check (Fail-closed)
    const isSuperAdmin =
      currentUserRole === 'Super Admin' ||
      currentUserRole === 'admin' ||
      currentUserRole === 'super_admin';

    if (!isSuperAdmin) {
      const err = new Error('403 Forbidden: Hanya Super Admin yang berhak membuat Admin Mitra.');
      (err as any).status = 403;
      throw err;
    }

    // 2. Validasi input
    const validation = validateAdminMitraPayload(payload);
    if (!validation.valid) {
      const err = new Error(validation.error || 'Validasi gagal.');
      (err as any).status = 400;
      throw err;
    }

    // 3. Cek duplikasi email pada memori simulasi
    const duplicate = _simulatedUsers.find(
      u => u.email.toLowerCase() === payload.email.trim().toLowerCase()
    );
    if (duplicate) {
      const err = new Error('409 Conflict: Email sudah terdaftar.');
      (err as any).status = 409;
      throw err;
    }

    // 4. Safeguard: Cek apakah mutasi backend produksi diizinkan
    if (!ENABLE_BACKEND_MUTATIONS) {
      // SAFE SIMULATION MODE
      const newId = String(_simulatedUsers.length + 101);
      const assignedIds = payload.assignedKioskIds || [];
      const assignedNames = assignedIds.map(resolveKioskName);

      const newRecord: UserRecord = {
        id: newId,
        name: payload.full_name.trim(),
        email: payload.email.trim(),
        role: 'Admin Mitra',
        partner: payload.partner_name.trim(),
        serviceMode: payload.serviceMode || 'Self-managed',
        assignedKiosks: assignedNames.length > 0 ? assignedNames : ['Belum Ditugaskan'],
        assignedKioskIds: assignedIds,
        status: 'Active',
        lastActive: 'Just now',
        notes: payload.notes || 'Admin Mitra baru (Simulasi).',
        isSimulated: true
      };

      // Tambahkan ke memori simulasi lokal
      _simulatedUsers = [newRecord, ..._simulatedUsers];

      // CATATAN KEAMANAN: Password tidak disimpan ke objek UserRecord atau storage apa pun!
      return {
        success: true,
        user: newRecord,
        isSimulated: true,
        message: 'Admin Mitra berhasil dibuat (SAFE SIMULATION: data tersimpan di memori lokal).'
      };
    }

    // 5. Live Backend Mutation (Hanya jika ENABLE_BACKEND_MUTATIONS = true & Staging lolos verifikasi)
    assertMutationAllowed(api.defaults.baseURL || '');
    const res = await api.post('/admin/admin-mitra', {
      full_name: payload.full_name.trim(),
      email: payload.email.trim(),
      password: payload.password,
      partner_name: payload.partner_name.trim()
    });

    const newRecord: UserRecord = {
      id: String(res.data?.id || Date.now()),
      name: payload.full_name.trim(),
      email: payload.email.trim(),
      role: 'Admin Mitra',
      partner: payload.partner_name.trim(),
      serviceMode: payload.serviceMode || 'Self-managed',
      assignedKiosks: (payload.assignedKioskIds || []).map(resolveKioskName),
      assignedKioskIds: payload.assignedKioskIds || [],
      status: 'Active',
      lastActive: 'Just now',
      notes: payload.notes,
      isSimulated: false
    };

    return {
      success: true,
      user: newRecord,
      isSimulated: false,
      message: res.data?.message || 'Admin Mitra berhasil dibuat di server backend.'
    };
  },

  /**
   * Memperbarui detail profil pengguna.
   */
  async updateUser(
    id: string,
    payload: UpdateUserPayload,
    currentUserRole?: string | null
  ): Promise<{
    success: boolean;
    user: UserRecord;
    isSimulated: boolean;
    message: string;
  }> {
    const isSuperAdmin =
      currentUserRole === 'Super Admin' ||
      currentUserRole === 'admin' ||
      currentUserRole === 'super_admin';

    if (!isSuperAdmin) {
      const err = new Error('403 Forbidden: Hanya Super Admin yang berhak memperbarui pengguna.');
      (err as any).status = 403;
      throw err;
    }

    const existingIndex = _simulatedUsers.findIndex(u => u.id === id);
    if (existingIndex === -1) {
      const err = new Error('404 Not Found: Pengguna tidak ditemukan.');
      (err as any).status = 404;
      throw err;
    }

    const current = _simulatedUsers[existingIndex];

    // Cek duplikasi email jika email diubah
    if (payload.email && payload.email.toLowerCase() !== current.email.toLowerCase()) {
      if (!validateEmail(payload.email)) {
        const err = new Error('400 Bad Request: Format email tidak valid.');
        (err as any).status = 400;
        throw err;
      }
      const duplicate = _simulatedUsers.find(
        u => u.id !== id && u.email.toLowerCase() === payload.email!.toLowerCase()
      );
      if (duplicate) {
        const err = new Error('409 Conflict: Email sudah digunakan oleh akun lain.');
        (err as any).status = 409;
        throw err;
      }
    }

    const updatedRecord: UserRecord = {
      ...current,
      name: payload.name?.trim() || current.name,
      email: payload.email?.trim() || current.email,
      role: payload.role || current.role,
      partner: payload.partner !== undefined ? payload.partner : current.partner,
      serviceMode: payload.serviceMode || current.serviceMode,
      assignedKiosks: payload.assignedKiosks || current.assignedKiosks,
      assignedKioskIds: payload.assignedKioskIds || current.assignedKioskIds,
      status: payload.status || current.status,
      notes: payload.notes !== undefined ? payload.notes : current.notes,
      lastActive: 'Updated recently',
      isSimulated: true
    };

    _simulatedUsers[existingIndex] = updatedRecord;

    return {
      success: true,
      user: updatedRecord,
      isSimulated: true,
      message: 'Data pengguna berhasil diperbarui (Simulasi Aman).'
    };
  },

  /**
   * Mengubah status pengguna (Active <-> Inactive).
   */
  async toggleUserStatus(
    id: string,
    currentUserRole?: string | null
  ): Promise<{
    success: boolean;
    user: UserRecord;
    isSimulated: boolean;
    message: string;
  }> {
    const isSuperAdmin =
      currentUserRole === 'Super Admin' ||
      currentUserRole === 'admin' ||
      currentUserRole === 'super_admin';

    if (!isSuperAdmin) {
      const err = new Error('403 Forbidden: Hanya Super Admin yang berhak mengubah status akun.');
      (err as any).status = 403;
      throw err;
    }

    const existingIndex = _simulatedUsers.findIndex(u => u.id === id);
    if (existingIndex === -1) {
      const err = new Error('404 Not Found: Pengguna tidak ditemukan.');
      (err as any).status = 404;
      throw err;
    }

    const current = _simulatedUsers[existingIndex];
    const newStatus: UserStatus = current.status === 'Active' ? 'Inactive' : 'Active';

    // Cegah penonaktifan satu-satunya Super Admin yang aktif
    if (
      current.role === 'Super Admin' &&
      newStatus === 'Inactive' &&
      _simulatedUsers.filter(u => u.role === 'Super Admin' && u.status === 'Active').length <= 1
    ) {
      const err = new Error('400 Bad Request: Tidak dapat menonaktifkan Super Admin aktif terakhir.');
      (err as any).status = 400;
      throw err;
    }

    const updatedRecord: UserRecord = {
      ...current,
      status: newStatus,
      lastActive: 'Status updated',
      isSimulated: true
    };

    _simulatedUsers[existingIndex] = updatedRecord;

    return {
      success: true,
      user: updatedRecord,
      isSimulated: true,
      message: `Status akun diubah menjadi ${newStatus} (Simulasi Lokal: tidak mengubah basis data produksi).`
    };
  },

  /**
   * Menghapus akun pengguna dari memori simulasi.
   * Mencegah penghapusan Super Admin terakhir.
   */
  async deleteUser(
    id: string,
    currentUserRole?: string | null
  ): Promise<{
    success: boolean;
    isSimulated: boolean;
    message: string;
  }> {
    const isSuperAdmin =
      currentUserRole === 'Super Admin' ||
      currentUserRole === 'admin' ||
      currentUserRole === 'super_admin';

    if (!isSuperAdmin) {
      const err = new Error('403 Forbidden: Hanya Super Admin yang berhak menghapus pengguna.');
      (err as any).status = 403;
      throw err;
    }

    const existing = _simulatedUsers.find(u => u.id === id);
    if (!existing) {
      const err = new Error('404 Not Found: Pengguna tidak ditemukan.');
      (err as any).status = 404;
      throw err;
    }

    // Proteksi: Tidak boleh menghapus Super Admin terakhir yang aktif
    if (
      existing.role === 'Super Admin' &&
      _simulatedUsers.filter(u => u.role === 'Super Admin' && u.status === 'Active').length <= 1
    ) {
      const err = new Error('400 Bad Request: Tidak dapat menghapus Super Admin aktif terakhir.');
      (err as any).status = 400;
      throw err;
    }

    _simulatedUsers = _simulatedUsers.filter(u => u.id !== id);

    return {
      success: true,
      isSimulated: true,
      message: `Pengguna ${existing.name} berhasil dihapus dari simulasi lokal.`
    };
  }
};
