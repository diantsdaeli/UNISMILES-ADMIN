import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, User, Lock, ArrowRight, Loader2, AlertCircle, Camera, Zap, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import api, { parseAuthResponse } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import { toast } from 'sonner';

export const Auth: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Mohon masukkan email dan password.');
      return;
    }

    if (!isLogin) {
      setError('Pendaftaran akun publik dinonaktifkan demi keamanan. Silakan hubungi Super Admin untuk penambahan akun.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: email.trim(),
        password,
      });

      const { token, user } = parseAuthResponse(response.data);
      login(token, user);
      toast.success('Login berhasil! Selamat datang kembali.');

      // Pengalihan default resmi: Arahkan ke /dashboard (atau deep-link jika dibuka spesifik)
      const from = (location.state as any)?.from?.pathname;
      if (from && from !== '/' && from !== '/login') {
        navigate(from, { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      console.error('Login request failed:', err?.message || 'Unknown network error');

      if (!api.defaults.baseURL) {
        setError('Konfigurasi API belum ditentukan. Silakan set VITE_API_BASE_URL pada file .env.local.');
      } else if (!err.response) {
        setError(`Gagal terhubung ke backend (${api.defaults.baseURL}). Pastikan server backend sedang aktif.`);
      } else if (err.response.status === 400) {
        setError('Format email atau password tidak valid.');
      } else if (err.response.status === 401) {
        setError('Email atau password salah. Silakan periksa kembali kredensial Anda.');
      } else if (err.response.status === 403) {
        setError('Akun Anda berstatus nonaktif. Silakan hubungi Super Admin.');
      } else if (err.response.status === 429) {
        setError('Terlalu banyak percobaan login gagal. Silakan tunggu beberapa saat.');
      } else {
        setError(err.response.data?.message || 'Terjadi kesalahan saat memproses login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex overflow-hidden font-sans relative">
      {/* Background Gradient */}
      <div
        className="absolute inset-0 z-0"
        style={{ background: 'linear-gradient(to bottom, #10172A, #223148)' }}
      />

      {/* Left Panel - Branding */}
      <div className="hidden lg:flex flex-1 relative flex-col justify-between p-16 overflow-hidden z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-black/20 rotate-12">
            <Camera className="text-[#10172A] w-7 h-7 -rotate-12" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-foreground uppercase">
            Uni<span className="text-primary italic">Smiles</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="text-6xl font-display font-black leading-[1.1] mb-6 text-foreground uppercase tracking-tighter">
            Empower Your <br />
            <span className="text-primary italic">Kiosk Business.</span>
          </h1>
          <p className="text-xl text-muted max-w-md leading-relaxed font-bold">
            Smart Photo Booth Management Dashboard for high-performance operations.
          </p>
        </motion.div>

        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">
            <div className="w-1 h-1 rounded-full bg-primary" />
            SECURE ADMIN ACCESS ONLY
          </div>
        </div>
      </div>

      {/* Right Panel - Form Area */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="bg-[#1E293B] border border-white/5 p-10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] rounded-[3rem]">
            <div className="mb-10">
              <h2 className="text-3xl font-display font-black mb-2 text-foreground tracking-tight uppercase">
                {isLogin ? 'WELCOME BACK' : 'CREATE ACCOUNT'}
              </h2>
              <p className="text-muted text-sm font-bold">
                {isLogin ? 'Identify yourself to access the control panel.' : 'Join UniSmiles and start managing your kiosks.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">
                  Username
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/40 focus:bg-black/30 transition-all text-sm font-bold text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/40 focus:bg-black/30 transition-all text-sm font-bold text-foreground"
                  />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isLogin ? (
                      <div className="flex items-center gap-3">
                        <LogIn className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span>MASUK KE DASHBOARD</span>
                      </div>
                    ) : (
                      <>
                        Initialize Account
                        <Zap className="w-4 h-4 group-hover:scale-125 group-hover:rotate-12 transition-transform" />
                      </>
                    )}
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[10px] font-black text-muted hover:text-primary tracking-[0.2em] uppercase transition-colors"
                >
                  {isLogin ? (
                    <>Don't have an account? Register Now</>
                  ) : (
                    <>Already have an account? Sign In</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
