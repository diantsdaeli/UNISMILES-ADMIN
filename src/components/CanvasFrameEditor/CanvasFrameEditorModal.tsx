import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
  ZoomIn, 
  ZoomOut, 
  Palette, 
  Type, 
  Layers, 
  Upload, 
  Trash2, 
  Plus, 
  Lock, 
  Code, 
  Copy, 
  Check, 
  ImageIcon,
  Loader2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  LayoutPreset, 
  LAYOUT_PRESETS, 
  EVENT_CATEGORIES, 
  EventCategory,
  GOOGLE_FONTS, 
  GRADIENT_PRESETS, 
  computeSlots, 
  buildFrameConfig,
  buildCreateTemplatePayload,
  buildUpdateTemplatePayload,
  FrameEditorState
} from '../../lib/layoutPresets';
import { 
  Template, 
  GradientStop, 
  TextElement, 
  AssetElement, 
  CanvasLayoutConfig, 
  PhotoSlot,
  createTemplate,
  updateTemplate,
  SimulationResult
} from '../../lib/templates';
import { ReusableAsset, fetchReusableAssets, uploadReusableAsset, resolveAssetUrl } from '../../lib/assets';
import { CanvasPreview } from './CanvasPreview';
import { GradientStopEditor } from './GradientStopEditor';
import { cn } from '../../lib/utils';
import { resolvePublicUrl } from '../../lib/urls';

export interface CanvasFrameEditorModalProps {
  isOpen: boolean;
  editingTemplate?: Template | null;
  activePreset?: LayoutPreset;
  digitalPrice?: number | string;
  digitalPrintPrice?: number | string;
  onClose: () => void;
  onSaved?: () => void;
}

export const CanvasFrameEditorModal: React.FC<CanvasFrameEditorModalProps> = ({
  isOpen,
  editingTemplate,
  activePreset: passedPreset,
  digitalPrice = '',
  digitalPrintPrice = '',
  onClose,
  onSaved,
}) => {
  // Preset Layout State
  const initialPresetId = editingTemplate?.layoutId || passedPreset?.id || '1x1';
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPresetId);
  const activePreset = LAYOUT_PRESETS.find(p => p.id === selectedPresetId) || passedPreset || LAYOUT_PRESETS[0];

  // Editor Sub-tabs & Zoom
  const [activeTab, setActiveTab] = useState<'bg' | 'text' | 'asset'>('bg');
  const [zoom, setZoom] = useState<number>(35);
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Safeguard Simulation State (Tahap 3B)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showSimulationModal, setShowSimulationModal] = useState<boolean>(false);
  const [copiedSimulationJson, setCopiedSimulationJson] = useState<boolean>(false);

  // Reusable Assets from Backend
  const [backendAssets, setBackendAssets] = useState<ReusableAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState<boolean>(false);
  const [newAssetName, setNewAssetName] = useState<string>('');
  const [assetUploading, setAssetUploading] = useState<boolean>(false);

  // File Upload References
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  // Form & Visual State
  const [name, setName] = useState<string>('New Frame Style');
  const [category, setCategory] = useState<EventCategory>('Birthday');
  const [frameType, setFrameType] = useState<'color' | 'gradient' | 'png'>('color');
  const [bgColor, setBgColor] = useState<string>('#1E293B');
  const [accentColor, setAccentColor] = useState<string>('#FFFFFF');
  const [gradientStyle, setGradientStyle] = useState<'linear' | 'radial'>('linear');
  const [gradientAngle, setGradientAngle] = useState<number>(45);
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    { color: '#059669', position: 0 },
    { color: '#10B981', position: 100 },
  ]);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [assetElements, setAssetElements] = useState<AssetElement[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string>('');
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [customSlots, setCustomSlots] = useState<PhotoSlot[] | undefined>(undefined);

  // Reset or Load Template when editor opens
  useEffect(() => {
    if (!isOpen) return;

    if (editingTemplate) {
      setName(editingTemplate.name || 'Untitled Template');
      const cat = EVENT_CATEGORIES.includes(editingTemplate.category as EventCategory)
        ? (editingTemplate.category as EventCategory)
        : 'General';
      setCategory(cat);
      setSelectedPresetId(editingTemplate.layoutId || passedPreset?.id || '1x1');
      setFrameType(editingTemplate.frameType || 'color');
      setBgColor(editingTemplate.bgColor || '#1E293B');
      setAccentColor(editingTemplate.accentColor || '#FFFFFF');
      setGradientStyle(editingTemplate.gradientStyle || 'linear');
      setGradientAngle(editingTemplate.gradientAngle ?? 45);
      setGradientStops(
        editingTemplate.gradientStops && editingTemplate.gradientStops.length >= 2
          ? editingTemplate.gradientStops
          : [
              { color: '#059669', position: 0 },
              { color: '#10B981', position: 100 },
            ]
      );

      const existingText = (editingTemplate.textElements && editingTemplate.textElements.length > 0)
        ? editingTemplate.textElements
        : (editingTemplate.layoutConfig?.elements || []);
      setTextElements(existingText);

      setBgImageUrl(editingTemplate.imageUrl || '');
      setBgImageFile(null);

      // Asset Elements & Slots from layoutConfig
      const cfg = editingTemplate.layoutConfig;
      if (cfg && Array.isArray(cfg.assetElements)) {
        setAssetElements(cfg.assetElements);
      } else {
        setAssetElements([]);
      }

      if (cfg && Array.isArray(cfg.slots) && cfg.slots.length > 0) {
        setCustomSlots(cfg.slots);
      } else {
        setCustomSlots(undefined);
      }
    } else {
      setName('New Frame Style');
      setCategory('Birthday');
      setSelectedPresetId(passedPreset?.id || '1x1');
      setFrameType('color');
      setBgColor('#1E293B');
      setAccentColor('#FFFFFF');
      setGradientStyle('linear');
      setGradientAngle(45);
      setGradientStops([
        { color: '#059669', position: 0 },
        { color: '#10B981', position: 100 },
      ]);
      setTextElements([]);
      setAssetElements([]);
      setBgImageUrl('');
      setBgImageFile(null);
      setCustomSlots(undefined);
    }
    setSelectedAssetId(null);
  }, [isOpen, editingTemplate, passedPreset]);

  // Load Reusable Assets for Stickers & Overlays
  useEffect(() => {
    if (!isOpen) return;
    setLoadingAssets(true);
    Promise.all([
      fetchReusableAssets('sticker'),
      fetchReusableAssets('logo'),
      fetchReusableAssets('overlay'),
    ])
      .then(([stickers, logos, overlays]) => {
        setBackendAssets([...overlays, ...stickers, ...logos]);
      })
      .catch(err => {
        console.warn('Could not load backend assets:', err);
      })
      .finally(() => {
        setLoadingAssets(false);
      });
  }, [isOpen]);

  // Handler Upload Background Gambar Lokal
  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Format gambar harus PNG, JPG, JPEG, atau WebP.');
      return;
    }

    setBgImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setBgImageUrl(reader.result as string);
      setFrameType('png');
      toast.success(`Gambar "${file.name}" dimuat sebagai background frame.`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handler Upload Asset Baru dari Tab Asset
  const handleUploadNewAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAssetUploading(true);
    try {
      const asset = await uploadReusableAsset(file, newAssetName.trim() || file.name, 'sticker');
      setBackendAssets(prev => [asset, ...prev]);
      setNewAssetName('');
      toast.success(`Aset "${asset.name}" berhasil diunggah.`);
    } catch {
      // Local fallback jika backend upload dibatasi
      const localUrl = URL.createObjectURL(file);
      const mockAsset: ReusableAsset = {
        id: `local-${Date.now()}`,
        name: newAssetName.trim() || file.name,
        type: 'sticker',
        url: localUrl,
        is_active: true,
      };
      setBackendAssets(prev => [mockAsset, ...prev]);
      setNewAssetName('');
      toast.info(`Aset "${mockAsset.name}" dimuat ke katalog lokal.`);
    } finally {
      setAssetUploading(false);
      e.target.value = '';
    }
  };

  // Text Elements Handlers
  const handleAddText = () => {
    const newId = `txt-${Date.now().toString(36)}`;
    const newElem: TextElement = {
      id: newId,
      type: 'text',
      text: 'UniSmiles Moments',
      content: 'UniSmiles Moments',
      fontFamily: 'Inter, sans-serif',
      fontSize: 48,
      color: '#FFFFFF',
      x: 50,
      y: 88,
      fontWeight: 'bold',
    };
    setTextElements(prev => [...prev, newElem]);
    toast.success('Elemen teks ditambahkan.');
  };

  const handleUpdateText = (id: string, patch: Partial<TextElement>) => {
    setTextElements(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...patch };
        if (patch.text !== undefined && patch.content === undefined) {
          updated.content = patch.text;
        } else if (patch.content !== undefined && patch.text === undefined) {
          updated.text = patch.content;
        }
        return updated;
      })
    );
  };

  const handleRemoveText = (id: string) => {
    setTextElements(prev => prev.filter(t => t.id !== id));
  };

  // Asset Elements Handlers
  const handleAddAssetToCanvas = (asset: ReusableAsset) => {
    const newId = `ast-${Date.now().toString(36)}`;
    const newAssetElement: AssetElement = {
      id: newId,
      type: 'sticker',
      anchor: 'top-left',
      assetId: asset.id,
      name: asset.name,
      url: asset.url,
      content: asset.url,
      x: 35,
      y: 40,
      width: 25,
      height: 15,
      opacity: 1,
      rotation: 0,
    };
    setAssetElements(prev => [...prev, newAssetElement]);
    setSelectedAssetId(newId);
    toast.success(`Stiker "${asset.name}" ditambahkan ke kanvas.`);
  };

  const handleSetAssetAsBackground = (asset: ReusableAsset) => {
    setBgImageUrl(asset.url);
    setFrameType('png');
    toast.success(`"${asset.name}" dijadikan background frame.`);
  };

  const handleUpdateAsset = (id: string, patch: Partial<AssetElement>) => {
    setAssetElements(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
  };

  const handleRemoveAsset = (id: string) => {
    setAssetElements(prev => prev.filter(a => a.id !== id));
    if (selectedAssetId === id) setSelectedAssetId(null);
  };

  // Build Canonical Config Object
  const currentCanonicalConfig: CanvasLayoutConfig = buildFrameConfig(
    activePreset,
    category,
    frameType,
    bgColor,
    accentColor,
    gradientStops,
    gradientAngle,
    gradientStyle,
    textElements,
    bgImageUrl,
    null,
    assetElements,
    customSlots,
    editingTemplate?.layoutConfig || null
  );

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentCanonicalConfig, null, 2));
    setCopiedJson(true);
    toast.success('Canonical layout_config disalin ke clipboard.');
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleRunSimulation = async (explicitPublish = false) => {
    const editorState: FrameEditorState = {
      preset: activePreset,
      name,
      category,
      frameType,
      bgColor,
      accentColor,
      gradientStops,
      gradientAngle,
      gradientStyle,
      textElements,
      assetElements,
      bgImageUrl,
      overlayAssetId: null,
      digitalPrice,
      digitalPrintPrice,
      customSlots,
      // Aturan 2: Frame baru secara default adalah draft (is_active: false).
      // Edit frame existing mempertahankan status is_active aslinya.
      isActive: editingTemplate ? editingTemplate.isActive : explicitPublish,
    };

    try {
      if (editingTemplate) {
        // Alur Edit: PUT /api/v1/admin/templates/:id (Mempertahankan ID dan status live)
        const payload = buildUpdateTemplatePayload(editingTemplate, editorState);
        const result = (await updateTemplate(editingTemplate.backendId, payload, { simulate: true })) as SimulationResult;
        setSimulationResult(result);
        setShowSimulationModal(true);
        if (result.validation.valid) {
          toast.info('Simulasi validasi Update Frame berhasil. Mutasi backend ditahan sesuai safeguard Tahap 3B.');
        } else {
          toast.error(`Validasi payload gagal: ${result.validation.errors.join('; ')}`);
        }
      } else {
        // Alur Create: POST /api/v1/admin/templates/generate (Default draft is_active=false)
        const payload = buildCreateTemplatePayload(editorState);
        const result = (await createTemplate(payload, { simulate: true })) as SimulationResult;
        setSimulationResult(result);
        setShowSimulationModal(true);
        if (result.validation.valid) {
          toast.info(`Simulasi validasi Create Frame (${explicitPublish ? 'Publish' : 'Draft'}) berhasil. Mutasi backend ditahan.`);
        } else {
          toast.error(`Validasi payload gagal: ${result.validation.errors.join('; ')}`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menjalankan simulasi penyimpanan');
    }
  };

  const handleCopySimulationJson = () => {
    if (!simulationResult) return;
    navigator.clipboard.writeText(JSON.stringify(simulationResult.payload, null, 2));
    setCopiedSimulationJson(true);
    toast.success('Payload simulasi disalin ke clipboard.');
    setTimeout(() => setCopiedSimulationJson(false), 2000);
  };

  if (!isOpen) return null;

  const selectedSticker = assetElements.find(a => a.id === selectedAssetId);

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F19]/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Top Bar Header (h-12 persis Nadin Gambar 3) */}
      <header className="h-12 border-b border-white/10 px-4 flex items-center justify-between flex-shrink-0 bg-[#0D1322]">
        {/* Left: Back + Title + Dimensions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-foreground transition-colors cursor-pointer"
            title="Kembali ke Gallery Templates"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">FRAME EDITOR</p>
            <p className="text-xs font-bold text-foreground">
              {activePreset.name} ({activePreset.width}x{activePreset.height})
            </p>
          </div>
        </div>

        {/* Center: Zoom Controls */}
        <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(15, z - 5))}
            className="p-1 text-muted hover:text-foreground transition-colors rounded hover:bg-white/5 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-muted w-10 text-center select-none">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(100, z + 5))}
            className="p-1 text-muted hover:text-foreground transition-colors rounded hover:bg-white/5 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Inspect Canonical JSON */}
          <button
            type="button"
            onClick={() => setShowJsonModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
            title="Inspeksi Canonical JSON"
          >
            <Code className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-muted hover:text-foreground text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {/* Safeguard Indicators & Simulation Actions (Tahap 3B) */}
          {!editingTemplate && (
            <button
              type="button"
              onClick={() => handleRunSimulation(true)}
              className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
              title="Simulasi Simpan Draf (is_active=false)"
            >
              <Play className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">Simulasi</span> Draft
            </button>
          )}

          <div className="relative group">
            <button
              type="button"
              onClick={() => handleRunSimulation(false)}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
              {editingTemplate ? 'Simulasi Update' : 'Simulasi Save'}
            </button>
            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#1E293B] border border-emerald-500/30 rounded-xl shadow-2xl text-[9px] text-emerald-200 hidden group-hover:block z-50 pointer-events-none">
              <p className="font-bold text-emerald-400 mb-1">🛡️ Safeguard Tahap 3B Aktif</p>
              Menguji validasi payload dan simulasi alur {editingTemplate ? 'PUT' : 'POST'} secara penuh tanpa mengirim mutasi ke backend produksi.
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace (Sidebar + Canvas) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar (w-72 persis Nadin Gambar 3) */}
        <aside className="w-72 border-r border-white/10 flex flex-col bg-[#0D1322] flex-shrink-0 z-10">
          {/* Sub-tabs: BG, TEXT, ASSET */}
          <div className="flex border-b border-white/10 flex-shrink-0 bg-[#0D1322]">
            {(
              [
                { id: 'bg', label: 'BG', icon: Palette },
                { id: 'text', label: 'Text', icon: Type },
                { id: 'asset', label: 'Asset', icon: Layers },
              ] as const
            ).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border-b-2 cursor-pointer',
                    isActive
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sub-tab Content Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            {/* 1. TAB BG */}
            {activeTab === 'bg' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Background Type Switcher */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                    Background Type
                  </p>
                  <div className="flex gap-1 bg-black/30 p-0.5 rounded-lg border border-white/10">
                    {(
                      [
                        { id: 'color', label: 'Solid' },
                        { id: 'gradient', label: 'Gradient' },
                        { id: 'png', label: 'Gambar / PNG' },
                      ] as const
                    ).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFrameType(t.id)}
                        className={cn(
                          'flex-1 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer',
                          frameType === t.id
                            ? 'bg-primary text-[#10172A] font-bold shadow'
                            : 'bg-white/5 text-muted hover:bg-white/10 hover:text-foreground'
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Solid Color Setting */}
                {frameType === 'color' && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">Color</p>
                    <label className="flex items-center gap-2 cursor-pointer bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 hover:border-primary/30 transition-colors">
                      <span
                        className="w-5 h-5 rounded border border-white/20 flex-shrink-0"
                        style={{ background: bgColor }}
                      />
                      <input
                        type="color"
                        value={bgColor}
                        onChange={e => setBgColor(e.target.value)}
                        className="sr-only"
                      />
                      <span className="font-mono text-[9px] text-foreground font-bold">
                        {bgColor.toUpperCase()}
                      </span>
                    </label>
                  </div>
                )}

                {/* Gradient Setting */}
                {frameType === 'gradient' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                        Gradient Presets
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {GRADIENT_PRESETS.map(preset => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => {
                              setGradientStyle(preset.style);
                              setGradientAngle(preset.angle);
                              setGradientStops(preset.stops);
                            }}
                            className="p-1.5 rounded-lg border border-white/10 bg-black/30 hover:border-primary/50 text-left transition-all cursor-pointer"
                          >
                            <div
                              className="h-4 rounded mb-1"
                              style={{
                                background: `linear-gradient(${preset.angle}deg, ${preset.stops[0].color}, ${preset.stops[preset.stops.length - 1].color})`,
                              }}
                            />
                            <p className="text-[8px] font-bold text-foreground truncate">{preset.name}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-wider text-muted">
                        <span>Sudut ({gradientAngle}°)</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setGradientStyle('linear')}
                            className={cn('px-1.5 py-0.5 rounded', gradientStyle === 'linear' ? 'bg-primary text-[#10172A]' : 'bg-white/10 text-muted')}
                          >
                            Linear
                          </button>
                          <button
                            type="button"
                            onClick={() => setGradientStyle('radial')}
                            className={cn('px-1.5 py-0.5 rounded', gradientStyle === 'radial' ? 'bg-primary text-[#10172A]' : 'bg-white/10 text-muted')}
                          >
                            Radial
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={gradientAngle}
                        onChange={e => setGradientAngle(Number(e.target.value))}
                        className="w-full accent-primary h-1 bg-white/10 rounded cursor-pointer"
                      />
                    </div>

                    <GradientStopEditor stops={gradientStops} onChange={setGradientStops} />
                  </div>
                )}

                {/* Gambar / PNG Setting */}
                {frameType === 'png' && (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[9px] font-bold leading-relaxed">
                      ✨ Gambar ini berada di <u>LAPISAN PALING BELAKANG</u> (di bawah kotak foto), sehingga foto dan border slot akan tampil rapi di depannya.
                    </div>

                    <input
                      ref={bgFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleBgFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bgFileInputRef.current?.click()}
                      className="w-full py-3 bg-primary/15 border border-dashed border-primary/50 text-primary text-[9px] font-black uppercase tracking-wider rounded-xl hover:bg-primary/25 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Background Gambar (PNG / JPG)
                    </button>

                    {bgImageUrl && (
                      <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40 p-2">
                        <img
                          src={resolvePublicUrl(bgImageUrl)}
                          alt="Background Preview"
                          className="w-full object-contain max-h-36 rounded"
                        />
                        <p className="text-center text-[8px] font-bold text-emerald-400 mt-2 truncate">
                          {bgImageFile ? bgImageFile.name : 'Background Aktif'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Border Slot Accent Color */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                    Warna Border Slot Foto
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 hover:border-primary/30 transition-colors">
                    <span
                      className="w-5 h-5 rounded border border-white/20 flex-shrink-0"
                      style={{ background: accentColor }}
                    />
                    <input
                      type="color"
                      value={accentColor}
                      onChange={e => setAccentColor(e.target.value)}
                      className="sr-only"
                    />
                    <span className="font-mono text-[9px] text-foreground font-bold">
                      {accentColor.toUpperCase()}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* 2. TAB TEXT */}
            {activeTab === 'text' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <button
                  type="button"
                  onClick={handleAddText}
                  className="w-full py-2 bg-primary/15 border border-dashed border-primary/40 text-primary text-[9px] font-black uppercase tracking-wider rounded-xl hover:bg-primary/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Teks Baru
                </button>

                {textElements.length === 0 ? (
                  <p className="text-[10px] text-muted text-center py-6">
                    Belum ada elemen teks pada kanvas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {textElements.map((elem, idx) => (
                      <div
                        key={elem.id}
                        className="p-2.5 bg-black/40 border border-white/10 rounded-xl space-y-2 relative"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black uppercase tracking-wider text-muted">
                            Teks #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveText(elem.id)}
                            className="p-1 text-muted hover:text-red-400 transition-colors cursor-pointer"
                            title="Hapus Teks"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Input Teks */}
                        <input
                          type="text"
                          value={elem.text}
                          onChange={e => handleUpdateText(elem.id, { text: e.target.value })}
                          placeholder="Masukkan teks..."
                          className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[10px] font-bold text-foreground outline-none focus:border-primary/50"
                        />

                        {/* Font Family Dropdown */}
                        <div>
                          <p className="text-[8px] text-muted uppercase font-black mb-0.5">Font</p>
                          <select
                            value={elem.fontFamily}
                            onChange={e => handleUpdateText(elem.id, { fontFamily: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-foreground font-bold outline-none"
                          >
                            {GOOGLE_FONTS.map(f => (
                              <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Size & Color */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[8px] text-muted uppercase font-black">
                              Size ({elem.fontSize}px)
                            </p>
                            <input
                              type="range"
                              min={16}
                              max={120}
                              value={elem.fontSize}
                              onChange={e => handleUpdateText(elem.id, { fontSize: Number(e.target.value) })}
                              className="w-full h-1 accent-primary cursor-pointer"
                            />
                          </div>
                          <div>
                            <p className="text-[8px] text-muted uppercase font-black">Color</p>
                            <label className="flex items-center gap-1 cursor-pointer bg-black/40 border border-white/10 rounded px-1.5 py-0.5">
                              <span
                                className="w-3.5 h-3.5 rounded border border-white/20"
                                style={{ background: elem.color }}
                              />
                              <input
                                type="color"
                                value={elem.color}
                                onChange={e => handleUpdateText(elem.id, { color: e.target.value })}
                                className="sr-only"
                              />
                              <span className="font-mono text-[8px] text-foreground truncate">
                                {elem.color}
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Y Position */}
                        <div>
                          <p className="text-[8px] text-muted uppercase font-black">
                            Posisi Y ({elem.y}%)
                          </p>
                          <input
                            type="range"
                            min={5}
                            max={95}
                            value={elem.y}
                            onChange={e => handleUpdateText(elem.id, { y: Number(e.target.value) })}
                            className="w-full h-1 accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. TAB ASSET (Persis Nadin Gambar 3) */}
            {activeTab === 'asset' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    ASSET &amp; STIKER
                  </p>
                  <p className="text-[8.5px] text-muted leading-relaxed">
                    Upload PNG atau JPG. Anda bisa menjadikannya Background Frame (di belakang foto) atau Stiker/Logo (di depan foto).
                  </p>
                </div>

                {/* Form Upload Asset */}
                <div className="space-y-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <input
                    type="text"
                    value={newAssetName}
                    onChange={e => setNewAssetName(e.target.value)}
                    placeholder="Nama asset baru"
                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[9px] font-bold text-foreground outline-none focus:border-primary/50"
                  />

                  <input
                    ref={assetFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleUploadNewAsset}
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={assetUploading}
                    onClick={() => assetFileInputRef.current?.click()}
                    className="w-full py-2 bg-primary/20 border border-primary/40 text-primary text-[9px] font-black uppercase tracking-wider rounded-lg hover:bg-primary/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {assetUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {assetUploading ? 'Mengunggah...' : '+ UPLOAD'}
                  </button>
                </div>

                {/* Selected Sticker Controls (Jika sedang memilih stiker) */}
                {selectedSticker && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-emerald-400 truncate">
                        {selectedSticker.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(selectedSticker.id)}
                        className="text-red-400 hover:text-red-300 p-0.5"
                        title="Hapus Stiker"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[8px] text-muted">
                      <div>
                        <span>Lebar ({selectedSticker.width}%)</span>
                        <input
                          type="range"
                          min="5"
                          max="80"
                          value={selectedSticker.width}
                          onChange={e =>
                            handleUpdateAsset(selectedSticker.id, { width: Number(e.target.value) })
                          }
                          className="w-full h-1 accent-emerald-400"
                        />
                      </div>
                      <div>
                        <span>Tinggi ({selectedSticker.height}%)</span>
                        <input
                          type="range"
                          min="5"
                          max="80"
                          value={selectedSticker.height}
                          onChange={e =>
                            handleUpdateAsset(selectedSticker.id, { height: Number(e.target.value) })
                          }
                          className="w-full h-1 accent-emerald-400"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[8px] text-muted pt-1">
                      <span>Anchor:</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateAsset(selectedSticker.id, { anchor: 'top-left' })}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[7px] font-bold',
                            selectedSticker.anchor === 'top-left'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white/10 text-muted'
                          )}
                        >
                          Top-Left
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateAsset(selectedSticker.id, { anchor: 'center' })}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[7px] font-bold',
                            selectedSticker.anchor === 'center'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white/10 text-muted'
                          )}
                        >
                          Center
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section DAFTAR ASSET TERSIMPAN (Persis Nadin Gambar 3) */}
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                    DAFTAR ASSET TERSIMPAN ({backendAssets.length})
                  </p>

                  {loadingAssets ? (
                    <div className="py-6 flex items-center justify-center text-muted">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  ) : backendAssets.length === 0 ? (
                    <p className="text-[9px] text-muted text-center py-4">Belum ada aset tersimpan.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                      {backendAssets.map(asset => (
                        <div
                          key={asset.id}
                          className="p-2 bg-black/40 border border-white/5 hover:border-white/20 rounded-xl flex items-center gap-2.5 transition-all"
                        >
                          <div className="w-10 h-10 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={resolveAssetUrl(asset.url)}
                              alt={asset.name}
                              className="w-full h-full object-contain"
                              onError={e => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold text-foreground truncate">{asset.name}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => handleSetAssetAsBackground(asset)}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[8px] font-bold border border-emerald-500/30 transition-all cursor-pointer"
                              >
                                🖼 Set BG
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddAssetToCanvas(asset)}
                                className="px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 text-[8px] font-bold border border-primary/30 transition-all cursor-pointer"
                              >
                                + Stiker
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Sidebar Panel: Frame Name + Shared Layout Price (Persis Nadin Gambar 3) */}
          <div className="border-t border-white/10 p-3 space-y-2 flex-shrink-0 bg-[#0A0F1D]">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted">FRAME NAME</p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Classic Dark"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] font-bold text-foreground outline-none focus:border-primary/50 transition-all"
            />

            <p className="text-[9px] font-black uppercase tracking-widest text-muted pt-1">
              HARGA DIGITAL (RP)
            </p>
            <div className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] font-bold text-primary">
              {digitalPrice ? `Rp ${Number(digitalPrice).toLocaleString('id-ID')}` : 'Rp 1.500'}
              <div className="mt-1">
                Digital &amp; Print: {digitalPrintPrice ? `Rp ${Number(digitalPrintPrice).toLocaleString('id-ID')}` : 'Rp 3.000'}
              </div>
            </div>
            <p className="text-[8px] text-muted leading-relaxed">
              Harga kedua paket berlaku untuk semua style pada layout ini.
            </p>
          </div>
        </aside>

        {/* Main Canvas Area (Center & Right - Persis Nadin Gambar 3) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c1020] relative">
          <div className="flex-1 overflow-auto flex items-center justify-center p-8">
            <div
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
              className="transition-transform duration-200 shadow-[0_0_60px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden flex-shrink-0"
            >
              <CanvasPreview
                preset={activePreset}
                bgColor={bgColor}
                accentColor={accentColor}
                frameType={frameType}
                gradientStops={gradientStops}
                gradientAngle={gradientAngle}
                gradientStyle={gradientStyle}
                textElements={textElements}
                assetElements={assetElements}
                imageUrl={frameType === 'png' ? bgImageUrl : ''}
                slots={customSlots}
                onAssetChange={handleUpdateAsset}
                onAssetSelect={id => setSelectedAssetId(id)}
                selectedAssetElementId={selectedAssetId}
                displayWidth={activePreset.width}
              />
            </div>
          </div>

          {/* Bottom Hint Bar (Persis Nadin Gambar 3) */}
          <div className="flex-shrink-0 h-8 flex items-center justify-center border-t border-white/5 bg-[#0D1322]">
            <p className="text-[9px] font-bold text-muted tracking-wider select-none">
              Click element to edit. Drag to move. Use sidebar for styling. Zoom to adjust view.
            </p>
          </div>
        </div>
      </div>

      {/* Inspect Canonical JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Canonical layout_config JSON
              </span>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="text-muted hover:text-foreground p-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-[10px] font-mono text-emerald-300 bg-black/50 custom-scrollbar">
              {JSON.stringify(currentCanonicalConfig, null, 2)}
            </pre>
            <div className="p-3 border-t border-white/10 flex justify-end gap-2 bg-black/30">
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 cursor-pointer"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedJson ? 'Disalin!' : 'Salin JSON'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tahap 3B: Preview Simulasi Penyimpanan Frame (Safeguard Aktif) */}
      {showSimulationModal && simulationResult && (
        <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0B0F19] border border-emerald-500/30 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-emerald-500/10">
            {/* Header Modal */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#0D1322]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                      SIMULASI PENYIMPANAN FRAME
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Safeguard Aktif
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5">
                    Uji validasi payload dan simulasi alur penyimpanan tanpa memutasi data backend produksi.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulationModal(false)}
                className="text-muted hover:text-foreground p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {/* Alert Callout: Status Data Belum Tersimpan ke Server */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-[10px] leading-relaxed">
                  <p className="font-black text-amber-300 text-[11px] mb-1">
                    STATUS: DATA BELUM TERSIMPAN KE SERVER (SAFEGUARD AKTIF)
                  </p>
                  <p className="text-amber-200/90">
                    Ini adalah <strong>mode simulasi &amp; validasi Tahap 3B</strong>. Permintaan HTTP <strong className="text-white font-mono">{simulationResult.method} {simulationResult.endpoint}</strong> berhasil diverifikasi secara lokal dan <strong>DITAHAN</strong>. Tidak ada data yang ditulis atau diubah pada database backend produksi sampai persetujuan izin tertulis diberikan.
                  </p>
                </div>
              </div>

              {/* Status Validasi & Alur */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted">HTTP Method</p>
                  <p className="text-xs font-mono font-bold text-emerald-400 mt-1">{simulationResult.method}</p>
                </div>
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted">Alur Operasi</p>
                  <p className="text-xs font-bold text-foreground mt-1 truncate">
                    {simulationResult.method === 'POST' ? 'Create Frame Baru' : `Update Frame #${simulationResult.templateId}`}
                  </p>
                </div>
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted">Status Validasi</p>
                  <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Lulus (0 Error)
                  </p>
                </div>
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted">Status Kiosk</p>
                  <p className="text-xs font-bold text-foreground mt-1">
                    {simulationResult.payload.is_active ? '✅ Live (is_active: 1)' : '⏸️ Draft (is_active: 0)'}
                  </p>
                </div>
              </div>

              {/* Warnings Jika Ada */}
              {simulationResult.validation.warnings.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-[10px] text-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Pemberitahuan Validasi ({simulationResult.validation.warnings.length}):
                  </div>
                  {simulationResult.validation.warnings.map((w, idx) => (
                    <p key={idx} className="pl-5 text-amber-200/80">• {w}</p>
                  ))}
                </div>
              )}

              {/* Preview Payload JSON */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted">
                  <span>Payload yang Disiapkan ({JSON.stringify(simulationResult.payload).length} bytes)</span>
                  <span className="text-emerald-400">Endpoint: {simulationResult.endpoint}</span>
                </div>
                <pre className="p-4 bg-black/60 border border-white/10 rounded-2xl text-[10px] font-mono text-emerald-300 max-h-56 overflow-auto custom-scrollbar">
                  {JSON.stringify(simulationResult.payload, null, 2)}
                </pre>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between bg-[#0D1322]">
              <span className="text-[9px] text-muted">
                Timestamp: {new Date(simulationResult.timestamp).toLocaleTimeString('id-ID')}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopySimulationJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  {copiedSimulationJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSimulationJson ? 'Tersalin' : 'Salin Payload JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSimulationModal(false)}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Tutup Simulasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
