import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  Download, 
  Loader2, 
  DollarSign,
  Receipt,
  Store,
  Clock,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Lock,
  RefreshCw
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useSession } from '../SessionContext';
import { useKiosk } from '../KioskContext';
import { 
  TransactionItem, 
  FinancialSummary, 
  fetchTransactionsService, 
  calculateFinancialSummary, 
  filterTransactionsByRole, 
  generateTransactionCSV 
} from '../lib/paymentService';

export const Analytics: React.FC = () => {
  const { user, isSuperAdmin } = useAuth();
  const { sessions, loading: sessionLoading } = useSession();
  const { kiosks } = useKiosk();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'financial'>('overview');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'month'>('all');

  // Transactions State for Financial Intelligence
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loadingTx, setLoadingTx] = useState<boolean>(true);
  const [isSimulated, setIsSimulated] = useState<boolean>(true);

  // Financial Filters & Pagination
  const [txSearch, setTxSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [kioskFilter, setKioskFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  // Load Transactions
  const loadTransactions = async () => {
    setLoadingTx(true);
    try {
      const data = await fetchTransactionsService();
      setTransactions(data);
      const simulated = data.some(t => t.isSimulated);
      setIsSimulated(simulated || data.length === 0);
    } catch (err: any) {
      console.error('[Analytics] Error fetching transactions:', err);
      const status = err?.response?.status || err?.status;
      if (status === 401 || status === 403) {
        setTransactions([]);
        setIsSimulated(false);
      }
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  // Filter sessions by Period
  const periodFilteredSessions = useMemo(() => {
    if (periodFilter === 'all') return sessions;

    const now = new Date();
    const todayStr = now.toDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return sessions.filter(s => {
      let d: Date;
      if (s.timestamp && typeof (s.timestamp as any).toDate === 'function') {
        d = (s.timestamp as any).toDate();
      } else if (s.timestamp) {
        d = new Date(s.timestamp);
      } else {
        d = new Date();
      }
      if (isNaN(d.getTime())) return false;

      if (periodFilter === 'today') {
        return d.toDateString() === todayStr;
      }
      if (periodFilter === 'month') {
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      return true;
    });
  }, [sessions, periodFilter]);

  // Aggregations for Operational Overview
  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i.toString().padStart(2, '0')}:00`,
    sessions: 0
  }));

  const dailyRevenue: Record<string, number> = {};
  const templateUsage: Record<string, number> = {};

  let totalGross = 0;
  let paidRevenue = 0;
  let successfulSessions = 0;

  periodFilteredSessions.forEach(s => {
    let date: Date;
    if (s.timestamp && typeof (s.timestamp as any).toDate === 'function') {
      date = (s.timestamp as any).toDate();
    } else if (s.timestamp) {
      date = new Date(s.timestamp);
    } else {
      date = new Date();
    }
    
    if (isNaN(date.getTime())) date = new Date();
    
    const hour = date.getHours();
    hourlyData[hour].sessions += 1;

    const amount = Math.round(s.amount || 0);
    totalGross += amount;

    // Critical: Do NOT assume session Success/completed means verified paid.
    // Use actual payment_status if available. If none, do not treat as verified paid revenue.
    const rawPS = (s as any).payment_status ? String((s as any).payment_status).toLowerCase() : undefined;
    const isPaymentVerified = rawPS === 'paid' || rawPS === 'success';

    if (isPaymentVerified) {
      paidRevenue += amount;
      successfulSessions += 1;
      const dateKey = date.toLocaleDateString('id-ID');
      dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + amount;
    }

    const templateId = s.template || 'Default';
    templateUsage[templateId] = (templateUsage[templateId] || 0) + 1;
  });

  const revenueChartData = Object.entries(dailyRevenue).map(([name, value]) => ({ name, value }));
  const templateRanking = Object.entries(templateUsage)
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => b.usage - a.usage);

  // Financial RBAC & Filtered Transactions
  const rbacTransactions = useMemo(() => {
    return filterTransactionsByRole(transactions, user);
  }, [transactions, user]);

  const filteredTransactions = useMemo(() => {
    return rbacTransactions.filter(t => {
      const q = txSearch.toLowerCase().trim();
      const matchSearch = !q || 
        t.transaction_code.toLowerCase().includes(q) ||
        t.session_code.toLowerCase().includes(q) ||
        t.kiosk_name.toLowerCase().includes(q) ||
        (t.partner_name && t.partner_name.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchMethod = methodFilter === 'all' || t.payment_method.toLowerCase() === methodFilter.toLowerCase();
      const matchKiosk = kioskFilter === 'all' || t.kiosk_id === kioskFilter;

      return matchSearch && matchStatus && matchMethod && matchKiosk;
    });
  }, [rbacTransactions, txSearch, statusFilter, methodFilter, kioskFilter]);

  // Financial Summary
  const financialSummary: FinancialSummary = useMemo(() => {
    return calculateFinancialSummary(filteredTransactions);
  }, [filteredTransactions]);

  // Transaction Pagination
  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [txSearch, statusFilter, methodFilter, kioskFilter, pageSize]);

  // CSV Export
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error('Tidak ada data transaksi untuk diekspor.');
      return;
    }
    try {
      const csv = generateTransactionCSV(filteredTransactions);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `unismiles_financial_report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Berhasil mengekspor ${filteredTransactions.length} rekaman transaksi.`);
    } catch (err: any) {
      console.error('Export CSV error:', err);
      toast.error('Gagal mengekspor file CSV.');
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'success':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <AlertCircle className="w-3 h-3" /> Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/5 text-muted border border-white/10">
            {status}
          </span>
        );
    }
  };

  if (sessionLoading) {
    return (
      <div className="h-full flex items-center justify-center py-24">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Simulation Banner */}
      {isSimulated && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-amber-300 uppercase tracking-wider">
                Simulasi Kontrak Finansial Aktif (Modul 6 Safe Engine)
              </p>
              <p className="text-[11px] text-amber-200/80 font-medium">
                Sistem beroperasi dalam mode aman: transaksi mutasi (capture/refund) diblokir fail-closed. Nilai nominal hanya mencatat transaksi terverifikasi.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 tracking-widest border border-amber-500/30 whitespace-nowrap">
            CONTRACT MOCK
          </span>
        </div>
      )}

      {/* Header & View Switcher */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 text-foreground">
            Analytics & Reports
          </h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            Deep dive into operational intelligence and financial transaction metrics
          </p>
        </div>

        {/* Tab & Period Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Filter */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 text-xs">
            <button
              onClick={() => setPeriodFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer",
                periodFilter === 'all' ? "bg-primary text-[#10172A]" : "text-muted hover:text-white"
              )}
            >
              Semua
            </button>
            <button
              onClick={() => setPeriodFilter('today')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer",
                periodFilter === 'today' ? "bg-primary text-[#10172A]" : "text-muted hover:text-white"
              )}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setPeriodFilter('month')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer",
                periodFilter === 'month' ? "bg-primary text-[#10172A]" : "text-muted hover:text-white"
              )}
            >
              Bulan Ini
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center bg-black/30 border border-white/10 rounded-xl p-1 text-xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "px-4 py-1.5 rounded-lg font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
                activeTab === 'overview' 
                  ? "bg-primary text-[#10172A] shadow-[0_0_15px_rgba(255,184,0,0.3)]" 
                  : "text-muted hover:text-white"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Ringkasan Operasional
            </button>
            <button
              onClick={() => setActiveTab('financial')}
              className={cn(
                "px-4 py-1.5 rounded-lg font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
                activeTab === 'financial' 
                  ? "bg-primary text-[#10172A] shadow-[0_0_15px_rgba(255,184,0,0.3)]" 
                  : "text-muted hover:text-white"
              )}
            >
              <DollarSign className="w-3.5 h-3.5" /> Financial Intelligence
            </button>
          </div>
        </div>
      </header>

      {/* TAB 1: OPERATIONAL OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { label: 'Total Sesi', value: `${successfulSessions}/${periodFilteredSessions.length}`, sub: `${periodFilteredSessions.length} sesi tercatat`, icon: TrendingUp, trend: 'Live', neonClass: 'neon-border' },
              { label: 'Paid Revenue', value: `Rp ${paidRevenue.toLocaleString('id-ID')}`, sub: 'Pembayaran sah terverifikasi', icon: DollarSign, trend: 'Verified', neonClass: 'neon-border-peach' },
              { label: 'Gross Sales Potential', value: `Rp ${totalGross.toLocaleString('id-ID')}`, sub: 'Nilai seluruh sesi terdaftar', icon: Users, trend: 'Gross', neonClass: 'neon-border' },
              { label: 'Rata-Rata / Sesi Sukses', value: `Rp ${successfulSessions ? Math.round(paidRevenue / successfulSessions).toLocaleString('id-ID') : 0}`, sub: 'Efisiensi pendapatan', icon: BarChart3, trend: 'Live', neonClass: 'neon-border-butter' },
            ].map((stat, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={stat.label} 
                className={cn("glass-panel p-6 group transition-all duration-500", stat.neonClass)}
              >
                <div className="flex justify-between items-center">
                  <div className="p-3 bg-white/5 rounded-xl group-hover:bg-primary/10 transition-colors">
                    <stat.icon className="w-6 h-6 text-primary neon-text-glow" />
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-1 bg-primary/10 text-primary rounded-full tracking-widest shadow-[0_0_5px_rgba(255,184,0,0.2)]">
                    {stat.trend}
                  </span>
                </div>
                <div className="mt-4">
                  <h3 className="text-muted text-xs font-bold uppercase tracking-widest">{stat.label}</h3>
                  <p className="text-2xl font-extrabold mt-1 tracking-tight text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted font-bold mt-1">{stat.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Peak Hours Heatmap */}
            <div className="glass-panel p-6 neon-border border-primary/20">
              <h3 className="text-base font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary neon-text-glow" /> Distribusi Sesi Per Jam
              </h3>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fontWeight: 700 }}
                    />
                    <YAxis 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fontWeight: 700 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,140,102,0.05)' }}
                      contentStyle={{ 
                        backgroundColor: '#0B0F19', 
                        border: '2px solid rgba(255,184,0,0.4)', 
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        padding: '12px'
                      }}
                      labelStyle={{ color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px' }}
                      itemStyle={{ color: '#FFB800', fontWeight: 900, fontSize: '14px' }}
                      formatter={(value: any) => [`${value} Sesi`, 'Waktu Sibuk']}
                    />
                    <Bar 
                      dataKey="sessions" 
                      fill="#FFB800" 
                      radius={[4, 4, 0, 0]} 
                      className="drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Daily Revenue Trend */}
            <div className="glass-panel p-6 neon-border-peach border-secondary/20">
              <h3 className="text-base font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-secondary neon-text-glow" /> Tren Pendapatan Harian (Paid Only)
              </h3>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fontWeight: 700 }}
                    />
                    <YAxis 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fontWeight: 700 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0B0F19', 
                        border: '2px solid rgba(255,107,0,0.4)', 
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        padding: '12px'
                      }}
                      labelStyle={{ color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px' }}
                      itemStyle={{ color: '#FF6B00', fontWeight: 900, fontSize: '14px' }}
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Pendapatan Sah']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#FF6B00" 
                      strokeWidth={3} 
                      dot={{ fill: '#FF6B00', strokeWidth: 2, r: 4, stroke: '#0B0F19' }}
                      activeDot={{ r: 6, strokeWidth: 0, className: 'drop-shadow-[0_0_10px_#FF6B00]' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Template Ranking */}
          <div className="glass-panel p-6 md:p-8 neon-border border-primary/20">
            <h3 className="text-xl font-bold tracking-tight mb-6 text-foreground flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-primary neon-text-glow" /> Peringkat Popularitas Template
            </h3>
            <div className="space-y-3">
              {templateRanking.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-extrabold text-xs text-primary">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{item.name}</h4>
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Template Frame</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold text-foreground">{item.usage} <span className="text-xs font-bold text-muted ml-1">kali dipakai</span></p>
                  </div>
                </div>
              ))}
              {templateRanking.length === 0 && (
                <p className="text-xs text-muted text-center py-8">Belum ada sesi pada periode ini.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL INTELLIGENCE */}
      {activeTab === 'financial' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Paid Revenue */}
            <div className="bg-[#1E293B] border border-white/5 p-6 rounded-3xl relative overflow-hidden shadow-xl hover:border-emerald-500/30 transition-all">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                  <DollarSign className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Verified Paid
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-muted text-[10px] font-black uppercase tracking-widest">Paid Revenue</h3>
                <p className="text-2xl md:text-3xl font-black mt-1 text-emerald-400">
                  Rp {financialSummary.paidRevenue.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-muted font-bold mt-1">
                  {financialSummary.successfulPayments} transaksi berhasil
                </p>
              </div>
            </div>

            {/* Gross Sales */}
            <div className="bg-[#1E293B] border border-white/5 p-6 rounded-3xl relative overflow-hidden shadow-xl hover:border-primary/30 transition-all">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-white/5 rounded-2xl text-primary">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 text-muted border border-white/10">
                  Gross Volume
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-muted text-[10px] font-black uppercase tracking-widest">Gross Sales</h3>
                <p className="text-2xl md:text-3xl font-black mt-1 text-foreground">
                  Rp {financialSummary.grossTransactionAmount.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-muted font-bold mt-1">
                  Total {financialSummary.totalTransactions} rekaman transaksi
                </p>
              </div>
            </div>

            {/* Pending Volume */}
            <div className="bg-[#1E293B] border border-white/5 p-6 rounded-3xl relative overflow-hidden shadow-xl hover:border-amber-500/30 transition-all">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                  <Clock className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Pending
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-muted text-[10px] font-black uppercase tracking-widest">Pending Volume</h3>
                <p className="text-2xl md:text-3xl font-black mt-1 text-amber-400">
                  Rp {financialSummary.pendingVolume.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-muted font-bold mt-1">
                  {financialSummary.pendingPayments} menunggu bukti pembayaran
                </p>
              </div>
            </div>

            {/* Failed & Expired */}
            <div className="bg-[#1E293B] border border-white/5 p-6 rounded-3xl relative overflow-hidden shadow-xl hover:border-red-500/30 transition-all">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-red-500/10 rounded-2xl text-red-400">
                  <XCircle className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  Unsettled
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-muted text-[10px] font-black uppercase tracking-widest">Failed / Expired</h3>
                <p className="text-2xl md:text-3xl font-black mt-1 text-red-400">
                  Rp {financialSummary.failedVolume.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-muted font-bold mt-1">
                  {financialSummary.failedPayments + financialSummary.expiredPayments} transaksi tidak terselesaikan
                </p>
              </div>
            </div>
          </div>

          {/* Settlement & Refund Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted block">Gateway Settlement Status</span>
                <span className="font-bold text-foreground">N/A (Belum Didukung Sinkronisasi Mutasi Bank Otomatis)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/5 text-muted text-[10px] font-bold">UNSUPPORTED</span>
            </div>
            <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted block">Refund & Chargeback Volume</span>
                <span className="font-bold text-foreground">N/A (Belum Didukung)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/5 text-muted text-[10px] font-bold">UNSUPPORTED</span>
            </div>
          </div>

          {/* Kiosk & Partner Revenue Monitoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kiosk Revenue Breakdown */}
            <div className="bg-[#1E293B] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2 border-b border-white/5 pb-3">
                <Store className="w-4 h-4 text-primary" /> Pendapatan Per Kiosk
              </h3>
              <div className="space-y-3">
                {Object.values(financialSummary.revenuePerKiosk).map((k) => (
                  <div key={k.kiosk_id} className="p-3.5 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground truncate max-w-[180px]">{k.kiosk_name}</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {k.success_rate}% Success
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted text-[10px] font-bold">Paid Revenue:</span>
                      <span className="font-extrabold text-foreground">Rp {k.paid_revenue.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-primary h-full rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, k.success_rate)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {Object.keys(financialSummary.revenuePerKiosk).length === 0 && (
                  <p className="text-xs text-muted text-center py-4">Belum ada data kiosk.</p>
                )}
              </div>
            </div>

            {/* Partner Revenue Breakdown (Super Admin view) */}
            <div className="bg-[#1E293B] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2 border-b border-white/5 pb-3">
                <Users className="w-4 h-4 text-primary" /> Pendapatan Per Mitra
              </h3>
              {isSuperAdmin ? (
                <div className="space-y-3">
                  {Object.values(financialSummary.revenuePerPartner).map((p) => (
                    <div key={p.partner_id} className="p-3.5 bg-black/20 rounded-2xl border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-foreground">{p.partner_name}</div>
                        <div className="text-[10px] text-muted font-bold">{p.total_transactions} Total Transaksi</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-xs text-emerald-400">Rp {p.paid_revenue.toLocaleString('id-ID')}</div>
                        <div className="text-[9px] text-muted font-mono uppercase">Gross: Rp {p.gross_sales.toLocaleString('id-ID')}</div>
                      </div>
                    </div>
                  ))}
                  {Object.keys(financialSummary.revenuePerPartner).length === 0 && (
                    <p className="text-xs text-muted text-center py-4">Belum ada data mitra.</p>
                  )}
                </div>
              ) : (
                <div className="p-6 bg-black/20 rounded-2xl text-center text-xs text-muted font-bold">
                  Data agregat seluruh mitra hanya dapat diakses oleh Super Admin. Anda sedang melihat transaksi bilik mitra Anda sendiri.
                </div>
              )}
            </div>
          </div>

          {/* Riwayat Transaksi Finansial Table Section */}
          <div className="bg-[#1E293B] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" /> Riwayat Transaksi Finansial
                </h3>
                <p className="text-xs text-muted font-bold mt-0.5">
                  Menampilkan {filteredTransactions.length} rekaman transaksi terisolasi
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadTransactions}
                  className="px-3.5 py-2 glass-panel rounded-xl hover:bg-white/5 text-xs font-bold text-foreground flex items-center gap-1.5 cursor-pointer"
                  title="Refresh Transaksi"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-primary" /> Refresh
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-primary text-[#10172A] rounded-xl hover:opacity-90 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,184,0,0.3)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari TRX / Sesi / Kiosk..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder-muted font-bold outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground font-bold outline-none focus:border-primary/50 cursor-pointer appearance-none"
                >
                  <option value="all">Semua Status</option>
                  <option value="paid">Paid (Sukses)</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div>
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground font-bold outline-none focus:border-primary/50 cursor-pointer appearance-none"
                >
                  <option value="all">Semua Metode</option>
                  <option value="qris">QRIS</option>
                  <option value="duitku">Duitku PG</option>
                  <option value="gopay">GoPay Merchant</option>
                  <option value="cash">Tunai / Cash</option>
                </select>
              </div>

              <div>
                <select
                  value={kioskFilter}
                  onChange={(e) => setKioskFilter(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground font-bold outline-none focus:border-primary/50 cursor-pointer appearance-none"
                >
                  <option value="all">Semua Kiosk</option>
                  {kiosks.map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-muted">
                    <th className="py-3 px-3">Kode TRX</th>
                    <th className="py-3 px-3">Sesi</th>
                    <th className="py-3 px-3">Kiosk</th>
                    <th className="py-3 px-3">Nominal</th>
                    <th className="py-3 px-3">Metode</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-foreground">{tx.transaction_code}</div>
                        {tx.is_simulated_reference && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 block mt-0.5">
                            Referensi Simulasi
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-muted">{tx.session_code}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-foreground truncate max-w-[140px]">{tx.kiosk_name}</div>
                        <div className="text-[9px] font-mono text-muted">{tx.kiosk_id}</div>
                      </td>
                      <td className="py-3 px-3 font-bold text-foreground whitespace-nowrap">
                        Rp {tx.amount.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 uppercase text-[10px] font-extrabold text-muted">
                        {tx.payment_method}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderStatusBadge(tx.status)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedTx(tx)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-primary hover:text-[#10172A] text-[10px] font-black uppercase tracking-wider transition-all ml-auto cursor-pointer"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted text-xs font-bold">
                        Tidak ada transaksi yang cocok dengan kriteria filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-xs text-muted font-bold">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-foreground"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-foreground"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1E293B] border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setSelectedTx(null)}
                className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <span className="text-[10px] font-black text-primary border border-primary/20 bg-primary/5 px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                  Detail Transaksi Finansial
                </span>
                <h3 className="text-2xl font-black tracking-tighter uppercase mt-2 text-foreground font-mono">
                  {selectedTx.transaction_code}
                </h3>
                {selectedTx.is_simulated_reference && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 block mt-1">
                    (Referensi Simulasi)
                  </span>
                )}
                <p className="text-xs text-muted font-bold mt-0.5">
                  Waktu: {new Date(selectedTx.created_at).toLocaleString('id-ID')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3.5 bg-black/20 p-4 rounded-2xl border border-white/5 text-xs">
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Sesi Terkait</span>
                  <span className="font-mono font-bold text-foreground">{selectedTx.session_code}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Nominal Transaksi</span>
                  <span className="font-bold text-foreground">Rp {selectedTx.amount.toLocaleString('id-ID')}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Metode Bayar</span>
                  <span className="font-extrabold uppercase text-foreground">{selectedTx.payment_method}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Status Pembayaran</span>
                  <div>{renderStatusBadge(selectedTx.status)}</div>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Kiosk Asal</span>
                  <span className="font-bold text-foreground block">{selectedTx.kiosk_name}</span>
                  <span className="text-[9px] text-muted font-mono">{selectedTx.kiosk_id}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Provider Terdeteksi</span>
                  <span className="font-bold text-foreground">{selectedTx.provider_detected || '-'}</span>
                </div>
                {selectedTx.failure_reason_code && (
                  <div className="col-span-2">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-0.5">Alasan Kegagalan</span>
                    <span className="font-bold text-red-400 font-mono">{selectedTx.failure_reason_code}</span>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-[11px] text-muted">
                  <strong className="text-foreground">Proteksi Mutasi Aktif:</strong> Aksi mutasi status (refund, override, capture) dikunci untuk menjamin integritas transaksi pelanggan.
                </p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
