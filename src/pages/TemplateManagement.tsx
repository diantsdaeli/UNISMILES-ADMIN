import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  LayoutTemplate,
  ImageIcon,
  Sparkles,
  Loader2,
  Layers,
  Upload,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTemplate, Template } from '../TemplateContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  LAYOUT_PRESETS, 
  LayoutPreset,
  EVENT_CATEGORIES 
} from '../lib/layoutPresets';
import { 
  CanvasFrameEditorModal, 
  LayoutTabIcon, 
  FrameCard 
} from '../components/CanvasFrameEditor';
import { fetchReusableAssets, ReusableAsset, resolveAssetUrl } from '../lib/assets';

export const TemplateManagement: React.FC = () => {
  const navigate = useNavigate();
  const { templates, loading, error, refreshTemplates } = useTemplate();

  // Tab Level 1: Frame Templates vs Sticker Library
  const [activeMainTab, setActiveMainTab] = useState<'frames' | 'stickers'>('frames');

  // Active Layout Preset (7 Horizontal Presets: 1x1, 2x1, 3x1, 4x1, 2x2, 2x3, 3x3)
  const [activeLayoutId, setActiveLayoutId] = useState<string>('1x1');
  const activePreset: LayoutPreset = useMemo(
    () => LAYOUT_PRESETS.find(p => p.id === activeLayoutId) || LAYOUT_PRESETS[0],
    [activeLayoutId]
  );

  // Layout Prices (Digital & Digital & Print)
  const [layoutPrice, setLayoutPrice] = useState<string>('1500');
  const [layoutPrintPrice, setLayoutPrintPrice] = useState<string>('3000');
  const [isSavingLayoutPrice, setIsSavingLayoutPrice] = useState<boolean>(false);

  // Secondary Filter Dian: Kategori Event & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editor Modal Fullscreen State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorTemplate, setEditorTemplate] = useState<Template | null>(null);

  // Sticker Library Assets State
  const [stickersList, setStickersList] = useState<ReusableAsset[]>([]);
  const [stickersLoading, setStickersLoading] = useState<boolean>(false);
  const [stickerFilterType, setStickerFilterType] = useState<string>('all');
  const [stickerSearch, setStickerSearch] = useState<string>('');

  // Templates for Active Layout
  const templatesForLayout = useMemo(
    () => templates.filter(t => t.layoutId === activeLayoutId),
    [templates, activeLayoutId]
  );

  const enabledFrameCount = useMemo(
    () => templatesForLayout.filter(t => t.isActive).length,
    [templatesForLayout]
  );

  // Auto-sync prices from templates on layout switch
  useEffect(() => {
    const digitalPrices = templatesForLayout
      .map(t => t.digitalPrice ?? t.price)
      .filter((p): p is number => p !== null && p !== undefined && p > 0);
    const printPrices = templatesForLayout
      .map(t => t.digitalPrintPrice ?? t.price)
      .filter((p): p is number => p !== null && p !== undefined && p > 0);

    if (digitalPrices.length > 0) {
      setLayoutPrice(String(digitalPrices[0]));
    } else {
      setLayoutPrice('1500');
    }

    if (printPrices.length > 0) {
      setLayoutPrintPrice(String(printPrices[0]));
    } else {
      setLayoutPrintPrice('3000');
    }
  }, [activeLayoutId, templatesForLayout]);

  // Load Sticker Library Assets when Tab Stickers active
  useEffect(() => {
    if (activeMainTab !== 'stickers') return;
    setStickersLoading(true);
    Promise.all([
      fetchReusableAssets('sticker'),
      fetchReusableAssets('logo'),
      fetchReusableAssets('overlay'),
    ])
      .then(([stickers, logos, overlays]) => {
        setStickersList([...stickers, ...logos, ...overlays]);
      })
      .catch(err => {
        console.warn('Failed loading assets for sticker library:', err);
      })
      .finally(() => {
        setStickersLoading(false);
      });
  }, [activeMainTab]);

  // Filtered Templates based on layout + secondary category + search
  const filteredTemplates = useMemo(() => {
    return templatesForLayout.filter(t => {
      const matchCategory =
        selectedCategory === 'All' || t.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch =
        !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchCategory && matchSearch;
    });
  }, [templatesForLayout, selectedCategory, searchQuery]);

  // Handlers
  const handleCreateClick = () => {
    setEditorTemplate(null);
    setIsEditorOpen(true);
  };

  const handleEditClick = (template: Template) => {
    setEditorTemplate(template);
    setIsEditorOpen(true);
  };

  const handleDuplicateClick = (template: Template) => {
    // Clone template locally and open editor with duplicated values
    const duplicateData: Template = {
      ...template,
      id: `${template.id}-copy`,
      name: `${template.name} (Copy)`,
    };
    setEditorTemplate(duplicateData);
    setIsEditorOpen(true);
    toast.info(`Duplikasi "${template.name}" dibuka di editor.`);
  };

  const handleDeleteClick = (template: Template) => {
    toast.info(
      'Operasi hapus frame ditangguhkan pada mode Read-Only untuk melindungi data server produksi.'
    );
  };

  const handleToggleActive = (template: Template) => {
    toast.info(
      `Pengubahan status aktif "${template.name}" ditangguhkan pada mode Read-Only (akan aktif pada Tahap 3).`
    );
  };

  const handleSaveAllPrices = () => {
    toast.info(
      `Penyimpanan harga massal ke semua frame (${activePreset.label}) ditangguhkan pada mode Read-Only.`
    );
  };

  const handleOpenStoryboard = (template: Template) => {
    navigate('/storyboard', { state: { templateId: template.id } });
    toast.success(`Membuka template "${template.name}" di Storyboard Dian.`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Fullscreen Canvas Frame Editor */}
      <CanvasFrameEditorModal
        isOpen={isEditorOpen}
        editingTemplate={editorTemplate}
        activePreset={activePreset}
        digitalPrice={layoutPrice}
        digitalPrintPrice={layoutPrintPrice}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorTemplate(null);
        }}
        onSaved={() => {
          setIsEditorOpen(false);
          setEditorTemplate(null);
          refreshTemplates();
        }}
      />

      {/* Main Page Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <LayoutTemplate className="w-8 h-8 text-primary" />
            </div>
            Image Frames
          </h1>
          <p className="text-muted mt-1 font-medium">Enable layouts and customize styles.</p>
        </div>
      </div>

      {/* Level 1 Navigation Tabs: Frame Templates vs Sticker Library */}
      <div className="flex gap-6 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('frames')}
          className={cn(
            'pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer',
            activeMainTab === 'frames'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          )}
        >
          Frame Templates
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('stickers')}
          className={cn(
            'pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
            activeMainTab === 'stickers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Sticker Library
        </button>
      </div>

      {/* ======================================================================== */}
      {/* TAB 1: FRAME TEMPLATES (IMAGE FRAMES NADIN VIEW - PERSIS GAMBAR 2)        */}
      {/* ======================================================================== */}
      {activeMainTab === 'frames' && (
        <div className="space-y-6">
          {/* Horizontal 7 Layout Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {LAYOUT_PRESETS.map(preset => {
              const active = preset.id === activeLayoutId;
              const hasActiveTemplates = templates
                .filter(t => t.layoutId === preset.id)
                .some(t => t.isActive);

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setActiveLayoutId(preset.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all flex-shrink-0 cursor-pointer',
                    active
                      ? 'bg-primary text-[#10172A] shadow-[0_4px_15px_rgba(255,184,0,0.25)] font-bold'
                      : 'bg-white/5 border border-white/10 text-muted hover:text-foreground hover:bg-white/8'
                  )}
                >
                  <LayoutTabIcon preset={preset} active={active} />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {preset.label}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-bold',
                      active ? 'text-[#10172A]/70' : 'text-muted/60'
                    )}
                  >
                    ({preset.width}×{preset.height})
                  </span>
                  {hasActiveTemplates && (
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        active
                          ? 'bg-[#10172A]/70'
                          : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                      )}
                      title="Terdapat frame aktif pada layout ini"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Main Glass Panel (Persis Nadin Gambar 2) */}
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-white/8 bg-[#0B0F19]/90">
            {/* Top Bar inside panel: Frame Status + Price Inputs + Create Style */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-white/5">
              <div className="flex flex-wrap items-center gap-5">
                {/* Frame Status Toggle Indicator */}
                <div
                  className="flex items-center gap-3 cursor-default"
                  title="Atur status aktif dari masing-masing kartu frame"
                >
                  <div
                    className={cn(
                      'w-12 h-6 rounded-full flex items-center px-1 transition-all',
                      enabledFrameCount > 0
                        ? 'bg-primary justify-end shadow-[0_0_15px_rgba(255,184,0,0.35)]'
                        : 'bg-white/10 border border-white/20 justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full shadow-sm',
                        enabledFrameCount > 0 ? 'bg-[#10172A]' : 'bg-muted'
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">Frame Status</p>
                    <p className="text-[10px] font-bold text-muted">
                      {enabledFrameCount} dari {templatesForLayout.length} frame aktif — pilih per frame
                    </p>
                  </div>
                </div>

                {/* Price Inputs & Button */}
                <div className="flex flex-wrap items-center gap-2 border-l border-white/10 pl-5">
                  <label
                    className="text-[10px] font-black uppercase tracking-widest text-muted"
                    htmlFor="layout-frame-price"
                  >
                    Harga Digital (Rp)
                  </label>
                  <input
                    id="layout-frame-price"
                    type="number"
                    min="1"
                    step="1"
                    value={layoutPrice}
                    onChange={e => setLayoutPrice(e.target.value)}
                    placeholder="Contoh: 1500"
                    className="w-28 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                  />

                  <label
                    className="text-[10px] font-black uppercase tracking-widest text-muted"
                    htmlFor="layout-print-price"
                  >
                    Harga Digital &amp; Print (Rp)
                  </label>
                  <input
                    id="layout-print-price"
                    type="number"
                    min="1"
                    step="1"
                    value={layoutPrintPrice}
                    onChange={e => setLayoutPrintPrice(e.target.value)}
                    placeholder="Contoh: 3000"
                    className="w-28 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50"
                  />

                  <button
                    type="button"
                    onClick={handleSaveAllPrices}
                    className="px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider hover:bg-primary/25 transition-all cursor-pointer"
                  >
                    Simpan ke Semua Frame
                  </button>
                </div>
              </div>

              {/* Create Style Button */}
              <button
                type="button"
                onClick={handleCreateClick}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 text-foreground hover:text-primary text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer self-start lg:self-center"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Style
              </button>
            </div>

            {/* Secondary Filter Bar Dian: Kategori Event & Search */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-hide py-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted mr-1">
                  Kategori:
                </span>
                {['All', ...EVENT_CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                      selectedCategory.toLowerCase() === cat.toLowerCase()
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-white/5 text-muted hover:text-foreground hover:bg-white/10'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari style frame..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/60 outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Available Styles Grid */}
            <div className="space-y-4 pt-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted">
                Available Styles ({filteredTemplates.length})
              </p>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs font-bold text-muted">Memuat frame dari backend online...</p>
                </div>
              ) : templatesForLayout.length === 0 ? (
                /* Empty state jika belum ada style sama sekali pada preset ini */
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-white/10 rounded-2xl gap-4 text-center">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
                    <ImageIcon className="w-7 h-7 text-muted opacity-40" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">No Styles Yet</p>
                    <p className="text-xs text-muted mt-1">
                      Create your first frame style for {activePreset.label} ({activePreset.width}×{activePreset.height})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateClick}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary/15 border border-primary/40 text-primary text-[11px] font-black uppercase tracking-wider rounded-xl hover:bg-primary/25 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Style
                  </button>
                </div>
              ) : (
                /* Grid Frame Cards Nadin */
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeLayoutId}-${selectedCategory}-${searchQuery}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                  >
                    {filteredTemplates.map(template => (
                      <FrameCard
                        key={template.id}
                        template={template}
                        preset={activePreset}
                        onEdit={() => handleEditClick(template)}
                        onDuplicate={() => handleDuplicateClick(template)}
                        onDelete={() => handleDeleteClick(template)}
                        onToggle={() => handleToggleActive(template)}
                        onOpenStoryboard={() => handleOpenStoryboard(template)}
                      />
                    ))}

                    {/* Add New Style Card (Persis Nadin Gambar 2) */}
                    <motion.button
                      type="button"
                      onClick={handleCreateClick}
                      className="rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 transition-all h-[275px] group cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 group-hover:bg-primary/10 border border-white/10 group-hover:border-primary/30 flex items-center justify-center transition-all">
                        <Plus className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted group-hover:text-primary transition-colors">
                        New Style
                      </p>
                    </motion.button>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* TAB 2: STICKER LIBRARY (DIAN STICKER ASSETS MANAGEMENT)                   */}
      {/* ======================================================================== */}
      {activeMainTab === 'stickers' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-white/8 bg-[#0B0F19]/90">
            {/* Header Sticker Library */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  Sticker &amp; Asset Library
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Katalog stiker, logo, dan overlay reusable yang dapat disematkan ke seluruh template frame.
                </p>
              </div>

              {/* Upload Sticker Button (Safeguarded) */}
              <div className="relative group self-start sm:self-auto">
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400/50 rounded-xl text-[11px] font-black uppercase tracking-wider cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Upload Stiker Baru
                </button>
                <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#1E293B] border border-emerald-500/30 rounded-xl shadow-2xl text-[9px] text-emerald-200 hidden group-hover:block z-50 pointer-events-none">
                  <p className="font-bold text-emerald-400 mb-1">Mode Read-Only</p>
                  Upload aset massal pada halaman utama dinonaktifkan untuk melindungi server backend produksi.
                </div>
              </div>
            </div>

            {/* Filter by Type & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'Semua Aset' },
                  { id: 'sticker', label: 'Stiker' },
                  { id: 'logo', label: 'Logo' },
                  { id: 'overlay', label: 'Overlay' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStickerFilterType(tab.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      stickerFilterType === tab.id
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-white/5 text-muted hover:text-foreground hover:bg-white/10'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={stickerSearch}
                  onChange={e => setStickerSearch(e.target.value)}
                  placeholder="Cari stiker atau logo..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/60 outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Assets Grid */}
            {stickersLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-xs font-bold text-muted">Memuat katalog stiker...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {stickersList
                  .filter(
                    a =>
                      (stickerFilterType === 'all' || a.type === stickerFilterType) &&
                      (!stickerSearch.trim() ||
                        a.name.toLowerCase().includes(stickerSearch.toLowerCase().trim()))
                  )
                  .map(asset => (
                    <div
                      key={asset.id}
                      className="p-3 bg-black/40 border border-white/5 hover:border-emerald-500/40 rounded-2xl flex flex-col items-center gap-2 transition-all group"
                    >
                      <div className="w-full h-28 rounded-xl bg-black/60 border border-white/5 flex items-center justify-center p-2 overflow-hidden">
                        <img
                          src={resolveAssetUrl(asset.url)}
                          alt={asset.name}
                          className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-200"
                          onError={e => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="w-full text-center">
                        <p className="text-[10px] font-bold text-foreground truncate">{asset.name}</p>
                        <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1 inline-block">
                          {asset.type}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
