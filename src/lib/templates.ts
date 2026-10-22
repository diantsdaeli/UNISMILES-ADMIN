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
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
  };
  slots?: PhotoSlot[];
  slotBorder?: {
    color: string;
    width: number;
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
