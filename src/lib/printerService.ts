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
  if (width > THERMAL_LIMITS.maxPrintWidthMm) {
    return `Lebar ${width} mm melebihi lebar cetak maksimum kepala cetak termal (${THERMAL_LIMITS.maxPrintWidthMm} mm). Sisi kanan akan terpotong secara fisik.`;
  }
  if (height < THERMAL_LIMITS.minHeightMm || height > THERMAL_LIMITS.maxHeightMm) {
    return `Tinggi harus antara ${THERMAL_LIMITS.minHeightMm}–${THERMAL_LIMITS.maxHeightMm} mm (diminta ${height} mm).`;
  }
  return null;
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
