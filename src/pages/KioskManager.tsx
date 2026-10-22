import React, { useState } from 'react';
import { 
  Monitor, 
  RefreshCcw, 
  Settings, 
  MapPin, 
  Plus, 
  CheckCircle2, 
  X, 
  Trash2,
  Key,
  Wrench,
  Clock,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useKiosks, Kiosk } from '../KioskContext';
import { toast } from 'sonner';
import { KioskConfigPage } from './KioskConfigPage';
import { useAuth } from '../components/AuthProvider';
import { DeviceCredentialModal } from '../components/DeviceCredentialModal';
import { DeleteKioskConfirmModal } from '../components/DeleteKioskConfirmModal';
import { 
  formatLastHeartbeat, 
  normalizeKioskTelemetry, 
  filterKiosksByRole, 
  validateKioskRegistration,
  generateSimulatedDeviceToken,
  getKioskCredentials
} from '../lib/kioskService';

export const KioskManager: React.FC = () => {
  const { user, role, isSuperAdmin } = useAuth();
  const { kiosks, addKiosk, updateKiosk, restartKiosk, deleteKiosk, regenerateKey, refreshKiosks } = useKiosks();
  const [isAdding, setIsAdding] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Form State
  const [newKiosk, setNewKiosk] = useState({ id: '', name: '', location: '', base_price: '35000' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Full Page Config state
  const [isConfigView, setIsConfigView] = useState(false);
  const [selectedKiosk, setSelectedKiosk] = useState<Kiosk | null>(null);

  // Device Credential Modal state
  const [credentialModal, setCredentialModal] = useState<{
    isOpen: boolean;
    kiosk: Kiosk | null;
    credentials: { deviceId: string; deviceToken: string } | null;
  }>({
    isOpen: false,
    kiosk: null,
    credentials: null,
  });

  // Delete Confirmation Modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    kiosk: Kiosk | null;
  }>({
    isOpen: false,
    kiosk: null,
  });

  // Filter Kiosks berbasis peran RBAC: Super Admin melihat semua, Admin Mitra hanya miliknya
  const displayedKiosks = filterKiosksByRole(kiosks, user);

  const canManage = isSuperAdmin || role === 'admin' || role === 'Super Admin';

  const handleConfirmRegistration = async () => {
    const validation = validateKioskRegistration(newKiosk);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || "Mohon periksa data input pendaftaran");
      return;
    }

    setFormErrors({});
    setIsRegistering(true);

    try {
      const result = await addKiosk(newKiosk, user?.id);

      setIsRegistering(false);
      setIsAdding(false);
      setNewKiosk({ id: '', name: '', location: '', base_price: '35000' });

      toast.success("Kiosk berhasil didaftarkan (Simulasi Aman)", {
        icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
        duration: 4000,
        position: 'top-center',
      });

      // Tampilkan modal kredensial segera pasca pendaftaran
      setCredentialModal({
        isOpen: true,
        kiosk: result.kiosk,
        credentials: result.credentials,
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      setIsRegistering(false);
      toast.error(error.message || "Gagal mendaftarkan kiosk");
    }
  };

  const handleRestart = async (id: string, name: string) => {
    try {
      toast.loading(`Memulai sekuens restart ${name}...`, { id: `restart-${id}` });
      await restartKiosk(id);
      toast.success(`Kiosk ${name} berhasil di-restart dari jarak jauh (Simulasi).`, { id: `restart-${id}` });
    } catch (error) {
      console.error("Restart failed", error);
      toast.error("Restart failed", { id: `restart-${id}` });
    }
  };

  const handleToggleMaintenance = async (kiosk: Kiosk) => {
    const currentMode = Boolean(kiosk.config?.maintenanceMode);
    const newMode = !currentMode;
    await updateKiosk(kiosk.id, {
      config: {
        ...(kiosk.config || {}),
        maintenanceMode: newMode,
      }
    });

    if (newMode) {
      toast.warning(`Mode Perawatan ${kiosk.name} DIAKTIFKAN (Simulasi)`, {
        icon: <Wrench className="w-4 h-4 text-amber-400" />
      });
    } else {
      toast.success(`Mode Perawatan ${kiosk.name} DINONAKTIFKAN (Simulasi)`);
    }
  };

  const handleViewCredentials = (kiosk: Kiosk) => {
    // Validasi otorisasi: cegah operator membuka kredensial kiosk milik orang lain
    const isOwnerOrSuper = isSuperAdmin || role === 'admin' || role === 'Super Admin' || (user?.id && String(kiosk.user_id) === String(user.id));
    if (!isOwnerOrSuper) {
      toast.error("Akses Ditolak: Anda tidak memiliki wewenang melihat kredensial kiosk ini");
      return;
    }

    // Ambil kredensial aman atau null jika tidak tersedia / belum diterbitkan
    const creds = getKioskCredentials(kiosk);
    setCredentialModal({
      isOpen: true,
      kiosk,
      credentials: creds,
    });
  };

  const handleRegenerateKeyFromModal = async () => {
    if (!credentialModal.kiosk) return;
    const newCreds = await regenerateKey(credentialModal.kiosk.id);
    setCredentialModal(prev => ({
      ...prev,
      credentials: newCreds,
    }));
  };

  const handleDeleteClick = (kiosk: Kiosk) => {
    setDeleteModal({
      isOpen: true,
      kiosk,
    });
  };

  const handleConfirmDelete = async (kioskId: string) => {
    if (!deleteModal.kiosk) return;
    await deleteKiosk(kioskId, deleteModal.kiosk.name);
  };

  const handleOpenConfig = (kiosk: Kiosk) => {
    setSelectedKiosk(kiosk);
    setIsConfigView(true);
  };

  const currentSelectedKiosk = selectedKiosk ? kiosks.find(k => k.id === selectedKiosk.id) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <AnimatePresence mode="wait">
        {isConfigView && currentSelectedKiosk ? (
          <motion.div
            key="config-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <KioskConfigPage 
              kiosk={currentSelectedKiosk} 
              onBack={() => {
                setIsConfigView(false);
                refreshKiosks();
              }} 
              onUpdate={updateKiosk}
            />
          </motion.div>
        ) : (
          <motion.div
            key="manager-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            {/* Safe Simulation Status Banner */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs text-emerald-300">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black uppercase tracking-wider text-[10px] text-emerald-400 block">
                    Modul 4 Safe Simulation Mode Active
                  </span>
                  <span className="text-[11px] text-emerald-200/80">
                    Status telemetri dihitung secara deterministik dari detak jantung terakhir. Kredensial dan aksi manajemen berjalan aman tanpa mutasi server produksi. Filter tampilan antarmuka (RBAC) diterapkan untuk visualisasi operator; isolasi basis data definitif ditegakkan pada backend gateway.
                  </span>
                </div>
              </div>
              <button
                onClick={refreshKiosks}
                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                title="Hitung Ulang Status Telemetri"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Sinkron Telemetri
              </button>
            </div>

            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground">Kiosk Manager</h1>
                <p className="text-muted mt-1 font-bold text-sm">
                  Pantau stasiun photobooth remote, kendalikan telemetri perangkat, dan atur kredensial.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsAdding(true)}
                  className="px-7 py-3 bg-primary text-[#10172A] rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/10 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5" /> Daftarkan Kiosk Baru
                </button>
              </div>
            </header>

            {/* Registration Form Panel */}
            {isAdding && (
              <div className="bg-[#1E293B] border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 space-y-6">
                <AnimatePresence>
                  {isRegistering && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#10172A]/80 backdrop-blur-md"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm font-black uppercase tracking-widest text-[#F1F5F9]">Mendaftarkan Kiosk...</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase text-foreground">Daftarkan Kiosk Baru</h3>
                    <p className="text-xs text-muted font-medium mt-1">
                      Kredensial Device Token akan dibuat secara otomatis setelah registrasi.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsAdding(false);
                      setFormErrors({});
                    }}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-foreground cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">
                      Nama Kiosk <span className="text-primary">*</span>
                    </label>
                    <input 
                      placeholder="e.g. Kios-K GIAT"
                      className={cn(
                        "w-full bg-black/30 border rounded-2xl px-5 py-3.5 outline-none transition-all text-foreground font-bold text-sm",
                        formErrors.name ? "border-red-500/80 focus:border-red-500" : "border-white/10 focus:border-primary/50"
                      )}
                      value={newKiosk.name}
                      onChange={e => {
                        setNewKiosk({...newKiosk, name: e.target.value});
                        if (formErrors.name) setFormErrors({...formErrors, name: ''});
                      }}
                    />
                    {formErrors.name && (
                      <p className="text-[10px] text-red-400 font-bold ml-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {formErrors.name}
                      </p>
                    )}
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">
                      Lokasi Penempatan
                    </label>
                    <input 
                      placeholder="e.g. Grand Indonesia Mall Lantai 3"
                      className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 outline-none focus:border-primary/50 transition-all text-foreground font-bold text-sm"
                      value={newKiosk.location}
                      onChange={e => setNewKiosk({...newKiosk, location: e.target.value})}
                    />
                  </div>

                  {/* Base Price */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1">
                      Tarif Dasar Sesi (Rp)
                    </label>
                    <input 
                      type="number"
                      placeholder="35000"
                      className={cn(
                        "w-full bg-black/30 border rounded-2xl px-5 py-3.5 outline-none transition-all text-foreground font-bold text-sm",
                        formErrors.base_price ? "border-red-500/80 focus:border-red-500" : "border-white/10 focus:border-primary/50"
                      )}
                      value={newKiosk.base_price}
                      onChange={e => {
                        setNewKiosk({...newKiosk, base_price: e.target.value});
                        if (formErrors.base_price) setFormErrors({...formErrors, base_price: ''});
                      }}
                    />
                    {formErrors.base_price && (
                      <p className="text-[10px] text-red-400 font-bold ml-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {formErrors.base_price}
                      </p>
                    )}
                  </div>

                  {/* Optional Custom Device ID */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1 flex items-center justify-between">
                      <span>Device ID (Opsional)</span>
                      <span className="text-[9px] text-muted/60 normal-case font-medium">Auto-generate bila dikosongkan</span>
                    </label>
                    <input 
                      placeholder="e.g. KSK-0004"
                      className={cn(
                        "w-full bg-black/30 border rounded-2xl px-5 py-3.5 outline-none transition-all text-foreground font-mono font-bold text-sm",
                        formErrors.id ? "border-red-500/80 focus:border-red-500" : "border-white/10 focus:border-primary/50"
                      )}
                      value={newKiosk.id}
                      onChange={e => {
                        setNewKiosk({...newKiosk, id: e.target.value});
                        if (formErrors.id) setFormErrors({...formErrors, id: ''});
                      }}
                    />
                    {formErrors.id && (
                      <p className="text-[10px] text-red-400 font-bold ml-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {formErrors.id}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={handleConfirmRegistration}
                    disabled={isRegistering}
                    className="px-8 py-3.5 bg-primary text-[#10172A] rounded-2xl font-black uppercase tracking-wider text-xs hover:opacity-90 transition-all shadow-xl shadow-primary/10 disabled:opacity-50 cursor-pointer"
                  >
                    Konfirmasi Pendaftaran
                  </button>
                  <button 
                    onClick={() => {
                      setIsAdding(false);
                      setFormErrors({});
                    }}
                    className="px-8 py-3.5 bg-white/5 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-white/10 transition-all text-muted cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {displayedKiosks.length === 0 && (
              <div className="bg-[#1E293B]/60 border border-white/5 rounded-[2.5rem] p-16 text-center space-y-6 flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-2xl">
                  <Monitor className="w-10 h-10" />
                </div>
                <div className="max-w-md space-y-2">
                  <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Tidak Ada Kiosk Terdaftar</h3>
                  <p className="text-xs text-muted font-medium leading-relaxed">
                    {canManage 
                      ? "Belum ada stasiun photobooth yang terdaftar. Klik tombol di atas untuk mendaftarkan kiosk pertama Anda."
                      : "Tidak ada stasiun kiosk yang dialokasikan untuk akun mitra Anda saat ini."}
                  </p>
                </div>
              </div>
            )}

            {/* Kiosks Grid Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {displayedKiosks.map((kiosk, i) => {
                const telemetry = normalizeKioskTelemetry(kiosk.health);
                const isOnline = kiosk.status === 'online';
                const isIdle = kiosk.status === 'idle';
                const isRestarting = kiosk.status === 'restarting';
                const isOffline = kiosk.status === 'offline';
                const isUnknown = kiosk.status === 'unknown';
                const isMaintenance = Boolean(kiosk.config?.maintenanceMode);

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    key={kiosk.id} 
                    className={cn(
                      "bg-[#1E293B] border rounded-[2.5rem] p-8 shadow-2xl transition-all duration-300 flex flex-col justify-between group",
                      isMaintenance ? "border-amber-500/40" : "border-white/5 hover:border-primary/30"
                    )}
                  >
                    <div>
                      {/* Top Header Row */}
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg",
                            isOnline ? "bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10" : 
                            isIdle ? "bg-amber-500/10 text-amber-400 shadow-amber-500/10" : 
                            isRestarting ? "bg-blue-500/10 text-blue-400 shadow-blue-500/10 animate-pulse" : 
                            isOffline ? "bg-red-500/10 text-red-400 shadow-red-500/10" :
                            "bg-slate-500/10 text-slate-400 shadow-slate-500/10"
                          )}>
                            <Monitor className="w-7 h-7" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-xl tracking-tight text-foreground uppercase">{kiosk.name}</h3>
                              {isMaintenance && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase tracking-wider">
                                  Maintenance
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 mt-1 text-[10px] text-muted font-bold">
                              <div className="flex items-center gap-1.5 uppercase tracking-wider text-muted/80">
                                <MapPin className="w-3 h-3 text-primary/50" /> {kiosk.location || 'Lokasi Belum Diisi'}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-primary/80 font-black">{kiosk.id}</span>
                                {kiosk.base_price !== undefined && (
                                  <span className="text-emerald-400 font-black">
                                    Rp {Number(kiosk.base_price).toLocaleString('id-ID')}
                                  </span>
                                )}
                              </div>
                              {/* Deterministic Heartbeat Text */}
                              <div className="flex items-center gap-1.5 text-[9px] text-muted/60 font-medium">
                                <Clock className="w-3 h-3" />
                                <span>{formatLastHeartbeat(kiosk.lastHeartbeat)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className={cn(
                          "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          isOnline ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                          isIdle ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                          isRestarting ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" : 
                          isOffline ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        )}>
                          {kiosk.status}
                        </div>
                      </div>

                      {/* Hardware Telemetry Progress Bars */}
                      <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-black/20 rounded-2xl border border-white/5">
                        {/* Ink */}
                        <div className="space-y-2">
                          <span className="text-muted text-[9px] font-black uppercase tracking-wider block">Ink</span>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              style={{ width: telemetry.printerInk !== null ? `${telemetry.printerInk}%` : '0%' }}
                              className={cn(
                                "h-full rounded-full transition-all duration-700",
                                telemetry.printerInk === null ? "bg-transparent" :
                                telemetry.printerInk > 20 ? "bg-primary" : "bg-red-500"
                              )} 
                            />
                          </div>
                          <p className="text-[11px] font-black text-foreground">
                            {telemetry.printerInk !== null ? `${telemetry.printerInk}%` : <span className="text-muted/60 font-medium">Unknown</span>}
                          </p>
                        </div>

                        {/* Storage */}
                        <div className="space-y-2">
                          <span className="text-muted text-[9px] font-black uppercase tracking-wider block">Disk</span>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              style={{ width: telemetry.storage !== null ? `${telemetry.storage}%` : '0%' }}
                              className="h-full bg-blue-500 rounded-full transition-all duration-700" 
                            />
                          </div>
                          <p className="text-[11px] font-black text-foreground">
                            {telemetry.storage !== null ? `${telemetry.storage}%` : <span className="text-muted/60 font-medium">Unknown</span>}
                          </p>
                        </div>

                        {/* Cam */}
                        <div className="space-y-2">
                          <span className="text-muted text-[9px] font-black uppercase tracking-wider block">Cam</span>
                          <div className="pt-0.5">
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md inline-block",
                              telemetry.camera === 'GOOD' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              telemetry.camera ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                              "bg-white/5 text-muted/60"
                            )}>
                              {telemetry.camera || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2 pt-2 border-t border-white/5">
                      {/* Maintenance Mode Toggle Button */}
                      <button 
                        onClick={() => handleToggleMaintenance(kiosk)}
                        className={cn(
                          "px-3.5 py-3.5 rounded-2xl transition-all cursor-pointer font-black text-[10px] uppercase flex items-center justify-center",
                          isMaintenance 
                            ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]" 
                            : "bg-white/5 text-muted hover:bg-white/10 hover:text-foreground"
                        )}
                        title={isMaintenance ? "Matikan Mode Perawatan" : "Nyalakan Mode Perawatan"}
                      >
                        <Wrench className="w-4 h-4" />
                      </button>

                      {/* 8-Tab Config Button */}
                      <button 
                        onClick={() => handleOpenConfig(kiosk)}
                        className="flex-1 py-3.5 bg-primary text-[#10172A] rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/5 hover:shadow-primary/15 flex items-center justify-center gap-2 group cursor-pointer"
                        title="Buka Konfigurasi 8 Tab"
                      >
                        <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                        Config
                      </button>

                      {/* Restart Button */}
                      <button 
                        onClick={() => handleRestart(kiosk.id, kiosk.name)}
                        disabled={kiosk.status === 'restarting'}
                        className="px-3.5 py-3.5 bg-white/5 hover:bg-red-500/10 text-muted hover:text-red-400 rounded-2xl transition-all disabled:opacity-50 cursor-pointer"
                        title="Remote Restart Kiosk"
                      >
                        <RefreshCcw className={cn("w-4 h-4", kiosk.status === 'restarting' && "animate-spin")} />
                      </button>

                      {/* View Credentials Button */}
                      <button 
                        onClick={() => handleViewCredentials(kiosk)}
                        className="px-3.5 py-3.5 bg-white/5 hover:bg-amber-500/10 text-muted hover:text-amber-400 rounded-2xl transition-all cursor-pointer"
                        title="Lihat Device Credentials (API Key)"
                      >
                        <Key className="w-4 h-4" />
                      </button>

                      {/* Delete Kiosk Button */}
                      <button 
                        onClick={() => handleDeleteClick(kiosk)}
                        className="px-3.5 py-3.5 bg-white/5 hover:bg-red-500/10 text-muted hover:text-red-400 rounded-2xl transition-all cursor-pointer"
                        title="Soft Delete Kiosk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Device Credentials Modal */}
      <DeviceCredentialModal
        isOpen={credentialModal.isOpen}
        onClose={() => setCredentialModal({ isOpen: false, kiosk: null, credentials: null })}
        kioskName={credentialModal.kiosk?.name || 'Kiosk'}
        credentials={credentialModal.credentials}
        onRegenerateKey={handleRegenerateKeyFromModal}
        canRegenerate={canManage}
      />

      {/* Delete Kiosk Confirmation Modal */}
      <DeleteKioskConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, kiosk: null })}
        kiosk={deleteModal.kiosk}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};
