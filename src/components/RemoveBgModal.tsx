import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Check, 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  Sliders, 
  Eye, 
  Image as ImageIcon,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  validatePngFile, 
  fileToDataUrl, 
  loadImageElement, 
  checkPngTransparency, 
  removeBackgroundLocally,
  TransparencyCheckResult,
  RemoveBackgroundResult
} from '../lib/imageProcessing';

export interface RemoveBgModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (processedDataUrl: string, assetName: string, originalFile: File) => Promise<void>;
  isSubmitting?: boolean;
}

export const RemoveBgModal: React.FC<RemoveBgModalProps> = ({
  isOpen,
  file,
  onClose,
  onConfirm,
  isSubmitting = false,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
  const [processedDataUrl, setProcessedDataUrl] = useState<string>('');
  const [assetName, setAssetName] = useState<string>('');
  const [hasOriginalAlpha, setHasOriginalAlpha] = useState<boolean>(false);
  const [bgResult, setBgResult] = useState<RemoveBackgroundResult | null>(null);
  const [tolerance, setTolerance] = useState<number>(32);
  const [feather, setFeather] = useState<number>(8);
  const [viewMode, setViewMode] = useState<'after' | 'before' | 'side-by-side'>('side-by-side');

  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  // Proses inisialisasi gambar saat berkas dipilih
  useEffect(() => {
    if (!isOpen || !file) {
      setOriginalDataUrl('');
      setProcessedDataUrl('');
      setBgResult(null);
      setError(null);
      setLoading(false);
      loadedImgRef.current = null;
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setBgResult(null);
    setAssetName(file.name.replace(/\.[^.]+$/, ''));

    const runProcess = async () => {
      try {
        // 1. Validasi Magic Bytes PNG
        const validation = await validatePngFile(file);
        if (!validation.valid) {
          throw new Error(validation.error || 'Berkas bukan PNG valid.');
        }

        // 2. Baca file ke Data URL
        const dataUrl = await fileToDataUrl(file);
        if (!isMounted) return;
        setOriginalDataUrl(dataUrl);

        // 3. Muat ke elemen gambar
        const img = await loadImageElement(dataUrl);
        if (!isMounted) return;
        loadedImgRef.current = img;

        // 4. Periksa apakah PNG sudah memiliki alpha channel transparan
        const check = checkPngTransparency(img);
        setHasOriginalAlpha(check.hasTransparency);

        if (check.hasTransparency) {
          // PNG sudah transparan, pertahankan transparansi asli
          setProcessedDataUrl(dataUrl);
          setBgResult(null);
        } else {
          // PNG solid / opaque, jalankan algoritma flood-fill lokal on-device
          const result = removeBackgroundLocally(img, { tolerance: 32, feather: 8 });
          setBgResult(result);
          setProcessedDataUrl(result.dataUrl);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Gagal memproses gambar PNG.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    runProcess();

    return () => {
      isMounted = false;
    };
  }, [isOpen, file]);

  // Handler re-run jika pengguna menggeser toleransi warna
  const handleReprocess = () => {
    if (!loadedImgRef.current) return;
    try {
      setLoading(true);
      const result = removeBackgroundLocally(loadedImgRef.current, { tolerance, feather });
      setBgResult(result);
      setProcessedDataUrl(result.dataUrl);
    } catch (err: any) {
      setError(err?.message || 'Gagal memproses ulang background.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!file || !processedDataUrl) return;
    const finalName = assetName.trim() || file.name.replace(/\.[^.]+$/, '');
    await onConfirm(processedDataUrl, finalName, file);
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#1E293B] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-display font-black text-foreground">
                Pembersihan Background Lokal (PNG Sticker)
              </h2>
              <p className="text-xs text-muted">
                Algoritma Flood-Fill On-Device &bull; {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] custom-scrollbar">
          {error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="text-sm font-bold">Validasi Berkas Gagal</p>
                <p className="text-xs text-rose-300/90 mt-1">{error}</p>
                <p className="text-[11px] text-muted mt-2">
                  Pastikan berkas adalah PNG asli dengan header yang valid dan ukuran tidak melebihi 15MB.
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-bold text-foreground">Memproses Flood-Fill Background On-Device...</p>
              <p className="text-xs text-muted">Menganalisis piksel & merender alpha channel transparan secara lokal.</p>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              {hasOriginalAlpha ? (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <p className="text-xs font-semibold">
                    PNG ini <strong>sudah memiliki transparansi asli (alpha channel)</strong>. Transparansi dipertahankan 100% tanpa pemotongan ulang.
                  </p>
                </div>
              ) : bgResult?.isComplexBackground ? (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-amber-300">
                      Latar Belakang Kompleks / Gradasi Terdeteksi
                    </p>
                    <p className="text-amber-200/90 leading-relaxed">
                      Sistem menggunakan algoritma lokal <em>Color Flood-Fill</em> (bukan AI Cloud). Pada latar belakang bercorak, bergradasi, atau pemandangan kompleks, penghapusan latar mungkin tidak 100% sempurna. Anda dapat menaikkan slider toleransi warna di bawah atau menggunakan berkas PNG transparan asli untuk hasil presisi.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-300">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <p className="text-xs font-semibold">
                      Latar belakang polos terdeteksi & berhasil dibersihkan dengan algoritma flood-fill lokal.
                    </p>
                  </div>
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setViewMode('side-by-side')}
                      className={`px-2 py-0.5 rounded-lg transition-all ${viewMode === 'side-by-side' ? 'bg-primary text-black' : 'text-muted hover:text-white'}`}
                    >
                      Bandingkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('after')}
                      className={`px-2 py-0.5 rounded-lg transition-all ${viewMode === 'after' ? 'bg-primary text-black' : 'text-muted hover:text-white'}`}
                    >
                      Transparan
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Container dengan Checkered Backdrop Transparan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Before (Original) */}
                {(viewMode === 'side-by-side' || viewMode === 'before') && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted">Original PNG</span>
                    <div className="h-56 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center p-3 overflow-hidden">
                      <img
                        src={originalDataUrl}
                        alt="Original"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* After (Transparent Result) */}
                {(viewMode === 'side-by-side' || viewMode === 'after') && (
                  <div className={`space-y-1.5 ${viewMode === 'after' ? 'sm:col-span-2' : ''}`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                      Hasil Stiker Transparan
                    </span>
                    <div
                      className="h-56 rounded-2xl border border-emerald-500/30 flex items-center justify-center p-3 overflow-hidden relative"
                      style={{
                        backgroundImage: `
                          linear-gradient(45deg, #182234 25%, transparent 25%), 
                          linear-gradient(-45deg, #182234 25%, transparent 25%), 
                          linear-gradient(45deg, transparent 75%, #182234 75%), 
                          linear-gradient(-45deg, transparent 75%, #182234 75%)
                        `,
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                        backgroundColor: '#0F172A',
                      }}
                    >
                      <img
                        src={processedDataUrl}
                        alt="Transparent Sticker"
                        className="max-h-full max-w-full object-contain drop-shadow-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Controls Penyesuaian Toleransi (Hanya jika background di-remove) */}
              {!hasOriginalAlpha && (
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-primary" />
                      Toleransi Warna Background: {tolerance}
                    </span>
                    <button
                      type="button"
                      onClick={handleReprocess}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer"
                    >
                      Terapkan Ulang
                    </button>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={tolerance}
                    onChange={e => setTolerance(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <p className="text-[10px] text-muted">
                    Geser ke kanan jika sisa background di sekitar stiker masih terlihat.
                  </p>
                </div>
              )}

              {/* Input Nama Aset Stiker */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted">Nama Stiker di Katalog</label>
                <input
                  type="text"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  placeholder="Misal: Cute Strawberry Deco"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-foreground outline-none focus:border-primary/50 transition-all font-medium"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:text-foreground hover:bg-white/5 transition-all cursor-pointer"
          >
            Batal
          </button>

          {!error && processedDataUrl && (
            <button
              type="button"
              disabled={isSubmitting || loading}
              onClick={handleConfirmSave}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan Stiker...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  Simpan Stiker Transparan
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
