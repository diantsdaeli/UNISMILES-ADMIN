import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { Template, fetchTemplates } from './lib/templates';

export type { Template } from './lib/templates';

interface TemplateContextType {
  templates: Template[];
  loading: boolean;
  error: string | null;
  refreshTemplates: () => Promise<void>;
  addTemplate: (template: Template | Omit<Template, 'id' | 'usageCount' | 'backendId' | 'isActive'>) => Promise<void>;
  editTemplate: (id: string | number, updates: Partial<Template>) => Promise<void>;
  deleteTemplate: (id: string | number) => Promise<void>;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const TemplateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const token = localStorage.getItem('unismiles_token') || sessionStorage.getItem('unismiles_token');
    if (!token) {
      setLoading(false);
      setTemplates([]);
      return;
    }

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
   * Menambahkan template baru ke state lokal TemplateContext tanpa refresh.
   * Frame baru yang tersimpan secara default adalah draft (is_active: false).
   */
  const addTemplate = async (templateData: Template | Omit<Template, 'id' | 'usageCount' | 'backendId' | 'isActive'>) => {
    let newTemplate: Template;
    if ('id' in templateData && 'backendId' in templateData) {
      newTemplate = templateData as Template;
    } else {
      const generatedId = `local-${Date.now()}`;
      newTemplate = {
        ...templateData,
        id: generatedId,
        backendId: generatedId,
        isActive: false, // Default draft
        status: 'inactive',
        usageCount: 0,
      } as Template;
    }
    setTemplates(prev => [newTemplate, ...prev]);
  };

  /**
   * Memperbarui template existing pada state lokal TemplateContext.
   * Mempertahankan backendId, isActive, slot geometry, dan metadata yang ada.
   */
  const editTemplate = async (id: string | number, updates: Partial<Template>) => {
    const idStr = String(id);
    setTemplates(prev =>
      prev.map(t => (t.id === idStr || String(t.backendId) === idStr) ? { ...t, ...updates } : t)
    );
  };

  /**
   * Menghapus template dari state lokal TemplateContext.
   */
  const deleteTemplate = async (id: string | number) => {
    const idStr = String(id);
    setTemplates(prev =>
      prev.filter(t => t.id !== idStr && String(t.backendId) !== idStr)
    );
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
