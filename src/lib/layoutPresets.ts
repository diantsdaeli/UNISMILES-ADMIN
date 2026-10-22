import {
  CanvasLayoutConfig,
  GradientStop,
  TextElement,
  AssetElement,
  PhotoSlot,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  Template,
} from './templates';
import { toStoredAssetPath } from './urls';

export interface LayoutPreset {
  id: string; // '1x1' | '2x1' | '3x1' | '4x1' | '2x2' | '2x3' | '3x3'
  label: string;
  name: string;
  width: number;
  height: number;
  slots: number;
  cols: number;
  rows: number;
  description: string;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: '1x1',
    label: 'Polaroid',
    name: '1x1 Polaroid',
    width: 708,
    height: 1062,
    slots: 1,
    cols: 1,
    rows: 1,
    description: 'Format Polaroid 2R dengan ruang teks / branding lebar di bawah',
  },
  {
    id: '2x1',
    label: 'Strip 2',
    name: '2x1 Strip 2',
    width: 591,
    height: 1772,
    slots: 2,
    cols: 1,
    rows: 2,
    description: 'Format Photo Strip 2R vertikal dengan 2 foto bertingkat',
  },
  {
    id: '3x1',
    label: 'Strip 3',
    name: '3x1 Strip 3',
    width: 591,
    height: 1772,
    slots: 3,
    cols: 1,
    rows: 3,
    description: 'Format Photo Strip 2R klasik dengan 3 foto vertikal',
  },
  {
    id: '4x1',
    label: 'Strip 4',
    name: '4x1 Strip 4',
    width: 591,
    height: 1772,
    slots: 4,
    cols: 1,
    rows: 4,
    description: 'Format Photo Strip 2R panjang dengan 4 foto vertikal',
  },
  {
    id: '2x2',
    label: 'Grid 2x2',
    name: '2x2 Grid 4',
    width: 1205,
    height: 1795,
    slots: 4,
    cols: 2,
    rows: 2,
    description: 'Format Cetak 4R grid simetris 2 kolom x 2 baris',
  },
  {
    id: '2x3',
    label: 'Grid 2x3',
    name: '2x3 Grid 6',
    width: 1205,
    height: 1795,
    slots: 6,
    cols: 2,
    rows: 3,
    description: 'Format Cetak 4R kolase 6 foto (2 kolom x 3 baris)',
  },
  {
    id: '3x3',
    label: 'Grid 3x3',
    name: '3x3 Grid 9',
    width: 1795,
    height: 2398,
    slots: 9,
    cols: 3,
    rows: 3,
    description: 'Format Poster Kolase 9 foto matriks (3 kolom x 3 baris)',
  },
];

export const EVENT_CATEGORIES = [
  'Birthday',
  'Wedding',
  'Graduation',
  'Corporate',
  'Holiday',
  'General',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const GOOGLE_FONTS = [
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Poppins', family: 'Poppins, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Playfair Display', family: "'Playfair Display', serif" },
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Pacifico', family: 'Pacifico, cursive' },
  { name: 'Caveat', family: 'Caveat, cursive' },
  { name: 'Satisfy', family: 'Satisfy, cursive' },
  { name: 'Space Grotesk', family: "'Space Grotesk', sans-serif" },
  { name: 'Roboto', family: 'Roboto, sans-serif' },
];

export const GRADIENT_PRESETS = [
  {
    name: 'Emerald Neon',
    style: 'linear' as const,
    angle: 45,
    stops: [
      { color: '#059669', position: 0 },
      { color: '#10B981', position: 50 },
      { color: '#064E3B', position: 100 },
    ],
  },
  {
    name: 'Cyberpunk Neon',
    style: 'linear' as const,
    angle: 90,
    stops: [
      { color: '#00F2FE', position: 0 },
      { color: '#4FACFE', position: 100 },
    ],
  },
  {
    name: 'Sunset Glow',
    style: 'linear' as const,
    angle: 135,
    stops: [
      { color: '#FF512F', position: 0 },
      { color: '#DD2476', position: 100 },
    ],
  },
  {
    name: 'Midnight Luxe',
    style: 'linear' as const,
    angle: 45,
    stops: [
      { color: '#0F172A', position: 0 },
      { color: '#1E293B', position: 50 },
      { color: '#334155', position: 100 },
    ],
  },
  {
    name: 'Deep Space',
    style: 'radial' as const,
    angle: 0,
    stops: [
      { color: '#302B63', position: 0 },
      { color: '#0F0C29', position: 100 },
    ],
  },
  {
    name: 'Golden Hour',
    style: 'linear' as const,
    angle: 60,
    stops: [
      { color: '#FFB800', position: 0 },
      { color: '#FF6B00', position: 100 },
    ],
  },
];

/**
 * Menghitung koordinat pixel slot foto presisi untuk setiap preset layout kiosk.
 * Koordinat dijamin berada di dalam batas kanvas (width x height).
 */
export function computeSlots(preset: LayoutPreset): PhotoSlot[] {
  if (preset.id === '1x1') {
    // 2R polaroid format: margin bawah lebar untuk teks / branding
    return [
      {
        index: 0,
        x: 40,
        y: 40,
        width: Math.max(10, preset.width - 80),
        height: Math.max(10, preset.height - 280),
      },
    ];
  }

  // Standar Photo Strip UniSmiles Photobooth (2x1, 3x1, 4x1):
  // 30px margin atas & samping, 20px celah antar foto, 250px footer untuk branding/logo
  if (preset.id === '2x1' || preset.id === '3x1' || preset.id === '4x1') {
    const SLOT_X = 30;
    const SLOT_Y = 30;
    const SLOT_WIDTH = preset.width - 60;
    const GAP = 20;
    const FOOTER_HEIGHT = 250;
    const SLOT_HEIGHT = Math.floor(
      (preset.height - SLOT_Y - FOOTER_HEIGHT - (preset.slots - 1) * GAP) / preset.slots
    );

    return Array.from({ length: preset.slots }, (_, index) => ({
      index,
      x: SLOT_X,
      y: SLOT_Y + index * (SLOT_HEIGHT + GAP),
      width: SLOT_WIDTH,
      height: Math.max(10, SLOT_HEIGHT),
    }));
  }

  // Format Grid (2x2, 2x3, 3x3)
  const PAD_X = 60;
  const PAD_Y = 70;
  const GAP = 18;
  const availW = preset.width - PAD_X * 2 - (preset.cols - 1) * GAP;
  const availH = preset.height - PAD_Y * 2 - (preset.rows - 1) * GAP;
  const slotW = Math.floor(availW / preset.cols);
  const slotH = Math.floor(availH / preset.rows);

  const slots: PhotoSlot[] = [];
  let index = 0;
  for (let r = 0; r < preset.rows; r++) {
    for (let c = 0; c < preset.cols; c++) {
      slots.push({
        index,
        x: PAD_X + c * (slotW + GAP),
        y: PAD_Y + r * (slotH + GAP),
        width: Math.max(10, slotW),
        height: Math.max(10, slotH),
      });
      index++;
    }
  }
  return slots;
}

/**
 * Membangun struktur data canonical `layout_config` yang dibaca oleh Kiosk Photobooth
 */
export function buildFrameConfig(
  preset: LayoutPreset,
  category: string,
  frameType: 'color' | 'gradient' | 'png',
  bgColor: string,
  accentColor: string,
  gradientStops: GradientStop[],
  gradientAngle: number,
  gradientStyle: 'linear' | 'radial',
  textElements: TextElement[] = [],
  overlayUrl = '',
  overlayAssetId: string | number | null = null,
  assetElements: AssetElement[] = [],
  customSlots?: PhotoSlot[],
  existingConfig?: CanvasLayoutConfig | null
): CanvasLayoutConfig {
  const slots = (customSlots && customSlots.length > 0)
    ? customSlots
    : (existingConfig?.slots && Array.isArray(existingConfig.slots) && existingConfig.slots.length > 0)
      ? existingConfig.slots
      : computeSlots(preset);

  // Perbaikan 3: Preservasi Metadata Tambahan & Deep Merge
  const extraFields = existingConfig && typeof existingConfig === 'object' ? { ...existingConfig } : {};
  const existingBg = (extraFields.backgroundConfig && typeof extraFields.backgroundConfig === 'object')
    ? { ...(extraFields.backgroundConfig as Record<string, unknown>) }
    : {};
  const existingSlotBorder = (extraFields.slotBorder && typeof extraFields.slotBorder === 'object')
    ? { ...(extraFields.slotBorder as Record<string, unknown>) }
    : {};

  // Hapus kunci yang dikelola langsung oleh editor dari extraFields agar nilai terbaru selalu menjadi prioritas
  delete extraFields.width;
  delete extraFields.height;
  delete extraFields.category;
  delete extraFields.backgroundConfig;
  delete extraFields.slotBorder;
  delete extraFields.slots;
  delete extraFields.elements;
  delete extraFields.assetElements;
  delete extraFields.overlayUrl;
  delete extraFields.overlayAssetId;

  return {
    // 1. Pertahankan metadata kustom yang tidak dikenal editor (e.g. designer, version, dpi, dsb)
    ...extraFields,

    // 2. Nilai terbaru yang dikelola editor
    width: preset.width,
    height: preset.height,
    category: category || 'General',
    backgroundConfig: {
      ...existingBg, // Preservasi nested property kustom pada backgroundConfig
      type: frameType === 'gradient' ? 'gradient' : frameType === 'png' ? 'image' : 'solid',
      gradientType: gradientStyle,
      gradientAngle,
      gradientStops: gradientStops.map(stop => ({
        color: stop.color,
        offset: stop.position,
      })),
      color: bgColor,
      ...(frameType === 'png' && overlayUrl ? { imageUrl: toStoredAssetPath(overlayUrl) } : {}),
    },
    slotBorder: {
      ...existingSlotBorder,
      color: accentColor || '#FFFFFF',
      width: (typeof existingSlotBorder.width === 'number' && existingSlotBorder.width > 0)
        ? existingSlotBorder.width
        : 2,
    },
    slots,

    // Perbaikan 2: Text Content — pastikan type='text', text, dan content terisi konsisten
    elements: textElements.map(elem => {
      const val = (elem.text && elem.text.trim()) ? elem.text : (elem.content || elem.text || '');
      return {
        ...elem,
        type: 'text',
        text: val,
        content: val,
      };
    }),

    // Perbaikan 1: Sticker Anchor — pastikan type='sticker', pertahankan anchor lama (jika center), atau set default 'top-left'
    assetElements: assetElements.map(element => {
      const existingElement = existingConfig?.assetElements?.find(
        e => e.id === element.id || (e.name === element.name && e.url === element.url)
      );

      let anchor = element.anchor;
      if (!anchor) {
        if (existingElement) {
          anchor = existingElement.anchor;
        } else {
          anchor = 'top-left';
        }
      }

      return {
        ...element,
        type: 'sticker',
        ...(anchor ? { anchor } : {}),
        url: toStoredAssetPath(element.url),
        content: element.content ? toStoredAssetPath(element.content) : toStoredAssetPath(element.url),
      };
    }),
    overlayUrl: toStoredAssetPath(overlayUrl),
    overlayAssetId,
  };
}

export interface FrameEditorState {
  preset: LayoutPreset;
  name: string;
  category: EventCategory;
  frameType: 'color' | 'gradient' | 'png';
  bgColor: string;
  accentColor: string;
  gradientStops: GradientStop[];
  gradientAngle: number;
  gradientStyle: 'linear' | 'radial';
  textElements: TextElement[];
  assetElements: AssetElement[];
  bgImageUrl?: string;
  overlayAssetId?: string | number | null;
  digitalPrice?: number | string;
  digitalPrintPrice?: number | string;
  customSlots?: PhotoSlot[];
  isActive?: boolean;
}

/**
 * Menyusun payload untuk Create Frame Baru (POST /api/v1/admin/templates/generate)
 */
export function buildCreateTemplatePayload(
  state: FrameEditorState,
  options?: { publish?: boolean }
): CreateTemplatePayload {
  const dPrice = Number(state.digitalPrice) || 0;
  const dpPrice = Number(state.digitalPrintPrice) || dPrice;
  const frameConfig = buildFrameConfig(
    state.preset,
    state.category,
    state.frameType,
    state.bgColor,
    state.accentColor,
    state.gradientStops,
    state.gradientAngle,
    state.gradientStyle,
    state.textElements,
    state.bgImageUrl || '',
    state.overlayAssetId || null,
    state.assetElements,
    state.customSlots,
    null
  );

  return {
    name: state.name.trim(),
    layout_id: state.preset.id,
    slot_count: state.preset.slots,
    price: dPrice,
    digital_price: dPrice,
    digital_print_price: dpPrice,
    frame_type: state.frameType,
    bg_color: state.bgColor,
    accent_color: state.accentColor,
    gradient_stops: state.gradientStops,
    gradient_angle: state.gradientAngle,
    gradient_style: state.gradientStyle,
    text_elements: frameConfig.elements || [],
    layout_config: frameConfig,
    image_url: frameConfig.overlayUrl || '',
    asset_id: state.overlayAssetId ?? null,
    is_active: options?.publish !== undefined ? Boolean(options.publish) : Boolean(state.isActive),
  };
}

/**
 * Menyusun payload untuk Edit / Update Frame Existing (PUT /api/v1/admin/templates/:id)
 * Menjamin ID template backend dipertahankan dan metadata yang sudah ada tidak hilang.
 */
export function buildUpdateTemplatePayload(
  existingTemplate: Template,
  state: FrameEditorState
): UpdateTemplatePayload {
  const dPrice = state.digitalPrice !== undefined && state.digitalPrice !== ''
    ? Number(state.digitalPrice)
    : existingTemplate.digitalPrice;
  const dpPrice = state.digitalPrintPrice !== undefined && state.digitalPrintPrice !== ''
    ? Number(state.digitalPrintPrice)
    : existingTemplate.digitalPrintPrice;

  const frameConfig = buildFrameConfig(
    state.preset,
    state.category,
    state.frameType,
    state.bgColor,
    state.accentColor,
    state.gradientStops,
    state.gradientAngle,
    state.gradientStyle,
    state.textElements,
    state.bgImageUrl || existingTemplate.imageUrl || '',
    state.overlayAssetId !== undefined ? state.overlayAssetId : (existingTemplate.assetId ?? null),
    state.assetElements,
    state.customSlots || existingTemplate.layoutConfig?.slots,
    existingTemplate.layoutConfig
  );

  return {
    name: state.name.trim(),
    layout_id: state.preset.id,
    slot_count: state.preset.slots,
    price: dPrice,
    digital_price: dPrice,
    digital_print_price: dpPrice,
    frame_type: state.frameType,
    bg_color: state.bgColor,
    accent_color: state.accentColor,
    gradient_stops: state.gradientStops,
    gradient_angle: state.gradientAngle,
    gradient_style: state.gradientStyle,
    text_elements: frameConfig.elements || [],
    layout_config: frameConfig,
    image_url: frameConfig.overlayUrl || '',
    asset_id: state.overlayAssetId !== undefined ? state.overlayAssetId : (existingTemplate.assetId ?? null),
    // PENTING: Pertahankan status keaktifan frame existing agar frame live tidak menghilang dari kiosk
    is_active: existingTemplate.isActive,
  };
}
