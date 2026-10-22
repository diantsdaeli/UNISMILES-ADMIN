import { AxiosInstance } from 'axios';
import api from './api';
import { resolvePublicUrl, toStoredAssetPath } from './urls';
import { ENABLE_BACKEND_MUTATIONS } from './templates';

export const STICKERS_STORAGE_KEY = 'unismiles_sticker_assets';
export const ALLOWED_ASSET_TYPES = ['overlay', 'logo', 'sticker'] as const;
export type AssetType = (typeof ALLOWED_ASSET_TYPES)[number];
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
export const MAX_ASSET_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export interface ReusableAsset {
  id: string | number;
  name: string;
  type: 'overlay' | 'sticker' | 'logo' | string;
  url: string; // Managed path (/uploads/assets/...) atau dataURL
  resolvedUrl?: string; // URL penuh untuk tag <img>
  content?: string;
  simulatedPath?: string;
  mime_type?: string;
  file_size?: number;
  is_active?: boolean;
  created_at?: string;
  isLocal?: boolean;
  simulated?: boolean;
}

export interface AssetExecutionOptions {
  simulate?: boolean;
  customApi?: AxiosInstance;
}

export interface AssetValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validasi berkas dan parameter upload aset sebelum dikirim ke backend/mock
 */
export function validateAssetUpload(
  file: File | { name: string; size?: number; type?: string },
  name: string,
  type: string
): AssetValidationResult {
  const errors: string[] = [];

  // 1. Validasi Nama Aset
  if (!name || !String(name).trim()) {
    errors.push('Nama aset wajib diisi.');
  } else if (String(name).trim().length > 160) {
    errors.push('Nama aset maksimal 160 karakter.');
  }

  // 2. Validasi Tipe Aset (sesuai backend ALLOWED_TYPES: overlay, logo, sticker)
  if (!ALLOWED_ASSET_TYPES.includes(type as AssetType)) {
    errors.push(`Tipe aset tidak valid. Pilihan: ${ALLOWED_ASSET_TYPES.join(', ')}.`);
  }

  // 3. Validasi Format & Ekstensi File
  if (!file) {
    errors.push('Berkas gambar wajib diunggah.');
  } else {
    const fileType = file.type || '';
    const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
    const isAllowedExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext || '');
    const isAllowedMime = !fileType || ALLOWED_MIME_TYPES.some(m => fileType.toLowerCase().includes(m.replace('image/', '')));

    if (!isAllowedExt && !isAllowedMime) {
      errors.push('Format berkas harus berupa PNG, JPG, JPEG, atau WebP.');
    }

    // 4. Validasi Ukuran File (Maksimal 15MB)
    if (file.size && file.size > MAX_ASSET_SIZE_BYTES) {
      errors.push('Ukuran berkas melebihi batas maksimal 15MB.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Resolusi URL aset untuk rendering gambar
 */
export const resolveAssetUrl = (url?: string | null): string => {
  if (!url) return '';
  return resolvePublicUrl(url);
};

/**
 * Normalisasi data respons aset dari backend atau database lokal
 */
export const normalizeAsset = (raw: any): ReusableAsset => {
  const rawPath = raw.file_url || raw.url || raw.image_url || '';
  const managedPath = rawPath.startsWith('/uploads/')
    ? rawPath
    : (rawPath.startsWith('data:') ? rawPath : (toStoredAssetPath(rawPath) || rawPath));

  return {
    id: raw.id,
    name: raw.name || raw.original_name || 'Untitled asset',
    type: raw.asset_type || raw.type || 'overlay',
    url: managedPath,
    resolvedUrl: resolveAssetUrl(managedPath),
    mime_type: raw.mime_type || raw.mimeType,
    file_size: raw.file_size || raw.fileSize,
    is_active: raw.is_active !== undefined && raw.is_active !== null ? Boolean(raw.is_active) : true,
    created_at: raw.created_at || raw.createdAt,
    isLocal: Boolean(raw.isLocal || String(raw.id).startsWith('local-') || String(raw.id).startsWith('sim-')),
  };
};

/**
 * Membaca aset stiker lokal dari localStorage agar tidak terhapus saat backend dimuat
 */
export function getLocalStoredAssets(): ReusableAsset[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STICKERS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      const rawUrl = item.content || item.url || '';
      const resolved = (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || /^https?:\/\//i.test(rawUrl))
        ? rawUrl
        : resolveAssetUrl(rawUrl);

      return {
        id: item.id || `local-${Math.random().toString(36).slice(2, 8)}`,
        name: item.name || 'Local Sticker',
        type: item.type || (item.category === 'Overlay' ? 'overlay' : 'sticker'),
        url: rawUrl,
        resolvedUrl: resolved,
        is_active: item.status !== 'inactive',
        isLocal: true,
        created_at: item.created_at || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.warn('Gagal membaca local stored assets:', err);
    return [];
  }
}

/**
 * Menyimpan aset lokal ke localStorage
 */
export function saveLocalAsset(asset: ReusableAsset): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getLocalStoredAssets();
    const filtered = current.filter(a => String(a.id) !== String(asset.id));
    const updated = [asset, ...filtered];
    localStorage.setItem(STICKERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Gagal menyimpan local asset:', err);
  }
}

/**
 * Menghapus aset lokal dari localStorage
 */
export function removeLocalAsset(id: string | number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getLocalStoredAssets();
    const updated = current.filter(a => String(a.id) !== String(id));
    localStorage.setItem(STICKERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Gagal menghapus local asset:', err);
  }
}

/**
 * Mengambil daftar aset yang dapat digunakan kembali dari backend (GET /api/v1/admin/assets).
 * Parameter type dapat berupa 'sticker', 'logo', atau 'overlay'.
 */
export async function fetchReusableAssets(
  type: 'sticker' | 'logo' | 'overlay' | string = 'sticker',
  options?: AssetExecutionOptions
): Promise<ReusableAsset[]> {
  const client = options?.customApi ?? api;
  const response = await client.get('/admin/assets', {
    params: type && type !== 'all' ? { type } : undefined,
  });
  const data = response.data?.data || response.data;
  return Array.isArray(data) ? data.map(normalizeAsset) : [];
}

import { getDefaultScrapbookAssets } from './scrapbookStickers';
export { getDefaultScrapbookAssets };

export interface FetchCombinedAssetOptions extends AssetExecutionOptions {
  includeLocal?: boolean;
  includeDefaults?: boolean;
}

/**
 * Mengambil daftar aset gabungan antara backend dan aset lokal (agar aset lokal tidak terhapus)
 */
export async function fetchCombinedAssets(
  type?: string,
  options?: FetchCombinedAssetOptions
): Promise<ReusableAsset[]> {
  const client = options?.customApi ?? api;
  let backendAssets: ReusableAsset[] = [];

  try {
    const response = await client.get('/admin/assets', {
      params: type && type !== 'all' ? { type } : undefined,
    });
    const data = response.data?.data || response.data;
    if (Array.isArray(data)) {
      backendAssets = data.map(normalizeAsset);
    }
  } catch (err) {
    console.warn('Gagal memuat aset dari server, fallback ke aset lokal:', err);
  }

  const includeLocal = options?.includeLocal ?? true;
  let localAssets: ReusableAsset[] = [];
  if (includeLocal) {
    localAssets = getLocalStoredAssets().filter(a => !type || type === 'all' || a.type === type);
  }

  const backendIds = new Set(backendAssets.map(a => String(a.id)));
  const uniqueLocal = localAssets.filter(l => !backendIds.has(String(l.id)));

  // Gabungkan dan deduplikasi ID secara ketat untuk mencegah duplikasi berulang
  const seenIds = new Set<string>();
  const merged: ReusableAsset[] = [];
  for (const asset of [...backendAssets, ...uniqueLocal]) {
    const strId = String(asset.id);
    if (!seenIds.has(strId)) {
      seenIds.add(strId);
      merged.push(asset);
    }
  }

  // Sertakan aset stiker scrapbook bawaan jika diminta (misal di UI Gallery & Canvas Editor)
  if (options?.includeDefaults) {
    const defaults = getDefaultScrapbookAssets().filter(a => !type || type === 'all' || a.type === type);
    for (const d of defaults) {
      const strId = String(d.id);
      if (!seenIds.has(strId)) {
        seenIds.add(strId);
        merged.push(d);
      }
    }
  }

  return merged;
}

/**
 * Upload aset baru ke backend (POST /api/v1/admin/assets).
 * Menghormati safeguard: tidak mengirim mutasi ke produksi saat ENABLE_BACKEND_MUTATIONS=false.
 */
export async function uploadReusableAsset(
  file: File,
  name: string,
  type: 'sticker' | 'logo' | 'overlay' = 'sticker',
  options?: AssetExecutionOptions & { dataUrl?: string }
): Promise<ReusableAsset> {
  const validation = validateAssetUpload(file, name, type);
  if (!validation.valid) {
    throw new Error(`Validasi berkas gagal: ${validation.errors.join('; ')}`);
  }

  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    // Mode Simulasi: Menahan HTTP request mutasi ke produksi
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const simulatedPath = `/uploads/assets/sim-${Date.now()}-${safeFilename}`;

    // Baca data URL asli atau gunakan dataUrl yang sudah diproses (misal hasil remove background)
    let actualDataUrl = options?.dataUrl || '';
    if (!actualDataUrl && typeof FileReader !== 'undefined') {
      try {
        actualDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Gagal membaca berkas'));
          reader.readAsDataURL(file);
        });
      } catch (_) {
        actualDataUrl = simulatedPath;
      }
    }

    const finalUrl = actualDataUrl || simulatedPath;

    const simulatedAsset: ReusableAsset = {
      id: `sim-${Date.now()}`,
      name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
      type,
      url: finalUrl,
      resolvedUrl: finalUrl,
      content: finalUrl,
      simulatedPath,
      mime_type: file.type || 'image/png',
      file_size: file.size,
      is_active: true,
      created_at: new Date().toISOString(),
      simulated: true,
      isLocal: true,
    };
    saveLocalAsset(simulatedAsset);
    return simulatedAsset;
  }

  const form = new FormData();
  form.append('asset', file);
  form.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
  form.append('type', type);

  const client = options?.customApi ?? api;
  const response = await client.post('/admin/assets', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return normalizeAsset(response.data?.data || response.data);
}

/**
 * Hapus aset dari backend (DELETE /api/v1/admin/assets/:id).
 * Menghormati safeguard: tidak mengirim mutasi ke produksi saat ENABLE_BACKEND_MUTATIONS=false.
 */
export async function deleteReusableAsset(
  id: string | number,
  options?: AssetExecutionOptions
): Promise<{ success: boolean; message: string; simulated?: boolean }> {
  // Jika aset lokal atau simulasi, bersihkan dari localStorage
  if (String(id).startsWith('local-') || String(id).startsWith('sim-')) {
    removeLocalAsset(id);
    return { success: true, message: 'Aset lokal/simulasi berhasil dihapus dari penyimpanan perangkat.', simulated: true };
  }

  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    removeLocalAsset(id);
    return {
      success: true,
      message: 'Simulasi penghapusan berhasil. Aset dihapus dari cache lokal saja (server produksi dilindungi).',
      simulated: true,
    };
  }

  const client = options?.customApi ?? api;
  const response = await client.delete(`/admin/assets/${id}`);
  const data = response.data || {};
  return {
    success: data.success !== undefined ? Boolean(data.success) : (data.status === 'success'),
    message: data.message || 'Asset berhasil dihapus.',
    simulated: false,
  };
}
