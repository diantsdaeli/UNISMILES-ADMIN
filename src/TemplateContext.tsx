import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';

export interface Template {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  status: 'active' | 'inactive';
  usageCount: number;
  createdAt?: any;
  updatedAt?: any;
  isDummy?: boolean;
}

interface TemplateContextType {
  templates: Template[];
  addTemplate: (template: Omit<Template, 'id' | 'usageCount'>) => Promise<void>;
  editTemplate: (id: string, updates: Partial<Template>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  loading: boolean;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'unismiles_templates';

export const TemplateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to parse dates from backend into the expected format
  const parseTemplate = (t: any): Template => ({
    ...t,
    createdAt: t.createdAt ? { toDate: () => new Date(t.createdAt) } : { toDate: () => new Date() },
    updatedAt: t.updatedAt ? { toDate: () => new Date(t.updatedAt) } : undefined
  });

  // Fetch Templates on mount
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.map(parseTemplate));
        }
      } catch (err) {
        console.error("Error fetching templates:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const addTemplate = async (templateData: Omit<Template, 'id' | 'usageCount'>) => {
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateData)
      });
      if (res.ok) {
        const newTemplate = await res.json();
        setTemplates(prev => [parseTemplate(newTemplate), ...prev]);
      } else {
        toast.error("Failed to upload template.");
      }
    } catch (err) {
      console.error("Error adding template:", err);
      toast.error("Network error while adding template.");
    }
  };

  const editTemplate = async (id: string, updates: Partial<Template>) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates(prev => prev.map(t => t.id === id ? parseTemplate(updated) : t));
      }
    } catch (err) {
      console.error("Error editing template:", err);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error("Error deleting template:", err);
    }
  };

  return (
    <TemplateContext.Provider value={{ templates, addTemplate, editTemplate, deleteTemplate, loading }}>
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
