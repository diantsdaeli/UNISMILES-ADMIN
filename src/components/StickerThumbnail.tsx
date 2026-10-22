import React, { useState } from 'react';
import { ImageOff, Loader2, Trash2 } from 'lucide-react';
import { ReusableAsset, resolveAssetUrl } from '../lib/assets';
import { cn } from '../lib/utils';

export interface StickerThumbnailProps {
  asset: ReusableAsset;
  className?: string;
  imageClassName?: string;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onSetBg?: (e: React.MouseEvent) => void;
  onAddSticker?: (e: React.MouseEvent) => void;
  isDeleting?: boolean;
  mode?: 'gallery' | 'editor';
}

export const StickerThumbnail: React.FC<StickerThumbnailProps> = ({
  asset,
  className,
  imageClassName,
  onClick,
  onDelete,
  onSetBg,
  onAddSticker,
  isDeleting = false,
  mode = 'gallery',
}) => {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // Resolusi aman URL aset gambar
  const rawUrl = asset.resolvedUrl || asset.url || '';
  const finalSrc = rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : resolveAssetUrl(rawUrl);

  const isDefaultSticker = String(asset.id).startsWith('sticker-');
  const isMissing = loadStatus === 'error' || !rawUrl.trim();

  return (
    <div
      title={isMissing ? `[Aset Hilang] ${asset.name} - File gambar tidak tersedia` : asset.name}
      onClick={!isMissing ? onClick : undefined}
      className={cn(
        "group relative p-1.5 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer aspect-square shadow-sm",
        isMissing
          ? "bg-rose-950/20 border border-rose-500/30 hover:border-rose-500/60"
          : "bg-black/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/40",
        className
      )}
    >
      {/* Tombol Hapus (untuk custom / missing asset) */}
      {onDelete && !isDefaultSticker && (
        <button
          type="button"
          title={`Hapus ${asset.name}`}
          disabled={isDeleting}
          onClick={onDelete}
          className="absolute top-1 right-1 p-1 rounded-md bg-black/80 hover:bg-rose-500/40 text-muted hover:text-rose-300 border border-white/10 opacity-0 group-hover:opacity-100 transition-all z-20 cursor-pointer shadow-md"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Kontainer Gambar */}
      <div className="w-full h-full flex items-center justify-center p-1 overflow-hidden relative">
        {/* Loading Skeleton */}
        {loadStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted/40" />
          </div>
        )}

        {/* Gambar Stiker Asli */}
        {!isMissing ? (
          <img
            src={finalSrc}
            alt={asset.name}
            loading="lazy"
            onLoad={() => setLoadStatus('loaded')}
            onError={() => setLoadStatus('error')}
            className={cn(
              "w-full h-full object-contain transition-transform duration-200 drop-shadow-md",
              loadStatus === 'loaded' ? "opacity-100 group-hover:scale-110" : "opacity-0",
              imageClassName
            )}
          />
        ) : (
          /* Visual Fallback jika file gambar tidak ditemukan di server / disk */
          <div className="flex flex-col items-center justify-center text-center p-1 text-rose-400/80">
            <ImageOff className="w-4 h-4 mb-0.5 text-rose-400" />
            <span className="text-[7px] font-black uppercase tracking-tighter leading-tight text-rose-300">
              Missing
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions Overlay (Hanya untuk Editor Mode & Gambar Valid) */}
      {mode === 'editor' && !isMissing && (onAddSticker || onSetBg) && (
        <div className="absolute inset-0 rounded-2xl bg-black/85 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity p-1 z-10">
          {onAddSticker && (
            <button
              type="button"
              onClick={onAddSticker}
              className="w-full py-0.5 text-[8px] font-black uppercase tracking-wider bg-primary hover:bg-primary-hover text-white rounded cursor-pointer text-center"
            >
              + Stiker
            </button>
          )}
          {onSetBg && (
            <button
              type="button"
              onClick={onSetBg}
              className="w-full py-0.5 text-[7px] font-bold bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded cursor-pointer text-center"
            >
              Set BG
            </button>
          )}
        </div>
      )}

      {/* Tooltip Melayang on Hover */}
      <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center pointer-events-none z-30">
        <div className={cn(
          "px-2 py-0.5 rounded-md text-[9px] font-bold whitespace-nowrap shadow-xl border",
          isMissing
            ? "bg-rose-950 border-rose-500/50 text-rose-200"
            : "bg-[#1E293B] border-emerald-500/30 text-emerald-200"
        )}>
          {isMissing ? `⚠️ ${asset.name} (File Tidak Tersedia)` : asset.name}
        </div>
      </div>
    </div>
  );
};
