import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { Template, fetchTemplates } from './lib/templates';

export type { Template } from './lib/templates';

interface TemplateContextType {
  templates: Template[];
  loading: boolean;
  error: string | null;
  refreshTemplates: () => Promise<void>;
  addTemplate: (template: Omit<Template, 'id' | 'usageCount' | 'backendId' | 'isActive'>) => Promise<void>;
  editTemplate: (id: string, updates: Partial<Template>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const TemplateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.error('Error fetching templates from backend:', err);
      const msg = err?.response?.data?.message || err?.message || 'Gagal terhubung ke backend templates.';
      setError(msg);
      // PENTING: Jangan tampilkan data lokal dummy seolah-olah data asli backend
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Templates on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /**
   * Pembatas Tahap 1: Operasi mutasi ditangguhkan hingga Tahap 2 untuk melindungi backend produksi.
   */
  const addTemplate = async (_templateData: Omit<Template, 'id' | 'usageCount' | 'backendId' | 'isActive'>) => {
    toast.info('Operasi tambah template ditangguhkan pada Tahap 1 (Read-Only). Fitur create/editor akan diaktifkan pada Tahap 2.');
  };

  const editTemplate = async (_id: string, _updates: Partial<Template>) => {
    toast.info('Operasi edit template ditangguhkan pada Tahap 1 (Read-Only). Fitur update/editor akan diaktifkan pada Tahap 2.');
  };

  const deleteTemplate = async (_id: string) => {
    toast.info('Operasi hapus template ditangguhkan pada Tahap 1 (Read-Only) untuk melindungi data produksi.');
  };

  return (
    <TemplateContext.Provider
      value={{
        templates,
        loading,
        error,
        refreshTemplates: loadTemplates,
        addTemplate,
        editTemplate,
        deleteTemplate,
      }}
    >
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplate = () => {
  const context = useContext(TemplateContext);
  if (context === undefined) {
    throw new Error('useTemplate must be used within a TemplateProvider');
  }
  return context;
};
