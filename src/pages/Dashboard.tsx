import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  DollarSign,
  Activity,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Monitor,
  ShieldAlert,
  Database,
  Radio,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { toast } from 'sonner';
import {
  fetchDashboardData,
  DashboardData
} from '../lib/dashboardService';
import {
  getDataSourceMode,
  setDataSourceMode,
  DataSourceMode
} from '../lib/dataSourceConfig';

const COLORS = ['#FFB800', '#FF6B00', '#F1F5F9', '#475569', '#3B82F6'];

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = () => {
  const { user, isSuperAdmin } = useAuth();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [dataSourceMode, setDataSourceModeState] = useState<DataSourceMode>(getDataSourceMode());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync mode state jika ada event pergantian dari komponen/halaman lain
  useEffect(() => {
    const handleModeChange = (e: CustomEvent<DataSourceMode>) => {
      setDataSourceModeState(e.detail);
    };
    window.addEventListener('unismiles:datasource-change' as any, handleModeChange);
    return () => {
      window.removeEventListener('unismiles:datasource-change' as any, handleModeChange);
    };
  }, []);

  const handleToggleMode = (newMode: DataSourceMode) => {
    // Clear stale state segera untuk mencegah kebocoran data antar mode
    setData(null);
    setErrorMsg(null);
    setDataSourceMode(newMode);
    setDataSourceModeState(newMode);
    toast.info(`Beralih ke mode: ${newMode === 'SAFE_SIMULATION' ? 'SAFE SIMULATION' : 'AUTHORIZED READ-ONLY'}`);
  };

  useEffect(() => {
    // Request Race Guard: Batalkan request sebelumnya yang masih berjalan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let active = true;

    async function loadData() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const result = await fetchDashboardData({
          mode: dataSourceMode,
          range,
          userRole: user?.role || (isSuperAdmin ? 'Super Admin' : 'Admin Mitra'),
          partnerName: user?.partner_name,
          signal: controller.signal,
        });

        if (active) {
          setData(result);
          setErrorMsg(null);
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return; // Abaikan pembatalan request
        }
        if (active) {
          console.error("Dashboard data load error:", err);
          setData(null);
          const message = err?.message || "Gagal memuat data dashboard.";
          setErrorMsg(message);
          toast.error(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, dataSourceMode, user, isSuperAdmin]);

  const rangeLabel = range === '7' ? 'this week' : range === '30' ? 'this month' : 'last 90 days';

  const formatGrowth = (val: unknown) => {
    if (val === null || val === undefined) return '0%';
    const num = typeof val === 'number' && Number.isFinite(val) ? val : Number(val);
    if (!Number.isFinite(num) || num === 0) return '0%';
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const statsList = data ? [
    {
      label: 'Total Sessions',
      value: (Number(data.stats?.totalSessions?.value) || 0).toLocaleString(),
      icon: Activity,
      change: formatGrowth(data.stats?.totalSessions?.growth),
      trend: data.stats?.totalSessions?.trend || 'neutral'
    },
    {
      label: 'Photos Printed',
      value: (Number(data.stats?.photosPrinted?.value) || 0).toLocaleString(),
      icon: Printer,
      change: formatGrowth(data.stats?.photosPrinted?.growth),
      trend: data.stats?.photosPrinted?.trend || 'neutral'
    },
    {
      label: data.stats?.revenueToday?.label || (dataSourceMode === 'AUTHORIZED_READ_ONLY' ? 'Completed Sessions Revenue' : 'Verified Paid Revenue'),
      value: `Rp ${(Number(data.stats?.revenueToday?.value) || 0).toLocaleString('id-ID')}`,
      icon: DollarSign,
      change: formatGrowth(data.stats?.revenueToday?.growth),
      trend: data.stats?.revenueToday?.trend || 'neutral',
      sublabel: data.stats?.revenueToday?.sublabel || (dataSourceMode === 'AUTHORIZED_READ_ONLY' ? 'Agregat backend: status = completed' : 'Berdasarkan status pembayaran paid')
    },
    {
      label: 'Active Kiosks',
      value: `${data.stats?.activeKiosks?.online ?? 0}/${data.stats?.activeKiosks?.total ?? 0}`,
      icon: Monitor,
      change: data.stats?.activeKiosks?.offline ? `${data.stats.activeKiosks.offline} Off` : 'Stable',
      trend: data.stats?.activeKiosks?.offline ? 'down' : 'up'
    },
  ] : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header with Data Source Mode Selector */}
      <header className="mb-8 border-b border-white/5 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 text-primary">Dashboard</h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            Operations Intelligence — {user?.displayName || user?.full_name || 'Admin'} {user?.partner_name ? `(${user.partner_name})` : ''}
          </p>
        </div>

        {/* Data Source Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all",
            dataSourceMode === 'SAFE_SIMULATION'
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              dataSourceMode === 'SAFE_SIMULATION' ? "bg-amber-400" : "bg-emerald-400"
            )} />
            <span>
              {dataSourceMode === 'SAFE_SIMULATION' ? '• SAFE SIMULATION' : '• AUTHORIZED READ-ONLY'}
            </span>
          </div>

          <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => handleToggleMode('SAFE_SIMULATION')}
              className={cn(
                "px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                dataSourceMode === 'SAFE_SIMULATION'
                  ? "bg-amber-500/20 text-amber-300 font-bold"
                  : "text-muted hover:text-foreground"
              )}
            >
              Simulasi
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('AUTHORIZED_READ_ONLY')}
              className={cn(
                "px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                dataSourceMode === 'AUTHORIZED_READ_ONLY'
                  ? "bg-emerald-500/20 text-emerald-300 font-bold"
                  : "text-muted hover:text-foreground"
              )}
            >
              Backend Live
            </button>
          </div>
        </div>
      </header>

      {/* Fail-Closed Error State (HTTP 401/403 or Network Error) */}
      {errorMsg && (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-3xl space-y-4 animate-in fade-in duration-300">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-500/20 rounded-2xl text-red-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-black uppercase tracking-tight text-red-400">
                Akses Backend Gagal (Fail-Closed Enforcement)
              </h3>
              <p className="text-xs text-red-200/80 mt-1 leading-relaxed">
                {errorMsg}
              </p>
              <p className="text-[10px] text-muted font-mono mt-2">
                Sesuai kebijakan keamanan Modul 8B: Sistem menolak melakukan fallback diam-diam ke mock saat terjadi kegagalan autentikasi atau jaringan.
              </p>
            </div>
            <button
              onClick={() => handleToggleMode('SAFE_SIMULATION')}
              className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold text-xs rounded-xl uppercase tracking-wider transition-all"
            >
              Beralih ke Safe Simulation
            </button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="h-[400px] flex items-center justify-center bg-[#020617] p-8 rounded-[3.5rem] border border-white/5">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,184,0,0.2)]" />
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse">
              Memuat Data Dashboard ({dataSourceMode === 'SAFE_SIMULATION' ? 'Simulasi' : 'GET /api/v1/admin/dashboard'})...
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !errorMsg && (!data || !data.hasData) && (
        <div className="h-[calc(100vh-16rem)] flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-500 bg-[#020617] p-8 rounded-[3.5rem] border border-white/5">
          <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center rotate-12">
            <Activity className="w-12 h-12 text-primary -rotate-12" />
          </div>
          <div className="max-w-md">
            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none text-foreground">No session data available yet</h1>
            <p className="text-muted text-[10px] font-black uppercase tracking-widest mt-2">
              Check back later once kiosks start capturing photo sessions.
            </p>
          </div>
        </div>
      )}

      {/* Main Dashboard Grid */}
      {!loading && !errorMsg && data && data.hasData && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statsList.map((stat, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={stat.label}
                className="bg-[#1E293B] border border-white/5 p-6 rounded-3xl group transition-all duration-500 hover:border-primary/30 shadow-xl"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-primary/10 transition-colors">
                    <stat.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full tracking-widest uppercase",
                    stat.trend === 'up' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    stat.trend === 'down' ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-white/5 text-muted border border-white/5"
                  )}>
                    {stat.trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
                    {stat.trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
                    {stat.change}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-muted text-[10px] font-black uppercase tracking-[0.2em]">{stat.label}</h3>
                  <p className="text-3xl font-black mt-1 tracking-tighter text-foreground">{stat.value}</p>
                  {(stat as any).sublabel && (
                    <p className="text-[9px] text-muted/70 font-semibold mt-1 tracking-tight leading-snug">
                      {(stat as any).sublabel}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Charts Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#1E293B] border border-white/5 p-8 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-black text-xl tracking-tighter uppercase">Revenue Overview</h3>
                  {dataSourceMode === 'AUTHORIZED_READ_ONLY' ? (
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider mt-0.5">
                      Endpoint Resmi GET /api/v1/admin/dashboard (Agregat Sesi Selesai)
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider mt-0.5">
                      Simulasi Pendapatan Terverifikasi (Sesi 8821 & 8824)
                    </p>
                  )}
                </div>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as any)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none text-muted focus:border-primary/50 transition-all cursor-pointer"
                >
                  <option value="7" className="bg-[#1E293B]">Last 7 Days</option>
                  <option value="30" className="bg-[#1E293B]">Last 30 Days</option>
                  <option value="90" className="bg-[#1E293B]">Last 90 Days</option>
                </select>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueChart}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFB800" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FFB800" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 184, 0, 0.05)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="currentColor"
                      className="text-muted"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                      tickFormatter={(value) => {
                        try {
                          const parts = value.split('-');
                          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                          return `${parts[2]} ${months[parseInt(parts[1]) - 1]}`;
                        } catch {
                          return value;
                        }
                      }}
                    />
                    <YAxis
                      stroke="currentColor"
                      className="text-muted"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `Rp ${value >= 1000000 ? (value/1000000).toFixed(1) + 'jt' : (value/1000).toFixed(0) + 'rb'}`}
                    />
                    <Tooltip
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Revenue']}
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid rgba(255, 184, 0, 0.2)',
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        color: '#F1F5F9'
                      }}
                      itemStyle={{ color: '#FFB800' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#FFB800"
                      strokeWidth={4}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#1E293B] border border-white/5 p-8 rounded-3xl shadow-xl flex flex-col">
              <h3 className="font-black text-xl tracking-tighter uppercase mb-8">Popularity</h3>
              <div className="flex-1 flex flex-col justify-center">
                {data.popularityChart && data.popularityChart.length > 0 ? (
                  <>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.popularityChart}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={8}
                            dataKey="value"
                          >
                            {data.popularityChart.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any) => [`${value}%`, 'Popularity']}
                            contentStyle={{
                              backgroundColor: '#1E293B',
                              border: '1px solid rgba(255, 184, 0, 0.2)',
                              borderRadius: '16px',
                              color: '#F1F5F9'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 mt-8">
                      {data.popularityChart.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }} />
                            <span className="text-muted">{item.name}</span>
                          </div>
                          <span className="text-foreground">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-muted text-[10px] font-bold uppercase tracking-wider">
                      {dataSourceMode === 'AUTHORIZED_READ_ONLY'
                        ? 'Detail popularitas frame tidak disertakan pada kontrak GET /admin/dashboard.'
                        : 'No template data this period'}
                    </p>
                    {dataSourceMode === 'AUTHORIZED_READ_ONLY' && (
                      <p className="text-[9px] text-muted/60">
                        Gunakan tab Gallery Templates atau Analytics untuk data mendalam.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#1E293B] border border-white/5 p-8 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-black text-xl tracking-tighter uppercase">Kiosk Status</h3>
                  <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">
                    {dataSourceMode === 'AUTHORIZED_READ_ONLY' ? 'Agregat Telemetri Kiosk Backend' : 'Daftar Kiosk Simulasi'}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {data.kioskStatus.map((kiosk) => (
                  <div key={kiosk.id} className="flex items-center justify-between p-5 bg-black/20 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-3 h-3 rounded-full animate-pulse shadow-[0_0_8px_currentColor]",
                        kiosk.status === 'online' ? "bg-emerald-400 text-emerald-400" :
                        kiosk.status === 'idle' ? "bg-amber-400 text-amber-400" :
                        kiosk.status === 'restarting' ? "bg-blue-400 text-blue-400" : "bg-red-400 text-red-400"
                      )} />
                      <div>
                        <h4 className="font-black text-sm tracking-tight uppercase text-foreground">{kiosk.name}</h4>
                        <p className="text-[10px] text-muted font-black uppercase tracking-widest">{kiosk.location}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">{kiosk.status}</p>
                      <p className="text-[10px] text-muted/60 font-bold uppercase mt-0.5">
                        {kiosk.lastSeen}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#1E293B] border border-white/5 p-8 rounded-3xl shadow-xl flex flex-col justify-center items-center text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center shadow-xl rotate-12">
                <Star className="w-10 h-10 text-primary -rotate-12" />
              </div>
              <div>
                <h3 className="font-black text-2xl tracking-tighter uppercase">Top Template</h3>
                {data.topTemplate ? (
                  <>
                    <p className="text-xl font-black tracking-tight text-foreground uppercase mt-2">{data.topTemplate.name}</p>
                    <p className="text-muted mt-1 font-bold">Used {data.topTemplate.usageCount} times {rangeLabel}!</p>
                  </>
                ) : (
                  <p className="text-muted mt-1 font-bold text-xs uppercase tracking-wider">
                    {dataSourceMode === 'AUTHORIZED_READ_ONLY'
                      ? 'Tersedia melalui analitik frame templates.'
                      : 'No template usage in this period.'}
                  </p>
                )}
              </div>
              {data.topTemplate && (
                <div className="w-full max-w-[180px] aspect-[3/4] rounded-2xl overflow-hidden border-2 border-primary/20 shadow-2xl rotate-3 transition-transform hover:rotate-0 duration-500">
                  <img
                    src={
                      data.topTemplate.name.includes("Graduation") ? "https://picsum.photos/seed/graduation/400/600" :
                      data.topTemplate.name.includes("Wedding") ? "https://picsum.photos/seed/wedding/400/600" :
                      data.topTemplate.name.includes("Birthday") ? "https://picsum.photos/seed/bdayframe/400/600" :
                      data.topTemplate.name.includes("Corporate") ? "https://picsum.photos/seed/corporate/400/600" :
                      "https://picsum.photos/seed/retro/400/600"
                    }
                    alt="Top Template"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
