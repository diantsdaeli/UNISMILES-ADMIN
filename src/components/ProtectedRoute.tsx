import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { toast } from 'sonner';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'super_admin' | 'admin_mitra' | string;
}

/**
 * Komponen Pengawal Rute Terproteksi
 * Memastikan akses ke rute hanya diizinkan jika sesi token telah diverifikasi sah oleh backend.
 * Mencegah flash konten Super Admin untuk sesi lokal yang tidak valid.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, isAuthenticated, loading, sessionVerified, isSuperAdmin } = useAuth();
  const location = useLocation();

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

  // Jika belum login atau sesi tidak sah
  if (!user || !isAuthenticated || !sessionVerified) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Jika rute mensyaratkan hak akses Super Admin
  if (requiredRole === 'super_admin' && !isSuperAdmin) {
    toast.error('Akses Ditolak: Halaman ini hanya dapat diakses oleh Super Admin.');
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
