import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  User, 
  Lock, 
  Check, 
  ShieldCheck, 
  QrCode, 
  Upload, 
  Save, 
  AlertCircle, 
  Info,
  Clock,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { 
  PaymentProfile, 
  DEFAULT_PAYMENT_PROFILE, 
  fetchPaymentProfileService, 
  savePaymentProfileService,
  ENABLE_BACKEND_MUTATIONS 
} from '../lib/paymentService';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'account' | 'payment'>('account');

  // Security State
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  // Payment Profile State
  const [profile, setProfile] = useState<PaymentProfile>(DEFAULT_PAYMENT_PROFILE);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [qrisPreview, setQrisPreview] = useState<string | null>(DEFAULT_PAYMENT_PROFILE.qris_image_url || null);

  useEffect(() => {
    if (activeTab === 'payment') {
      setLoadingProfile(true);
      fetchPaymentProfileService()
        .then(data => {
          setProfile(data);
          if (data.qris_image_url) setQrisPreview(data.qris_image_url);
        })
        .catch(err => {
          console.error('[Settings] Error fetching payment profile:', err);
        })
        .finally(() => setLoadingProfile(false));
    }
  }, [activeTab]);

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Mohon isi semua bidang kata sandi');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('Kata sandi baru tidak cocok');
      return;
    }
    toast.success('Kata sandi berhasil diperbarui.');
    setPasswords({ current: '', new: '', confirm: '' });
  };

  const handleSavePaymentProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await savePaymentProfileService(profile);
      setProfile(updated);
      if (!ENABLE_BACKEND_MUTATIONS) {
        toast.success('Pengaturan pembayaran disimpan dalam mode simulasi aman.');
      } else {
        toast.success('Pengaturan pembayaran berhasil disimpan ke server.');
      }
    } catch (err: any) {
      console.error('[Settings] Error saving payment profile:', err);
      toast.error(err?.message || 'Gagal menyimpan profil pembayaran.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('File harus berupa gambar (PNG/JPG/WEBP).');
        return;
      }
      const localUrl = URL.createObjectURL(file);
      setQrisPreview(localUrl);
      setProfile(prev => ({ ...prev, qris_image_url: localUrl }));
      toast.info('Gambar QRIS siap disimpan.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-2xl">
              <SettingsIcon className="w-8 h-8 text-primary" />
            </div>
            Pengaturan Sistem
          </h1>
          <p className="text-muted mt-1 text-xs font-bold">
            Konfigurasi preferensi sistem, keamanan akun, dan integrasi gateway pembayaran.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
        <button
          onClick={() => setActiveTab('account')}
          className={cn(
            "px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
            activeTab === 'account' 
              ? "bg-primary text-[#10172A] shadow-[0_0_15px_rgba(255,184,0,0.3)]" 
              : "bg-white/5 text-muted hover:text-white"
          )}
        >
          <ShieldCheck className="w-4 h-4" /> Keamanan & Akun
        </button>
        <button
          onClick={() => setActiveTab('payment')}
          className={cn(
            "px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
            activeTab === 'payment' 
              ? "bg-primary text-[#10172A] shadow-[0_0_15px_rgba(255,184,0,0.3)]" 
              : "bg-white/5 text-muted hover:text-white"
          )}
        >
          <QrCode className="w-4 h-4" /> Pembayaran & QRIS
        </button>
      </div>

      {/* TAB 1: Account & Security */}
      {activeTab === 'account' && (
        <section className="space-y-4">
          <div className="glass-panel p-6 md:p-8 neon-border">
            <h3 className="text-xl font-bold mb-1">Pembaruan Kata Sandi</h3>
            <p className="text-xs text-muted mb-6">Perbarui kata sandi yang digunakan untuk mengakses panel kontrol ini.</p>
            
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Kata Sandi Saat Ini
                </label>
                <input 
                  type="password" 
                  value={passwords.current}
                  onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 transition-all font-mono text-foreground text-xs"
                  placeholder="••••••••"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest flex items-center gap-2">
                    <User className="w-3 h-3" /> Kata Sandi Baru
                  </label>
                  <input 
                    type="password" 
                    value={passwords.new}
                    onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 transition-all font-mono text-foreground text-xs"
                    placeholder="Kata sandi baru"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest flex items-center gap-2">
                    <Check className="w-3 h-3" /> Konfirmasi Kata Sandi Baru
                  </label>
                  <input 
                    type="password" 
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 transition-all font-mono text-foreground text-xs"
                    placeholder="Konfirmasi kata sandi"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-3.5 bg-primary text-[#10172A] font-black uppercase tracking-wider rounded-xl shadow-[0_4px_15px_rgba(255,184,0,0.3)] hover:opacity-90 transition-all mt-4 flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                Simpan Kata Sandi
              </button>
            </form>
          </div>
        </section>
      )}

      {/* TAB 2: Payment & QRIS Configuration */}
      {activeTab === 'payment' && (
        <section className="space-y-6">
          <div className="bg-[#1E293B] border border-white/5 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" /> Konfigurasi QRIS & Gateway
              </h3>
              <p className="text-xs text-muted font-bold mt-1">
                Atur penerimaan pembayaran statis dan dinamis pada bilik photobooth.
              </p>
            </div>

            {loadingProfile ? (
              <div className="py-12 text-center text-xs text-muted font-bold">
                Memuat konfigurasi pembayaran...
              </div>
            ) : (
              <form onSubmit={handleSavePaymentProfile} className="space-y-6">
                {/* Payment Required Toggle */}
                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Wajibkan Pembayaran</h4>
                    <p className="text-[11px] text-muted font-bold mt-0.5">
                      Jika dinonaktifkan, kiosk langsung melewati layar bayar (mode testing/gratis).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfile(prev => ({ ...prev, payment_required: !prev.payment_required }))}
                    className="text-primary cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {profile.payment_required ? (
                      <ToggleRight className="w-10 h-10 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-muted" />
                    )}
                  </button>
                </div>

                {/* QRIS Static Upload & Preview */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                    Gambar QRIS Statis Kiosk
                  </label>
                  <div className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center space-y-3 hover:border-primary/40 transition-colors bg-black/10">
                    {qrisPreview ? (
                      <div className="flex flex-col items-center gap-3">
                        <img 
                          src={qrisPreview} 
                          alt="QRIS Preview" 
                          className="max-h-48 rounded-xl object-contain border border-white/10 bg-white p-2"
                        />
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                          QRIS Aktif Terpasang
                        </span>
                      </div>
                    ) : (
                      <div className="py-4 text-muted">
                        <QrCode className="w-12 h-12 mx-auto text-primary/40 mb-2" />
                        <p className="text-xs font-bold">Belum ada gambar QRIS yang diunggah</p>
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-foreground cursor-pointer transition-colors border border-white/10">
                      <Upload className="w-4 h-4 text-primary" /> Pilih Gambar QRIS Baru
                      <input 
                        type="file" 
                        accept="image/png,image/jpeg,image/webp" 
                        onChange={handleFileChange} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                </div>

                {/* Merchant Names */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                      Nama Merchant Resmi
                    </label>
                    <input 
                      type="text"
                      value={profile.merchant_name}
                      onChange={(e) => setProfile(prev => ({ ...prev, merchant_name: e.target.value }))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      placeholder="UNISMILES PHOTOBOOTH"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                      Nama Tampilan Kiosk
                    </label>
                    <input 
                      type="text"
                      value={profile.display_name}
                      onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                      placeholder="UniSmiles Official"
                    />
                  </div>
                </div>

                {/* Session TTL & Unique Amount */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                      Masa Berlaku Sesi Bayar (Menit)
                    </label>
                    <input 
                      type="number"
                      min={1}
                      max={60}
                      value={profile.session_ttl_minutes}
                      onChange={(e) => setProfile(prev => ({ ...prev, session_ttl_minutes: parseInt(e.target.value) || 5 }))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="p-4 bg-black/20 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Kode Nominal Unik</h4>
                      <p className="text-[10px] text-muted font-bold">Tambahkan 3 digit unik untuk identifikasi visual</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfile(prev => ({ ...prev, unique_amount_enabled: !prev.unique_amount_enabled }))}
                      className="text-primary cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {profile.unique_amount_enabled ? (
                        <ToggleRight className="w-8 h-8 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-muted" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Package Visibility */}
                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Paket yang Ditampilkan di Bilik</h4>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={profile.show_digital_package}
                        onChange={(e) => setProfile(prev => ({ ...prev, show_digital_package: e.target.checked }))}
                        className="rounded border-white/20 text-primary focus:ring-primary bg-black/30"
                      />
                      <span className="font-bold text-foreground">Paket Digital (File Saja)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={profile.show_print_package}
                        onChange={(e) => setProfile(prev => ({ ...prev, show_print_package: e.target.checked }))}
                        className="rounded border-white/20 text-primary focus:ring-primary bg-black/30"
                      />
                      <span className="font-bold text-foreground">Paket Cetak (Digital + Print Fisik)</span>
                    </label>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-3.5 bg-primary text-[#10172A] font-black uppercase tracking-wider rounded-xl shadow-[0_4px_15px_rgba(255,184,0,0.3)] hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {savingProfile ? 'Menyimpan...' : 'Simpan Profil Pembayaran'}
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
