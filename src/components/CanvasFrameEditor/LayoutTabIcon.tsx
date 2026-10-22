import React from 'react';
import { LayoutPreset } from '../../lib/layoutPresets';

export const LayoutTabIcon: React.FC<{ preset: LayoutPreset; active: boolean }> = ({ preset, active }) => {
  const gridClass =
    preset.id === '1x1' ? 'grid-cols-1 grid-rows-1' :
    preset.id === '2x1' ? 'grid-cols-1 grid-rows-2' :
    preset.id === '3x1' ? 'grid-cols-1 grid-rows-3' :
    preset.id === '4x1' ? 'grid-cols-1 grid-rows-4' :
    preset.id === '2x2' ? 'grid-cols-2 grid-rows-2' :
    preset.id === '2x3' ? 'grid-cols-2 grid-rows-3' :
                          'grid-cols-3 grid-rows-3';
  return (
    <div className={`grid gap-0.5 w-5 h-7 ${gridClass}`}>
      {Array.from({ length: preset.slots }).map((_, i) => (
        <div
          key={i}
          className={`rounded-[1px] transition-colors ${
            active ? 'bg-[#10172A]/70' : 'bg-current opacity-40'
          }`}
        />
      ))}
    </div>
  );
};
