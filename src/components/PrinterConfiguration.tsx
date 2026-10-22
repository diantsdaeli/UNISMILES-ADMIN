import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer,
  Sliders,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle2,
  TestTube2,
  SlidersHorizontal,
  Layers,
  Palette,
  Eye,
  Info,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { PrintPreview } from './PrintPreview';
import {
  PAPER_CATALOG,
  findPaper,
  previewPlan,
  effectiveMargin,
  GRAYSCALE_OPTIONS,
  type Margin,
} from '../lib/printPapers';
import {
  DEFAULT_PRINTER_CONFIG,
  getPrinterConfig,
  updatePrinterConfig,
  refreshPrinterStatus,
  testPrintSimulation,
  validateCustomPaperSize,
  THERMAL_LIMITS,
} from '../lib/printerService';
import type { PrinterConfig, PrinterReportedState, PrintingConfigStatus } from '../types/printer';

interface PrinterConfigurationProps {
  kiosk: any;
  onConfigChange?: (config: PrinterConfig) => void;
}

const ADAPTERS = [
  { value: 'disabled', label: 'Disabled / Direct Web Bluetooth' },
  { value: 'thermal', label: 'Thermal Label Printer (NIIMBOT B1/B1 Pro)' },
  { value: 'windows', label: 'Windows Print Spooler' },
  { value: 'cups', label: 'CUPS Spooler (macOS / Linux)' },
  { value: 'mock', label: 'Mock Test Adapter (Simulasi)' },
] as const;

const PHOTO_PRESETS = [
  'Instax Mini (54 × 86 mm)',
  'Polaroid 6 × 9 cm (2R)',
  '2 Strip 5 × 15 cm',
  '3 Strip 5 × 15 cm',
  '4 Strip 5 × 15 cm',
  '2×2 Grid 10 × 10 cm',
  '2×3 Grid 10 × 15 cm',
] as const;

const THERMAL_PRESETS = [
  'Termal 40 × 60 mm (2 foto)',
  'Termal 40 × 90 mm (3 foto)',
  'Termal 40 × 120 mm (4 foto)',
  'Termal 48 × 150 mm (strip panjang)',
  'Termal 30 × 40 mm (label kecil)',
] as const;

const ALGORITHM_DESCRIPTIONS: Record<string, string> = {
  rec601: 'Bobot 0,299R + 0,587G + 0,114B. Standar TV lama; terbukti paling seimbang di kertas fisik.',
  rec709: 'Bobot 0,213R + 0,715G + 0,072B. Hijau dinaikkan; kontras antar warna lebih tegas untuk foto berwarna.',
  average: 'Ketiga kanal dibagi tiga sama rata. Warna biru dan merah lebih terang.',
  'luma-sqrt': 'Akar dari jumlah kanal kuadrat. Hasil abu-abu jauh lebih terang.',
  green: 'Hanya kanal hijau. Kontras kulit wajah dan tekstur paling tinggi.',
  red: 'Hanya kanal merah. Memunculkan detail kulit terang dan gaun putih; langit biru jadi gelap.',
  blue: 'Hanya kanal biru. Citra lebih gelap, menonjolkan elemen biru jadi hitam tegas.',
  max: 'Ambil kanal paling terang. Bayangan tetap terbaca; bagian sangat terang bisa jenuh.',
  min: 'Ambil kanal paling gelap. Garis dan tepi paling tegas.',
};

export const PrinterConfiguration: React.FC<PrinterConfigurationProps> = ({ kiosk, onConfigChange }) => {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG);
  const [reported, setReported] = useState<PrinterReportedState | null>(null);
  const [status, setStatus] = useState<PrintingConfigStatus>({ pending: false, applied: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  const kioskId = String(kiosk?.id || 'default');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPrinterConfig(kioskId, kiosk?.status);
      setConfig(res.config);
      setReported(res.reported);
      setStatus(res.status);
      onConfigChange?.(res.config);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat konfigurasi printer.');
    } finally {
      setLoading(false);
    }
  }, [kioskId, kiosk?.status, onConfigChange]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const setField = <K extends keyof PrinterConfig>(field: K, value: PrinterConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      onConfigChange?.(next);
      return next;
    });
  };

  const isCustomSize = /^custom\s/i.test(String(config.paper_size || ''));
  const [customDraft, setCustomDraft] = useState<string>(isCustomSize ? config.paper_size : 'CUSTOM 48X150 MM');
  useEffect(() => {
    if (isCustomSize) setCustomDraft(config.paper_size);
  }, [isCustomSize, config.paper_size]);

  const customProblem = isCustomSize ? validateCustomPaperSize(config.paper_size) : null;

  const configuredMargin: Margin = useMemo(
    () => ({
      topPx: config.print_margin_top_px ?? 0,
      rightPx: config.print_margin_right_px ?? 0,
      leftPx: config.print_margin_left_px ?? 0,
      bottomPx: config.print_margin_bottom_px ?? 0,
    }),
    [config.print_margin_top_px, config.print_margin_right_px, config.print_margin_left_px, config.print_margin_bottom_px]
  );

  const marginEfektif = useMemo(
    () => effectiveMargin(config.paper_size, configuredMargin),
    [config.paper_size, configuredMargin]
  );

  const handleSave = async () => {
    if (config.printing_enabled && config.adapter === 'disabled') {
      toast.warning('Printing diaktifkan dengan adapter disabled (Direct Web Bluetooth).');
    }
    if (isCustomSize && customProblem) {
      toast.error(customProblem);
      return;
    }
    setSaving(true);
    try {
      const res = await updatePrinterConfig(kioskId, config);
      if (res.data) {
        setConfig(res.data.config);
        setReported(res.data.reported);
        setStatus(res.data.status);
      }
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan konfigurasi printer.');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshPrinterStatus(kioskId);
      toast.info(res.message);
      await loadConfig();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyegarkan status printer.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    try {
      const res = await testPrintSimulation(kioskId, config);
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menjalankan simulasi cetak.');
    } finally {
      setTestPrinting(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset seluruh konfigurasi printer ke nilai bawaan pabrik?')) {
      setConfig(DEFAULT_PRINTER_CONFIG);
      onConfigChange?.(DEFAULT_PRINTER_CONFIG);
      toast.info('Konfigurasi dikembalikan ke nilai default.');
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
        <p className="text-xs font-black uppercase tracking-widest text-muted">Memuat konfigurasi printer…</p>
      </div>
    );
  }

  const isOnline = kiosk.status === 'online';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-black/20 rounded-3xl border border-white/5">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2">
              Printer Configuration & Photo Calibration
              <span
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest',
                  isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-muted'
                )}
              >
                {isOnline ? 'Kiosk Online' : 'Kiosk Offline'}
              </span>
            </h2>
            <p className="text-xs text-muted font-medium mt-0.5">
              Kelola adapter printer, preset kertas terukur, kalibrasi citra, dan live preview 1-bit dithering.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin text-primary')} />
            Refresh Status
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testPrinting}
            title="Simulasi visual uji cetak lokal tanpa menyentuh perangkat printer fisik"
            className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <TestTube2 className="w-3.5 h-3.5 text-amber-400" />
            Simulate Test Print — No Physical Printing
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
          </button>
        </div>
      </div>

      {/* Grid: Settings Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Kolom 1: Hardware & Paper Selection */}
        <div className="space-y-6">
          {/* Card: Adapter & Switch */}
          <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Adapter & Status Cetak
            </h3>

            {/* Toggle Enable Printing */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <p className="text-xs font-bold text-foreground">Aktifkan Layanan Pencetakan</p>
                <p className="text-[10px] text-muted">Izinkan Kiosk menjalankan antrean cetak foto / label.</p>
              </div>
              <input
                type="checkbox"
                checked={config.printing_enabled}
                onChange={(e) => setField('printing_enabled', e.target.checked)}
                className="w-5 h-5 accent-primary cursor-pointer"
              />
            </div>

            {/* Adapter Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted">Pilihan Adapter Printer</label>
              <select
                value={config.adapter}
                onChange={(e) => setField('adapter', e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-primary/50"
              >
                {ADAPTERS.map((a) => (
                  <option key={a.value} value={a.value} className="bg-neutral-900 text-foreground">
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Printer Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted">Nama Perangkat Printer</label>
              <input
                type="text"
                value={config.printer_name || ''}
                onChange={(e) => setField('printer_name', e.target.value || null)}
                placeholder="misal: NIIMBOT B1 Pro / DNP DS-RX1"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-primary/50"
              />
            </div>

            {/* Reported State Card */}
            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Status Hardware Terlapor:</span>
                <span
                  className={cn(
                    'font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
                    reported?.status === 'READY'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : reported?.status === 'ERROR'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/10 text-muted'
                  )}
                >
                  {reported?.status || (isOnline ? 'UNKNOWN' : 'OFFLINE')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Status Kertas Kiosk:</span>
                <span className="text-foreground font-bold">{reported?.paper_status || 'Tidak ada laporan'}</span>
              </div>
              {reported?.available_printers && reported.available_printers.length > 0 && (
                <div className="text-[10px] text-muted pt-2 border-t border-white/5">
                  Printer terdeteksi: <span className="text-foreground">{reported.available_printers.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card: Paper Size Presets */}
          <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Preset Ukuran Kertas
            </h3>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted">Katalog Ukuran Kertas</label>
              <select
                value={config.paper_size}
                onChange={(e) => setField('paper_size', e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-primary/50"
              >
                <optgroup label="Preset Foto Standar" className="bg-neutral-900 text-foreground">
                  {PHOTO_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Preset Kertas Termal" className="bg-neutral-900 text-foreground">
                  {THERMAL_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Katalog Label Resmi NIIMBOT" className="bg-neutral-900 text-foreground">
                  {PAPER_CATALOG.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Ukuran Kustom" className="bg-neutral-900 text-foreground">
                  <option value={customDraft}>Ukuran Kustom ({customDraft})</option>
                </optgroup>
              </select>
            </div>

            {/* Custom Paper Size Input */}
            {isCustomSize && (
              <div className="space-y-2 p-4 bg-white/5 rounded-2xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Pengaturan Ukuran Kustom (CUSTOM &lt;lebar&gt;X&lt;tinggi&gt; MM)
                </label>
                <input
                  type="text"
                  value={customDraft}
                  onChange={(e) => {
                    setCustomDraft(e.target.value);
                    setField('paper_size', e.target.value);
                  }}
                  placeholder="contoh: CUSTOM 48X150 MM"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-foreground outline-none focus:border-primary/50"
                />
                {customProblem ? (
                  <p className="text-[10px] text-red-400 font-semibold">{customProblem}</p>
                ) : (
                  <p className="text-[10px] text-muted">Format valid untuk printer termal (lebar maks {THERMAL_LIMITS.maxPrintWidthMm} mm).</p>
                )}
              </div>
            )}

            {/* Orientasi & Limit Salinan */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">Orientasi</label>
                <select
                  value={config.orientation}
                  onChange={(e) => setField('orientation', e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">Batas Salinan (Copies)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={config.copies_limit}
                  onChange={(e) => setField('copies_limit', Math.max(1, Number(e.target.value)))}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Card: Kiosk End-Screen Buttons Visibility */}
          <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Visibilitas Tombol Layar Selesai Kiosk
            </h3>
            <p className="text-[11px] text-muted">
              Atur tombol aksi yang tampil bagi pelanggan di layar penutup photobooth.
            </p>
            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer">
                <span className="text-xs font-semibold text-foreground">Tampilkan Tombol Cetak Fisik</span>
                <input
                  type="checkbox"
                  checked={config.show_print_button}
                  onChange={(e) => setField('show_print_button', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer">
                <span className="text-xs font-semibold text-foreground">Tampilkan Tombol Kirim Email</span>
                <input
                  type="checkbox"
                  checked={config.show_email_button}
                  onChange={(e) => setField('show_email_button', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer">
                <span className="text-xs font-semibold text-foreground">Tampilkan Tombol Retake Foto</span>
                <input
                  type="checkbox"
                  checked={config.show_retake_button}
                  onChange={(e) => setField('show_retake_button', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Kolom 2: Calibration, Grayscale & WYSIWYG Live Preview */}
        <div className="space-y-6">
          {/* Card: Calibration Sliders */}
          <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" /> Kalibrasi Citra Foto & Termal
              </h3>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-[10px] font-black uppercase tracking-widest text-muted hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset Bawaan
              </button>
            </div>

            {/* Sliders B/C/S */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                  <span>Brightness (Kecerahan)</span>
                  <span className="font-mono text-primary">
                    {config.photo_brightness}%{' '}
                    <span className="text-muted font-normal text-[10px]">
                      {config.photo_brightness === 100
                        ? '(Netral / ±0%)'
                        : config.photo_brightness > 100
                        ? `(+${config.photo_brightness - 100}%)`
                        : `(${config.photo_brightness - 100}%)`}
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={config.photo_brightness}
                  onChange={(e) => setField('photo_brightness', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                  <span>Contrast (Kontras)</span>
                  <span className="font-mono text-primary">
                    {config.photo_contrast}%{' '}
                    <span className="text-muted font-normal text-[10px]">
                      {config.photo_contrast === 100
                        ? '(Netral / ±0%)'
                        : config.photo_contrast > 100
                        ? `(+${config.photo_contrast - 100}%)`
                        : `(${config.photo_contrast - 100}%)`}
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={config.photo_contrast}
                  onChange={(e) => setField('photo_contrast', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                  <span>Saturation (Saturasi)</span>
                  <span className="font-mono text-primary">
                    {config.photo_saturation}%{' '}
                    <span className="text-muted font-normal text-[10px]">
                      {config.photo_saturation === 100
                        ? '(Netral / ±0%)'
                        : config.photo_saturation === 0
                        ? '(Hitam-Putih Murni)'
                        : config.photo_saturation > 100
                        ? `(+${config.photo_saturation - 100}%)`
                        : `(${config.photo_saturation - 100}%)`}
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={config.photo_saturation}
                  onChange={(e) => setField('photo_saturation', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                  <span>Sharpening (Penajaman Unsharp Mask)</span>
                  <span className="font-mono text-primary">{config.print_sharpen}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.print_sharpen}
                  onChange={(e) => setField('print_sharpen', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>

            {/* Thermal Specific: Density, Offset, Fit Mode */}
            <div className="pt-4 border-t border-white/5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                    <span>Kepekatan Termal (1–5)</span>
                    <span>Level {config.thermal_density}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={config.thermal_density}
                    onChange={(e) => setField('thermal_density', Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-foreground mb-1">
                    <span>Fit Mode Foto</span>
                    <span className="uppercase">{config.photo_fit_mode}</span>
                  </div>
                  <select
                    value={config.photo_fit_mode}
                    onChange={(e) => setField('photo_fit_mode', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="fit">Fit (Jaga Rasio)</option>
                    <option value="cover">Cover (Penuhi Label)</option>
                    <option value="stretch">Stretch (Renggangkan)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted mb-1">
                    <span>Offset Horizontal X</span>
                    <span className="font-mono text-foreground font-bold">
                      {config.thermal_offset_x_px} px (~{(config.thermal_offset_x_px / 11.81).toFixed(1)} mm)
                    </span>
                  </div>
                  <input
                    type="number"
                    min={-200}
                    max={200}
                    value={config.thermal_offset_x_px}
                    onChange={(e) => setField('thermal_offset_x_px', Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted mb-1">
                    <span>Offset Vertikal Y</span>
                    <span className="font-mono text-foreground font-bold">
                      {config.thermal_offset_y_px} px (~{(config.thermal_offset_y_px / 11.81).toFixed(1)} mm)
                    </span>
                  </div>
                  <input
                    type="number"
                    min={-200}
                    max={200}
                    value={config.thermal_offset_y_px}
                    onChange={(e) => setField('thermal_offset_y_px', Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Margins 4 Sisi */}
              <div className="pt-3 border-t border-white/5 space-y-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
                    Margin Kotak Cetak (12 px ≈ 1 mm)
                  </label>
                  <p className="text-[10px] text-muted mt-0.5">
                    Di luar margin ini media dibiarkan kosong agar tidak menimpa bingkai cetak bawaan pabrik.
                  </p>
                </div>

                {marginEfektif.source === 'measured' ? (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Terkunci dari ukuran terukur di kertas fisik: Kiri {marginEfektif.margin.leftPx}px · Atas {marginEfektif.margin.topPx}px · Kanan {marginEfektif.margin.rightPx}px · Bawah {marginEfektif.margin.bottomPx}px
                    </p>
                    <p className="text-[10px] text-muted font-medium">
                      Kotak aman 555 × 555 px di x=0 y=71 (SNS 54 × 67 mm). Terkunci otomatis agar kalibrasi pabrik tidak rusak.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted">Kiri</label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={config.print_margin_left_px}
                        onChange={(e) => setField('print_margin_left_px', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      />
                      <span className="text-[9px] text-muted">~{(config.print_margin_left_px / 11.81).toFixed(1)} mm</span>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted">Atas</label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={config.print_margin_top_px}
                        onChange={(e) => setField('print_margin_top_px', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      />
                      <span className="text-[9px] text-muted">~{(config.print_margin_top_px / 11.81).toFixed(1)} mm</span>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted">Kanan</label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={config.print_margin_right_px}
                        onChange={(e) => setField('print_margin_right_px', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      />
                      <span className="text-[9px] text-muted">~{(config.print_margin_right_px / 11.81).toFixed(1)} mm</span>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted">Bawah</label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={config.print_margin_bottom_px}
                        onChange={(e) => setField('print_margin_bottom_px', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      />
                      <span className="text-[9px] text-muted">~{(config.print_margin_bottom_px / 11.81).toFixed(1)} mm</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Grayscale Algorithm Selection */}
            <div className="pt-4 border-t border-white/5 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted">Algoritma Konversi Abu-Abu</label>
              <select
                value={config.grayscale_algorithm}
                onChange={(e) => setField('grayscale_algorithm', e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-primary/50"
              >
                {GRAYSCALE_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value} className="bg-neutral-900 text-foreground">
                    {g.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted leading-relaxed">
                {ALGORITHM_DESCRIPTIONS[config.grayscale_algorithm] || 'Algoritma konversi piksel ke monokrom.'}
              </p>
            </div>
          </div>

          {/* Card: WYSIWYG Live Preview */}
          <PrintPreview
            paperSize={config.paper_size}
            margin={marginEfektif.margin}
            offsetXPx={config.thermal_offset_x_px}
            offsetYPx={config.thermal_offset_y_px}
            fitMode={config.photo_fit_mode}
            brightness={config.photo_brightness}
            contrast={config.photo_contrast}
            saturation={config.photo_saturation}
            grayscale={config.grayscale_algorithm}
            sharpen={config.print_sharpen}
            adapter={config.adapter}
            printerName={config.printer_name}
          />
        </div>
      </div>
    </div>
  );
};
