import api from './api';
import { resolvePublicUrl } from './urls';

export interface ReusableAsset {
  id: string | number;
  name: string;
  type: 'overlay' | 'sticker' | 'logo' | string;
  url: string;
  mime_type?: string;
  file_size?: number;
  is_active?: boolean;
  created_at?: string;
}

export const resolveAssetUrl = (url?: string | null): string => {
  if (!url) return '';
  return resolvePublicUrl(url);
};

export const normalizeAsset = (raw: any): ReusableAsset => ({
  id: raw.id,
  name: raw.name || raw.original_name || 'Untitled asset',
  type: raw.type || raw.asset_type || 'overlay',
  url: resolveAssetUrl(raw.url || raw.image_url || raw.file_url || ''),
  mime_type: raw.mime_type || raw.mimeType,
  file_size: raw.file_size || raw.fileSize,
  is_active: raw.is_active !== undefined && raw.is_active !== null ? Boolean(raw.is_active) : true,
  created_at: raw.created_at || raw.createdAt,
});

/**
 * Mengambil daftar aset yang dapat digunakan kembali dari backend (GET /api/v1/admin/assets).
 * Parameter type dapat berupa 'sticker', 'logo', atau 'overlay'.
 */
export async function fetchReusableAssets(type: 'sticker' | 'logo' | 'overlay' | string = 'sticker'): Promise<ReusableAsset[]> {
  const response = await api.get('/admin/assets', { params: { type } });
  const data = response.data?.data || response.data;
  return Array.isArray(data) ? data.map(normalizeAsset) : [];
}

/**
 * Upload aset baru ke backend (POST /api/v1/admin/assets).
 * Catatan Tahap 1: Operasi dibatasi hanya saat disetujui untuk mutasi.
 */
export async function uploadReusableAsset(file: File, name: string, type = 'overlay'): Promise<ReusableAsset> {
  const form = new FormData();
  form.append('asset', file);
  form.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
  form.append('type', type);
  const response = await api.post('/admin/assets', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return normalizeAsset(response.data?.data || response.data);
}

/**
 * Hapus aset dari backend (DELETE /api/v1/admin/assets/:id).
 * Catatan Tahap 1: Operasi dibatasi hanya saat disetujui untuk mutasi.
 */
export async function deleteReusableAsset(id: string | number): Promise<void> {
  await api.delete(`/admin/assets/${id}`);
}
