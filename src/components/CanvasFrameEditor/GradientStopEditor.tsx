import React from 'react';
import { X, Plus } from 'lucide-react';
import { GradientStop } from '../../lib/templates';

interface GradientStopEditorProps {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}

export const GradientStopEditor: React.FC<GradientStopEditorProps> = ({ stops, onChange }) => {
  const updateStop = (i: number, field: keyof GradientStop, value: string | number) => {
    const next = stops.map((s, idx) => (idx === i ? { ...s, [field]: value } : s));
    onChange(next);
  };

  const addStop = () => {
    const lastPos = stops.length > 0 ? stops[stops.length - 1].position : 50;
    const newPos = Math.min(100, lastPos + 20);
    onChange([...stops, { color: '#10B981', position: newPos }]);
  };

  const removeStop = (i: number) => {
    if (stops.length > 2) {
      onChange(stops.filter((_, idx) => idx !== i));
    }
  };

  return (
    <div className="space-y-3">
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-3 bg-black/30 p-2.5 rounded-xl border border-white/5">
          <label className="flex-shrink-0 cursor-pointer relative w-7 h-7 rounded-lg border border-white/20 overflow-hidden shadow-inner hover:scale-105 transition-transform">
            <span className="absolute inset-0" style={{ background: stop.color }} />
            <input
              type="color"
              value={stop.color}
              onChange={e => updateStop(i, 'color', e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex justify-between items-center text-[9px] font-mono text-muted">
              <span>Color {i + 1}</span>
              <span>{stop.position}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={stop.position}
              onChange={e => updateStop(i, 'position', Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-emerald-400 bg-white/10 cursor-pointer"
            />
          </div>
          <button
            type="button"
            onClick={() => removeStop(i)}
            disabled={stops.length <= 2}
            className="p-1.5 text-muted hover:text-red-400 disabled:opacity-20 transition-colors rounded-lg hover:bg-white/5"
            title={stops.length <= 2 ? 'Minimal 2 stop warna' : 'Hapus stop'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addStop}
        className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Tambah Stop Warna
      </button>
    </div>
  );
};
