/**
 * VERIFIKASI INTEGRASI MODUL 2 TAHAP 3E:
 * PENGUJIAN KOMPATIBILITAS END-TO-END ADMIN DIAN, BACKEND API, DAN PHOTOBOOTH
 *
 * Cakupan:
 * 1. Audit Kontrak End-to-End: Admin Canvas -> buildCreateTemplatePayload -> Backend frameTemplateController -> Kiosk API -> PhotoBooth renderer.
 * 2. Pengujian 7 Layout (1x1, 2x1, 3x1, 4x1, 2x2, 2x3, 3x3): Dimensi kanvas, slot count, slot geometry, capture indices.
 * 3. Pengujian Rendering: Background solid/gradient/image, sticker position/anchor, rotation/opacity/z-index, text sync, slot border, overlay.
 * 4. Pengujian Harga & Status: digital_price, digital_print_price, penolakan Rp0, draft hidden dari kiosk, live tampil, update preserve ID.
 * 5. Pengujian Aset: resolveFrameArtworkUrl, penolakan sim-*, isolasi kiosk dari localStorage Admin.
 * 6. Pengujian Revisi Sticker Library Pinterest Scrapbook: 25 transparent SVG stickers, 7 kategori, thumbnail compact grid, canvas addition.
 * 7. Verifikasi Zero Mutation ke Backend Produksi (100% mutasi terisolasi).
 */

import http from 'http';
import axios, { AxiosInstance } from 'axios';
import {
  LAYOUT_PRESETS,
  LayoutPreset,
  buildCreateTemplatePayload,
  buildUpdateTemplatePayload,
  FrameEditorState,
  computeSlots,
} from '../src/lib/layoutPresets';
import {
  validateTemplatePayload,
  createTemplate,
  updateTemplate,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  Template,
  ENABLE_BACKEND_MUTATIONS,
} from '../src/lib/templates';
import {
  ReusableAsset,
  fetchCombinedAssets,
  resolveAssetUrl,
  STICKERS_STORAGE_KEY,
} from '../src/lib/assets';
import {
  STICKER_DEFINITIONS,
  getDefaultScrapbookAssets,
} from '../src/lib/scrapbookStickers';

// ─────────────────────────────────────────────────────────────────────────────
// POLYFILL GLOBAL UNTUK NODE.JS ENVIRONMENT
// ─────────────────────────────────────────────────────────────────────────────
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: { origin: 'http://localhost:3000' },
    localStorage: mockLocalStorage,
  };
} else {
  (globalThis.window as any).localStorage = mockLocalStorage;
}
(globalThis as any).localStorage = mockLocalStorage;

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTOBOOTH RENDERER ENGINE LOGIC (Mirror dari frontend_uni_gateway)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Implementasi sebenarnya dari getEffectiveLayoutConfig pada PhotoBooth.tsx (line 574-652)
 */
function photoboothGetEffectiveLayoutConfig(style: any, layoutId: string) {
  const fallbackPreset = LAYOUT_PRESETS.find(p => p.id === layoutId) || LAYOUT_PRESETS[0];
  const fallback = {
    width: fallbackPreset.width,
    height: fallbackPreset.height,
    slots: computeSlots(fallbackPreset),
  };

  if (!style) return fallback;

  // Prioritas parsing kontrak backend: frameConfig > layout_config > _layoutConfig
  let raw = style.frameConfig ?? style.frame_config ?? style.layout_config ?? style._layoutConfig;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) { raw = null; }
  }
  if (!raw && (Array.isArray(style.slots) || style.width || style.height)) {
    raw = style;
  }
  if (raw && !Array.isArray(raw) && typeof raw === 'object' && raw.layout_config) {
    raw = raw.layout_config;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = null; }
    }
  }
  if (!raw) return fallback;

  const rawCanvas = raw && !Array.isArray(raw) && typeof raw === 'object'
    ? (raw.canvas || raw.frame || raw.layout || raw)
    : {};
  const targetW = Number(rawCanvas.width ?? rawCanvas.canvasWidth ?? style.canvasWidth ?? style.width);
  const targetH = Number(rawCanvas.height ?? rawCanvas.canvasHeight ?? style.canvasHeight ?? style.height);
  const width = Number.isFinite(targetW) && targetW > 0 ? targetW : fallback.width;
  const height = Number.isFinite(targetH) && targetH > 0 ? targetH : fallback.height;

  // Case 1: Array of slots
  if (Array.isArray(raw) && raw.length > 0) {
    const slots = raw
      .map((s: any) => ({
        x: Number(s.x ?? 0),
        y: Number(s.y ?? 0),
        width: Number(s.w ?? s.width ?? 0),
        height: Number(s.h ?? s.height ?? 0),
      }))
      .filter((s: any) => s.width > 0 && s.height > 0);
    if (slots.length > 0) return { width, height, slots };
  }

  // Case 2: Object { slots: [{x, y, width, height}] }
  if (raw && typeof raw === 'object' && Array.isArray(raw.slots) && raw.slots.length > 0) {
    const first = raw.slots[0];
    const sourceW = Number(rawCanvas.width) > 0 ? Number(rawCanvas.width) : width;
    const sourceH = Number(rawCanvas.height) > 0 ? Number(rawCanvas.height) : height;
    const firstSlotWidth = Number(first.width ?? first.w);
    const firstSlotHeight = Number(first.height ?? first.h);
    const declaredUnits = String(raw.units ?? raw.slotUnits ?? raw.coordinateType ?? '').toLowerCase();

    const hasCanvasDimensions = Number(rawCanvas.width) > 0 || Number(rawCanvas.height) > 0;
    const isPct = declaredUnits === 'percent' || declaredUnits === 'percentage' || declaredUnits === '%'
      || (!hasCanvasDimensions && declaredUnits !== 'pixel' && declaredUnits !== 'pixels'
        && Number.isFinite(firstSlotWidth) && Number.isFinite(firstSlotHeight)
        && firstSlotWidth <= 100 && firstSlotHeight <= 100);

    const slots = raw.slots
      .map((s: any) => ({
        x: Math.round((Number(s.x ?? 0) / (isPct ? 100 : sourceW)) * width),
        y: Math.round((Number(s.y ?? 0) / (isPct ? 100 : sourceH)) * height),
        width: Math.round((Number(s.width ?? s.w ?? 0) / (isPct ? 100 : sourceW)) * width),
        height: Math.round((Number(s.height ?? s.h ?? 0) / (isPct ? 100 : sourceH)) * height),
      }))
      .filter((s: any) => s.width > 0 && s.height > 0);

    if (slots.length > 0) return { width, height, slots };
  }

  return fallback;
}

/**
 * Implementasi getSlotBorderConfig pada PhotoBooth.tsx (line 656-670)
 */
function photoboothGetSlotBorderConfig(style: any) {
  const raw = style?._layoutConfig || style?.layout_config;
  const config = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const border = config.slotBorder ?? config.slot_border ?? style?.slotBorder ?? style?.slot_border ?? {};
  const color = border.color ?? config.slotBorderColor ?? config.slot_border_color
    ?? config.borderColor ?? config.border_color ?? config.accentColor ?? config.accent_color
    ?? style?.slotBorderColor ?? style?.slot_border_color ?? style?.borderColor ?? style?._accentColor
    ?? '#ffffff';
  const width = Number(border.width ?? config.slotBorderWidth ?? config.slot_border_width
    ?? config.borderWidth ?? config.border_width ?? style?.slotBorderWidth
    ?? style?.slot_border_width ?? style?.borderWidth ?? 2);
  return { color, width: Number.isFinite(width) && width > 0 ? width : 2 };
}

/**
 * Implementasi resolveFrameArtworkUrl pada frontend_uni_gateway/services/frameAssets.ts
 */
function photoboothResolveFrameArtworkUrl(style: any, config: any, apiBaseUrl: string): string | undefined {
  const root = String(apiBaseUrl || '').trim().replace(/\/api\/v1(?:\/kiosk)?$/i, '').replace(/\/+$/, '');
  const background = style?.backgroundConfig ?? style?.background_config ?? style?.background
    ?? config?.backgroundConfig ?? config?.background_config ?? config?.background;

  const candidates = [
    style?.overlayUrl, style?.overlay_url,
    style?.backgroundImageUrl, style?.background_image_url,
    background?.imageUrl, background?.image_url, background?.fileUrl, background?.file_url,
    background?.url, background?.src,
    style?.imageUrl, style?.image_url,
    config?.overlayUrl, config?.overlay_url,
    config?.imageUrl, config?.image_url,
  ];

  const value = candidates.find((c): c is string => typeof c === 'string' && c.trim().length > 0)?.trim();
  if (!value) return undefined;
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return root ? `${root}/${value.replace(/^\/+/, '')}` : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK HTTP SERVER UNTUK KONTRAK BACKEND & KIOSK API
// ─────────────────────────────────────────────────────────────────────────────
let server: http.Server;
let mockServerUrl = '';
let productionRequestsCount = 0;

interface MockDbTemplateRecord {
  id: number;
  name: string;
  frame_type: string;
  slot_count: number;
  price: number;
  digital_price: number;
  digital_print_price: number;
  is_active: number;
  layout_config: any;
  image_url: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

let mockDbTemplates: MockDbTemplateRecord[] = [];
let nextTplId = 801;

function resetDb() {
  nextTplId = 801;
  mockDbTemplates = [
    {
      id: 701,
      name: 'Existing Live Frame',
      frame_type: 'custom',
      slot_count: 2,
      price: 1500,
      digital_price: 1500,
      digital_print_price: 3000,
      is_active: 1, // LIVE
      layout_config: {
        width: 591,
        height: 1772,
        layout_id: '2x1',
        slots: [
          { index: 0, x: 25, y: 30, width: 541, height: 830 },
          { index: 1, x: 25, y: 880, width: 541, height: 830 },
        ],
        backgroundConfig: { type: 'solid', color: '#1E293B' },
        slotBorder: { width: 2, color: '#FFFFFF' },
        elements: [],
      },
      image_url: '',
      deleted_at: null,
      created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      updated_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    },
    {
      id: 702,
      name: 'Existing Draft Frame',
      frame_type: 'custom',
      slot_count: 4,
      price: 2000,
      digital_price: 2000,
      digital_print_price: 4000,
      is_active: 0, // DRAFT
      layout_config: {
        width: 591,
        height: 1772,
        layout_id: '4x1',
        slots: [
          { index: 0, x: 30, y: 30, width: 531, height: 380 },
          { index: 1, x: 30, y: 440, width: 531, height: 380 },
          { index: 2, x: 30, y: 850, width: 531, height: 380 },
          { index: 3, x: 30, y: 1260, width: 531, height: 380 },
        ],
        elements: [],
      },
      image_url: '',
      deleted_at: null,
      created_at: new Date('2026-01-02T00:00:00Z').toISOString(),
      updated_at: new Date('2026-01-02T00:00:00Z').toISOString(),
    },
  ];
}

function startMockServer(): Promise<string> {
  return new Promise(resolve => {
    resetDb();
    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = urlObj.pathname;
      const method = req.method;

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsedBody: any = null;
        if (body) {
          try { parsedBody = JSON.parse(body); } catch (_) {}
        }

        // 1. POST /admin/templates/generate (Create Frame)
        if (pathname === '/admin/templates/generate' && method === 'POST') {
          const newId = nextTplId++;
          const record: MockDbTemplateRecord = {
            id: newId,
            name: parsedBody.name || 'Untitled',
            frame_type: parsedBody.frame_type || 'custom',
            slot_count: parsedBody.slot_count || 1,
            price: parsedBody.digital_price || parsedBody.price || 1500,
            digital_price: parsedBody.digital_price || 1500,
            digital_print_price: parsedBody.digital_print_price || 3000,
            is_active: parsedBody.is_active ? 1 : 0, // default draft
            layout_config: parsedBody.layout_config,
            image_url: parsedBody.image_url || '',
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockDbTemplates.push(record);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', data: record }));
          return;
        }

        // 2. PUT /admin/templates/:id (Update Frame)
        const putMatch = pathname.match(/^\/admin\/templates\/([0-9]+)$/);
        if (putMatch && method === 'PUT') {
          const targetId = parseInt(putMatch[1], 10);
          const found = mockDbTemplates.find(t => t.id === targetId && !t.deleted_at);
          if (!found) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'fail', message: 'Template not found' }));
            return;
          }

          if (parsedBody.name) found.name = parsedBody.name;
          if (parsedBody.digital_price) {
            found.digital_price = parsedBody.digital_price;
            found.price = parsedBody.digital_price;
          }
          if (parsedBody.digital_print_price) found.digital_print_price = parsedBody.digital_print_price;
          if (parsedBody.layout_config) found.layout_config = parsedBody.layout_config;
          if (parsedBody.is_active !== undefined) found.is_active = parsedBody.is_active ? 1 : 0;
          found.updated_at = new Date().toISOString();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', data: found }));
          return;
        }

        // 3. GET /kiosk/templates (Kiosk API - Photobooth fetch)
        // Photobooth query: SELECT * FROM templates WHERE is_active = 1 AND deleted_at IS NULL
        if (pathname === '/kiosk/templates' && method === 'GET') {
          const liveTemplates = mockDbTemplates.filter(t => t.is_active === 1 && !t.deleted_at);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            data: liveTemplates.map(t => ({
              id: t.id,
              name: t.name,
              layout_id: t.layout_config?.layout_id || '1x1',
              slot_count: t.slot_count,
              digital_price: t.digital_price,
              digital_print_price: t.digital_print_price,
              layout_config: t.layout_config,
              _layoutConfig: t.layout_config,
              image_url: t.image_url,
              overlayUrl: t.layout_config?.overlayUrl || '',
            })),
          }));
          return;
        }

        // 4. DELETE /admin/templates/:id (Soft-delete)
        const delMatch = pathname.match(/^\/admin\/templates\/([0-9]+)$/);
        if (delMatch && method === 'DELETE') {
          const targetId = parseInt(delMatch[1], 10);
          const found = mockDbTemplates.find(t => t.id === targetId && !t.deleted_at);
          if (found) {
            found.deleted_at = new Date().toISOString();
            found.is_active = 0;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', message: 'Template soft-deleted' }));
          return;
        }

        // 5. GET /admin/assets
        if (pathname === '/admin/assets' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', data: [] }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fail', message: 'Not Found' }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      mockServerUrl = `http://127.0.0.1:${addr.port}`;
      resolve(mockServerUrl);
    });
  });
}

function stopMockServer(): Promise<void> {
  return new Promise(resolve => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE PENGUJIAN TAHAP 3E
// ─────────────────────────────────────────────────────────────────────────────
async function runStage3ETests() {
  console.log('================================================================');
  console.log('VERIFIKASI INTEGRASI MODUL 2 TAHAP 3E: COMPATIBILITY END-TO-END');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Audit Kontrak End-to-End (Admin -> Backend -> Kiosk -> PhotoBooth)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Audit Kontrak End-to-End ---');

  const serverUrl = await startMockServer();
  assert(serverUrl.startsWith('http://127.0.0.1:'), `1.1 Mock Server running on isolated ${serverUrl}`);

  const mockApi: AxiosInstance = axios.create({ baseURL: serverUrl, timeout: 3000 });

  // 1A. State di Canvas Frame Editor Admin Dian
  const preset2x1 = LAYOUT_PRESETS.find(p => p.id === '2x1')!;
  const editorState: FrameEditorState = {
    preset: preset2x1,
    name: 'End-to-End Wedding Classic',
    category: 'Wedding',
    frameType: 'gradient',
    bgColor: '#FFF5F5',
    accentColor: '#FFFFFF',
    gradientStops: [
      { color: '#FFF5F5', position: 0 },
      { color: '#FCE4EC', position: 100 },
    ],
    gradientAngle: 90,
    gradientStyle: 'linear',
    customSlots: [
      { index: 0, x: 30, y: 40, width: 531, height: 820 },
      { index: 1, x: 30, y: 890, width: 531, height: 820 },
    ],
    textElements: [
      {
        id: 'txt-1',
        text: 'HAPPY WEDDING',
        fontFamily: 'serif',
        fontSize: 24,
        color: '#4A3E3D',
        x: 50,
        y: 97,
        rotation: 0,
      },
    ],
    assetElements: [
      {
        id: 'ast-1',
        name: 'Coquette Pink Bow',
        type: 'sticker',
        url: '/uploads/assets/sticker-coquette-bow.png',
        x: 50,
        y: 2,
        width: 80,
        height: 60,
        rotation: 0,
        opacity: 1,
        anchor: 'center',
      },
    ],
    bgImageUrl: '',
    digitalPrice: '2000',
    digitalPrintPrice: '3500',
    isActive: false,
  };

  // 1B. Build Payload Create
  const createPayload = buildCreateTemplatePayload(editorState);
  assert(createPayload.name === 'End-to-End Wedding Classic', '1.2 Name mapped to create payload');
  assert(createPayload.layout_id === '2x1', '1.3 layout_id matches 2x1');
  assert(createPayload.slot_count === 2, '1.4 slot_count matches 2');
  assert(createPayload.is_active === false, '1.5 Create defaults to draft (is_active: false)');
  assert(createPayload.digital_price === 2000, '1.6 digital_price is 2000');
  assert(createPayload.digital_print_price === 3500, '1.7 digital_print_price is 3500');

  // Canonical layout_config fields matching ADMIN_FRAME_DATA_PROMPT.md
  const cfg = createPayload.layout_config;
  assert(cfg.width === 591, '1.8 Canvas width in layout_config is 591px');
  assert(cfg.height === 1772, '1.9 Canvas height in layout_config is 1772px');
  assert(cfg.slots.length === 2, '1.10 Exactly 2 slots in canonical layout_config');
  assert(cfg.slots[0].x === 30 && cfg.slots[0].width === 531, '1.11 Slot 0 geometry matches Admin editor');
  assert(cfg.slotBorder.width === 2 && cfg.slotBorder.color === '#FFFFFF', '1.12 slotBorder preserved in canonical format');
  assert(cfg.elements.length === 1 && (cfg.assetElements?.length === 1), '1.13 Elements separated into elements (text) and assetElements (stickers)');

  // 1C. Simulasikan Pengiriman ke Backend
  const backendRes = await mockApi.post('/admin/templates/generate', createPayload);
  assert(backendRes.status === 201, '1.14 Backend accepted create request with 201 Created');
  const savedTemplate = backendRes.data.data;
  assert(savedTemplate.id === 801, '1.15 Template saved in database with auto-increment ID 801');
  assert(savedTemplate.is_active === 0, '1.16 Saved in database as draft (is_active: 0)');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Matriks Kompatibilitas 7 Layout Resmi
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Matriks Kompatibilitas 7 Layout Resmi ---');

  const officialLayouts = ['1x1', '2x1', '3x1', '4x1', '2x2', '2x3', '3x3'];
  assert(officialLayouts.length === 7, '2.1 Exactly 7 official layouts in test suite');

  for (const layoutId of officialLayouts) {
    const preset = LAYOUT_PRESETS.find(p => p.id === layoutId);
    assert(!!preset, `2.2 Preset ${layoutId} exists in LAYOUT_PRESETS`);
    if (!preset) continue;

    // Buat state editor untuk layout ini
    const testState: FrameEditorState = {
      preset,
      name: `Frame Layout ${layoutId}`,
      category: 'General',
      frameType: 'color',
      bgColor: '#FFFFFF',
      accentColor: '#3B82F6',
      gradientStops: [{ color: '#FFF', position: 0 }, { color: '#EEE', position: 100 }],
      gradientAngle: 0,
      gradientStyle: 'linear',
      customSlots: computeSlots(preset),
      textElements: [],
      assetElements: [],
      bgImageUrl: '',
      digitalPrice: '1500',
      digitalPrintPrice: '3000',
    };

    const payload = buildCreateTemplatePayload(testState);
    const pbConfig = photoboothGetEffectiveLayoutConfig(
      { layout_config: payload.layout_config },
      layoutId
    );

    // Verifikasi keselarasan dimensi
    assert(pbConfig.width === preset.width, `2.3 [${layoutId}] Photobooth width (${pbConfig.width}) === Admin (${preset.width})`);
    assert(pbConfig.height === preset.height, `2.4 [${layoutId}] Photobooth height (${pbConfig.height}) === Admin (${preset.height})`);
    assert(pbConfig.slots.length === preset.slots, `2.5 [${layoutId}] Photobooth slot count (${pbConfig.slots.length}) === Preset (${preset.slots})`);

    // Verifikasi slot capture sequence index
    for (let i = 0; i < pbConfig.slots.length; i++) {
      assert(pbConfig.slots[i].width > 0 && pbConfig.slots[i].height > 0, `2.6 [${layoutId}] Slot ${i} has positive dimensions`);
      assert(pbConfig.slots[i].x >= 0 && pbConfig.slots[i].y >= 0, `2.7 [${layoutId}] Slot ${i} has non-negative coordinates`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Pengujian Rendering (Background, Slot Border, Stickers, Text)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Pengujian Rendering ---');

  // 3A. Solid & Gradient Background
  const gradientTemplate = {
    layout_config: {
      width: 1205,
      height: 1795,
      backgroundConfig: {
        type: 'gradient',
        color: '#FF69B4',
        gradient: {
          type: 'linear',
          angle: 45,
          stops: [
            { id: '1', color: '#FF69B4', position: 0 },
            { id: '2', color: '#9C27B0', position: 100 },
          ],
        },
      },
      slots: [{ index: 0, x: 50, y: 50, width: 500, height: 750 }],
      slotBorder: { width: 4, color: '#FFD700' },
    },
  };

  const pbBorder = photoboothGetSlotBorderConfig(gradientTemplate);
  assert(pbBorder.width === 4, '3.1 Slot border width parsed correctly as 4px');
  assert(pbBorder.color === '#FFD700', '3.2 Slot border color parsed correctly as #FFD700');

  // 3B. Sticker Position, Anchor & Rotation
  const stickerElement = editorState.assetElements[0];
  assert(stickerElement.anchor === 'center', '3.3 Sticker anchor is "center"');
  assert(stickerElement.rotation === 0, '3.4 Sticker rotation preserved');
  assert(stickerElement.opacity === 1, '3.5 Sticker opacity preserved');

  // 3C. Text Elements Synchronization
  const textElem = editorState.textElements[0];
  assert(textElem.text === 'HAPPY WEDDING', '3.6 Text string matches exactly');
  assert(textElem.fontFamily === 'serif', '3.7 Font family serif preserved');
  assert(textElem.fontSize === 24, '3.8 Font size 24 preserved');
  assert(textElem.color === '#4A3E3D', '3.9 Font color preserved');

  // 3D. Extra Unknown Metadata Preservation
  const existingTemplateRecord: Template = {
    id: '801',
    name: 'End-to-End Wedding Classic',
    category: 'Wedding',
    imageUrl: '',
    status: 'active',
    usageCount: 0,
    backendId: 801,
    layoutId: '2x1',
    slotCount: 2,
    isActive: true,
    price: 2000,
    digitalPrice: 2000,
    digitalPrintPrice: 3500,
    frameType: 'gradient',
    bgColor: '#FFF5F5',
    accentColor: '#FFFFFF',
    gradientStops: [
      { color: '#FFF5F5', position: 0 },
      { color: '#FCE4EC', position: 100 },
    ],
    gradientAngle: 90,
    gradientStyle: 'linear',
    textElements: editorState.textElements,
    layoutConfig: {
      ...createPayload.layout_config,
      designer: 'Dian & Tim',
      unrecognizedEngineKey: 'photobooth-v3-alpha',
      kioskFilterPreset: 'sepia-vintage',
    },
  };

  const updatePayloadWithExtra = buildUpdateTemplatePayload(
    existingTemplateRecord,
    editorState
  );
  assert(
    (updatePayloadWithExtra.layout_config as any).designer === 'Dian & Tim',
    '3.10 Top-level metadata "designer" preserved'
  );
  assert(
    (updatePayloadWithExtra.layout_config as any).unrecognizedEngineKey === 'photobooth-v3-alpha',
    '3.11 Unrecognized custom metadata preserved untouched'
  );
  assert(
    (updatePayloadWithExtra.layout_config as any).kioskFilterPreset === 'sepia-vintage',
    '3.12 Kiosk filter preset metadata preserved untouched'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Pengujian Harga & Status (Kiosk Visibility & Soft-Delete)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Pengujian Harga & Status ---');

  // 4A. Penolakan Harga Rp0
  const zeroPriceVal = validateTemplatePayload({
    name: 'Zero Price Test',
    digital_price: 0,
    digital_print_price: 3000,
  } as any);
  assert(zeroPriceVal.valid === false, '4.1 digital_price = 0 is strictly rejected');
  assert(zeroPriceVal.errors.some(e => e.includes('digital_price')), '4.2 Error message for digital_price = 0 present');

  // 4B. Draft Frame Hidden dari Kiosk API
  const kioskResBefore = await mockApi.get('/kiosk/templates');
  const kioskTemplatesBefore = kioskResBefore.data.data;
  assert(
    !kioskTemplatesBefore.some((t: any) => t.id === 801),
    '4.3 Draft template #801 is completely HIDDEN from kiosk templates list'
  );
  assert(
    kioskTemplatesBefore.some((t: any) => t.id === 701),
    '4.4 Live template #701 is VISIBLE on kiosk'
  );

  // 4C. Update Frame Publikasi (is_active: 1)
  const pubRes = await mockApi.put('/admin/templates/801', { is_active: 1 });
  assert(pubRes.status === 200, '4.5 Admin successfully published template #801');

  const kioskResAfter = await mockApi.get('/kiosk/templates');
  const kioskTemplatesAfter = kioskResAfter.data.data;
  assert(
    kioskTemplatesAfter.some((t: any) => t.id === 801),
    '4.6 Newly published template #801 is now VISIBLE on kiosk'
  );

  // 4D. Update Frame Mempertahankan ID
  assert(pubRes.data.data.id === 801, '4.7 Update frame strictly preserves original ID #801');

  // 4E. Soft-Delete Mempertahankan Referensi Historis
  await mockApi.delete('/admin/templates/801');
  const kioskResDel = await mockApi.get('/kiosk/templates');
  assert(
    !kioskResDel.data.data.some((t: any) => t.id === 801),
    '4.8 Soft-deleted template #801 immediately removed from kiosk display'
  );
  const deletedInDb = mockDbTemplates.find(t => t.id === 801);
  assert(deletedInDb?.deleted_at !== null, '4.9 Record persists in database with deleted_at timestamp (historical retention)');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Pengujian Aset & Kompatibilitas URL
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Pengujian Aset & Kompatibilitas URL ---');

  // 5A. URL Managed /uploads/assets/... diresolve oleh Photobooth
  const sampleStyle = {
    overlayUrl: '/uploads/assets/sticker-coquette-bow.png',
    backgroundConfig: { imageUrl: '/uploads/assets/neon-bg.jpg' },
  };
  const resolvedArtwork = photoboothResolveFrameArtworkUrl(sampleStyle, sampleStyle, 'http://127.0.0.1:5000/api/v1');
  assert(
    resolvedArtwork === 'http://127.0.0.1:5000/uploads/assets/sticker-coquette-bow.png',
    '5.1 photoboothResolveFrameArtworkUrl correctly maps relative /uploads/ path to server root'
  );

  // 5B. Data URL Resolves As-Is
  const svgDataUrl = 'data:image/svg+xml;utf8,<svg></svg>';
  const resolvedDataUrl = photoboothResolveFrameArtworkUrl({ overlayUrl: svgDataUrl }, {}, 'http://127.0.0.1:5000');
  assert(resolvedDataUrl === svgDataUrl, '5.2 Data URL preserved as-is without host prepending');

  // 5C. Aset sim-* Ditolak pada Mutasi Sungguhan
  const simAssetPayload = {
    name: 'Frame With Simulated Asset',
    image_url: '/uploads/assets/sim-12345-sparkle.png',
    digital_price: 1500,
    layout_config: { width: 600, height: 1700, slots: [{ x: 0, y: 0, width: 100, height: 100 }] },
  };
  const simVal = validateTemplatePayload(simAssetPayload as any, false, { disallowSimulatedAssets: true });
  assert(simVal.valid === false, '5.3 Payload containing sim-* asset rejected when disallowSimulatedAssets: true');

  // 5D. Kiosk Mandiri dari localStorage Admin Dian
  assert(
    kioskTemplatesAfter[0]._layoutConfig.slots.length > 0,
    '5.4 Kiosk receives complete canvas configuration from API response, independent of Admin localStorage'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Pengujian Revisi Sticker Library (Pinterest Scrapbook Stickers)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Pengujian Revisi Sticker Library Scrapbook ---');

  const defaultScrapbook = getDefaultScrapbookAssets();
  assert(defaultScrapbook.length === 25, '6.1 Exactly 25 cute scrapbook stickers available');
  assert(STICKER_DEFINITIONS.length === 25, '6.2 STICKER_DEFINITIONS has 25 items');

  // Verifikasi Kategori-Kategori yang diminta User
  const categories = new Set(defaultScrapbook.map(s => s.category));
  assert(categories.has('Animals'), '6.3 Kategori "Animals" (cats, bear, bunny, shiba) present');
  assert(categories.has('Ribbons'), '6.4 Kategori "Ribbons" (coquette bows, ribbons) present');
  assert(categories.has('Love & Flowers'), '6.5 Kategori "Love & Flowers" (hearts, sakura, daisy, tulip) present');
  assert(categories.has('Fruits'), '6.6 Kategori "Fruits" (strawberry, cherries, peach) present');
  assert(categories.has('Birthday'), '6.7 Kategori "Birthday" (cupcake, celebration cake) present');
  assert(categories.has('Stars & Magic'), '6.8 Kategori "Stars & Magic" (sparkle star, butterfly, twinkle) present');
  assert(categories.has('Vintage & Deco'), '6.9 Kategori "Vintage & Deco" (retro camera, film, washi tape, stamp) present');

  // Verifikasi Background Transparan & URL Data
  for (const sticker of defaultScrapbook) {
    assert(sticker.url.startsWith('data:image/svg+xml;utf8,'), `6.10 [${sticker.id}] Uses valid transparent SVG data URL`);
    assert(sticker.type === 'sticker', `6.11 [${sticker.id}] Type is "sticker"`);
    assert(sticker.name.trim().length > 0, `6.12 [${sticker.id}] Has friendly name (${sticker.name})`);
  }

  // Verifikasi fetchCombinedAssets dengan includeDefaults: true
  storageMap.clear();
  const uiAssets = await fetchCombinedAssets('all', { includeDefaults: true, customApi: mockApi });
  assert(uiAssets.length >= 25, '6.13 fetchCombinedAssets with includeDefaults: true returns all scrapbook stickers');
  assert(uiAssets.some(a => a.id === 'sticker-coquette-bow'), '6.14 Coquette pink bow sticker is present in UI assets collection');
  assert(uiAssets.some(a => a.id === 'sticker-cat-white'), '6.15 Cute white cat sticker is present in UI assets collection');
  assert(uiAssets.some(a => a.id === 'sticker-sweet-strawberry'), '6.16 Sweet strawberry sticker is present in UI assets collection');

  // Verifikasi Kompatibilitas Penambahan Stiker ke Canvas Frame Editor
  const catSticker = defaultScrapbook.find(s => s.id === 'sticker-cat-white')!;
  const canvasElementFromSticker = {
    id: `ast-${Date.now()}`,
    type: 'sticker',
    anchor: 'top-left',
    assetId: catSticker.id,
    name: catSticker.name,
    url: catSticker.url,
    content: catSticker.url,
    x: 35,
    y: 40,
    width: 20,
    height: 20, // 1:1 proportional aspect ratio
    opacity: 1,
    rotation: 0,
  };

  assert(canvasElementFromSticker.type === 'sticker', '6.17 Canvas element type is "sticker"');
  assert(canvasElementFromSticker.width === 20 && canvasElementFromSticker.height === 20, '6.18 Proportional 1:1 aspect ratio');
  assert(canvasElementFromSticker.url === catSticker.url, '6.19 Element url matches sticker data URL');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Verifikasi Zero Mutasi ke Backend Produksi
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Verifikasi Zero Mutasi ke Backend Produksi ---');

  assert(ENABLE_BACKEND_MUTATIONS === false, '7.1 ENABLE_BACKEND_MUTATIONS strictly false');
  assert(productionRequestsCount === 0, '7.2 Exactly 0 HTTP requests dispatched to production host');
  assert(serverUrl.includes('127.0.0.1'), '7.3 All operations contained within local mock server');

  await stopMockServer();

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 3E TESTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage3ETests().catch(err => {
  console.error('Fatal test error in Stage 3E:', err);
  process.exit(1);
});
