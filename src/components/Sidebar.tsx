import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  History, 
  Sparkles, 
  Monitor, 
  BarChart3, 
  Users, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  Camera,
  Smile,
  Zap
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';

interface SidebarProps {
  role?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isSuperAdmin: authIsSuperAdmin } = useAuth();

  const isSuperAdmin = authIsSuperAdmin || role === 'Super Admin' || role === 'admin';
  const displayName = user?.displayName || user?.full_name || 'Admin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : (user?.partner_name ? `Mitra: ${user.partner_name}` : 'Admin Mitra');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || (isSuperAdmin ? 'SA' : 'AM');

  const menuItems = [
    { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', superAdminOnly: false },
    { id: 'templates', path: '/templates', icon: ImageIcon, label: 'Gallery', superAdminOnly: false },
    { id: 'sessions', path: '/sessions', icon: History, label: 'Sessions', superAdminOnly: false },
    { id: 'ai-gen', path: '/ai-gen', icon: Sparkles, label: 'AI Content', superAdminOnly: false },
    { id: 'storyboard', path: '/storyboard', icon: ImageIcon, label: 'Storyboard', superAdminOnly: false },
    { id: 'kiosks', path: '/kiosks', icon: Monitor, label: 'Kiosks', superAdminOnly: false },
    { id: 'analytics', path: '/analytics', icon: BarChart3, label: 'Analytics', superAdminOnly: true },
    { id: 'users', path: '/users', icon: Users, label: 'Users', superAdminOnly: true },
    { id: 'settings', path: '/settings', icon: Settings, label: 'Settings', superAdminOnly: false },
  ];

  const handleLogout = () => {
    logout();
  };

  const filteredItems = menuItems.filter(item => !item.superAdminOnly || isSuperAdmin);
  const activeId = menuItems.find(item => location.pathname.startsWith(item.path))?.id || 'dashboard';

  return (
    <aside 
      className={cn(
        "h-screen border-y-0 border-l-0 rounded-none flex flex-col transition-all duration-300 ease-in-out z-50 backdrop-blur-xl relative",
        "border-r border-white/10 shadow-[5px_0_30px_rgba(0,0,0,0.3)] bg-[#1E293B]",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(210,199,184,0.3)]">
          <Camera className="text-[#10172A] w-6 h-6" />
        </div>
        {!collapsed && (
          <span className="font-display font-black text-xl tracking-tighter text-foreground uppercase">
            Uni<span className="text-primary italic">Smiles</span>
          </span>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={cn(
              "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden sidebar-menu-hover",
              activeId === item.id 
                ? "bg-[#FFB800]/10 text-[#FFB800]" 
                : "text-muted hover:text-[#F1F5F9]"
            )}
          >
            {/* Vertical Indicator */}
            {activeId === item.id && (
              <motion.div 
                layoutId="activeIndicator"
                className="absolute left-0 w-1.5 h-6 bg-[#FFB800] rounded-r-full shadow-[4px_0_15px_rgba(255,184,0,0.4)]"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              />
            )}
            
            <item.icon className={cn(
              "w-5 h-5 transition-all duration-300 group-hover:scale-110",
              activeId === item.id ? "text-[#FFB800] scale-110 drop-shadow-[0_0_8px_rgba(255,184,0,0.3)]" : "text-muted"
            )} />
            {!collapsed && (
              <span className={cn(
                "font-black text-[10px] uppercase tracking-[0.2em] transition-colors",
                activeId === item.id ? "text-[#FFB800]" : "text-muted"
              )}>{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-6 py-4 mx-3 mb-2 bg-black/20 rounded-2xl border border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] border border-white/10 flex items-center justify-center overflow-hidden">
             <div className="w-full h-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xs">
               {initials}
             </div>
          </div>
          <div className="flex-1 overflow-hidden">
             <p className="text-[10px] font-black text-foreground uppercase tracking-tight truncate" title={displayName}>
               {displayName}
             </p>
             <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest truncate" title={roleLabel}>
               {roleLabel}
             </p>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-white/5 space-y-1">
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-4 py-3 text-muted hover:text-foreground transition-all rounded-xl hover:bg-white/5"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span className="font-bold text-sm">Minimize</span>}
        </button>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400/80 hover:text-red-400 transition-all rounded-xl hover:bg-red-500/10 group"
          title="Logout"
        >
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          {!collapsed && <span className="font-bold text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );
};
