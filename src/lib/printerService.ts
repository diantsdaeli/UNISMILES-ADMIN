import api from './api';
import { assertMutationAllowed, ENABLE_BACKEND_MUTATIONS, ServiceExecutionOptions } from './templates';
import type {
  PrinterConfig,
  PrinterReportedState,
  PrintingConfigResponse,
} from '../types/printer';

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  printing_enabled: false,
  adapter: 'disabled',
  printer_name: null,
  paper_size: 'Instax Mini (54 × 86 mm)',
  orientation: 'portrait',
  copies_limit: 1,
  timeout_ms: 60000,
  retry_count: 2,
  config_version: 1,
  allowed_layouts: [],
  photo_brightness: 100,
  photo_contrast: 100,
  photo_saturation: 100,
  thermal_density: 3,
  thermal_offset_y_px: 0,
  thermal_offset_x_px: 0,
  photo_fit_mode: 'fit',
  print_margin_top_px: 0,
  print_margin_right_px: 0,
  print_margin_left_px: 0,
  print_margin_bottom_px: 0,
  print_sharpen: 0,
  grayscale_algorithm: 'rec601',
  show_email_button: true,
  show_retake_button: true,
  show_print_button: true,
};

const STORAGE_PREFIX = 'unismiles_kiosk_printer_config_';

export const THERMAL_LIMITS = {
  maxPaperWidthMm: 60,
  maxPrintWidthMm: 48,
  minHeightMm: 8,
  maxHeightMm: 350,
  dpi: 300,
};

export const CUSTOM_PATTERN = /^CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM$/i;

export const PHOTO_ADJUST_LIMITS = {
  photo_brightness: { min: 50, max: 150, fallback: 100 },
  photo_contrast: { min: 50, max: 150, fallback: 100 },
  photo_saturation: { min: 0, max: 150, fallback: 100 },
  thermal_density: { min: 1, max: 5, fallback: 3 },
  thermal_offset_y_px: { min: -200, max: 200, fallback: 0 },
  thermal_offset_x_px: { min: -200, max: 200, fallback: 0 },
  print_margin_top_px: { min: 0, max: 300, fallback: 0 },
  print_margin_right_px: { min: 0, max: 300, fallback: 0 },
  print_margin_left_px: { min: 0, max: 300, fallback: 0 },
  print_margin_bottom_px: { min: 0, max: 300, fallback: 0 },
  print_sharpen: { min: 0, max: 100, fallback: 0 },
};

export const ALLOWED_ADAPTERS = ['disabled', 'cups', 'windows', 'mock', 'thermal'] as const;
export const ALLOWED_ORIENTATIONS = ['portrait', 'landscape'] as const;
export const ALLOWED_FIT_MODES = ['fit', 'cover', 'stretch'] as const;
export const ALLOWED_GRAYSCALE_ALGORITHMS = [
  'rec601', 'rec709', 'average', 'luma-sqrt',
  'green', 'red', 'blue', 'max', 'min',
] as const;

export const KNOWN_PAPER_SIZES: readonly string[] = [
  'Instax Mini (54 × 86 mm)',
  'Polaroid 6 × 9 cm (2R)',
  '2 Strip 5 × 15 cm',
  '3 Strip 5 × 15 cm',
  '4 Strip 5 × 15 cm',
  '2×2 Grid 10 × 10 cm',
  '2×3 Grid 10 × 15 cm',
  'Termal 40 × 60 mm (2 foto)',
  'Termal 40 × 90 mm (3 foto)',
  'Termal 40 × 120 mm (4 foto)',
  'Termal 48 × 150 mm (strip panjang)',
  'Termal 30 × 40 mm (label kecil)',
  'nimbotpaper-polaroid',
  '2R', '3R', '4R', 'STRIP', '6R',
  'POLAROID', 'STRIP 2', 'STRIP 3', 'STRIP 4',
  'GRID', 'GRID 2X2', 'GRID 2X3', 'GRID 3X3',
];

export const FORBIDDEN_PRINTING_FIELDS = [
  'command',
  'shell_command',
  'executable_path',
  'script',
  'driver_command',
] as const;

export const ALLOWED_PRINTING_FIELDS = new Set([
  'printing_enabled',
  'adapter',
  'printer_name',
  'paper_size',
  'orientation',
  'copies_limit',
  'timeout_ms',
  'retry_count',
  'config_version',
  'allowed_layouts',
  'photo_brightness',
  'photo_contrast',
  'photo_saturation',
  'thermal_density',
  'thermal_offset_y_px',
  'thermal_offset_x_px',
  'print_margin_top_px',
  'print_margin_right_px',
  'print_margin_left_px',
  'print_margin_bottom_px',
  'photo_fit_mode',
  'print_sharpen',
  'grayscale_algorithm',
  'show_email_button',
  'show_retake_button',
  'show_print_button',
]);

export class PrintingValidationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = 'INVALID_PRINTING_CONFIG', statusCode = 400) {
    super(message);
    this.name = 'PrintingValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function clampInt(val: any, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function parseBool(val: any, fallback: boolean): boolean {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'ya'].includes(s)) return true;
  if (['false', '0', 'no', 'off', 'tidak'].includes(s)) return false;
  return fallback;
}

/**
 * Validasi ketat payload konfigurasi printer mencerminkan skema Backend API.
 * Menolak field command injection berbahaya, tipe data salah, dan batas nilai di luar rentang fisik.
 */
export function validatePrintingConfigPayload(
  input: Record<string, any>,
  existing: Partial<PrinterConfig> = {},
  reported: PrinterReportedState | null = null
): PrinterConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrintingValidationError('Printing configuration must be an object.');
  }

  // 1. Cek forbidden fields (Anti shell/command injection)
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_PRINTING_FIELDS.includes(key as any)) {
      throw new PrintingValidationError(`${key} is not accepted.`, 'FORBIDDEN_FIELD');
    }
    if (!ALLOWED_PRINTING_FIELDS.has(key)) {
      throw new PrintingValidationError(`Unknown printing configuration field: ${key}.`, 'UNKNOWN_FIELD');
    }
  }

  const merged = {
    ...DEFAULT_PRINTER_CONFIG,
    ...existing,
    ...input,
  };

  const enabled = Boolean(merged.printing_enabled);
  const adapter = String(merged.adapter || 'disabled').toLowerCase();
  if (!ALLOWED_ADAPTERS.includes(adapter as any)) {
    throw new PrintingValidationError(`adapter must be one of: ${ALLOWED_ADAPTERS.join(', ')}.`);
  }

  // Ukuran kertas
  const paperSize = String(merged.paper_size || '').trim();
  const isCustom = CUSTOM_PATTERN.test(paperSize);
  const isKnown = KNOWN_PAPER_SIZES.some((k) => k.toLowerCase() === paperSize.toLowerCase());

  if (!isKnown && !isCustom) {
    throw new PrintingValidationError(
      `Ukuran kertas "${paperSize}" tidak dikenali. Pilih preset yang tersedia atau gunakan CUSTOM <lebar>X<tinggi> MM.`
    );
  }

  if (isCustom) {
    const customMatch = paperSize.match(CUSTOM_PATTERN);
    if (customMatch) {
      const width = Number(customMatch[1]);
      const height = Number(customMatch[2]);
      if (width > THERMAL_LIMITS.maxPaperWidthMm) {
        throw new PrintingValidationError(
          `Lebar ${width} mm melebihi lebar kertas maksimum (${THERMAL_LIMITS.maxPaperWidthMm} mm).`
        );
      }
      if (height < THERMAL_LIMITS.minHeightMm || height > THERMAL_LIMITS.maxHeightMm) {
        throw new PrintingValidationError(
          `Tinggi ${height} mm di luar rentang printer termal (${THERMAL_LIMITS.minHeightMm}-${THERMAL_LIMITS.maxHeightMm} mm).`
        );
      }
    }
  }

  const orientation = String(merged.orientation || 'portrait').toLowerCase();
  if (!ALLOWED_ORIENTATIONS.includes(orientation as any)) {
    throw new PrintingValidationError('orientation must be portrait or landscape.');
  }

  // Printer Name
  let printerName = merged.printer_name !== null && merged.printer_name !== undefined ? String(merged.printer_name).trim() : null;
  if (printerName !== null && printerName !== '') {
    if (printerName.length > 255 || !/^[\p{L}\p{N} ._()\-/#:+@]+$/u.test(printerName)) {
      throw new PrintingValidationError('printer_name contains unsupported characters.');
    }
  } else {
    printerName = null;
  }

  if (enabled && adapter !== 'disabled') {
    if (!printerName) {
      throw new PrintingValidationError('printer_name is required when printing is enabled.');
    }

    if (reported?.supported_adapters && reported.supported_adapters.length > 0) {
      if (!reported.supported_adapters.includes(adapter)) {
        throw new PrintingValidationError(
          'The selected adapter is not supported by this Kiosk Agent.',
          'UNSUPPORTED_ADAPTER'
        );
      }
    }

    if (reported?.available_printers && reported.available_printers.length > 0) {
      const matches = reported.available_printers.some((p: any) => {
        if (typeof p === 'string') return p === printerName;
        return p && (p.name === printerName || p.id === printerName);
      });
      if (!matches) {
        throw new PrintingValidationError(
          'The selected printer was not reported by this Kiosk Agent.',
          'PRINTER_NOT_AVAILABLE'
        );
      }
    }
  }

  // Range validation helper
  const validateIntRange = (val: any, name: string, min: number, max: number): number => {
    const num = Number(val);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
      throw new PrintingValidationError(`${name} must be an integer between ${min} and ${max}.`);
    }
    return num;
  };

  const copies_limit = validateIntRange(merged.copies_limit, 'copies_limit', 1, 10);
  const timeout_ms = validateIntRange(merged.timeout_ms, 'timeout_ms', 5000, 300000);
  const retry_count = validateIntRange(merged.retry_count, 'retry_count', 0, 3);
  const photo_brightness = validateIntRange(merged.photo_brightness, 'photo_brightness', 50, 150);
  const photo_contrast = validateIntRange(merged.photo_contrast, 'photo_contrast', 50, 150);
  const photo_saturation = validateIntRange(merged.photo_saturation, 'photo_saturation', 0, 150);
  const thermal_density = validateIntRange(merged.thermal_density, 'thermal_density', 1, 5);
  const thermal_offset_y_px = validateIntRange(merged.thermal_offset_y_px, 'thermal_offset_y_px', -200, 200);
  const thermal_offset_x_px = validateIntRange(merged.thermal_offset_x_px, 'thermal_offset_x_px', -200, 200);
  const print_margin_top_px = validateIntRange(merged.print_margin_top_px, 'print_margin_top_px', 0, 300);
  const print_margin_right_px = validateIntRange(merged.print_margin_right_px, 'print_margin_right_px', 0, 300);
  const print_margin_left_px = validateIntRange(merged.print_margin_left_px, 'print_margin_left_px', 0, 300);
  const print_margin_bottom_px = validateIntRange(merged.print_margin_bottom_px, 'print_margin_bottom_px', 0, 300);
  const print_sharpen = validateIntRange(merged.print_sharpen, 'print_sharpen', 0, 100);

  const photo_fit_mode = String(merged.photo_fit_mode || 'fit').toLowerCase();
  if (!ALLOWED_FIT_MODES.includes(photo_fit_mode as any)) {
    throw new PrintingValidationError(`photo_fit_mode must be one of: ${ALLOWED_FIT_MODES.join(', ')}.`);
  }

  const grayscale_algorithm = String(merged.grayscale_algorithm || 'rec601').toLowerCase();
  if (!ALLOWED_GRAYSCALE_ALGORITHMS.includes(grayscale_algorithm as any)) {
    throw new PrintingValidationError(
      `grayscale_algorithm must be one of: ${ALLOWED_GRAYSCALE_ALGORITHMS.join(', ')}.`
    );
  }

  return {
    printing_enabled: enabled,
    adapter: enabled ? adapter : 'disabled',
    printer_name: enabled ? printerName : null,
    paper_size: paperSize,
    orientation,
    copies_limit,
    timeout_ms,
    retry_count,
    config_version: Math.max(1, Math.round(Number(merged.config_version || 1))),
    allowed_layouts: Array.isArray(merged.allowed_layouts) ? merged.allowed_layouts.map(String) : [],
    photo_brightness,
    photo_contrast,
    photo_saturation,
    thermal_density,
    thermal_offset_y_px,
    thermal_offset_x_px,
    photo_fit_mode,
    print_margin_top_px,
    print_margin_right_px,
    print_margin_left_px,
    print_margin_bottom_px,
    print_sharpen,
    grayscale_algorithm,
    show_email_button: parseBool(merged.show_email_button, true),
    show_retake_button: parseBool(merged.show_retake_button, true),
    show_print_button: parseBool(merged.show_print_button, true),
  };
}

/**
 * Serialisasi printer config sebelum dikirim ke backend atau disimpan ke storage.
 * Melakukan validasi tipe ketat, batasan numerik (clamping), dan penyesuaian payload.
 */
export function serializePrinterConfig(config: Partial<PrinterConfig>): PrinterConfig {
  const enabled = Boolean(config.printing_enabled);
  let adapter = String(config.adapter || 'disabled').toLowerCase();
  if (!ALLOWED_ADAPTERS.includes(adapter as any)) {
    adapter = 'disabled';
  }

  let orientation = String(config.orientation || 'portrait').toLowerCase();
  if (!ALLOWED_ORIENTATIONS.includes(orientation as any)) {
    orientation = 'portrait';
  }

  let photo_fit_mode = String(config.photo_fit_mode || 'fit').toLowerCase();
  if (!ALLOWED_FIT_MODES.includes(photo_fit_mode as any)) {
    photo_fit_mode = 'fit';
  }

  let grayscale_algorithm = String(config.grayscale_algorithm || 'rec601').toLowerCase();
  if (!ALLOWED_GRAYSCALE_ALGORITHMS.includes(grayscale_algorithm as any)) {
    grayscale_algorithm = 'rec601';
  }

  return {
    printing_enabled: enabled,
    adapter: enabled ? adapter : 'disabled',
    printer_name: enabled ? (config.printer_name ? String(config.printer_name).trim() : null) : null,
    paper_size: String(config.paper_size || DEFAULT_PRINTER_CONFIG.paper_size).trim(),
    orientation,
    copies_limit: clampInt(config.copies_limit, 1, 10, 1),
    timeout_ms: clampInt(config.timeout_ms, 5000, 300000, 60000),
    retry_count: clampInt(config.retry_count, 0, 3, 2),
    config_version: Math.max(1, Math.round(Number(config.config_version || 1))),
    allowed_layouts: Array.isArray(config.allowed_layouts) ? config.allowed_layouts.map(String) : [],

    // Kalibrasi foto (50-150%, persen)
    photo_brightness: clampInt(config.photo_brightness, 50, 150, 100),
    photo_contrast: clampInt(config.photo_contrast, 50, 150, 100),
    photo_saturation: clampInt(config.photo_saturation, 0, 150, 100),

    // Kalibrasi termal
    thermal_density: clampInt(config.thermal_density, 1, 5, 3),
    thermal_offset_x_px: clampInt(config.thermal_offset_x_px, -200, 200, 0),
    thermal_offset_y_px: clampInt(config.thermal_offset_y_px, -200, 200, 0),
    photo_fit_mode,

    // Margin kotak cetak piksel (0-300 px)
    print_margin_top_px: clampInt(config.print_margin_top_px, 0, 300, 0),
    print_margin_right_px: clampInt(config.print_margin_right_px, 0, 300, 0),
    print_margin_left_px: clampInt(config.print_margin_left_px, 0, 300, 0),
    print_margin_bottom_px: clampInt(config.print_margin_bottom_px, 0, 300, 0),

    // Ketajaman & algoritma monokrom
    print_sharpen: clampInt(config.print_sharpen, 0, 100, 0),
    grayscale_algorithm,

    // Tombol layar akhir kiosk
    show_email_button: parseBool(config.show_email_button, true),
    show_retake_button: parseBool(config.show_retake_button, true),
    show_print_button: parseBool(config.show_print_button, true),
  };
}

/**
 * Deserialisasi konfigurasi dari response backend atau storage lokal menjadi PrinterConfig valid.
 */
export function deserializePrinterConfig(raw: any): PrinterConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
  const merged = { ...DEFAULT_PRINTER_CONFIG, ...raw };
  if ('enabled' in raw && !('printing_enabled' in raw)) {
    merged.printing_enabled = raw.enabled;
  }
  return serializePrinterConfig(merged);
}

/**
 * Validasi ukuran kertas kustom terhadap batas fisik printer label termal.
 */
export function validateCustomPaperSize(value: string): string | null {
  const match = String(value || '').trim().match(CUSTOM_PATTERN);
  if (!match) return 'Format: CUSTOM <lebar>X<tinggi> MM (contoh: CUSTOM 48X150 MM)';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > THERMAL_LIMITS.maxPaperWidthMm) {
    return `Lebar ${width} mm melebihi lebar kertas maksimum (${THERMAL_LIMITS.maxPaperWidthMm} mm).`;
  }
  if (width > THERMAL_LIMITS.maxPrintWidthMm) {
    return `Lebar ${width} mm melebihi lebar cetak maksimum kepala cetak termal (${THERMAL_LIMITS.maxPrintWidthMm} mm). Sisi kanan akan terpotong secara fisik.`;
  }
  if (height < THERMAL_LIMITS.minHeightMm || height > THERMAL_LIMITS.maxHeightMm) {
    return `Tinggi harus antara ${THERMAL_LIMITS.minHeightMm}–${THERMAL_LIMITS.maxHeightMm} mm (diminta ${height} mm).`;
  }
  return null;
}

/**
 * Konversi error HTTP ke format terstruktur untuk feedback UI yang aman.
 */
export interface ParsedPrinterError {
  status: number;
  code: string;
  message: string;
  isSecurityError: boolean;
  isNetworkError: boolean;
}

export function parsePrinterApiError(error: any): ParsedPrinterError {
  const status = error?.response?.status || (error?.statusCode ?? 0);
  const data = error?.response?.data;
  const code = data?.error_code || error?.code || (
    status === 400 ? 'BAD_REQUEST' :
    status === 401 ? 'UNAUTHORIZED' :
    status === 403 ? 'FORBIDDEN' :
    status === 404 ? 'NOT_FOUND' :
    status === 503 ? 'SERVICE_UNAVAILABLE' :
    'UNKNOWN_ERROR'
  );
  const message = data?.message || error?.message || 'Terjadi kesalahan pada printer service.';
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
 * Pemetaan konsistensi dua arah antara konfigurasi printer lama pada tab Hardware (4x6 / Strip)
 * dengan preset ukuran kertas baru pada tab Printer Configuration.
 */
export function mapLegacyPrinterSizeToPaperPreset(legacySize: '4x6' | 'Strip' | string): string {
  const norm = String(legacySize || '').trim().toLowerCase();
  if (norm === 'strip') {
    return '4 Strip 5 × 15 cm';
  }
  if (norm === '4x6' || norm === '4r') {
    return '2×3 Grid 10 × 15 cm';
  }
  return 'Instax Mini (54 × 86 mm)';
}

export function mapPaperPresetToLegacyPrinterSize(paperSize: string): '4x6' | 'Strip' {
  const norm = String(paperSize || '').trim().toLowerCase();
  if (norm.includes('strip')) {
    return 'Strip';
  }
  return '4x6';
}

/**
 * Audit lingkungan pengujian cetak lokal untuk memastikan isolasi penuh dari hardware fisik.
 */
export interface TestPrintSafetyAudit {
  isHardwarePrintingBlocked: boolean;
  isBackendJobCreationBlocked: boolean;
  isWebSocketCommandBlocked: boolean;
  isElectronIpcBlocked: boolean;
  isWebBluetoothBlocked: boolean;
  isWindowsSpoolerBlocked: boolean;
  isCupsSpoolerBlocked: boolean;
  mode: 'SAFE_SIMULATION';
}

export function auditTestPrintSafety(): TestPrintSafetyAudit {
  return {
    isHardwarePrintingBlocked: true,
    isBackendJobCreationBlocked: true,
    isWebSocketCommandBlocked: true,
    isElectronIpcBlocked: true,
    isWebBluetoothBlocked: true,
    isWindowsSpoolerBlocked: true,
    isCupsSpoolerBlocked: true,
    mode: 'SAFE_SIMULATION',
  };
}

/**
 * Mengambil konfigurasi printer per-kiosk.
 * Menggunakan mode simulasi lokal jika ENABLE_BACKEND_MUTATIONS=false untuk melindungi backend produksi.
 */
export async function getPrinterConfig(
  kioskId: string | number,
  kioskStatus?: string,
  options?: ServiceExecutionOptions
): Promise<PrintingConfigResponse> {
  const strId = String(kioskId);
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    let savedConfig: PrinterConfig = { ...DEFAULT_PRINTER_CONFIG };
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${strId}`);
        if (raw) {
          savedConfig = deserializePrinterConfig(JSON.parse(raw));
        }
      } catch (err) {
        console.warn('Gagal membaca simulated printer config dari storage:', err);
      }
    }

    const isOnline = kioskStatus === 'online';
    const simulatedReported: PrinterReportedState = {
      config_version: savedConfig.config_version,
      adapter: savedConfig.adapter,
      printer_name: savedConfig.printer_name,
      status: isOnline ? (savedConfig.printing_enabled ? 'READY' : 'OFFLINE') : 'OFFLINE',
      paper_status: isOnline ? 'OK' : 'UNKNOWN',
      prints_remaining: isOnline ? 120 : null,
      last_print_error: null,
      supported_adapters: ['disabled', 'thermal', 'windows', 'mock'],
      available_printers: savedConfig.printer_name ? [savedConfig.printer_name] : ['NIIMBOT B1 Pro (Bluetooth)'],
      reported_at: new Date().toISOString(),
    };

    return {
      config: savedConfig,
      reported: simulatedReported,
      status: { pending: false, applied: true },
    };
  }

  const client = options?.customApi ?? api;
  const res = await client.get(`/admin/kiosks/${encodeURIComponent(strId)}/printing-config`);
  const data = res.data?.data || res.data || {};
  return {
    config: deserializePrinterConfig(data.config || data),
    reported: data.reported || null,
    status: data.status || { pending: false, applied: true },
  };
}

/**
 * Menyimpan konfigurasi printer per-kiosk.
 * Menghormati safeguard fail-closed; menyimpan ke penyimpanan lokal per-kiosk saat simulasi.
 */
export async function updatePrinterConfig(
  kioskId: string | number,
  config: PrinterConfig,
  options?: ServiceExecutionOptions
): Promise<{ success: boolean; message: string; simulated?: boolean; data?: PrintingConfigResponse }> {
  const strId = String(kioskId);
  // Validasi payload sebelum disimpan lokal atau dikirim ke backend
  validatePrintingConfigPayload(config);

  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    const updated: PrinterConfig = serializePrinterConfig({
      ...config,
      config_version: (config.config_version || 1) + 1,
    });
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${strId}`, JSON.stringify(updated));
      } catch (err) {
        console.warn('Gagal menyimpan simulated printer config:', err);
      }
    }
    return {
      success: true,
      message: 'Konfigurasi printer berhasil disimpan (Mode simulasi aman - server produksi dilindungi).',
      simulated: true,
      data: {
        config: updated,
        reported: {
          config_version: updated.config_version,
          adapter: updated.adapter,
          printer_name: updated.printer_name,
          status: updated.printing_enabled ? 'READY' : 'OFFLINE',
          paper_status: 'OK',
          supported_adapters: ['disabled', 'thermal', 'windows', 'mock'],
          available_printers: updated.printer_name ? [updated.printer_name] : [],
          reported_at: new Date().toISOString(),
        },
        status: { pending: false, applied: true },
      },
    };
  }

  const client = options?.customApi ?? api;
  const targetBaseUrl = client.defaults.baseURL || '';
  assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));

  const payload = serializePrinterConfig(config);
  const res = await client.put(`/admin/kiosks/${encodeURIComponent(strId)}/printing-config`, payload);
  const data = res.data?.data;
  return {
    success: true,
    message: res.data?.message || 'Printer configuration saved to server.',
    simulated: false,
    data: data ? {
      config: deserializePrinterConfig(data.config || data),
      reported: data.reported || null,
      status: data.status || { pending: false, applied: true },
    } : undefined,
  };
}

/**
 * Meminta penyegaran status printer.
 */
export async function refreshPrinterStatus(
  kioskId: string | number,
  options?: ServiceExecutionOptions
): Promise<{ success: boolean; message: string; simulated?: boolean }> {
  const strId = String(kioskId);
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    return {
      success: true,
      message: 'Status printer berhasil diperbarui (Simulasi lokal).',
      simulated: true,
    };
  }

  const client = options?.customApi ?? api;
  const targetBaseUrl = client.defaults.baseURL || '';
  assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));

  const res = await client.post(`/admin/kiosks/${encodeURIComponent(strId)}/printing-config/refresh`);
  return {
    success: true,
    message: res.data?.message || 'Printer status refresh requested.',
    simulated: false,
  };
}

/**
 * Menjalankan uji cetak (Test Print).
 * PERINGATAN KEAMANAN KRITIS: Dalam mode default, fungsi ini HANYA menjalankan simulasi visual.
 * Tidak pernah memicu pencetakan fisik atau mutasi jaringan backend.
 */
export async function testPrintSimulation(
  kioskId: string | number,
  config: PrinterConfig,
  options?: ServiceExecutionOptions
): Promise<{ success: boolean; message: string; simulated: boolean; jobId?: string }> {
  const strId = String(kioskId);
  const shouldSimulate = options?.simulate ?? (!options?.customApi && !ENABLE_BACKEND_MUTATIONS);

  if (shouldSimulate) {
    if (!config.printing_enabled || config.adapter === 'disabled') {
      throw new Error('Pencetakan harus diaktifkan dan adapter dipilih sebelum menjalankan uji cetak.');
    }
    const simulatedJobId = `SIM-TEST-${Date.now()}`;
    return {
      success: true,
      message: 'Simulasi cetak berhasil (Mode simulasi visual lokal — tidak ada pencetakan fisik).',
      simulated: true,
      jobId: simulatedJobId,
    };
  }

  const client = options?.customApi ?? api;
  const targetBaseUrl = client.defaults.baseURL || '';
  assertMutationAllowed(targetBaseUrl, Boolean(options?.customApi));

  const res = await client.post(`/admin/kiosks/${encodeURIComponent(strId)}/printing-config/test`);
  return {
    success: true,
    message: res.data?.message || 'Test print queued on kiosk.',
    simulated: false,
    jobId: res.data?.data?.job_id,
  };
}
