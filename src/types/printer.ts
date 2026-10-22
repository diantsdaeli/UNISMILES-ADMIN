/**
 * Definisi Model Data Printer Configuration untuk Admin Dian
 * Kompatibel dengan skema tabel kiosk_printing_configs di Backend API.
 */

export interface Margin {
  topPx: number;
  rightPx: number;
  leftPx: number;
  bottomPx: number;
}

export type PrinterAdapter = 'disabled' | 'cups' | 'windows' | 'thermal' | 'mock';

export type GrayscaleAlgorithm =
  | 'rec601'
  | 'rec709'
  | 'average'
  | 'luma-sqrt'
  | 'green'
  | 'red'
  | 'blue'
  | 'max'
  | 'min';

export interface PrinterConfig {
  printing_enabled: boolean;
  adapter: string;
  printer_name: string | null;
  paper_size: string;
  orientation: 'portrait' | 'landscape' | string;
  copies_limit: number;
  timeout_ms: number;
  retry_count: number;
  config_version: number;
  allowed_layouts?: string[];

  // Kalibrasi tampilan citra foto
  photo_brightness: number;
  photo_contrast: number;
  photo_saturation: number;

  // Kalibrasi termal & geometri
  thermal_density: number;
  thermal_offset_y_px: number;
  thermal_offset_x_px: number;
  photo_fit_mode: 'fit' | 'cover' | 'stretch' | string;

  // Margin kotak cetak piksel
  print_margin_top_px: number;
  print_margin_right_px: number;
  print_margin_left_px: number;
  print_margin_bottom_px: number;

  // Penajaman citra & algoritma monokrom
  print_sharpen: number;
  grayscale_algorithm: GrayscaleAlgorithm | string;

  // Visibilitas tombol layar akhir Kiosk
  show_email_button: boolean;
  show_retake_button: boolean;
  show_print_button: boolean;
}

export interface PrinterReportedState {
  config_version?: number;
  adapter?: string | null;
  printer_name?: string | null;
  status?: 'READY' | 'OFFLINE' | 'ERROR' | 'UNKNOWN' | string | null;
  paper_status?: string | null;
  prints_remaining?: number | null;
  last_print_error?: string | null;
  supported_adapters?: string[];
  available_printers?: string[];
  reported_at?: string | null;
}

export interface PrintingConfigStatus {
  pending: boolean;
  applied: boolean;
}

export interface PrintingConfigResponse {
  config: PrinterConfig;
  reported: PrinterReportedState | null;
  status: PrintingConfigStatus;
}
