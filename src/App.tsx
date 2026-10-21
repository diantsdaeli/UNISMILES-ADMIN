import React from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  History, 
  Sparkles, 
  Monitor, 
  BarChart3, 
  Users, 
  Settings, 
  Bell,
  Search,
  User,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { TemplateManagement } from './pages/TemplateManagement';
import { AIGenerator } from './pages/AIGenerator';
import { Storyboard } from './pages/Storyboard';
import { SessionRepository } from './pages/SessionRepository';
import { KioskManager } from './pages/KioskManager';
import { Analytics } from './pages/Analytics';
import { SettingsPage } from './pages/Settings';
import { UserManager } from './pages/UserManager';
import { Auth } from './pages/Auth';
import { Stickers } from './pages/Stickers';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { cn } from './lib/utils';

import { AuthProvider, useAuth, ErrorBoundary } from './components/AuthProvider';
import { Toaster, toast } from 'sonner';

import { TemplateProvider } from './TemplateContext';
import { KioskProvider } from './KioskContext';
import { SessionProvider } from './SessionContext';

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) {
    toast.error('Akses Ditolak: Halaman ini hanya dapat diakses oleh Super Admin.');
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppContent() {
  const { user, role, loading, isSuperAdmin, logout } = useAuth();
  const location = useLocation();

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#10172A]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-primary/60">Memverifikasi Sesi...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-primary/20 px-8 flex items-center justify-between bg-black/10 backdrop-blur-md z-40 neon-header-glow">
          <div className="relative w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
            <input 
              placeholder="Search anything..."
              className="w-full bg-white/5 border border-primary/10 rounded-xl pl-12 pr-4 py-2.5 outline-none focus:border-primary/40 transition-all text-sm font-medium focus:shadow-[0_0_15px_rgba(210,199,184,0.1)] text-foreground"
            />
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-[10px] font-extrabold tracking-widest border border-primary/30 text-primary neon-text-glow">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_currentColor]" />
              SYSTEM ONLINE
            </div>
            
            <button className="relative p-2.5 rounded-xl bg-white/5 border border-primary/20 hover:bg-white/10 transition-all text-muted hover:text-primary">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_currentColor]" />
            </button>
            
            <div className="h-8 w-px bg-white/10" />
            
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="text-right">
                <p className="text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {user.displayName || user.full_name || 'Admin'}
                </p>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary/60">
                  {isSuperAdmin ? 'Super Admin' : (user.partner_name ? `Mitra: ${user.partner_name}` : 'Admin Mitra')}
                </p>
              </div>
              <div className="relative group/avatar">
                <button className="w-10 h-10 rounded-xl bg-white/5 border border-primary/30 flex items-center justify-center hover:bg-white/10 transition-all overflow-hidden shadow-lg">
                  <img 
                    src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || 'unismiles'}`} 
                    alt="Avatar" 
                    className="w-full h-full object-cover" 
                  />
                </button>
                <div className="absolute right-0 top-full mt-3 w-48 glass-panel p-2 hidden group-hover/avatar:block animate-in fade-in slide-in-from-top-2 duration-200 border-primary/30 shadow-2xl">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard onNavigate={() => {}} />} />
            <Route path="/templates" element={<TemplateManagement />} />
            <Route path="/templates/stickers" element={<Stickers />} />
            <Route path="/ai-gen" element={<AIGenerator />} />
            <Route path="/storyboard" element={<Storyboard />} />
            <Route path="/sessions" element={<SessionRepository />} />
            <Route path="/kiosks" element={<KioskManager />} />
            <Route 
              path="/analytics" 
              element={
                <SuperAdminRoute>
                  <Analytics />
                </SuperAdminRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <SuperAdminRoute>
                  <UserManager />
                </SuperAdminRoute>
              } 
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" expand={false} richColors />
      <AuthProvider>
        <TemplateProvider>
          <KioskProvider>
            <SessionProvider>
              <AppContent />
            </SessionProvider>
          </KioskProvider>
        </TemplateProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}


const PlaceholderPage: React.FC<{ title: string; description: string; icon: any }> = ({ title, description, icon: Icon }) => (
  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-500">
    <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center rotate-12">
      <Icon className="w-12 h-12 text-primary -rotate-12" />
    </div>
    <div className="max-w-md">
      <h1 className="text-3xl font-display font-bold">{title}</h1>
      <p className="text-muted mt-2">{description}</p>
    </div>
    <button className="px-6 py-3 glass-panel hover:bg-foreground/5 transition-all font-bold text-sm">
      Coming Soon in v2.0
    </button>
  </div>
);
