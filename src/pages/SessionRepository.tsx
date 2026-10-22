import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileSpreadsheet,
  X,
  Mail,
  Printer,
  Shield,
  Image as ImageIcon,
  LayoutGrid,
  List,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Store,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSession } from '../SessionContext';
import { useKiosk } from '../KioskContext';
import { 
  SessionItem, 
  SessionPhoto,
  categorizeSessionPhotos, 
  filterSessions,
  generateExportCSV,
  auditReprintSafety,
  sendDigitalCopySimulation,
  isSafePhotoUrl
} from '../lib/sessionService';
import { toast } from 'sonner';

export const SessionRepository: React.FC = () => {

  const { sessions, loading, error, isSimulated, refreshSessions } = useSession();
  const { kiosks } = useKiosk();

  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [templateFilter, setTemplateFilter] = useState('All Templates');
  const [kioskFilter, setKioskFilter] = useState('All Kiosks');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // View States
  const [viewMode, setViewMode] = useState<'table' | 'gallery'>('table');
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<SessionPhoto | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter options derived from data & kiosks
  const templates = useMemo(() => {
    return Array.from(new Set(sessions.map(s => s.template || 'Default'))).filter(Boolean);
  }, [sessions]);

  const kioskOptions = useMemo(() => {
    const list = new Map<string, string>();
    // Dari data kiosk terdaftar
    kiosks.forEach(k => list.set(k.id, k.name));
    // Dari data sesi yang ada
    sessions.forEach(s => {
      if (s.kiosk_id && !list.has(s.kiosk_id)) {
        list.set(s.kiosk_id, s.kiosk_name || s.kiosk_id);
      }
    });
    return Array.from(list.entries()).map(([id, name]) => ({ id, name }));
  }, [kiosks, sessions]);

  // Eksekusi pemfilteran
  const filteredSessions = useMemo(() => {
    return filterSessions(sessions, {
      search,
      status: statusFilter,
      template: templateFilter,
      kiosk: kioskFilter,
      startDate: dateRange.start,
      endDate: dateRange.end,
    });
  }, [sessions, search, statusFilter, templateFilter, kioskFilter, dateRange]);

  // Statistik KPI Sesi
  const stats = useMemo(() => {
    const total = filteredSessions.length;
    const successful = filteredSessions.filter(s => s.status === 'Success').length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;
    const revenue = filteredSessions.reduce((acc, s) => acc + (s.amount || 0), 0);
    const totalPhotos = filteredSessions.reduce((acc, s) => acc + (s.photos?.length || 0), 0);

    return { total, successful, successRate, revenue, totalPhotos };
  }, [filteredSessions]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredSessions.length / pageSize) || 1;
  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredSessions.slice(startIndex, startIndex + pageSize);
  }, [filteredSessions, currentPage, pageSize]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, templateFilter, kioskFilter, dateRange, pageSize]);

  // Export CSV dengan perlindungan Formula Injection
  const handleExportCSV = () => {
    if (filteredSessions.length === 0) {
      toast.error('Tidak ada data sesi untuk diekspor.');
      return;
    }

    try {
      const csvContent = generateExportCSV(filteredSessions);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `unismiles_sessions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Berhasil mengekspor ${filteredSessions.length} sesi ke CSV.`);
    } catch (err: any) {
      console.error('Export CSV Error:', err);
      toast.error('Gagal mengekspor file CSV.');
    }
  };

  // Unduh satu file foto
  const downloadUrl = async (url: string, filename: string) => {
    if (!isSafePhotoUrl(url)) {
      toast.error('URL foto tidak aman atau tidak diizinkan.');
      return;
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Gagal mengunduh gambar langsung:', err);
      if (isSafePhotoUrl(url) && (url.startsWith('http://') || url.startsWith('https://'))) {
        window.open(url, '_blank');
      }
    }
  };


  // Unduh seluruh foto sesi sekaligus
  const downloadSessionPhotos = async (photos: string[], sessionId: string) => {
    if (!photos || photos.length === 0) {
      toast.error('Tidak ada foto yang tersedia untuk diunduh pada sesi ini.');
      return;
    }

    const toastId = toast.loading(`Mengunduh ${photos.length} foto sesi...`);
    try {
      for (let idx = 0; idx < photos.length; idx++) {
        await downloadUrl(photos[idx], `session-${sessionId.replace(/#/g, '')}-photo-${idx + 1}.jpg`);
      }
      toast.success(`Berhasil mengunduh ${photos.length} foto.`, { id: toastId });
    } catch (err) {
      toast.error('Gagal mengunduh beberapa foto.', { id: toastId });
    }
  };

  // Pengiriman email salinan digital
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    if (!resendEmail.trim()) {
      toast.error('Masukkan alamat email penerima yang valid.');
      return;
    }

    setSendingEmail(true);
    const toastId = toast.loading('Memproses pengiriman salinan digital...');

    try {
      const result = await sendDigitalCopySimulation(selectedSession.id, resendEmail);
      toast.success(result.message, { id: toastId, duration: 4000 });
      setResendEmail('');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengirim email salinan digital.', { id: toastId });
    } finally {
      setSendingEmail(false);
    }
  };

  // Perintah Cetak Ulang dengan Safeguard Fail-Closed
  const handlePrintCommand = (session: SessionItem) => {
    const kiosk = kiosks.find(k => k.id === session.kiosk_id);
    const audit = auditReprintSafety(session, kiosk?.status);

    if (!audit.allowed) {
      toast.error(audit.reason, { duration: 5000 });
      return;
    }

    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Menghubungi layanan printer kiosk...',
        success: `Perintah cetak ulang terkirim untuk Sesi ${session.id}!`,
        error: 'Gagal berkomunikasi dengan printer kiosk.',
      }
    );
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (e) {
      console.error('Date parsing error', e);
    }
    return 'N/A';
  };

  // Ekstrak detail foto terpisah untuk modal
  const selectedPhotosCategorized = useMemo(() => {
    if (!selectedSession) return { framePhoto: null, singlePhotos: [], allPhotos: [] };
    return categorizeSessionPhotos(selectedSession.photos);
  }, [selectedSession]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header Halaman */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
              Modul 5
            </span>
            <span className="text-xs text-muted font-bold flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> Session & Photo Repository
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Session Repository</h1>
          <p className="text-muted mt-1 font-medium">
            Pemantauan sesi photobooth terpusat, repositori jepretan foto, dan riwayat transaksi pelanggan.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={refreshSessions}
            disabled={loading}
            className="p-3 glass-panel hover:bg-foreground/5 rounded-2xl transition-all border-primary/20 text-muted hover:text-primary active:scale-95 disabled:opacity-50"
            title="Muat Ulang Data Sesi"
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin text-primary")} />
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex-1 md:flex-initial px-6 py-3 glass-panel hover:bg-foreground/5 transition-all flex items-center justify-center gap-2 text-sm font-extrabold border-primary/20 shadow-[0_0_15px_rgba(255,140,102,0.1)] active:scale-95 cursor-pointer rounded-2xl"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 neon-text-glow" /> Export CSV
          </button>
        </div>
      </header>

      {/* Safe Simulation Banner */}
      {isSimulated && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 shadow-lg">
          <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-extrabold text-amber-500 uppercase tracking-wider flex items-center gap-2">
              SAFE SIMULATION ACTIVE — Zero Production Mutation
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Sistem saat ini berjalan dalam mode <strong>simulasi terisolasi</strong>. Data sesi, foto, dan transaksi yang disajikan merupakan data sintetis untuk memverifikasi antarmuka dan kontrak backend tanpa memaparkan foto pelanggan riil maupun memicu cetak fisik.
            </p>
          </div>
        </div>
      )}

      {/* Error State Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-extrabold text-red-500 uppercase tracking-wider">
                Kendala Sinkronisasi Sesi Backend
              </p>
              <p className="text-foreground/80 leading-relaxed">{error}</p>
            </div>
          </div>
          <button
            onClick={refreshSessions}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold rounded-xl text-xs transition-colors shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border-primary/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Sesi</span>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black">{stats.total}</div>
          <p className="text-[10px] text-muted font-bold mt-1">Sesi terfilter</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-primary/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Tingkat Sukses</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.successRate}%</div>
          <p className="text-[10px] text-muted font-bold mt-1">{stats.successful} dari {stats.total} selesai</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-primary/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Estimasi Pendapatan</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black">Rp {stats.revenue.toLocaleString('id-ID')}</div>
          <p className="text-[10px] text-muted font-bold mt-1">Total nilai transaksi</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-primary/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Foto Terjepret</span>
            <ImageIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-400">{stats.totalPhotos}</div>
          <p className="text-[10px] text-muted font-bold mt-1">File foto tercatat</p>
        </div>
      </div>

      {/* Filter and View Controls Bar */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
        {/* Search Input */}
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ID Sesi, Template, atau Kiosk..."
            className="w-full bg-foreground/5 border border-primary/20 rounded-2xl pl-12 pr-4 py-2.5 outline-none focus:border-primary/50 transition-all text-foreground font-medium text-sm focus:shadow-[0_0_15px_rgba(255,140,102,0.1)]"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary pointer-events-none" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 glass-panel bg-foreground/5 border-primary/20 rounded-xl text-xs font-bold outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              <option value="All Status" className="bg-background text-foreground">Semua Status</option>
              <option value="Success" className="bg-background text-foreground">Success</option>
              <option value="Failed (Paper Jam)" className="bg-background text-foreground">Failed (Paper Jam)</option>
              <option value="Pending" className="bg-background text-foreground">Pending</option>
            </select>
          </div>

          {/* Kiosk Filter */}
          <div className="relative">
            <select 
              value={kioskFilter}
              onChange={(e) => setKioskFilter(e.target.value)}
              className="px-3.5 py-2 glass-panel bg-foreground/5 border-primary/20 rounded-xl text-xs font-bold outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              <option value="All Kiosks" className="bg-background text-foreground">Semua Kiosk</option>
              {kioskOptions.map(k => (
                <option key={k.id} value={k.id} className="bg-background text-foreground">
                  {k.name} ({k.id})
                </option>
              ))}
            </select>
          </div>

          {/* Template Filter */}
          <div className="relative">
            <select 
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="px-3.5 py-2 glass-panel bg-foreground/5 border-primary/20 rounded-xl text-xs font-bold outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              <option value="All Templates" className="bg-background text-foreground">Semua Template</option>
              {templates.map(t => (
                <option key={t} value={t} className="bg-background text-foreground">{t}</option>
              ))}
            </select>
          </div>
          
          {/* Date Range Picker */}
          <div className="flex items-center gap-1.5 glass-panel p-1 border-primary/20 rounded-xl">
            <input 
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-transparent text-[11px] font-bold px-2 py-1 outline-none text-foreground color-scheme-dark"
              title="Tanggal Awal"
            />
            <span className="text-muted text-[9px] font-black">S/D</span>
            <input 
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-transparent text-[11px] font-bold px-2 py-1 outline-none text-foreground color-scheme-dark"
              title="Tanggal Akhir"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center glass-panel p-1 border-primary/20 rounded-xl ml-auto">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "p-1.5 rounded-lg transition-all text-xs flex items-center gap-1",
                viewMode === 'table' ? "bg-primary text-[#10172A] font-extrabold shadow-sm" : "text-muted hover:text-foreground"
              )}
              title="Tampilan Tabel"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('gallery')}
              className={cn(
                "p-1.5 rounded-lg transition-all text-xs flex items-center gap-1",
                viewMode === 'gallery' ? "bg-primary text-[#10172A] font-extrabold shadow-sm" : "text-muted hover:text-foreground"
              )}
              title="Tampilan Galeri Foto"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Konten Utama: Tabel atau Galeri Foto */}
      {viewMode === 'table' ? (
        <div className="glass-panel overflow-hidden neon-border border-primary/20 rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-primary/10 bg-foreground/5">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Session ID</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Kiosk Asal</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Waktu</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Template</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Foto</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Nominal</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted">Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {paginatedSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-foreground/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-mono text-primary font-bold neon-text-glow">{session.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <span className="text-sm font-bold text-foreground block">{session.kiosk_name}</span>
                        <span className="text-[10px] text-muted font-mono">{session.kiosk_id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-foreground/80 font-medium">
                        {formatDateTime(session.timestamp)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-foreground">{session.template || 'Default'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex -space-x-2 overflow-hidden items-center">
                        {(session.photos || []).slice(0, 3).map((photo: string, idx: number) => (
                          <div 
                            key={idx}
                            onClick={() => setPreviewPhoto(session.detailedPhotos[idx] || {
                              url: photo,
                              resolvedUrl: photo,
                              filename: `photo-${idx + 1}.jpg`,
                              isFrame: idx === session.photos.length - 1,
                              isPrintAsset: false,
                              index: idx
                            })}
                            className="inline-block h-8 w-8 rounded-lg ring-2 ring-background overflow-hidden cursor-pointer hover:scale-110 hover:z-10 transition-transform shadow-md bg-black/40"
                            title="Klik untuk pratinjau foto"
                          >
                            <img 
                              src={photo} 
                              alt="Foto Sesi" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        ))}
                        {(session.photos?.length || 0) > 3 && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10 text-[10px] font-bold text-muted ring-2 ring-background">
                            +{(session.photos?.length || 0) - 3}
                          </div>
                        )}
                        {(!session.photos || session.photos.length === 0) && (
                          <span className="text-xs text-muted font-medium italic">Tidak ada foto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-foreground">
                        Rp {(session.amount || 0).toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full w-fit",
                        session.status === 'Success' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : 
                        session.status?.startsWith('Failed') ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" : 
                        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      )}>
                        {session.status === 'Success' ? <CheckCircle2 className="w-3 h-3" /> : 
                         session.status?.startsWith('Failed') ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        <span>{session.status || 'unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button 
                          onClick={() => { setSelectedSession(session); setResendEmail(''); }}
                          className="p-2 hover:bg-primary/10 rounded-lg transition-all text-muted hover:text-primary cursor-pointer"
                          title="Lihat Detail Sesi"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => downloadSessionPhotos(session.photos, session.id)}
                          className="p-2 hover:bg-primary/10 rounded-lg transition-all text-muted hover:text-primary cursor-pointer"
                          title="Unduh Semua Foto"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted font-bold">
                      <div className="max-w-sm mx-auto space-y-2">
                        <ImageIcon className="w-8 h-8 text-muted/50 mx-auto" />
                        <p className="text-sm font-bold uppercase tracking-wider">Tidak ada sesi yang cocok</p>
                        <p className="text-xs text-muted">Cobalah menyesuaikan kata kunci pencarian, filter kiosk, atau rentang tanggal.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted font-bold">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                        <span>Memuat daftar sesi...</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Photo Gallery View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {paginatedSessions.map((session) => {
            const { framePhoto, singlePhotos } = categorizeSessionPhotos(session.photos);
            const mainPhoto = framePhoto || singlePhotos[0];

            return (
              <div 
                key={session.id}
                className="glass-panel border-primary/20 rounded-2xl overflow-hidden hover:border-primary/50 transition-all group flex flex-col justify-between"
              >
                <div className="relative aspect-[3/4] bg-black/40 overflow-hidden cursor-pointer"
                  onClick={() => { setSelectedSession(session); setResendEmail(''); }}
                >
                  {mainPhoto ? (
                    <img 
                      src={mainPhoto.resolvedUrl} 
                      alt={`Sesi ${session.id}`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted text-xs font-bold">
                      Tidak ada foto
                    </div>
                  )}

                  {/* Badges on top */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="font-mono text-[10px] font-black bg-black/70 backdrop-blur-md text-primary px-2 py-0.5 rounded-lg border border-primary/20">
                      {session.id}
                    </span>
                    {framePhoto && (
                      <span className="text-[9px] font-bold bg-indigo-500/80 text-white px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                        Framed
                      </span>
                    )}
                  </div>

                  <div className="absolute top-3 right-3">
                    <span className={cn(
                      "text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-md",
                      session.status === 'Success' ? "bg-emerald-500/80 text-white" : "bg-red-500/80 text-white"
                    )}>
                      {session.status}
                    </span>
                  </div>

                  {/* Overlay Action */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mainPhoto) setPreviewPhoto(mainPhoto);
                      }}
                      className="p-2.5 rounded-xl bg-primary text-[#10172A] font-bold hover:scale-110 active:scale-95 transition-all"
                      title="Pratinjau Foto Penuh"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSessionPhotos(session.photos, session.id);
                      }}
                      className="p-2.5 rounded-xl bg-white/20 text-white hover:bg-white/30 backdrop-blur-md hover:scale-110 active:scale-95 transition-all"
                      title="Unduh Foto Sesi"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-foreground truncate max-w-[150px]">{session.template}</h4>
                      <p className="text-[11px] text-muted truncate">{session.kiosk_name}</p>
                    </div>
                    <span className="text-xs font-black text-foreground">
                      Rp {(session.amount || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted pt-2 border-t border-primary/10">
                    <span>{formatDateTime(session.timestamp)}</span>
                    <span>{session.photos.length} file</span>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filteredSessions.length === 0 && (
            <div className="col-span-full py-16 text-center text-muted font-bold">
              <ImageIcon className="w-10 h-10 text-muted/40 mx-auto mb-2" />
              <p>Tidak ada foto yang sesuai dengan kriteria filter.</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination Footer */}
      {filteredSessions.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-medium text-muted pt-2">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-foreground/5 border border-primary/20 rounded-lg px-2 py-1 outline-none font-bold text-foreground cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Menampilkan {Math.min((currentPage - 1) * pageSize + 1, filteredSessions.length)} - {Math.min(currentPage * pageSize, filteredSessions.length)} dari {filteredSessions.length} sesi
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 glass-panel rounded-xl border-primary/20 text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/5 transition-all"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-foreground">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 glass-panel rounded-xl border-primary/20 text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/5 transition-all"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1E293B] border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setSelectedSession(null)}
              className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-black text-primary border border-primary/20 bg-primary/5 px-3 py-1 rounded-full uppercase tracking-widest">
                  Detail Sesi Photobooth
                </span>
                <h3 className="text-3xl font-black tracking-tighter uppercase mt-3 text-foreground">{selectedSession.id}</h3>
                <p className="text-xs text-muted font-bold">{formatDateTime(selectedSession.timestamp)}</p>
              </div>

              {/* Data Grid Sesi */}
              <div className="grid grid-cols-2 gap-4 bg-black/20 p-5 rounded-2xl border border-white/5 text-xs">
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Template Frame</span>
                  <span className="font-bold text-foreground">{selectedSession.template || 'Default'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Nilai Transaksi</span>
                  <span className="font-bold text-foreground">Rp {(selectedSession.amount || 0).toLocaleString('id-ID')}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Status Sesi</span>
                  <span className={cn(
                    "font-bold",
                    selectedSession.status === 'Success' ? "text-emerald-400" : "text-amber-400"
                  )}>
                    {selectedSession.status}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Kiosk Asal</span>
                  <span className="font-bold text-foreground block">{selectedSession.kiosk_name}</span>
                  <span className="text-[9px] text-muted font-mono">{selectedSession.kiosk_id}</span>
                </div>
              </div>

              {/* Foto-Foto Sesi */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-muted">
                    Foto Jepretan Pelanggan ({selectedSession.photos?.length || 0})
                  </h4>
                  {selectedSession.photos?.length > 0 && (
                    <button
                      onClick={() => downloadSessionPhotos(selectedSession.photos, selectedSession.id)}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Unduh Semua
                    </button>
                  )}
                </div>

                {/* Frame Result jika ada */}
                {selectedPhotosCategorized.framePhoto && (
                  <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-2xl">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest block mb-2">
                      Hasil Frame (Foto Akhir)
                    </span>
                    <div className="relative aspect-[3/2] max-w-sm rounded-xl overflow-hidden bg-black/40 group">
                      <img 
                        src={selectedPhotosCategorized.framePhoto.resolvedUrl} 
                        alt="Foto Frame" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setPreviewPhoto(selectedPhotosCategorized.framePhoto!)}
                          className="p-2 rounded-lg bg-primary text-[#10172A] font-bold"
                          title="Perbesar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => downloadUrl(selectedPhotosCategorized.framePhoto!.url, `frame-${selectedSession.rawId}.jpg`)}
                          className="p-2 rounded-lg bg-white/20 text-white backdrop-blur-md"
                          title="Unduh"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Raw Single Photos Grid */}
                {selectedPhotosCategorized.singlePhotos.length > 0 && (
                  <div>
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest block mb-2">
                      Jepretan Satuan (Mentah)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {selectedPhotosCategorized.singlePhotos.map((photo, idx) => (
                        <div key={idx} className="relative group overflow-hidden rounded-xl border border-white/5 bg-black/30 aspect-[4/3]">
                          <img 
                            src={photo.resolvedUrl} 
                            alt={`Capture ${idx + 1}`} 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => setPreviewPhoto(photo)}
                              className="p-1.5 rounded-lg bg-primary text-[#10172A]"
                              title="Perbesar"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => downloadUrl(photo.url, `session-${selectedSession.rawId}-shot-${idx + 1}.jpg`)}
                              className="p-1.5 rounded-lg bg-white/20 text-white"
                              title="Unduh"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!selectedSession.photos || selectedSession.photos.length === 0) && (
                  <p className="text-xs text-muted italic">Tidak ada foto yang tersimpan pada sesi ini.</p>
                )}
              </div>

              {/* Action Operations */}
              <div className="pt-4 border-t border-white/5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Resend Email Form */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-primary" /> Kirim Ulang Salinan Digital
                    </span>
                    <form onSubmit={handleSendEmail} className="flex gap-2">
                      <input 
                        type="email"
                        placeholder="email.pelanggan@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary/40 font-medium"
                      />
                      <button 
                        type="submit"
                        disabled={sendingEmail}
                        className="px-4 py-2 bg-primary text-[#10172A] rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:opacity-90 disabled:opacity-50"
                      >
                        Kirim
                      </button>
                    </form>
                  </div>

                  {/* Trigger Reprint */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-amber-400" /> Operasi Cetak Ulang Kiosk
                    </span>
                    <button 
                      onClick={() => handlePrintCommand(selectedSession)}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer text-foreground"
                    >
                      <Printer className="w-3.5 h-3.5" /> Picu Cetak Ulang di Kiosk
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* High-Resolution Photo Lightbox Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button 
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors"
              title="Tutup Pratinjau (ESC)"
            >
              <X className="w-8 h-8" />
            </button>

            <div className="relative rounded-2xl overflow-hidden bg-black/60 shadow-2xl max-h-[75vh] flex items-center justify-center border border-white/10">
              <img 
                src={previewPhoto.resolvedUrl} 
                alt={previewPhoto.filename} 
                className="max-h-[75vh] w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="mt-4 flex items-center justify-between w-full text-xs text-white/70 px-2">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold">{previewPhoto.filename}</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                  previewPhoto.isFrame ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-white/10 text-white/80"
                )}>
                  {previewPhoto.isFrame ? "Foto Frame (Hasil Akhir)" : "Foto Jepretan Satuan"}
                </span>
              </div>

              <button
                onClick={() => downloadUrl(previewPhoto.url, previewPhoto.filename)}
                className="px-4 py-2 bg-primary text-[#10172A] rounded-xl font-bold flex items-center gap-2 hover:opacity-90 cursor-pointer text-xs"
              >
                <Download className="w-4 h-4" /> Unduh Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
