/**
 * UNISMILES DATA SOURCE MODE CONFIGURATION
 *
 * Sediakan mode data yang eksplisit:
 * A. SAFE_SIMULATION: Seluruh halaman menggunakan fixture sintetis yang konsisten.
 * B. AUTHORIZED_READ_ONLY: Pembacaan GET backend yang diizinkan, dengan kontrol akses dan perlindungan data pelanggan.
 *
 * Default: SAFE_SIMULATION (sesuai instruksi: "pertahankan SAFE SIMULATION sebagai default").
 */

export type DataSourceMode = 'SAFE_SIMULATION' | 'AUTHORIZED_READ_ONLY';

export const DEFAULT_DATA_SOURCE_MODE: DataSourceMode = 'SAFE_SIMULATION';

const STORAGE_KEY = 'unismiles_data_source_mode';

let _memoryMode: DataSourceMode = DEFAULT_DATA_SOURCE_MODE;

export function getDataSourceMode(): DataSourceMode {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as DataSourceMode | null;
      if (saved === 'SAFE_SIMULATION' || saved === 'AUTHORIZED_READ_ONLY') {
        return saved;
      }
    } catch {
      // Ignore localStorage errors (e.g. in tests)
    }
  }
  return _memoryMode;
}

export function setDataSourceMode(mode: DataSourceMode): void {
  _memoryMode = mode;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent('unismiles:datasource-change', { detail: mode }));
    } catch {
      // Ignore localStorage errors
    }
  }
}
