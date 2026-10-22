import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  Info,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Video,
  X,
  VideoOff,
  Sparkles,
} from 'lucide-react';
import {
  previewPlan,
  renderPrintBitmap,
  inkSummary,
  findPaper,
  applyAdjust,
  effectiveSourceDpi,
  GRAYSCALE_OPTIONS,
  Margin,
  resolvePrinterProfile,
  cameraErrorMessage,
  frameToImage,
} from '../lib/printPapers';

const ZOOM = 2;

export interface PrintPreviewProps {
  paperSize: string;
  margin: Margin;
  offsetXPx: number;
  offsetYPx: number;
  fitMode: 'fit' | 'cover' | 'stretch' | string;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: string;
  sharpen: number;
  adapter?: string;
  printerName?: string | null;
}

function samplePattern(sx: number, sy: number, w: number, h: number): [number, number, number] {
  const mmPerPx = 54 / w;
  const tick = 5 / mmPerPx;
  const tepi = 2;
  const diPenggaris = sx % tick < 2 || sy % tick < 2;
  if (sx < tepi || sy < tepi || sx >= w - tepi || sy >= h - tepi) return [0, 0, 0];
  const kotakSudut = 26;
  const diSudut =
    (sx < kotakSudut || sx >= w - kotakSudut) &&
    (sy < kotakSudut || sy >= h - kotakSudut);
  if (diSudut) return [0, 0, 0];
  const cx = w / 2,
    cy = h / 2;
  const d = Math.hypot(sx - cx, (sy - cy) * 1.1);
  if (d < Math.min(w, h) * 0.16) return [40, 40, 40];
  const v = Math.round(60 + 180 * ((sx / w) * 0.6 + (sy / h) * 0.4));
  return diPenggaris ? [110, 110, 110] : [v, v, v];
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
  paperSize,
  margin,
  offsetXPx,
  offsetYPx,
  fitMode,
  brightness,
  contrast,
  saturation,
  grayscale,
  sharpen,
  adapter,
  printerName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [foto, setFoto] = useState<HTMLImageElement | null>(null);
  const [namaFoto, setNamaFoto] = useState<string>('');
  const [kameraAktif, setKameraAktif] = useState<boolean>(false);
  const [kameraGalat, setKameraGalat] = useState<string | null>(null);

  const profile = useMemo(
    () => resolvePrinterProfile(adapter, printerName, paperSize),
    [adapter, printerName, paperSize]
  );

  const plan = useMemo(
    () => previewPlan(paperSize, margin, offsetXPx, offsetYPx),
    [paperSize, margin, offsetXPx, offsetYPx]
  );
  const ringkas = useMemo(() => inkSummary(plan), [plan]);
  const kertas = useMemo(() => findPaper(paperSize), [paperSize]);
  const adaPenyesuaian = brightness !== 100 || contrast !== 100 || saturation !== 100;
  const grayscaleLabel = GRAYSCALE_OPTIONS.find((o) => o.value === grayscale)?.label || grayscale;

  const dpiSumber = useMemo(
    () => (foto ? effectiveSourceDpi(plan.box, foto.naturalWidth, foto.naturalHeight, fitMode) : null),
    [foto, plan.box, fitMode]
  );

  const pilihFoto = useCallback((file: File | null) => {
    if (!file) {
      setFoto(null);
      setNamaFoto('');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setFoto(img);
      setNamaFoto(file.name);
    };
    img.src = url;
  }, []);

  const resetFoto = useCallback(() => {
    setFoto(null);
    setNamaFoto('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const tutupKamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setKameraAktif(false);
  }, []);

  const bukaKamera = useCallback(async () => {
    setKameraGalat(null);
    if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setKameraGalat(cameraErrorMessage(null));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setKameraAktif(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setKameraGalat(cameraErrorMessage(err));
    }
  }, []);

  const ambilGambar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const img = await frameToImage(video);
      setFoto(img);
      setNamaFoto('Capture Kamera');
      tutupKamera();
    } catch (err) {
      setKameraGalat(cameraErrorMessage(err));
    }
  }, [tutupKamera]);

  // Cleanup stream kamera secara ketat saat unmount untuk mencegah lampu indikator kamera menyala
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Susun bitmap dither jalur cetak WYSIWYG
    const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
    const imgW = foto ? foto.naturalWidth : plan.canvasW;
    const imgH = foto ? foto.naturalHeight : plan.canvasH;

    let sumber: { data: Uint8ClampedArray; width: number; height: number } | null = null;
    if (foto) {
      const s = document.createElement('canvas');
      s.width = imgW;
      s.height = imgH;
      const sc = s.getContext('2d', { willReadFrequently: true });
      if (sc) {
        sc.drawImage(foto, 0, 0, imgW, imgH);
        sumber = sc.getImageData(0, 0, imgW, imgH);
      }
    }

    const mentah = (sx: number, sy: number): [number, number, number] => {
      if (sumber) {
        const i = (sy * sumber.width + sx) * 4;
        return [sumber.data[i], sumber.data[i + 1], sumber.data[i + 2]];
      }
      return samplePattern(sx, sy, imgW, imgH);
    };

    const sample = adaPenyesuaian
      ? (sx: number, sy: number) => applyAdjust(mentah(sx, sy), brightness, contrast, saturation)
      : mentah;

    renderPrintBitmap(
      { data, width: plan.canvasW, height: plan.canvasH },
      { plan, fitMode, imgW, imgH, sample, grayscale, sharpen }
    );

    // 2. Render ke canvas dengan perbesaran ZOOM tanpa smoothing
    const sumberKanvas = document.createElement('canvas');
    sumberKanvas.width = plan.canvasW;
    sumberKanvas.height = plan.canvasH;
    const sCtx = sumberKanvas.getContext('2d');
    if (sCtx) {
      sCtx.putImageData(new ImageData(data, plan.canvasW, plan.canvasH), 0, 0);
    }

    canvas.width = plan.canvasW * ZOOM;
    canvas.height = plan.canvasH * ZOOM;
    const g = canvas.getContext('2d');
    if (!g) return;

    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(sumberKanvas, 0, 0, canvas.width, canvas.height);

    // 3. Panduan visual kotak cetak (cyan)
    g.lineWidth = 1.5;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(34, 211, 238, 0.9)';
    g.strokeRect(plan.box.x * ZOOM + 0.5, plan.box.y * ZOOM + 0.5, plan.box.w * ZOOM, plan.box.h * ZOOM);

    // 4. Batas fisik printhead termal (merah putus-putus) jika melebihi lebar printhead profil
    if (profile.printheadDots < plan.canvasW) {
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(239, 68, 68, 0.95)';
      g.beginPath();
      g.moveTo(profile.printheadDots * ZOOM + 0.5, 0);
      g.lineTo(profile.printheadDots * ZOOM + 0.5, canvas.height);
      g.stroke();
      g.setLineDash([]);
    }

    // Border kertas luar
    g.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    g.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }, [plan, fitMode, brightness, contrast, saturation, adaPenyesuaian, foto, grayscale, sharpen, profile]);

  const exceedsPrinthead = profile.printheadDots < plan.canvasW;

  return (
    <div className="p-6 rounded-3xl bg-black/30 border border-white/5 space-y-5">
      {/* Header Preview */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-black uppercase tracking-wider text-foreground">
              Simulasi Print Preview (WYSIWYG)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-primary/20 text-primary border border-primary/30">
              1-Bit Monochrome
            </span>
            {!profile.isVerifiedHardware && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Estimasi Simulasi
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted font-medium mt-1">
            Simulasi visual langsung di browser: klip ke kotak cetak, penajaman, dan dithering Floyd-Steinberg 1-bit.
          </p>
        </div>

        {/* Upload Custom Sample Photo & Live Camera Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) pilihFoto(e.target.files[0]);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
          >
            <CameraIcon className="w-3.5 h-3.5 text-primary" />
            {foto ? 'Ganti Foto Uji' : 'Upload Foto Uji'}
          </button>

          {!kameraAktif ? (
            <button
              type="button"
              onClick={bukaKamera}
              className="px-3 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              Capture Kamera
            </button>
          ) : (
            <button
              type="button"
              onClick={tutupKamera}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Tutup Kamera
            </button>
          )}

          {foto && (
            <button
              type="button"
              onClick={resetFoto}
              title="Kembali ke pola uji geometris"
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-muted hover:text-foreground transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Camera Viewfinder Modal / Section */}
      {kameraAktif && (
        <div className="p-4 rounded-2xl bg-black/60 border border-primary/30 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-400 animate-pulse" />
              Live Camera Viewfinder (Ambil foto untuk menguji kalibrasi nyata)
            </p>
            <button
              type="button"
              onClick={tutupKamera}
              className="p-1 hover:bg-white/10 rounded-lg text-muted hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative aspect-video max-h-64 bg-black rounded-xl overflow-hidden border border-white/10 mx-auto">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={tutupKamera}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={ambilGambar}
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <CameraIcon className="w-3.5 h-3.5" />
              Ambil Frame Ini
            </button>
          </div>
        </div>
      )}

      {/* Error Message for Camera */}
      {kameraGalat && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[11px] font-medium leading-relaxed">{kameraGalat}</p>
        </div>
      )}

      {/* Warning: Physical Printhead Clipping */}
      {exceedsPrinthead && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-[11px] space-y-1">
            <p className="font-bold flex items-center gap-2">
              Peringatan Lebar Fisik Kepala Cetak ({profile.name}):
              {!profile.isVerifiedHardware && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 uppercase tracking-widest">
                  Estimasi Simulasi
                </span>
              )}
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              Lebar kertas ({ringkas.canvasLabel}) melebihi jangkauan kepala cetak fisik printer ({profile.printheadDots} px = {profile.maxPrintWidthMm} mm). 
              Garis merah putus-putus menunjukkan batas cetak fisik. Bagian di sebelah kanan garis akan terpotong secara fisik di media cetak.
            </p>
            <p className="text-[10px] text-amber-300/70 italic">
              Sumber verifikasi: {profile.verificationSource}
            </p>
          </div>
        </div>
      )}

      {/* Warning: Framed Paper with Zero Margin */}
      {plan.warning && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed font-semibold">{plan.warning}</p>
        </div>
      )}

      {/* Canvas Display */}
      <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start justify-center p-6 bg-black/40 rounded-2xl border border-white/5 overflow-auto">
        <div className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-white">
          <canvas ref={canvasRef} className="block max-w-full h-auto" />
        </div>

        {/* Technical Data Sidebar */}
        <div className="w-full lg:w-72 space-y-4 text-[11px]">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
            <p className="font-black text-muted uppercase tracking-widest text-[9px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" /> Geometri Cetak
            </p>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted">Profil Printer:</span>
                <span className="text-foreground font-bold">{profile.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Kertas (Kanvas):</span>
                <span className="text-foreground font-bold">{ringkas.canvasLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Ukuran Kertas:</span>
                <span className="text-foreground font-bold">{kertas?.label || paperSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Kotak Aman:</span>
                <span className="text-cyan-400 font-bold">{ringkas.boxLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Dimensi Cetak:</span>
                <span className="text-foreground font-bold">{ringkas.mmLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Headroom Printhead:</span>
                <span className={ringkas.headroomPx < 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {ringkas.headroomPx} px
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
            <p className="font-black text-muted uppercase tracking-widest text-[9px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Parameter Kalibrasi Aktif
            </p>
            <div className="space-y-1.5 text-muted">
              <div>Algoritma: <span className="text-foreground font-bold">{grayscaleLabel}</span></div>
              <div>Penajaman: <span className="text-foreground font-bold">{sharpen}%</span></div>
              <div>Fit Mode: <span className="text-foreground font-bold uppercase">{fitMode}</span></div>
              <div>B / C / S: <span className="text-foreground font-bold">{brightness}% / {contrast}% / {saturation}%</span></div>
              {dpiSumber && (
                <div className="pt-2 border-t border-white/5 text-[10px]">
                  Resolusi Efektif: <span className={dpiSumber.upscaled ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>{Math.round(dpiSumber.min)} DPI</span>
                  {dpiSumber.upscaled && ' (Interpolasi)'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
