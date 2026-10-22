import React, { useState } from 'react';
import { 
  Key, 
  Copy, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  ShieldAlert, 
  RefreshCw, 
  FileCode,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { buildEnvConfigSnippet } from '../lib/kioskService';

export interface DeviceCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  kioskName: string;
  credentials: { deviceId: string; deviceToken: string } | null;
  onRegenerateKey?: () => Promise<void>;
  canRegenerate?: boolean;
}

export const DeviceCredentialModal: React.FC<DeviceCredentialModalProps> = ({
  isOpen,
  onClose,
  kioskName,
  credentials,
  onRegenerateKey,
  canRegenerate = false,
}) => {
  const [isMasked, setIsMasked] = useState(true);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [isConfirmingRegen, setIsConfirmingRegen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleClose = () => {
    setIsMasked(true);
    setCopiedToken(false);
    setCopiedId(false);
    setCopiedEnv(false);
    setIsConfirmingRegen(false);
    onClose();
  };

  const handleCopy = async (text: string, type: 'id' | 'token' | 'env') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'id') {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
        toast.success("Device ID disalin ke clipboard");
      } else if (type === 'token') {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
        toast.success("Device Token disalin ke clipboard");
      } else if (type === 'env') {
        setCopiedEnv(true);
        setTimeout(() => setCopiedEnv(false), 2000);
        toast.success("Format .env disalin ke clipboard");
      }
    } catch (err) {
      toast.error("Gagal menyalin ke clipboard");
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerateKey) return;
    setIsRegenerating(true);
    try {
      await onRegenerateKey();
      setIsConfirmingRegen(false);
      toast.success("Device Token berhasil dirotasi (Simulasi)");
    } catch (err) {
      toast.error("Gagal melakukan regenerasi token");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-xl bg-[#1E293B] border border-white/10 rounded-[2rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight uppercase">
                  Device Credentials
                </h3>
                <p className="text-xs text-muted font-medium">
                  Kredensial Autentikasi untuk <span className="text-amber-400 font-bold">{kioskName}</span>
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

          {/* Security Alert Banner */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">
                Safe Simulation Active
              </p>
              <p className="text-amber-200/80 leading-relaxed text-[11px]">
                Kredensial di bawah adalah token simulasi aman (<code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-300">SIMULATED_DEVICE_TOKEN_NOT_VALID</code>). Token ini tidak valid pada server produksi dan tidak disimpan dalam localStorage atau log.
              </p>
            </div>
          </div>

          {/* Credentials Body */}
          {credentials ? (
            <div className="space-y-5">
              {/* Device ID */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">
                  Device ID / Kiosk Identifier
                </label>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-2xl px-4 py-3">
                  <span className="font-mono text-xs font-bold text-foreground flex-1 tracking-wider">
                    {credentials.deviceId}
                  </span>
                  <button
                    onClick={() => handleCopy(credentials.deviceId, 'id')}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-muted hover:text-foreground cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                    title="Copy Device ID"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span className="text-[10px]">{copiedId ? 'Disalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* Device Token */}
              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">
                    Device Token (API Key)
                  </label>
                  <button
                    onClick={() => setIsMasked(!isMasked)}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isMasked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {isMasked ? 'Tampilkan Token' : 'Sembunyikan Token'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-2xl px-4 py-3">
                  <span className="font-mono text-xs font-bold text-amber-300/90 flex-1 truncate tracking-wider">
                    {isMasked ? '••••••••••••••••••••••••••••••••••••••••' : credentials.deviceToken}
                  </span>
                  <button
                    onClick={() => handleCopy(credentials.deviceToken, 'token')}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-muted hover:text-foreground cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                    title="Copy Token"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span className="text-[10px]">{copiedToken ? 'Disalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons: Copy .env & Regenerate */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleCopy(buildEnvConfigSnippet(credentials.deviceId, credentials.deviceToken), 'env')}
                  className="flex-1 py-3.5 px-4 bg-primary text-[#10172A] rounded-2xl font-black uppercase tracking-wider text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10 cursor-pointer"
                >
                  {copiedEnv ? <Check className="w-4 h-4 text-[#10172A]" /> : <FileCode className="w-4 h-4" />}
                  {copiedEnv ? 'Format .env Disalin!' : 'Salin Format .env'}
                </button>

                {canRegenerate && onRegenerateKey && !isConfirmingRegen && (
                  <button
                    onClick={() => setIsConfirmingRegen(true)}
                    className="py-3.5 px-4 bg-white/5 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 text-muted hover:text-amber-400 rounded-2xl font-black uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Rotasi Kunci
                  </button>
                )}
              </div>

              {/* Confirmation Prompt for Key Regeneration */}
              {isConfirmingRegen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3"
                >
                  <div className="flex items-start gap-2.5 text-xs text-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Rotasi token akan membatalkan kredensial lama. Kiosk photobooth fisik yang sedang menggunakan token ini akan terputus hingga diperbarui dengan token baru.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsConfirmingRegen(false)}
                      disabled={isRegenerating}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-muted transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-500/20"
                    >
                      {isRegenerating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {isRegenerating ? 'Memproses...' : 'Konfirmasi Rotasi Token'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 text-muted mx-auto flex items-center justify-center">
                <Key className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-muted uppercase tracking-wider">
                Credential unavailable
              </p>
              <p className="text-xs text-muted/70 max-w-sm mx-auto">
                Kredensial untuk kiosk ini belum tersedia pada sistem atau belum pernah diterbitkan.
              </p>
            </div>
          )}

          {/* Footer Close Button */}
          <div className="pt-2 border-t border-white/5 flex justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-muted hover:text-foreground rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
