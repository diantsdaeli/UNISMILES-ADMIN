import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Kiosk } from '../KioskContext';

export interface DeleteKioskConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  kiosk: Kiosk | null;
  onConfirmDelete: (kioskId: string) => Promise<void>;
}

export const DeleteKioskConfirmModal: React.FC<DeleteKioskConfirmModalProps> = ({
  isOpen,
  onClose,
  kiosk,
  onConfirmDelete,
}) => {
  const [typedName, setTypedName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClose = () => {
    setTypedName('');
    setIsDeleting(false);
    onClose();
  };

  const isMatch = Boolean(kiosk && typedName.trim() === kiosk.name.trim());

  const handleDelete = async () => {
    if (!kiosk || !isMatch || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete(kiosk.id);
      handleClose();
    } catch (err) {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !kiosk) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-[#1E293B] border border-red-500/20 rounded-[2rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shadow-lg shadow-red-500/10">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight uppercase">
                  Konfirmasi Soft Delete Kiosk
                </h3>
                <p className="text-xs text-muted font-medium">
                  Menonaktifkan kiosk <span className="text-red-400 font-bold">{kiosk.name}</span> ({kiosk.id})
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-foreground cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Warning Card */}
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              Peringatan Dampak Soft Delete
            </div>
            <ul className="text-[11px] text-red-200/80 space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Kiosk photobooth fisik tidak akan dapat terhubung lagi ke sistem.</li>
              <li>Seluruh riwayat sesi foto masa lalu dan data analitik pendapatan <strong className="text-white">tetap aman dan tersimpan</strong>.</li>
              <li>Aksi ini berjalan dalam <strong className="text-white">Safe Simulation</strong> (tidak mengeksekusi DELETE ke server produksi).</li>
            </ul>
          </div>

          {/* Typing confirmation input */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">
              Ketik nama kiosk <span className="text-red-400 font-mono font-bold select-all">"{kiosk.name}"</span> untuk mengonfirmasi:
            </label>
            <input
              type="text"
              placeholder={`Ketik "${kiosk.name}"`}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-5 py-3.5 text-sm font-bold text-foreground outline-none transition-all"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex gap-3 justify-end">
            <button
              onClick={handleClose}
              disabled={isDeleting}
              className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-muted hover:text-foreground rounded-2xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={!isMatch || isDeleting}
              className="px-6 py-3.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-red-500/20 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Menghapus...' : 'Hapus Kiosk'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
