import api from './api';
import { resolvePublicUrl } from './urls';

export interface GradientStop {
  color: string;
  position: number;
}

export interface TextElement {
  id: string;
  type?: 'text' | string;
  text: string;
  content?: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  effect?: 'shadow' | 'neon' | 'outline' | 'none' | string;
  anchor?: 'top-left' | 'center' | string;
  [key: string]: unknown;
}

export interface AssetElement {
  id: string;
  type?: 'sticker' | 'logo' | 'overlay' | string;
  assetId?: string | number | null;
  name: string;
  url: string;
  content?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  anchor?: 'top-left' | 'center' | string;
  [key: string]: unknown;
}

export interface PhotoSlot {
  index?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface CanvasLayoutConfig {
  width?: number;
  height?: number;
  category?: string;
  backgroundConfig?: {
    type: 'solid' | 'gradient' | 'image' | string;
    color?: string;
    gradientType?: 'linear' | 'radial' | string;
    gradientAngle?: number;
    gradientStops?: Array<{ color: string; offset: number }>;
    imageUrl?: string;
    [key: string]: unknown;
  };
  slots?: PhotoSlot[];
  slotBorder?: {
    color: string;
    width: number;
    [key: string]: unknown;
  };
  elements?: TextElement[];
  assetElements?: AssetElement[];
  overlayUrl?: string;
  overlayAssetId?: string | number | null;
  [key: string]: unknown;
}

/**
 * Format data mentah dari backend /api/v1/admin/templates
 */
export interface BackendTemplate {
  id: number | string;
  user_id?: number | null;
  name: string;
  layout_id?: string;
  image_url?: string | null;
  slot_count?: number;
  layout_config?: CanvasLayoutConfig | string | null;
  bg_color?: string;
  accent_color?: string;
  frame_type?: 'color' | 'gradient' | 'png' | string;
  gradient_stops?: GradientStop[] | string | null;
  gradient_angle?: number;
  gradient_style?: 'linear' | 'radial' | string;
  text_elements?: TextElement[] | string | null;
  asset_id?: string | number | null;
  is_active: boolean | number;
  price?: number | null;
  digital_price?: number | null;
  digital_print_price?: number | null;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  category?: string;
}

/**
 * Struktur model template yang dikonsumsi oleh antarmuka Admin Dian
 * Mempertahankan kompatibilitas penuh dengan Storyboard dan TemplateManagement
 */
export interface Template {
  // Identitas & Tampilan Utama Dian
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  status: 'active' | 'inactive';
  usageCount: number;
  createdAt?: string;
  updatedAt?: string;

  // Metadata Backend & Hardware Layout
  backendId: number | string;
  layoutId: string;
  slotCount: number;
  isActive: boolean;

  // Harga Paket
  price: number;
  digitalPrice: number;
  digitalPrintPrice: number;

  // Konfigurasi Kanvas Presisi Kiosk
  layoutConfig: CanvasLayoutConfig;
  bgColor: string;
  accentColor: string;
  frameType: 'color' | 'gradient' | 'png';
  gradientStops: GradientStop[];
  gradientAngle: number;
  gradientStyle: 'linear' | 'radial';
  textElements: TextElement[];
  assetId?: string | number | null;
}

/**
 * Parsing aman JSON jika backend mengembalikan stringified object
 */
function safeParseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Adapter: Memetakan respons template dari backend resmi Nadin ke domain model Dian
 * Menjamin tidak ada ID buatan, tidak ada data yang hilang, dan category tetap terbaca.
 */
export function adaptBackendTemplateToDian(raw: BackendTemplate): Template {
  const backendId = raw.id !== undefined && raw.id !== null ? raw.id : 'unknown';
  const idStr = String(backendId);

  // Parse layout_config
  const layoutConfig = safeParseJson<CanvasLayoutConfig>(raw.layout_config, {});

  // Resolusi Kategori: layout_config.category > raw.category > 'General'
  const category = (
    (typeof layoutConfig.category === 'string' && layoutConfig.category.trim()) ||
    (typeof raw.category === 'string' && raw.category.trim()) ||
    'General'
  );

  // Pastikan field category tetap tertanam pada layoutConfig objek
  if (!layoutConfig.category && category) {
    layoutConfig.category = category;
  }

  // Resolusi Gambar: image_url kolom > overlayUrl di layout_config
  const rawImageUrl = raw.image_url || layoutConfig.overlayUrl || '';
  const resolvedImageUrl = rawImageUrl ? resolvePublicUrl(rawImageUrl) : '';

  // Resolusi Status Aktif
  const isActive = Boolean(raw.is_active);
  const status: 'active' | 'inactive' = isActive ? 'active' : 'inactive';

  // Resolusi Harga
  const basePrice = Number(raw.price) || 0;
  const digitalPrice = raw.digital_price != null ? Number(raw.digital_price) : basePrice;
  const digitalPrintPrice = raw.digital_print_price != null ? Number(raw.digital_print_price) : basePrice;

  // Visual & Elemen
  const frameType = (raw.frame_type === 'gradient' || raw.frame_type === 'png') ? raw.frame_type : 'color';
  const gradientStops = safeParseJson<GradientStop[]>(raw.gradient_stops, []);
  const rawTextElements = safeParseJson<TextElement[]>(raw.text_elements, []);
  const textElements = rawTextElements.length > 0
    ? rawTextElements
    : (Array.isArray(layoutConfig.elements) ? layoutConfig.elements : []);

  return {
    id: idStr,
    backendId,
    name: raw.name || 'Untitled Template',
    category,
    imageUrl: resolvedImageUrl,
    status,
    isActive,
    usageCount: Number(raw.usage_count) || 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,

    layoutId: raw.layout_id || '1x1',
    slotCount: Number(raw.slot_count) || 1,

    price: basePrice,
    digitalPrice,
    digitalPrintPrice,

    layoutConfig,
    bgColor: raw.bg_color || '#1E293B',
    accentColor: raw.accent_color || '#FFFFFF',
    frameType,
    gradientStops,
    gradientAngle: Number(raw.gradient_angle ?? 45),
    gradientStyle: (raw.gradient_style === 'radial') ? 'radial' : 'linear',
    textElements,
    assetId: raw.asset_id ?? null,
  };
}

/**
 * Mengambil seluruh daftar frame template dari backend resmi online (GET /api/v1/admin/templates)
 */
export async function fetchTemplates(): Promise<Template[]> {
  const response = await api.get('/admin/templates');
  const body = response.data;
  const rawList: BackendTemplate[] = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body)
      ? body
      : [];

  return rawList.map(adaptBackendTemplateToDian);
}

// ============================================================================
// MODUL 2 TAHAP 3B: KONTRAK PAYLOAD, BUILDER, VALIDATOR & SAFEGUARD SERVICE
// ============================================================================

export interface CreateTemplatePayload {
  name: string;
  layout_id: string;
  slot_count: number;
  price: number;
  digital_price: number;
  digital_print_price: number;
  frame_type: 'color' | 'gradient' | 'png';
  bg_color: string;
  accent_color: string;
  gradient_stops: GradientStop[];
  gradient_angle: number;
  gradient_style: 'linear' | 'radial';
  text_elements: TextElement[];
  layout_config: CanvasLayoutConfig;
  image_url?: string;
  asset_id?: string | number | null;
  is_active: boolean;
}

export interface UpdateTemplatePayload {
  name?: string;
  layout_id?: string;
  slot_count?: number;
  price?: number;
  digital_price?: number;
  digital_print_price?: number;
  frame_type?: 'color' | 'gradient' | 'png';
  bg_color?: string;
  accent_color?: string;
  gradient_stops?: GradientStop[];
  gradient_angle?: number;
  gradient_style?: 'linear' | 'radial';
  text_elements?: TextElement[];
  layout_config?: CanvasLayoutConfig;
  image_url?: string;
  asset_id?: string | number | null;
  is_active?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SimulationResult {
  success: boolean;
  simulated: true;
  method: 'POST' | 'PUT';
  endpoint: string;
  templateId?: string | number;
  payload: CreateTemplatePayload | UpdateTemplatePayload;
  validation: ValidationResult;
  timestamp: string;
}

export interface TemplateValidationOptions {
  disallowSimulatedAssets?: boolean;
}

/**
 * Validasi payload template sebelum dikirim ke backend
 */
export function validateTemplatePayload(
  payload: CreateTemplatePayload | UpdateTemplatePayload,
  isEdit = false,
  options?: TemplateValidationOptions
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validasi Nama Frame
  if (!payload.name || !String(payload.name).trim()) {
    if (!isEdit) {
      errors.push('Nama frame wajib diisi.');
    }
  } else if (String(payload.name).trim().length > 100) {
    errors.push('Nama frame maksimal 100 karakter.');
  }

  // 2. Validasi Layout ID & Slot Count
  if (!isEdit || payload.layout_id !== undefined) {
    if (!payload.layout_id || !String(payload.layout_id).trim()) {
      errors.push('Layout ID wajib ditentukan.');
    }
  }

  if (payload.slot_count !== undefined) {
    if (!Number.isInteger(payload.slot_count) || payload.slot_count < 1) {
      errors.push('slot_count harus berupa bilangan bulat minimal 1.');
    }
  }

  // 3. Validasi Harga Paket (Digital & Digital Print)
  // Backend rule (packagePricing.js:22): amount > 0 && amount <= 9999999999 (Rp0 TIDAK diperbolehkan)
  if (payload.digital_price !== undefined && payload.digital_price !== null) {
    const dp = Number(payload.digital_price);
    if (!Number.isSafeInteger(dp) || dp <= 0 || dp > 9999999999) {
      errors.push('digital_price wajib berupa nominal Rupiah bulat positif, maksimal Rp9.999.999.999.');
    }
  }

  if (payload.digital_print_price !== undefined && payload.digital_print_price !== null) {
    const dpp = Number(payload.digital_print_price);
    if (!Number.isSafeInteger(dpp) || dpp <= 0 || dpp > 9999999999) {
      errors.push('digital_print_price wajib berupa nominal Rupiah bulat positif, maksimal Rp9.999.999.999.');
    }
  }

  // 4. Validasi layout_config
  if (payload.layout_config) {
    const cfg = payload.layout_config;

    // Batasan ukuran JSON backend: 256KB
    const jsonStr = JSON.stringify(cfg);
    if (jsonStr.length > 256 * 1024) {
      errors.push('Ukuran konfigurasi kanvas melebihi batas 256KB backend.');
    }

    // Validasi dimensi kanvas
    if (cfg.width !== undefined && cfg.width <= 0) {
      errors.push('Lebar kanvas (width) harus lebih besar dari 0.');
    }
    if (cfg.height !== undefined && cfg.height <= 0) {
      errors.push('Tinggi kanvas (height) harus lebih besar dari 0.');
    }

    // Validasi slots geometry
    if (Array.isArray(cfg.slots)) {
      cfg.slots.forEach((slot, idx) => {
        if (slot.width <= 0 || slot.height <= 0) {
          errors.push(`Slot #${idx + 1} memiliki dimensi tidak valid (w: ${slot.width}, h: ${slot.height}).`);
        }
      });
    }

    // Validasi managed URLs (backend tidak menerima domain eksternal sembarangan)
    if (cfg.overlayUrl && typeof cfg.overlayUrl === 'string' && cfg.overlayUrl.trim()) {
      if (/^https?:\/\//i.test(cfg.overlayUrl) && !cfg.overlayUrl.includes('/uploads/')) {
        warnings.push('overlayUrl menggunakan URL penuh; pastikan berkas tersimpan di penyimpanan resmi backend.');
      }
    }

    // 4.a Deteksi & Penolakan Mutlak Blob URL (Blob hanya ada di memori peramban lokal dan rusak saat dikirim)
    const hasBlobUrl = (
      (typeof payload.image_url === 'string' && payload.image_url.startsWith('blob:')) ||
      (typeof cfg.overlayUrl === 'string' && cfg.overlayUrl.startsWith('blob:')) ||
      (typeof cfg.backgroundConfig?.imageUrl === 'string' && cfg.backgroundConfig.imageUrl.startsWith('blob:')) ||
      (Array.isArray(cfg.elements) && cfg.elements.some((el: any) =>
        String(el.url || '').startsWith('blob:') || String(el.content || '').startsWith('blob:')
      )) ||
      (Array.isArray(cfg.assetElements) && cfg.assetElements.some((el: any) =>
        String(el.url || '').startsWith('blob:') || String(el.content || '').startsWith('blob:')
      ))
    );

    if (hasBlobUrl) {
      errors.push('URL blob (blob:...) tidak dapat disimpan ke server karena hanya valid di memori peramban lokal.');
    }

    // 4.b Deteksi & Penolakan Data URI Biner Lokal untuk Produksi (Kecuali SVG bawaan)
    const isBinaryDataUri = (val?: string) => {
      if (!val || typeof val !== 'string') return false;
      return val.startsWith('data:image/') && !val.startsWith('data:image/svg+xml');
    };

    const hasBinaryDataUri = (
      isBinaryDataUri(payload.image_url) ||
      isBinaryDataUri(cfg.overlayUrl) ||
      isBinaryDataUri(cfg.backgroundConfig?.imageUrl) ||
      (Array.isArray(cfg.assetElements) && cfg.assetElements.some((el: any) =>
        isBinaryDataUri(el.url) || isBinaryDataUri(el.content)
      ))
    );

    if (hasBinaryDataUri) {
      if (options?.disallowSimulatedAssets || ENABLE_BACKEND_MUTATIONS) {
        errors.push('Aset gambar frame produksi wajib diunggah ke backend (/uploads/...) dan tidak boleh menggunakan Data URI biner lokal.');
      } else {
        warnings.push('Frame memuat Data URI gambar lokal; pastikan diunggah ke server sebelum rilis produksi.');
      }
    }

    // 4.c Validasi deteksi aset simulasi (sim-*) untuk perlindungan payload backend sungguhan
    const hasSimulatedAsset = (
      (typeof cfg.overlayUrl === 'string' && cfg.overlayUrl.includes('sim-')) ||
      (typeof payload.image_url === 'string' && payload.image_url.includes('sim-')) ||
      (typeof cfg.backgroundConfig?.imageUrl === 'string' && cfg.backgroundConfig.imageUrl.includes('sim-')) ||
      (Array.isArray(cfg.elements) && cfg.elements.some((el: any) =>
        String(el.id || '').includes('sim-') ||
        String(el.url || '').includes('sim-') ||
        String(el.content || '').includes('sim-')
      )) ||
      (Array.isArray(cfg.assetElements) && cfg.assetElements.some((el: any) =>
        String(el.id || '').includes('sim-') ||
        String(el.url || '').includes('sim-') ||
        String(el.content || '').includes('sim-') ||
        String(el.assetId || '').includes('sim-')
      ))
    );

    if (hasSimulatedAsset) {
      if (options?.disallowSimulatedAssets || ENABLE_BACKEND_MUTATIONS) {
        errors.push('Payload frame sungguhan tidak boleh menggunakan aset simulasi (sim-*). Unggah aset resmi ke server terlebih dahulu.');
      } else {
        warnings.push('Template memuat aset simulasi (sim-*); aset ini belum tersimpan secara permanen di backend.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Daftar Host Backend Produksi yang Dilindungi (Blacklist Pertahanan Berlapis)
 */
export const KNOWN_PRODUCTION_HOSTS: readonly string[] = [
  'backend-photobooth.uniinside.net',
  'api.uniinside.net',
];

/**
 * Daftar Host Staging yang Telah Diverifikasi Secara Formal (Allowlist Eksplisit - Fail-Closed).
 *
 * KRITERIA WAJIB UNTUK MASUK ALLOWLIST:
 * 1. Database terpisah secara fisik/skema dari basis data produksi (bukti isolasi terverifikasi).
 * 2. Tidak ada replikasi dua arah yang dapat mengubah data produksi.
 * 3. Surat persetujuan tertulis dari pemilik sistem untuk pengujian mutasi aktif.
 *
 * SAAT INI SENGAJA KOSONG (FAIL-CLOSED):
 * Belum ada backend staging terisolasi resmi yang diverifikasi.
 * Setiap upaya mutasi HTTP nyata akan DITOLAK sampai host staging resmi didaftarkan di sini.
 */
export const VERIFIED_STAGING_ALLOWLIST: readonly string[] = [
  // Belum ada staging terisolasi resmi yang diverifikasi
];

/**
 * Memeriksa apakah sebuah URL mengarah ke host backend produksi yang diblacklist
 */
export function isProductionApiUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
    const hostname = parsed.hostname.toLowerCase();
    return KNOWN_PRODUCTION_HOSTS.some(prodHost =>
      hostname === prodHost || hostname.endsWith(`.${prodHost}`)
    );
  } catch (_) {
    const lower = url.toLowerCase();
    return KNOWN_PRODUCTION_HOSTS.some(prodHost => lower.includes(prodHost));
  }
}

/**
 * Memeriksa apakah sebuah URL merupakan staging terverifikasi yang sah.
 * Menerapkan prinsip FAIL-CLOSED:
 * - Tidak otomatis menganggap localhost, 127.0.0.1, atau nama mengandung 'staging' sebagai staging terisolasi.
 * - Host wajib terdaftar di VERIFIED_STAGING_ALLOWLIST.
 * - Host tidak boleh berada di KNOWN_PRODUCTION_HOSTS.
 */
export function isVerifiedStagingHost(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (isProductionApiUrl(url)) return false;

  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
    const hostname = parsed.hostname.toLowerCase();
    return VERIFIED_STAGING_ALLOWLIST.includes(hostname);
  } catch (_) {
    return false;
  }
}

/**
 * Validator Safeguard Mutasi Backend (Fail-Closed Enforcer):
 * Memastikan bahwa mutasi HTTP nyata HANYA dapat berjalan jika:
 * 1. Host target bukan host produksi (KNOWN_PRODUCTION_HOSTS).
 * 2. Jika bukan mock test client terisolasi (customApi):
 *    - ENABLE_BACKEND_MUTATIONS wajib bernilai true.
 *    - Host target terdaftar secara resmi di VERIFIED_STAGING_ALLOWLIST.
 *
 * Catatan Arsitektur Penting:
 * Pemeriksaan hostname pada frontend tidak dapat menjamin isolasi database backend
 * (misalnya server lokal yang diam-diam menyambung ke basis data produksi).
 * Isolasi database sejati tetap WAJIB diverifikasi pada level infrastruktur backend.
 */
export function assertMutationAllowed(targetBaseUrl: string, isCustomApi = false): void {
  // 1. Blokir mutlak jika mengarah ke host produksi (Defense in Depth)
  if (isProductionApiUrl(targetBaseUrl)) {
    throw new Error(
      `PERLINDUNGAN PRODUKSI: Mutasi HTTP (${targetBaseUrl}) ke backend produksi dilarang secara permanen! Mutasi hanya diizinkan pada lingkungan staging terisolasi.`
    );
  }

  // 2. Safeguard Fail-Closed: Jika pemanggilan menggunakan client aplikasi utama
  if (!isCustomApi) {
    if (!ENABLE_BACKEND_MUTATIONS) {
      throw new Error(
        `SAFEGUARD FAIL-CLOSED: ENABLE_BACKEND_MUTATIONS berstatus false. Mutasi HTTP backend dinonaktifkan secara default untuk melindungi data produksi.`
      );
    }
    if (!isVerifiedStagingHost(targetBaseUrl)) {
      throw new Error(
        `SAFEGUARD STAGING (FAIL-CLOSED): Mutasi backend ditolak. Host (${targetBaseUrl || 'undefined'}) belum diverifikasi di VERIFIED_STAGING_ALLOWLIST dengan bukti isolasi basis data. Mengubah VITE_API_BASE_URL saja tidak membuktikan isolasi lingkungan.`
      );
    }
  }
}

/**
 * Flag Safeguard Mutasi Backend:
 * Menjamin TIDAK ADA request POST/PUT/DELETE yang dieksekusi ke backend produksi
 * pada Tahap 3B/3C/3G sampai persetujuan izin tertulis diberikan.
 */
export const ENABLE_BACKEND_MUTATIONS = false;

export interface ServiceExecutionOptions {
  simulate?: boolean;
  customApi?: import('axios').AxiosInstance;
}

/**
 * Memetakan payload CreateTemplatePayload dan ID dari backend/mock
 * menjadi struktur objek Template Dian yang siap dimasukkan ke TemplateContext.
 */
export function buildTemplateFromPayload(
  payload: CreateTemplatePayload,
  id: number | string,
  extra?: { createdAt?: string; usageCount?: number }
): Template {
  const idStr = String(id);
  const isActive = Boolean(payload.is_active);
  const rawImageUrl = payload.image_url || payload.layout_config?.overlayUrl || '';
  const resolvedImageUrl = rawImageUrl ? resolvePublicUrl(rawImageUrl) : '';

  return {
    id: idStr,
    backendId: id,
    name: payload.name || 'Untitled Template',
    category: (payload.layout_config?.category as string) || 'General',
    imageUrl: resolvedImageUrl,
    status: isActive ? 'active' : 'inactive',
    isActive,
    usageCount: extra?.usageCount ?? 0,
    createdAt: extra?.createdAt ?? new Date().toISOString(),
    layoutId: payload.layout_id || '1x1',
    slotCount: payload.slot_count || 1,
    price: payload.price ?? payload.digital_price ?? 0,
    digitalPrice: payload.digital_price ?? payload.price ?? 0,
    digitalPrintPrice: payload.digital_print_price ?? payload.price ?? 0,
    layoutConfig: payload.layout_config,
    bgColor: payload.bg_color || '#1E293B',
    accentColor: payload.accent_color || '#FFFFFF',
    frameType: payload.frame_type || 'color',
    gradientStops: payload.gradient_stops || [],
    gradientAngle: payload.gradient_angle ?? 45,
    gradientStyle: payload.gradient_style || 'linear',
    textElements: payload.text_elements || [],
    assetId: payload.asset_id ?? null,
  };
}

/**
 * Service API: Buat frame template baru (POST /api/v1/admin/templates/generate)
 * Menggunakan mode simulasi secara default demi perlindungan data backend produksi.
 */
export async function createTemplate(
  payload: CreateTemplatePayload,
  options?: ServiceExecutionOptions
): Promise<SimulationResult | { success: boolean; data?: unknown; message?: string }> {
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);
  const validation = validateTemplatePayload(payload, false);

  if (shouldSimulate) {
    // Mode Simulasi: Menahan HTTP request mutasi dan mengembalikan bukti eksekusi
    return {
      success: validation.valid,
      simulated: true,
      method: 'POST',
      endpoint: '/api/v1/admin/templates/generate',
      payload,
      validation,
      timestamp: new Date().toISOString(),
    };
  }

  const client = options?.customApi ?? api;
  const targetBaseUrl = client.defaults.baseURL || '';

  // Safeguard Fail-Closed & Blacklist Check
  assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));

  if (!validation.valid) {
    throw new Error(`Validasi payload gagal: ${validation.errors.join('; ')}`);
  }

  const response = await client.post('/admin/templates/generate', payload);
  return response.data;
}

/**
 * Service API: Perbarui frame template yang sudah ada (PUT /api/v1/admin/templates/:id)
 * Menjamin template ID backend dipertahankan dan TIDAK menggunakan pola DELETE + POST.
 */
export async function updateTemplate(
  id: string | number,
  payload: UpdateTemplatePayload,
  options?: ServiceExecutionOptions
): Promise<SimulationResult | { success: boolean; data?: unknown; message?: string }> {
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);
  const validation = validateTemplatePayload(payload, true);

  if (shouldSimulate) {
    // Mode Simulasi: Menahan HTTP request mutasi dan mengembalikan bukti eksekusi
    return {
      success: validation.valid,
      simulated: true,
      method: 'PUT',
      endpoint: `/api/v1/admin/templates/${id}`,
      templateId: id,
      payload,
      validation,
      timestamp: new Date().toISOString(),
    };
  }

  const client = options?.customApi ?? api;
  const targetBaseUrl = client.defaults.baseURL || '';

  // Safeguard Fail-Closed & Blacklist Check
  assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));

  if (!validation.valid) {
    throw new Error(`Validasi payload gagal: ${validation.errors.join('; ')}`);
  }

  const response = await client.put(`/admin/templates/${id}`, payload);
  return response.data;
}
