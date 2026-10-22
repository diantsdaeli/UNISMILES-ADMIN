import React, { useState } from 'react';
import { Edit2, Copy, Trash2, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { Template } from '../../TemplateContext';
import { LayoutPreset } from '../../lib/layoutPresets';
import { CanvasPreview } from './CanvasPreview';

export interface FrameCardProps {
  template: Template;
  preset: LayoutPreset;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onOpenStoryboard?: () => void;
}

export const FrameCard: React.FC<FrameCardProps> = ({
  template,
  preset,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle,
  onOpenStoryboard,
}) => {
  const [hovered, setHovered] = useState(false);
  const frameBadge =
    template.frameType === 'png'
      ? 'PNG'
      : template.frameType === 'gradient'
        ? 'Gradient'
        : 'Solid';

  const digitalPriceVal = template.digitalPrice ?? template.price;
  const digitalPrintPriceVal = template.digitalPrintPrice ?? template.price;
  const hasDigitalPrice = digitalPriceVal !== null && digitalPriceVal !== undefined && digitalPriceVal > 0;
  const hasPrintPrice = digitalPrintPriceVal !== null && digitalPrintPriceVal !== undefined && digitalPrintPriceVal > 0;

  const assetElements = template.layoutConfig?.assetElements || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
      className={cn(
        'relative rounded-2xl overflow-hidden border transition-all duration-300 group flex flex-col h-[275px] cursor-pointer',
        template.isActive
          ? 'bg-gradient-to-b from-[#1E293B]/80 to-[#0F172A]/90 border-white/10 hover:border-primary/50 hover:shadow-[0_0_25px_rgba(255,184,0,0.2)]'
          : 'bg-[#111827]/40 border-white/5 opacity-55 hover:opacity-100'
      )}
    >
      {/* Top Header Bar */}
      <div className="absolute top-2.5 inset-x-2.5 z-30 flex items-center justify-between pointer-events-none">
        <span className="px-2 py-0.5 bg-black/70 backdrop-blur-md rounded-md border border-white/10 text-[8px] font-black uppercase tracking-widest text-primary">
          {frameBadge}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            'pointer-events-auto px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer shadow-md',
            template.isActive
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
              : 'bg-white/10 border-white/20 text-muted'
          )}
          title={template.isActive ? 'Active — click to toggle' : 'Inactive — click to toggle'}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              template.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted'
            )}
          />
          {template.isActive ? 'Active' : 'Off'}
        </button>
      </div>

      {/* Canvas Preview Container (Fixed height h-[210px]) */}
      <div className="relative flex items-center justify-center p-3 pt-9 bg-black/30 h-[210px] flex-shrink-0">
        <CanvasPreview
          preset={preset}
          bgColor={template.bgColor}
          accentColor={template.accentColor}
          frameType={template.frameType || 'color'}
          gradientStops={template.gradientStops || []}
          gradientAngle={template.gradientAngle ?? 45}
          gradientStyle={template.gradientStyle || 'linear'}
          textElements={template.textElements || []}
          assetElements={assetElements}
          imageUrl={template.imageUrl}
          displayWidth={140}
          maxHeight={150}
          className="shadow-2xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-102"
        />

        {/* Hover Actions Overlay */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-[3px] flex flex-col items-center justify-center gap-2.5 p-3 z-20"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-white px-2 text-center line-clamp-2">
                {template.name}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-2 bg-primary text-[#10172A] hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(255,184,0,0.4)] cursor-pointer"
                  title="Edit Style"
                >
                  <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate();
                  }}
                  className="p-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-white transition-all cursor-pointer"
                  title="Duplicate Style"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {onOpenStoryboard && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStoryboard();
                    }}
                    className="p-2 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-xl text-emerald-400 transition-all cursor-pointer"
                    title="Buka di Storyboard Dian"
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-xl text-red-400 transition-all cursor-pointer"
                  title="Delete Style"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-white/5 bg-black/40 flex items-center justify-between gap-2 mt-auto h-[55px]">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-foreground truncate">{template.name}</p>
          <p className="text-[9px] font-bold text-muted uppercase tracking-widest mt-0.5">
            {preset.slots} {preset.slots === 1 ? 'Slot' : 'Slots'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[9px] font-black text-primary leading-tight">
            Digital: {hasDigitalPrice ? `Rp ${Number(digitalPriceVal).toLocaleString('id-ID')}` : 'Harga kiosk'}
          </p>
          <p className="text-[9px] font-bold text-primary/80 leading-tight mt-0.5">
            Print: {hasPrintPrice ? `Rp ${Number(digitalPrintPriceVal).toLocaleString('id-ID')}` : 'Harga kiosk'}
          </p>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 shadow-sm mt-0.5"
            style={{ background: template.accentColor || '#FFFFFF' }}
            title={`Accent color: ${template.accentColor}`}
          />
        </div>
      </div>
    </motion.div>
  );
};
