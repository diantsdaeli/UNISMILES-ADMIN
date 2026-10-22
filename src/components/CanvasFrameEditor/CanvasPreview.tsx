import React, { useRef, useEffect } from 'react';
import { LayoutPreset, computeSlots } from '../../lib/layoutPresets';
import { GradientStop, TextElement, AssetElement, PhotoSlot } from '../../lib/templates';
import { resolveAssetUrl } from '../../lib/assets';
import { resolvePublicUrl } from '../../lib/urls';
import { cn } from '../../lib/utils';

export interface CanvasPreviewProps {
  preset: LayoutPreset;
  bgColor: string;
  accentColor: string;
  frameType: 'color' | 'gradient' | 'png';
  gradientStops: GradientStop[];
  gradientAngle: number;
  gradientStyle: 'linear' | 'radial';
  textElements?: TextElement[];
  assetElements?: AssetElement[];
  imageUrl?: string;
  slots?: PhotoSlot[];
  onAssetChange?: (id: string, patch: Partial<AssetElement>) => void;
  onAssetSelect?: (id: string) => void;
  selectedAssetElementId?: string | null;
  displayWidth?: number;
  maxHeight?: number;
  className?: string;
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({
  preset,
  bgColor,
  accentColor,
  frameType,
  gradientStops,
  gradientAngle,
  gradientStyle,
  textElements = [],
  assetElements = [],
  imageUrl,
  slots: customSlots,
  displayWidth = 320,
  maxHeight,
  className,
  onAssetChange,
  onAssetSelect,
  selectedAssetElementId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aspect = preset.width / preset.height;
  let calcW = displayWidth;
  let calcH = Math.round(displayWidth / aspect);

  if (maxHeight && calcH > maxHeight) {
    calcH = maxHeight;
    calcW = Math.round(maxHeight * aspect);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = preset.width;
    canvas.height = preset.height;

    const drawTextElements = () => {
      if (!textElements || textElements.length === 0) return;
      textElements.forEach(item => {
        ctx.save();
        ctx.fillStyle = item.color || '#FFFFFF';
        ctx.font = `${item.fontWeight || 'bold'} ${item.fontSize || 48}px ${item.fontFamily || 'Inter, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const posX = (item.x / 100) * preset.width;
        const posY = (item.y / 100) * preset.height;
        const textToDraw = item.content || item.text || '';
        ctx.fillText(textToDraw, posX, posY);
        ctx.restore();
      });
    };

    const draw = (
      backgroundImage?: HTMLImageElement,
      assetImages: Array<{ element: AssetElement; image: HTMLImageElement }> = []
    ) => {
      ctx.clearRect(0, 0, preset.width, preset.height);

      // 1. Gambar Background (Jika frameType === 'png' dan gambar tersedia)
      if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, preset.width, preset.height);
      } else if (frameType === 'gradient' && gradientStops.length >= 2) {
        // 2. Linear / Radial Gradient
        let grad: CanvasGradient;
        if (gradientStyle === 'radial') {
          grad = ctx.createRadialGradient(
            preset.width / 2,
            preset.height / 2,
            0,
            preset.width / 2,
            preset.height / 2,
            Math.max(preset.width, preset.height) / 2
          );
        } else {
          const angleRad = (gradientAngle * Math.PI) / 180;
          const cx = preset.width / 2;
          const cy = preset.height / 2;
          const len = Math.sqrt(preset.width ** 2 + preset.height ** 2) / 2;
          grad = ctx.createLinearGradient(
            cx - Math.cos(angleRad) * len,
            cy - Math.sin(angleRad) * len,
            cx + Math.cos(angleRad) * len,
            cy + Math.sin(angleRad) * len
          );
        }
        gradientStops.forEach(s => grad.addColorStop(Math.max(0, Math.min(1, s.position / 100)), s.color));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, preset.width, preset.height);
      } else {
        // 3. Solid Color Background
        ctx.fillStyle = bgColor || '#1E293B';
        ctx.fillRect(0, 0, preset.width, preset.height);
      }

      // 4. Render Slot Foto (Border & Placeholder)
      const slotsToDraw = (customSlots && customSlots.length > 0) ? customSlots : computeSlots(preset);
      slotsToDraw.forEach((slot, index) => {
        // Kotak hitam semi-transparan sebagai placeholder foto
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(slot.x, slot.y, slot.width, slot.height);

        // Border slot dengan accentColor
        ctx.strokeStyle = accentColor || '#FFFFFF';
        ctx.lineWidth = Math.max(3, Math.round(preset.width / 180));
        ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);

        // Nomor urut slot foto
        ctx.save();
        ctx.fillStyle = accentColor || '#FFFFFF';
        ctx.globalAlpha = 0.6;
        const fontSz = Math.min(slot.width, slot.height) * 0.25;
        ctx.font = `900 ${Math.round(fontSz)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, slot.x + slot.width / 2, slot.y + slot.height / 2);
        ctx.restore();
      });

      // 5. Render Teks
      drawTextElements();

      // 6. Render Stiker & Aset di atas foto
      assetImages.forEach(({ element, image }) => {
        ctx.save();
        ctx.globalAlpha = element.opacity ?? 1;
        const posX = (element.x / 100) * preset.width;
        const posY = (element.y / 100) * preset.height;
        const elemW = (element.width / 100) * preset.width;
        const elemH = (element.height / 100) * preset.height;

        const isTopLeft = element.anchor === 'top-left';
        const offsetX = isTopLeft ? 0 : -elemW / 2;
        const offsetY = isTopLeft ? 0 : -elemH / 2;

        ctx.translate(posX, posY);
        if (element.rotation) {
          ctx.rotate(((element.rotation || 0) * Math.PI) / 180);
        }
        ctx.drawImage(image, offsetX, offsetY, elemW, elemH);

        // Seleksi visual saat stiker aktif
        if (selectedAssetElementId === element.id) {
          ctx.strokeStyle = '#10B981'; // Emerald
          ctx.lineWidth = 4;
          ctx.strokeRect(offsetX - 2, offsetY - 2, elemW + 4, elemH + 4);
        }

        ctx.restore();
      });
    };

    const loadAssets = (backgroundImage?: HTMLImageElement) => {
      if (!assetElements.length) {
        draw(backgroundImage);
        return;
      }

      Promise.all(
        assetElements.map(
          element =>
            new Promise<{ element: AssetElement; image: HTMLImageElement } | null>(resolve => {
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onload = () => resolve({ element, image });
              image.onerror = () => resolve(null);
              image.src = resolveAssetUrl(element.url);
            })
        )
      ).then(images => {
        draw(
          backgroundImage,
          images.filter(Boolean) as Array<{ element: AssetElement; image: HTMLImageElement }>
        );
      });
    };

    if (frameType === 'png' && imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadAssets(img);
      };
      img.onerror = () => {
        loadAssets();
      };
      img.src = resolvePublicUrl(imageUrl);
    } else {
      loadAssets();
    }
  }, [
    preset,
    bgColor,
    accentColor,
    frameType,
    gradientStops,
    gradientAngle,
    gradientStyle,
    textElements,
    assetElements,
    imageUrl,
    customSlots,
    selectedAssetElementId,
  ]);

  // Pointer drag handling untuk memindahkan stiker pada canvas
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onAssetChange || !onAssetSelect || assetElements.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const selected = [...assetElements]
      .reverse()
      .find(element => {
        const isTopLeft = element.anchor === 'top-left';
        const minX = isTopLeft ? element.x : element.x - element.width / 2;
        const maxX = isTopLeft ? element.x + element.width : element.x + element.width / 2;
        const minY = isTopLeft ? element.y : element.y - element.height / 2;
        const maxY = isTopLeft ? element.y + element.height : element.y + element.height / 2;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      });

    if (!selected) return;
    onAssetSelect(selected.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget as any).__assetDrag = {
      id: selected.id,
      startX: x,
      startY: y,
      originalX: selected.x,
      originalY: selected.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = (event.currentTarget as any).__assetDrag;
    if (!drag || !onAssetChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    onAssetChange(drag.id, {
      x: Math.max(0, Math.min(100 - 5, drag.originalX + x - drag.startX)),
      y: Math.max(0, Math.min(100 - 5, drag.originalY + y - drag.startY)),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    delete (event.currentTarget as any).__assetDrag;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: calcW, height: calcH }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        'rounded-2xl transition-shadow',
        onAssetChange ? 'cursor-move' : '',
        selectedAssetElementId ? 'touch-none' : '',
        className
      )}
    />
  );
};
