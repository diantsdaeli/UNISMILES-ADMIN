import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  MoreVertical,
  Edit2,
  Trash2,
  Key,
  Power,
  Eye,
  EyeOff,
  X,
  Check,
  ChevronDown,
  Building2,
  Monitor,
  Calendar,
  Filter,
  Info,
  Zap,
  AlertCircle,
  Sparkles,
  Lock,
  RefreshCw,
  Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../components/AuthProvider';
import {
  userService,
  UserRecord,
  Role,
  ServiceMode,
  KIOSK_REGISTRY,
  resolveKioskName,
  resolveKioskId,
  generateSecurePassword,
  validateAdminMitraPayload
} from '../lib/userService';
import { getDataSourceMode, setDataSourceMode, DataSourceMode } from '../lib/dataSourceConfig';

interface RoleDefinition {
  name: Role;
  description: string;
  access: string[];
}

// --- Constants & Defaults ---

const ROLES_STORAGE_KEY = 'unismiles_roles';
const CURRENT_USER_SIM_KEY = 'unismiles_current_user';

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    name: 'Super Admin',
    description: 'Uni Inside internal team with full platform access.',
    access: [
      'Manage all partners', 'Manage all kiosks', 'Manage all templates',
      'Manage all sessions', 'Manage all analytics', 'Manage users and roles',
      'Configure system settings', 'Assist partner operations'
    ]
  },
  {
    name: 'Admin Mitra',
    description: 'Partner account that manages only assigned business and kiosks.',
    access: [
      'View own dashboard', 'Manage own templates', 'Manage own AI content',
      'Manage own storyboard layouts', 'View own sessions', 'View own analytics',
      'Configure assigned kiosks', 'Manage own photo filters and branding'
    ]
  },
  {
    name: 'Viewer',
    description: 'Read-only account for partners who only need reports.',
    access: [
      'View dashboard', 'View sessions', 'View analytics', 'Export reports'
    ]
  }
];

const PERMISSION_MATRIX = [
  { feature: 'Dashboard', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'Templates', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Sessions', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'AI Content', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Storyboard', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Kiosks', super: 'Full Access', mitra: 'Assigned Only', viewer: 'View Only' },
  { feature: 'Analytics', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'Stickers & Icons', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Photo Filters', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Settings', super: 'Full Access', mitra: 'Branding Only', viewer: 'No Access' },
  { feature: 'Users', super: 'Full Access', mitra: 'No Access', viewer: 'No Access' },
];

export const UserManager: React.FC = () => {
  const { user: authUser, role: authRole } = useAuth();
  const currentRole = authRole || authUser?.role || 'Super Admin';

  // --- State ---
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSourceMode, setModeState] = useState<DataSourceMode>(getDataSourceMode());
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);

  const [roles] = useState<RoleDefinition[]>(() => {
    const saved = localStorage.getItem(ROLES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_ROLES;
  });

  const [currentUserSim, setCurrentUserSim] = useState(() => {
    return localStorage.getItem(CURRENT_USER_SIM_KEY) || 'Uni Inside Owner';
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All Roles');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Form State
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Admin Mitra' as Role,
    partner: '',
    serviceMode: 'Self-managed' as ServiceMode,
    assignedKiosks: [] as string[],
    assignedKioskIds: [] as string[],
    status: 'Active' as 'Active' | 'Inactive',
    notes: ''
  });

  // --- Load Data ---
  const loadUsers = useCallback(async (mode: DataSourceMode) => {
    setLoading(true);
    try {
      const result = await userService.getUsers({
        mode,
        currentUserRole: currentRole
      });

      if (result.status === 'unsupported') {
        setUsers([]);
        setUnsupportedMessage(result.message || 'Endpoint belum tersedia di backend.');
      } else {
        setUsers(result.users);
        setUnsupportedMessage(null);
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      toast.error(err?.message || 'Gagal memuat direktori pengguna.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [currentRole]);

  useEffect(() => {
    loadUsers(dataSourceMode);
  }, [loadUsers, dataSourceMode]);

  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<DataSourceMode>;
      if (customEvent.detail) {
        setModeState(customEvent.detail);
      }
    };
    window.addEventListener('unismiles:datasource-change', handleModeChange);
    return () => window.removeEventListener('unismiles:datasource-change', handleModeChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(CURRENT_USER_SIM_KEY, currentUserSim);
  }, [currentUserSim]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // --- Computed ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.partner.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === 'All Roles' || u.role === roleFilter;
      const matchStatus = statusFilter === 'All Status' || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      superAdmins: users.filter(u => u.role === 'Super Admin').length,
      adminMitra: users.filter(u => u.role === 'Admin Mitra').length,
      activePartners: new Set(users.map(u => u.partner).filter(p => p && p !== 'All Partners')).size
    };
  }, [users]);

  // --- Handlers ---
  const handleOpenModal = (userToEdit?: UserRecord) => {
    setShowPassword(false);
    if (userToEdit) {
      setEditingUser(userToEdit);
      setFormData({
        name: userToEdit.name,
        email: userToEdit.email,
        password: '', // Password tidak pernah ditampilkan saat edit
        role: userToEdit.role,
        partner: userToEdit.partner,
        serviceMode: userToEdit.serviceMode,
        assignedKiosks: userToEdit.assignedKiosks || [],
        assignedKioskIds: userToEdit.assignedKioskIds || [],
        status: userToEdit.status,
        notes: userToEdit.notes || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'Admin Mitra',
        partner: '',
        serviceMode: 'Self-managed',
        assignedKiosks: [],
        assignedKioskIds: [],
        status: 'Active',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    // KEAMANAN: Hapus password dari state form segera setelah modal ditutup
    setFormData(prev => ({ ...prev, password: '' }));
    setShowPassword(false);
    setIsModalOpen(false);
  };

  const handleGeneratePassword = () => {
    const pwd = generateSecurePassword(12);
    if (pwd) {
      setFormData(prev => ({ ...prev, password: pwd }));
      setShowPassword(true);
      toast.info('Kata sandi acak berbasis Web Crypto berhasil digenerate.');
    } else {
      toast.error('Web Crypto API tidak tersedia pada browser Anda.');
    }
  };

  const handleSaveUser = async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.role) {
      toast.error('Nama Lengkap, Email, dan Role wajib diisi.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error('Format email tidak valid.');
      return;
    }

    if ((formData.role === 'Admin Mitra' || formData.role === 'Viewer') && !formData.partner.trim()) {
      toast.error('Nama Mitra / Business Name wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        // Mode Edit User
        const result = await userService.updateUser(
          editingUser.id,
          {
            name: formData.name,
            email: formData.email,
            role: formData.role,
            partner: formData.partner,
            serviceMode: formData.serviceMode,
            assignedKiosks: formData.assignedKiosks,
            assignedKioskIds: formData.assignedKioskIds,
            status: formData.status,
            notes: formData.notes
          },
          currentRole
        );

        setUsers(users.map(u => u.id === editingUser.id ? result.user : u));
        toast.success(result.message);
        handleCloseModal();
      } else {
        // Mode Pembuatan User Baru
        if (formData.role === 'Admin Mitra') {
          const result = await userService.createAdminMitra(
            {
              full_name: formData.name,
              email: formData.email,
              password: formData.password,
              partner_name: formData.partner,
              assignedKioskIds: formData.assignedKioskIds,
              serviceMode: formData.serviceMode,
              notes: formData.notes
            },
            currentRole
          );

          setUsers(prev => [result.user, ...prev]);
          toast.success(result.message);
          handleCloseModal();
        } else {
          // Simulasi pembuatan Super Admin / Viewer
          const newSimRecord: UserRecord = {
            id: String(Date.now()),
            name: formData.name.trim(),
            email: formData.email.trim(),
            role: formData.role,
            partner: formData.role === 'Super Admin' ? 'All Partners' : formData.partner.trim(),
            serviceMode: formData.serviceMode,
            assignedKiosks: formData.role === 'Super Admin' ? ['All Kiosks'] : formData.assignedKiosks,
            assignedKioskIds: formData.role === 'Super Admin' ? ['KSK-ALL'] : formData.assignedKioskIds,
            status: formData.status,
            lastActive: 'Just now',
            notes: formData.notes,
            isSimulated: true
          };

          setUsers(prev => [newSimRecord, ...prev]);
          toast.success(`Pengguna (${formData.role}) berhasil ditambahkan (SAFE SIMULATION).`);
          handleCloseModal();
        }
      }
    } catch (err: any) {
      console.error('Error saving user:', err);
      toast.error(err?.message || 'Gagal menyimpan data pengguna.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;

    if (window.confirm(`Yakin ingin menghapus personel ${userToDelete.name}? (Simulasi Lokal)`)) {
      try {
        const result = await userService.deleteUser(id, currentRole);
        setUsers(prev => prev.filter(u => u.id !== id));
        toast.success(result.message);
      } catch (err: any) {
        console.error('Error deleting user:', err);
        toast.error(err?.message || 'Gagal menghapus pengguna.');
      }
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const result = await userService.toggleUserStatus(id, currentRole);
      setUsers(prev => prev.map(u => u.id === id ? result.user : u));
      toast.success(result.message);
    } catch (err: any) {
      console.error('Error toggling status:', err);
      toast.error(err?.message || 'Gagal mengubah status akun.');
    }
  };

  const handleResetPassword = (email: string) => {
    toast.info(`Tautan reset password berhasil digenerate untuk ${email}. (Simulasi: tidak ada email terkirim).`);
  };

  const handleSwitchToSimulation = () => {
    setDataSourceMode('SAFE_SIMULATION');
    setModeState('SAFE_SIMULATION');
    toast.success('Beralih ke mode SAFE SIMULATION.');
  };

  const currentSimUser = users.find(u => u.name === currentUserSim) || users[0] || {
    id: "fallback",
    name: currentUserSim,
    email: "owner@uniinside.com",
    role: "Super Admin",
    partner: "All Partners",
    serviceMode: "Platform Owner",
    assignedKiosks: ["All Kiosks"],
    assignedKioskIds: ["KSK-ALL"],
    status: "Active",
    lastActive: "Today"
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header & Source Mode Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 text-foreground">Personnel</h1>
            <span className={cn(
              "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
              dataSourceMode === 'SAFE_SIMULATION'
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
            )}>
              {dataSourceMode === 'SAFE_SIMULATION' ? '• SAFE SIMULATION' : '• AUTHORIZED READ-ONLY'}
            </span>
          </div>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Identity Governance & System Permissions</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary flex items-center gap-3 px-8 shadow-xl"
          >
            <UserPlus className="w-5 h-5" />
            Add Personnel
          </button>
        </div>
      </div>

      {/* Unsupported Backend Banner (jika dalam mode AUTHORIZED_READ_ONLY) */}
      {unsupportedMessage && (
        <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide text-foreground">Endpoint /api/v1/users Belum Tersedia</h4>
              <p className="text-xs text-muted font-bold mt-1 max-w-2xl leading-relaxed">
                {unsupportedMessage}
              </p>
            </div>
          </div>
          <button
            onClick={handleSwitchToSimulation}
            className="px-6 py-3 bg-amber-500 text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            Beralih ke SAFE SIMULATION
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Nodes', value: stats.total, icon: Users, color: 'text-[#FFB800]' },
          { label: 'Governance', value: stats.superAdmins, icon: ShieldCheck, color: 'text-blue-400' },
          { label: 'Business Ops', value: stats.adminMitra, icon: Building2, color: 'text-emerald-400' },
          { label: 'Active Orgs', value: stats.activePartners, icon: Monitor, color: 'text-primary' }
        ].map((s, idx) => (
          <div key={idx} className="bg-[#1E293B] border border-white/5 p-8 rounded-3xl group hover:border-primary/40 transition-all shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-muted uppercase tracking-[0.3em]">{s.label}</p>
                <h3 className="text-3xl font-black mt-3 text-foreground tracking-tighter">{s.value}</h3>
              </div>
              <div className={cn("p-4 bg-white/5 rounded-2xl group-hover:bg-primary/10 transition-all", s.color)}>
                <s.icon className="w-8 h-8" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Actions & Table */}
      <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 bg-black/10 flex flex-col md:flex-row items-center gap-6">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search directory by name, email, or partner network..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-primary/40 transition-all text-sm font-black text-foreground"
            />
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group w-full md:w-56">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-11 pr-10 py-4 outline-none focus:border-primary/40 transition-all text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer text-foreground"
              >
                <option value="All Roles" className="bg-[#1E293B]">All Roles</option>
                <option value="Super Admin" className="bg-[#1E293B]">Super Admin</option>
                <option value="Admin Mitra" className="bg-[#1E293B]">Admin Mitra</option>
                <option value="Viewer" className="bg-[#1E293B]">Viewer</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            </div>

            <div className="relative group w-full md:w-56">
              <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-11 pr-10 py-4 outline-none focus:border-primary/40 transition-all text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer text-foreground"
              >
                <option value="All Status" className="bg-[#1E293B]">All Status</option>
                <option value="Active" className="bg-[#1E293B]">Active</option>
                <option value="Inactive" className="bg-[#1E293B]">Inactive</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto select-none">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center gap-4 text-muted">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-black uppercase tracking-widest">Memuat Direktori Personel...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-16 text-center text-muted">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">Tidak ada data personel yang cocok dengan filter.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-[9px] font-black text-muted uppercase tracking-[0.2em]">
                  <th className="px-8 py-6">Personnel Info</th>
                  <th className="px-8 py-6">Governance/Role</th>
                  <th className="px-8 py-6">Network/Partner</th>
                  <th className="px-8 py-6">Assigned Kiosks</th>
                  <th className="px-8 py-6">Connectivity</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={cn(
                      "group hover:bg-white/5 transition-all",
                      user.status === 'Inactive' && "opacity-40 grayscale"
                    )}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[#FFB800] font-black border border-white/5 group-hover:border-primary/40 transition-all">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-foreground tracking-tight uppercase">{user.name}</span>
                            {user.isSimulated && (
                              <span className="text-[8px] font-black px-2 py-0.5 rounded bg-white/5 text-muted border border-white/10 uppercase tracking-widest">
                                SIMULASI
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted font-black uppercase tracking-widest opacity-60">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest",
                        user.role === 'Super Admin' ? "bg-[#FFB800]/10 border-[#FFB800]/20 text-[#FFB800]" :
                        user.role === 'Admin Mitra' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                        "bg-white/5 border-white/10 text-muted"
                      )}>
                        {user.role}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{user.partner}</div>
                      <div className="text-[8px] font-bold text-muted uppercase tracking-wider">{user.serviceMode}</div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {user.assignedKiosks && user.assignedKiosks.length > 0 ? (
                          user.assignedKiosks.map((kiosk, idx) => (
                            <span
                              key={idx}
                              className="text-[8px] px-2.5 py-1 bg-white/5 text-muted border border-white/10 rounded-lg font-bold uppercase tracking-wider"
                            >
                              {kiosk}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] text-muted italic">Tidak ada kiosk</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            user.status === 'Active' ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                          )} />
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            user.status === 'Active' ? "text-emerald-400" : "text-muted"
                          )}>
                            {user.status === 'Active' ? 'Verified Online' : 'System Offline'}
                          </span>
                        </div>
                        <span className="text-[8px] text-muted font-black uppercase opacity-40">Sync: {user.lastActive}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-3 bg-white/5 hover:bg-[#FFB800]/10 hover:text-[#FFB800] rounded-2xl transition-all text-muted"
                          title="Modify"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id)}
                          className={cn(
                            "p-3 rounded-2xl transition-all",
                            user.status === 'Active'
                              ? "bg-white/5 text-muted hover:bg-red-500/10 hover:text-red-400"
                              : "bg-white/5 text-muted hover:bg-emerald-500/10 hover:text-emerald-400"
                          )}
                          title={user.status === 'Active' ? "Disable Access (Simulated)" : "Grant Access (Simulated)"}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === user.id ? null : user.id);
                            }}
                            className="p-3 bg-white/5 text-muted hover:text-foreground transition-all rounded-2xl cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          <div className={cn(
                            "absolute right-0 bottom-full mb-3 w-48 bg-[#1E293B] border border-white/5 p-2 z-50 shadow-2xl rounded-2xl transition-all",
                            activeDropdownId === user.id ? "block" : "hidden"
                          )}>
                            <button
                              onClick={() => handleResetPassword(user.email)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted hover:text-foreground hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                            >
                              <Key className="w-4 h-4" /> New Credentials
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" /> Hapus User
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Role & Permission Matrix */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-4">
            <Shield className="w-6 h-6 text-[#FFB800]" />
            <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Permission Matrix</h2>
          </div>

          <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-black text-muted uppercase tracking-[0.2em] bg-black/10">
                    <th className="px-6 py-5 rounded-tl-3xl">System Module</th>
                    <th className="px-6 py-5 text-center">Super Admin</th>
                    <th className="px-6 py-5 text-center">Admin Mitra</th>
                    <th className="px-6 py-5 text-center rounded-tr-3xl">Viewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {PERMISSION_MATRIX.map((p, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4 text-[10px] font-black text-foreground uppercase tracking-widest">{p.feature}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[8px] font-black px-3 py-1 rounded-full bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 uppercase tracking-widest">
                          {p.super}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-[8px] font-black px-3 py-1 rounded-full border uppercase tracking-widest",
                          p.mitra === 'No Access' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}>
                          {p.mitra}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-[8px] font-black px-3 py-1 rounded-full border uppercase tracking-widest",
                          p.viewer === 'No Access' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-white/5 border-white/10 text-muted"
                        )}>
                          {p.viewer}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Access Simulation */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Zap className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Simulation</h2>
          </div>

          <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[80px] -translate-y-24 translate-x-24 rounded-full group-hover:bg-primary/10 transition-all duration-1000" />

            <div className="space-y-8 relative z-10">
              <div className="space-y-4">
                <label className="text-[9px] font-black text-muted uppercase tracking-[0.3em] ml-1">Identity Simulation</label>
                <div className="relative">
                  <select
                    value={currentUserSim}
                    onChange={(e) => setCurrentUserSim(e.target.value)}
                    className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 appearance-none font-black text-xs text-foreground uppercase tracking-widest cursor-pointer"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.name} className="bg-[#1E293B]">{u.name.toUpperCase()} / {u.role.toUpperCase()}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                </div>
              </div>

              <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 space-y-6 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Info className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Policy Intelligence</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed font-bold uppercase tracking-wider">
                  {currentSimUser.role === 'Super Admin' && "Governance Node: Full administrative authority over all partners, kiosks, users, systems, and cryptographic protocols."}
                  {currentSimUser.role === 'Admin Mitra' && "Partner Node: Restricted authority limited to owned business vertical, assigned kiosk infrastructure, and local assets."}
                  {currentSimUser.role === 'Viewer' && "Observer Node: Read-only access to analytics telemetry without modification privileges to platform state."}
                </p>
                <div className="pt-4 border-t border-white/5">
                  <div className="text-[8px] font-black text-muted uppercase tracking-[0.3em] mb-4">Core Privileges:</div>
                  <div className="flex flex-wrap gap-2">
                    {roles.find(r => r.name === currentSimUser.role)?.access.slice(0, 4).map((a, i) => (
                      <span key={i} className="text-[8px] px-3 py-1.5 bg-primary/5 text-primary rounded-xl border border-primary/20 font-black uppercase tracking-widest">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Personnel Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 border-primary/30 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button
                onClick={handleCloseModal}
                className="absolute top-6 right-6 text-muted hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-primary/10 rounded-xl">
                  {editingUser ? <Edit2 className="w-6 h-6 text-primary" /> : <UserPlus className="w-6 h-6 text-primary" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h2>
                  <p className="text-xs text-muted font-medium italic">
                    {editingUser
                      ? 'Perbarui identitas, peran, dan hak akses pengguna.'
                      : 'Buat akun Admin Mitra atau personel baru (Kontrak: POST /api/v1/admin/admin-mitra).'}
                  </p>
                </div>
              </div>

              {/* Safe Simulation notice inside modal */}
              <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0" />
                <p className="text-[11px] font-bold text-foreground">
                  <span className="text-primary font-black uppercase">SAFE SIMULATION:</span> Operasi pembuatan dan perubahan akun dijalankan secara aman pada memori lokal untuk melindungi basis data produksi.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Budi Santoso"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold text-foreground"
                  />
                </div>

                {/* Password field khusus saat pembuatan Admin Mitra baru */}
                {!editingUser && formData.role === 'Admin Mitra' && (
                  <div className="md:col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-primary" />
                        Password Akun Mitra <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="text-[9px] font-black uppercase text-primary hover:underline flex items-center gap-1.5"
                      >
                        <Zap className="w-3 h-3" /> Generate Secure Password
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Minimal 8 karakter"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 outline-none focus:border-primary/40 text-sm font-bold text-foreground font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[9px] text-muted italic">
                      * Password akan di-hash menggunakan bcrypt(salt 10) di backend. Password tidak disimpan plain-text di browser.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Role</label>
                  <div className="relative">
                    <select
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value as Role;
                        setFormData(prev => ({
                          ...prev,
                          role: newRole,
                          partner: newRole === 'Super Admin' ? 'All Partners' : (prev.partner === 'All Partners' ? '' : prev.partner)
                        }));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm text-foreground cursor-pointer"
                    >
                      <option value="Admin Mitra" className="bg-[#1E293B]">Admin Mitra (Partner)</option>
                      <option value="Super Admin" className="bg-[#1E293B]">Super Admin (Governance)</option>
                      <option value="Viewer" className="bg-[#1E293B]">Viewer (Read-only)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">
                    Business / Partner Name {formData.role !== 'Super Admin' && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kafe Senja"
                    disabled={formData.role === 'Super Admin'}
                    value={formData.partner}
                    onChange={(e) => setFormData(prev => ({ ...prev, partner: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold disabled:opacity-50 text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Service Mode</label>
                  <div className="relative">
                    <select
                      value={formData.serviceMode}
                      onChange={(e) => setFormData(prev => ({ ...prev, serviceMode: e.target.value as ServiceMode }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm text-foreground cursor-pointer"
                    >
                      <option value="Self-managed" className="bg-[#1E293B]">Self-managed</option>
                      <option value="Managed by Uni Inside" className="bg-[#1E293B]">Managed by Uni Inside</option>
                      <option value="View Only" className="bg-[#1E293B]">View Only</option>
                      <option value="Platform Owner" className="bg-[#1E293B]">Platform Owner</option>
                      <option value="Managed Support" className="bg-[#1E293B]">Managed Support</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Account Status</label>
                  <div className="relative">
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'Active' | 'Inactive' }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm text-foreground cursor-pointer"
                    >
                      <option value="Active" className="bg-[#1E293B]">Active (Akses Diberikan)</option>
                      <option value="Inactive" className="bg-[#1E293B]">Inactive (Akses Dinonaktifkan)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">
                    Assigned Kiosks (Relational Ownership)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {KIOSK_REGISTRY.map(k => {
                      const isSelected = formData.assignedKioskIds.includes(k.id) || formData.assignedKiosks.includes(k.name);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => {
                            let nextIds = [...formData.assignedKioskIds];
                            let nextNames = [...formData.assignedKiosks];
                            if (isSelected) {
                              nextIds = nextIds.filter(id => id !== k.id);
                              nextNames = nextNames.filter(name => name !== k.name);
                            } else {
                              nextIds = [...nextIds, k.id];
                              nextNames = [...nextNames, k.name];
                            }
                            setFormData(prev => ({
                              ...prev,
                              assignedKioskIds: nextIds,
                              assignedKiosks: nextNames
                            }));
                          }}
                          className={cn(
                            "px-3 py-2.5 rounded-xl border text-[10px] font-bold text-left transition-all",
                            isSelected
                              ? "bg-primary/20 border-primary/40 text-primary"
                              : "bg-white/5 border-white/10 text-muted hover:border-white/20"
                          )}
                        >
                          <div className="font-black text-foreground">{k.name}</div>
                          <div className="text-[8px] text-muted font-mono">{k.id} • {k.location}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-muted italic">* Super Admins otomatis memiliki akses ke seluruh kiosk.</p>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Internal Notes</label>
                  <textarea
                    placeholder="Tambahkan catatan khusus untuk akun personel ini..."
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-medium min-h-[80px] resize-none text-foreground"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-foreground font-bold rounded-xl hover:bg-white/10 transition-all font-display"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveUser}
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,140,102,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all font-display flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      {editingUser ? 'Save Changes' : 'Create User'}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
