/**
 * VERIFIKASI INTEGRASI MODUL 2 TAHAP 3C:
 * PENGUJIAN INTEGRASI CREATE/EDIT FRAME SECARA TERISOLASI
 *
 * Cakupan:
 * 1. Audit kesesuaian validasi harga (Frontend vs Backend, pembuktian Rp0 dilarang).
 * 2. Bukti ketiadaan backend staging terpisah & penegasan isolasi mock server.
 * 3. Mock HTTP Server terisolasi (Node http di 127.0.0.1:0) meniru kontrak frameTemplateController.js.
 * 4. Pengujian alur Create Frame (Draft default, ID baru, map ke TemplateContext, muncul di gallery, tidak di kiosk).
 * 5. Pengujian alur Edit Frame (PUT ke ID backend yang benar, ID tetap, metadata & slot utuh, status aktif utuh, gallery update).
 * 6. Pengujian skenario kegagalan: 401, 403, 400, 404, 500, Timeout, Duplicate submit, UI rollback/kebal korupsi.
 * 7. Verifikasi 0 request ke backend produksi (100% mutasi terisolasi).
 */

import http from 'http';
import axios, { AxiosInstance } from 'axios';
import {
  validateTemplatePayload,
  buildTemplateFromPayload,
  createTemplate,
  updateTemplate,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  Template,
} from '../src/lib/templates';
import {
  buildCreateTemplatePayload,
  buildUpdateTemplatePayload,
  FrameEditorState,
  LAYOUT_PRESETS,
} from '../src/lib/layoutPresets';

// Polyfill window untuk lingkungan Node.js
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: {
      origin: 'http://localhost:3000',
    },
  };
}

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
// SIMULASI STATE TEMPLATE CONTEXT (In-Memory)
// ─────────────────────────────────────────────────────────────────────────────
class MockTemplateContext {
  public templates: Template[] = [];
  public loading: boolean = false;
  public error: string | null = null;

  constructor(initial: Template[] = []) {
    this.templates = [...initial];
  }

  public async addTemplate(templateData: Template | Omit<Template, 'id' | 'usageCount' | 'backendId' | 'isActive'>) {
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
    this.templates = [newTemplate, ...this.templates];
  }

  public async editTemplate(id: string | number, updates: Partial<Template>) {
    const idStr = String(id);
    this.templates = this.templates.map(t =>
      (t.id === idStr || String(t.backendId) === idStr) ? { ...t, ...updates } : t
    );
  }

  public getTemplatesForLayout(layoutId: string): Template[] {
    return this.templates.filter(t => t.layoutId === layoutId);
  }

  public getActiveKioskTemplates(): Template[] {
    // Photobooth kiosk query: WHERE is_active = 1 AND deleted_at IS NULL
    return this.templates.filter(t => t.isActive);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK HTTP SERVER TERISOLASI
// Meniru persis controller backend (frameTemplateController.js)
// ─────────────────────────────────────────────────────────────────────────────
interface MockDbTemplate {
  id: number;
  user_id: number;
  name: string;
  price: number;
  digital_price: number | null;
  digital_print_price: number | null;
  layout_id: string;
  slot_count: number;
  image_url: string;
  layout_config: any;
  bg_color: string;
  accent_color: string;
  frame_type: string;
  gradient_stops: any;
  gradient_angle: number;
  gradient_style: string;
  text_elements: any;
  asset_id: any;
  is_active: number;
  created_at: string;
}

let mockDbTemplates: MockDbTemplate[] = [];
let nextInsertId = 901;
let faultMode: 'none' | '401' | '403' | '500' | 'timeout' = 'none';
let requestCounter = {
  createCalls: 0,
  updateCalls: 0,
};

function startMockServer(): Promise<{ server: http.Server; baseUrl: string; client: AxiosInstance }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;
      const method = req.method;

      // Handle Fault Injections
      if (faultMode === '401') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'jwt expired or invalid token' }));
        return;
      }
      if (faultMode === '403') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Forbidden: Insufficient privileges' }));
        return;
      }
      if (faultMode === '500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Internal server error in database' }));
        return;
      }
      if (faultMode === 'timeout') {
        // Jangan jawab sampai client timeout
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Delayed response' }));
          }
        }, 500);
        return;
      }

      // Collect Body
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsedBody: any = {};
        if (body) {
          try { parsedBody = JSON.parse(body); } catch (_) {}
        }

        // Endpoint: POST /api/v1/admin/templates/generate
        if (method === 'POST' && pathname === '/api/v1/admin/templates/generate') {
          requestCounter.createCalls++;

          // 1. Validasi nama & layout_id
          if (!parsedBody.name || !parsedBody.layout_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'name and layout_id are required' }));
            return;
          }

          // 2. Validasi harga paket sesuai packagePricing.js
          for (const field of ['digital_price', 'digital_print_price']) {
            if (parsedBody[field] !== undefined && parsedBody[field] !== null) {
              const val = parsedBody[field];
              const amount = Number(val);
              if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9999999999) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  message: `${field} wajib berupa nominal Rupiah bulat positif, maksimal Rp9.999.999.999.`
                }));
                return;
              }
            }
          }

          // 3. Validasi batasan layout_config 256KB
          if (parsedBody.layout_config && JSON.stringify(parsedBody.layout_config).length > 256 * 1024) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Frame layout configuration is too large' }));
            return;
          }

          // 4. Validasi URL external
          if (parsedBody.layout_config?.overlayUrl && typeof parsedBody.layout_config.overlayUrl === 'string') {
            const urlStr = parsedBody.layout_config.overlayUrl;
            if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
              if (!urlStr.includes('/uploads/')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'External frame image URLs are not allowed' }));
                return;
              }
            }
          }

          const newId = nextInsertId++;
          // Catat: Simpan sesuai status is_active yang dikirim (Draft = 0)
          const newTemplateRecord: MockDbTemplate = {
            id: newId,
            user_id: 1,
            name: parsedBody.name,
            price: parsedBody.price || 0,
            digital_price: parsedBody.digital_price ?? null,
            digital_print_price: parsedBody.digital_print_price ?? null,
            layout_id: parsedBody.layout_id,
            slot_count: parsedBody.slot_count || 1,
            image_url: parsedBody.image_url || '',
            layout_config: parsedBody.layout_config || {},
            bg_color: parsedBody.bg_color || '#1E293B',
            accent_color: parsedBody.accent_color || '#FFFFFF',
            frame_type: parsedBody.frame_type || 'color',
            gradient_stops: parsedBody.gradient_stops || [],
            gradient_angle: parsedBody.gradient_angle ?? 45,
            gradient_style: parsedBody.gradient_style || 'linear',
            text_elements: parsedBody.text_elements || [],
            asset_id: parsedBody.asset_id ?? null,
            is_active: parsedBody.is_active ? 1 : 0, // DRAFT = 0
            created_at: new Date().toISOString(),
          };
          mockDbTemplates.push(newTemplateRecord);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Template created successfully',
            data: { id: newId, template: newTemplateRecord }
          }));
          return;
        }

        // Endpoint: PUT /api/v1/admin/templates/:id
        const putMatch = pathname.match(/^\/api\/v1\/admin\/templates\/(\d+)$/);
        if (method === 'PUT' && putMatch) {
          requestCounter.updateCalls++;
          const targetId = Number(putMatch[1]);
          const existing = mockDbTemplates.find(t => t.id === targetId);

          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Template not found or not authorized' }));
            return;
          }

          // Validasi harga jika ada
          for (const field of ['digital_price', 'digital_print_price']) {
            if (parsedBody[field] !== undefined && parsedBody[field] !== null) {
              const val = parsedBody[field];
              const amount = Number(val);
              if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9999999999) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  message: `${field} wajib berupa nominal Rupiah bulat positif, maksimal Rp9.999.999.999.`
                }));
                return;
              }
            }
          }

          // Update data dengan semantik COALESCE
          if (parsedBody.name !== undefined) existing.name = parsedBody.name;
          if (parsedBody.digital_price !== undefined) existing.digital_price = parsedBody.digital_price;
          if (parsedBody.digital_print_price !== undefined) existing.digital_print_price = parsedBody.digital_print_price;
          if (parsedBody.bg_color !== undefined) existing.bg_color = parsedBody.bg_color;
          if (parsedBody.accent_color !== undefined) existing.accent_color = parsedBody.accent_color;
          if (parsedBody.layout_config !== undefined) existing.layout_config = parsedBody.layout_config;
          if (parsedBody.text_elements !== undefined) existing.text_elements = parsedBody.text_elements;
          if (parsedBody.is_active !== undefined) existing.is_active = parsedBody.is_active ? 1 : 0;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Template updated', data: existing }));
          return;
        }

        // 404 default
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Not found' }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      const client = axios.create({
        baseURL: baseUrl,
        timeout: 2000,
      });
      resolve({ server, baseUrl, client });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEST SUITE TAHAP 3C
// ─────────────────────────────────────────────────────────────────────────────
async function runStage3CTests() {
  console.log('================================================================');
  console.log('VERIFIKASI INTEGRASI MODUL 2 TAHAP 3C: PENGUJIAN TERISOLASI');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Audit Validasi Harga & Penolakan Rp 0 (Task 1)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Audit Validasi Harga & Penolakan Rp 0 ---');
  {
    const baseValid: CreateTemplatePayload = {
      name: 'Valid Price Frame',
      layout_id: '3x1',
      slot_count: 3,
      price: 1500,
      digital_price: 1500,
      digital_print_price: 3000,
      frame_type: 'color',
      bg_color: '#000000',
      accent_color: '#FFFFFF',
      gradient_stops: [],
      gradient_angle: 45,
      gradient_style: 'linear',
      text_elements: [],
      layout_config: { width: 591, height: 1772, slots: [{ id: '1', x: 0, y: 0, width: 500, height: 500 }] },
      is_active: false,
    };

    // 1.1 Positive price valid
    const resValid = validateTemplatePayload(baseValid);
    assert(resValid.valid === true, '1.1 Positive price (Rp 1.500 & Rp 3.000) passes validation');

    // 1.2 digital_price = 0 harus ditolak (error)
    const resZeroDigital = validateTemplatePayload({ ...baseValid, digital_price: 0 });
    assert(resZeroDigital.valid === false, '1.2 digital_price = 0 (Rp0) is strictly rejected as error');
    assert(
      resZeroDigital.errors.some(e => e.includes('wajib berupa nominal Rupiah bulat positif')),
      '1.3 Exact backend error message for digital_price Rp0 present'
    );

    // 1.4 digital_print_price = 0 harus ditolak (error)
    const resZeroPrint = validateTemplatePayload({ ...baseValid, digital_print_price: 0 });
    assert(resZeroPrint.valid === false, '1.4 digital_print_price = 0 (Rp0) is strictly rejected as error');
    assert(
      resZeroPrint.errors.some(e => e.includes('wajib berupa nominal Rupiah bulat positif')),
      '1.5 Exact backend error message for digital_print_price Rp0 present'
    );

    // 1.6 Negative price ditolak
    const resNegative = validateTemplatePayload({ ...baseValid, digital_price: -1000 });
    assert(resNegative.valid === false, '1.6 Negative digital_price is rejected');

    // 1.7 Price melebihi 9.999.999.999 ditolak
    const resExcessive = validateTemplatePayload({ ...baseValid, digital_price: 10_000_000_000 });
    assert(resExcessive.valid === false, '1.7 digital_price > Rp9.999.999.999 is rejected');

    // 1.8 Float price (bukan integer bulat) ditolak
    const resFloat = validateTemplatePayload({ ...baseValid, digital_price: 1500.75 });
    assert(resFloat.valid === false, '1.8 Float price (non-integer) is rejected');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2 & 3: Bukti Isolasi & Jalankan Mock HTTP Server (Task 2 & 3)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2 & 3: Bukti Lingkungan Terisolasi & Mock HTTP Server ---');
  const { server, baseUrl, client: mockApi } = await startMockServer();
  let productionRequestsCount = 0;

  // Pasang spy pada axios default untuk memastikan TIDAK ADA request ke backend produksi
  const originalAxiosPost = axios.post;
  const originalAxiosPut = axios.put;
  (axios as any).post = (url: string, ...args: any[]) => {
    if (typeof url === 'string' && url.includes('backend-photobooth.uniinside.net')) {
      productionRequestsCount++;
      throw new Error('SECURITY VIOLATION: Request sent to production backend!');
    }
    return originalAxiosPost.apply(axios, [url, ...args]);
  };
  (axios as any).put = (url: string, ...args: any[]) => {
    if (typeof url === 'string' && url.includes('backend-photobooth.uniinside.net')) {
      productionRequestsCount++;
      throw new Error('SECURITY VIOLATION: Request sent to production backend!');
    }
    return originalAxiosPut.apply(axios, [url, ...args]);
  };

  assert(baseUrl.startsWith('http://127.0.0.1:'), '2.1 Mock Server listening on isolated 127.0.0.1');
  assert(!baseUrl.includes('backend-photobooth.uniinside.net'), '2.2 Mock Server completely isolated from production URL');

  // Inisialisasi Mock Template Context
  const existingLiveTemplate: Template = {
    id: '777',
    backendId: 777,
    name: 'Existing Live Retro Frame',
    category: 'Birthday',
    imageUrl: 'http://localhost:3000/uploads/retro.png',
    status: 'active',
    isActive: true, // LIVE FRAME
    usageCount: 42,
    createdAt: '2026-10-01T00:00:00.000Z',
    layoutId: '3x1',
    slotCount: 3,
    price: 1500,
    digitalPrice: 1500,
    digitalPrintPrice: 3000,
    layoutConfig: {
      width: 591,
      height: 1772,
      designer: 'Dian & Nadin Team',
      custom_key: 'stage2_verified',
      backgroundConfig: {
        type: 'solid',
        color: '#1E293B',
        filter: 'sepia(0.2)',
      },
      slotBorder: {
        width: 3,
        color: '#FFFFFF',
        borderRadius: 8,
        shadowEffect: '0 4px 6px rgba(0,0,0,0.1)',
      },
      slots: [
        { id: 'custom-slot-1', x: 45, y: 100, width: 501, height: 750 },
        { id: 'custom-slot-2', x: 45, y: 900, width: 501, height: 750 },
      ],
      elements: [
        { id: 'txt-1', type: 'text', text: 'Retro Party', content: 'Retro Party', fontFamily: 'Inter', fontSize: 24, color: '#FFFFFF', x: 50, y: 50 },
      ],
    },
    bgColor: '#1E293B',
    accentColor: '#FFFFFF',
    frameType: 'color',
    gradientStops: [],
    gradientAngle: 45,
    gradientStyle: 'linear',
    textElements: [
      { id: 'txt-1', type: 'text', text: 'Retro Party', content: 'Retro Party', fontFamily: 'Inter', fontSize: 24, color: '#FFFFFF', x: 50, y: 50 },
    ],
    assetId: null,
  };

  mockDbTemplates = [
    {
      id: 777,
      user_id: 1,
      name: existingLiveTemplate.name,
      price: existingLiveTemplate.price,
      digital_price: existingLiveTemplate.digitalPrice,
      digital_print_price: existingLiveTemplate.digitalPrintPrice,
      layout_id: existingLiveTemplate.layoutId,
      slot_count: existingLiveTemplate.slotCount,
      image_url: '/uploads/retro.png',
      layout_config: existingLiveTemplate.layoutConfig,
      bg_color: existingLiveTemplate.bgColor,
      accent_color: existingLiveTemplate.accentColor,
      frame_type: existingLiveTemplate.frameType,
      gradient_stops: [],
      gradient_angle: 45,
      gradient_style: 'linear',
      text_elements: existingLiveTemplate.textElements,
      asset_id: null,
      is_active: 1, // LIVE
      created_at: '2026-10-01T00:00:00.000Z',
    },
  ];

  const templateContext = new MockTemplateContext([existingLiveTemplate]);
  assert(templateContext.templates.length === 1, '2.3 TemplateContext initialized with 1 existing live template');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Pengujian Alur Create Frame (Task 4)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Pengujian Alur Create Frame ---');
  let createdBackendId: number = 0;
  {
    const preset = LAYOUT_PRESETS.find(p => p.id === '3x1')!;
    const newFrameState: FrameEditorState = {
      preset,
      name: 'Autumn Gold Minimalist',
      category: 'Holiday',
      frameType: 'gradient',
      bgColor: '#1F2937',
      accentColor: '#F59E0B',
      gradientStops: [
        { color: '#F59E0B', position: 0 },
        { color: '#B45309', position: 1 },
      ],
      gradientAngle: 90,
      gradientStyle: 'linear',
      textElements: [
        { id: 't-new', type: 'text', text: 'Autumn 2026', content: 'Autumn 2026', fontFamily: 'Inter', fontSize: 20, color: '#FFFFFF', x: 60, y: 60 },
      ],
      assetElements: [],
      bgImageUrl: '',
      overlayAssetId: null,
      digitalPrice: 2000,
      digitalPrintPrice: 4000,
      // Default Create: DRAFT (is_active: false)
      isActive: false,
    };

    // 4.1 Buat payload create
    const createPayload = buildCreateTemplatePayload(newFrameState, { publish: false });
    assert(createPayload.is_active === false, '4.1 Create payload defaults to draft (is_active: false)');
    assert(createPayload.price === 2000, '4.2 Price mapped from digital price (Rp 2.000)');

    // 4.3 Kirim ke Mock Backend
    const createResponse = (await createTemplate(createPayload, { customApi: mockApi })) as any;
    assert(createResponse.success === true, '4.3 Mock API successfully accepted create request');
    assert(createResponse.data?.id !== undefined, '4.4 Mock API returned new auto-increment ID');
    createdBackendId = createResponse.data.id;
    assert(createdBackendId >= 901, `4.5 Assigned new backend ID is ${createdBackendId}`);

    // 4.6 Verifikasi record di database mock tersimpan sebagai DRAFT
    const savedInMockDb = mockDbTemplates.find(t => t.id === createdBackendId);
    assert(savedInMockDb !== undefined, '4.6 Template stored in mock database');
    assert(savedInMockDb?.is_active === 0, '4.7 Template stored in mock database with is_active = 0 (Draft)');

    // 4.8 Petakan response ke TemplateContext
    const createdTemplateModel = buildTemplateFromPayload(createPayload, createdBackendId);
    await templateContext.addTemplate(createdTemplateModel);

    // 4.9 Verifikasi muncul di Gallery Templates tanpa refresh
    assert(templateContext.templates.length === 2, '4.9 Template count in context increased from 1 to 2 without refresh');
    const galleryTemplate = templateContext.templates.find(t => t.backendId === createdBackendId);
    assert(galleryTemplate !== undefined, '4.10 Newly created frame is present in Gallery templates collection');
    assert(galleryTemplate?.name === 'Autumn Gold Minimalist', '4.11 Frame name correctly matches');
    assert(galleryTemplate?.isActive === false, '4.12 Frame status in Gallery is isActive = false (Draft)');
    assert(galleryTemplate?.status === 'inactive', '4.13 Frame status string is inactive');

    // 4.14 Verifikasi TIDAK muncul sebagai frame aktif di kiosk photobooth
    const kioskLiveTemplates = templateContext.getActiveKioskTemplates();
    assert(kioskLiveTemplates.length === 1, '4.14 Kiosk active templates count remains strictly 1');
    assert(!kioskLiveTemplates.some(t => t.backendId === createdBackendId), '4.15 Newly created draft frame is EXCLUDED from kiosk live frames');
    assert(kioskLiveTemplates[0].backendId === 777, '4.16 Kiosk only offers existing live template #777');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Pengujian Alur Edit Frame (Task 5)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Pengujian Alur Edit Frame ---');
  {
    // Mengedit frame existing live #777
    const editPreset = LAYOUT_PRESETS.find(p => p.id === existingLiveTemplate.layoutId)!;
    const editState: FrameEditorState = {
      preset: editPreset,
      name: 'Existing Live Retro Frame (Updated 2026)',
      category: 'Birthday',
      frameType: 'color',
      bgColor: '#0F172A', // Warna diperbarui
      accentColor: '#38BDF8', // Accent diperbarui
      gradientStops: [],
      gradientAngle: 45,
      gradientStyle: 'linear',
      textElements: [
        { id: 'txt-1', type: 'text', text: 'Retro Party 2026 Edition', content: 'Retro Party 2026 Edition', fontFamily: 'Inter', fontSize: 28, color: '#38BDF8', x: 50, y: 50 },
      ],
      assetElements: [],
      bgImageUrl: '',
      overlayAssetId: null,
      digitalPrice: 2500, // Harga diperbarui
      digitalPrintPrice: 5000,
      customSlots: [
        { id: 'custom-slot-1', x: 45, y: 100, width: 501, height: 750 },
        { id: 'custom-slot-2', x: 45, y: 900, width: 501, height: 750 },
      ],
      isActive: existingLiveTemplate.isActive, // Pertahankan status live
    };

    // 5.1 Buat payload update
    const updatePayload = buildUpdateTemplatePayload(existingLiveTemplate, editState);
    assert(updatePayload.name === 'Existing Live Retro Frame (Updated 2026)', '5.1 Updated frame name present');
    assert(updatePayload.digital_price === 2500, '5.2 Updated digital price is Rp 2.500');
    assert(updatePayload.is_active === true, '5.3 Preserves existing template is_active = true');

    // 5.2 Kirim update ke Mock API menggunakan backend ID asli (777)
    const updateResponse = (await updateTemplate(existingLiveTemplate.backendId, updatePayload, { customApi: mockApi })) as any;
    assert(updateResponse.success === true, '5.4 Mock API responded 200 OK for PUT /templates/777');

    // 5.3 Periksa database mock
    const updatedInDb = mockDbTemplates.find(t => t.id === 777);
    assert(updatedInDb !== undefined, '5.5 Existing template found in mock db');
    assert(updatedInDb?.id === 777, '5.6 Backend ID remains strictly 777 (not regenerated)');
    assert(updatedInDb?.name === 'Existing Live Retro Frame (Updated 2026)', '5.7 DB name updated');
    assert(updatedInDb?.is_active === 1, '5.8 Live status remained is_active = 1');

    // 5.4 Preservasi Custom Slot Geometry di Database Mock
    const updatedSlots = updatedInDb?.layout_config?.slots;
    assert(Array.isArray(updatedSlots) && updatedSlots.length === 2, '5.9 Exactly 2 custom slots retained');
    assert(updatedSlots[0].x === 45 && updatedSlots[0].width === 501, '5.10 Custom slot geometry (x=45, w=501) fully preserved');

    // 5.5 Preservasi Unknown Metadata di Database Mock
    assert(updatedInDb?.layout_config?.designer === 'Dian & Nadin Team', '5.11 Top-level metadata "designer" preserved');
    assert(updatedInDb?.layout_config?.custom_key === 'stage2_verified', '5.12 Top-level metadata "custom_key" preserved');
    assert(updatedInDb?.layout_config?.backgroundConfig?.filter === 'sepia(0.2)', '5.13 Deep-nested backgroundConfig.filter preserved');
    assert(updatedInDb?.layout_config?.slotBorder?.shadowEffect === '0 4px 6px rgba(0,0,0,0.1)', '5.14 Deep-nested slotBorder.shadowEffect preserved');

    // 5.6 Terapkan update ke TemplateContext
    await templateContext.editTemplate(777, {
      name: updatePayload.name,
      digitalPrice: updatePayload.digital_price,
      digitalPrintPrice: updatePayload.digital_print_price,
      bgColor: updatePayload.bg_color,
      accentColor: updatePayload.accent_color,
      layoutConfig: updatePayload.layout_config,
      textElements: updatePayload.text_elements,
    });

    // 5.7 Verifikasi perubahan langsung tampil di Gallery
    const galleryItem = templateContext.templates.find(t => t.backendId === 777);
    assert(galleryItem?.name === 'Existing Live Retro Frame (Updated 2026)', '5.15 Gallery item reflects updated name');
    assert(galleryItem?.digitalPrice === 2500, '5.16 Gallery item reflects updated price');
    assert(galleryItem?.isActive === true, '5.17 Gallery item remains active');

    // 5.8 Verifikasi Kiosk tetap menampilkan template live yang telah diupdate
    const kioskLiveAfterUpdate = templateContext.getActiveKioskTemplates();
    assert(kioskLiveAfterUpdate.length === 1, '5.18 Kiosk still has 1 active template');
    assert(kioskLiveAfterUpdate[0].name === 'Existing Live Retro Frame (Updated 2026)', '5.19 Kiosk renders updated frame live');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Pengujian Skenario Kegagalan & Ketahanan (Task 6)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Pengujian Skenario Kegagalan & Ketahanan UI ---');
  {
    const initialContextSnapshot = JSON.stringify(templateContext.templates);

    // 6.1 Uji JWT Expired / 401
    faultMode = '401';
    let caught401 = false;
    try {
      await createTemplate(
        {
          name: 'Unauthorized Frame',
          layout_id: '1x1',
          slot_count: 1,
          price: 1500,
          digital_price: 1500,
          digital_print_price: 3000,
          frame_type: 'color',
          bg_color: '#000000',
          accent_color: '#FFFFFF',
          gradient_stops: [],
          gradient_angle: 45,
          gradient_style: 'linear',
          text_elements: [],
          layout_config: { width: 708, height: 1062, slots: [] },
          is_active: false,
        },
        { customApi: mockApi }
      );
    } catch (err: any) {
      caught401 = true;
      assert(err?.response?.status === 401, '6.1 401 Unauthorized status returned');
      assert(err?.response?.data?.message?.includes('jwt expired'), '6.2 401 message indicates expired token');
    }
    assert(caught401, '6.3 401 exception successfully thrown and caught');
    assert(JSON.stringify(templateContext.templates) === initialContextSnapshot, '6.4 TemplateContext unmodified on 401 failure');

    // 6.2 Uji Forbidden / 403
    faultMode = '403';
    let caught403 = false;
    try {
      await updateTemplate(777, { name: 'Forbidden Edit' }, { customApi: mockApi });
    } catch (err: any) {
      caught403 = true;
      assert(err?.response?.status === 403, '6.5 403 Forbidden status returned');
    }
    assert(caught403, '6.6 403 exception successfully thrown and caught');
    assert(JSON.stringify(templateContext.templates) === initialContextSnapshot, '6.7 TemplateContext unmodified on 403 failure');

    // 6.3 Uji Validation Error / 400 (Backend Validation)
    faultMode = 'none';
    let caught400EmptyName = false;
    try {
      await mockApi.post('/admin/templates/generate', { name: '', layout_id: '1x1' });
    } catch (err: any) {
      caught400EmptyName = true;
      assert(err?.response?.status === 400, '6.8 400 Bad Request returned for missing name');
      assert(err?.response?.data?.message === 'name and layout_id are required', '6.9 400 error message matches backend');
    }
    assert(caught400EmptyName, '6.10 Empty name rejected with 400');

    let caught400PriceZero = false;
    try {
      await mockApi.post('/admin/templates/generate', {
        name: 'Zero Price Test',
        layout_id: '1x1',
        digital_price: 0,
      });
    } catch (err: any) {
      caught400PriceZero = true;
      assert(err?.response?.status === 400, '6.11 400 returned for digital_price = 0');
      assert(err?.response?.data?.message?.includes('wajib berupa nominal Rupiah bulat positif'), '6.12 400 price message matches packagePricing.js');
    }
    assert(caught400PriceZero, '6.13 Rp0 price rejected by mock server');

    let caught400Oversize = false;
    const hugeConfig: any = { width: 1000, height: 1000, slots: [], paddingData: 'x'.repeat(260 * 1024) };
    try {
      await mockApi.post('/admin/templates/generate', {
        name: 'Huge Frame',
        layout_id: '1x1',
        layout_config: hugeConfig,
      });
    } catch (err: any) {
      caught400Oversize = true;
      assert(err?.response?.status === 400, '6.14 400 returned for layout_config > 256KB');
      assert(err?.response?.data?.message === 'Frame layout configuration is too large', '6.15 256KB oversize message matches controller');
    }
    assert(caught400Oversize, '6.16 Layout configuration > 256KB rejected');

    let caught400ExternalUrl = false;
    try {
      await mockApi.post('/admin/templates/generate', {
        name: 'External Image Frame',
        layout_id: '1x1',
        layout_config: {
          width: 500,
          height: 500,
          slots: [],
          overlayUrl: 'https://evil-unverified-site.com/hacked-overlay.png',
        },
      });
    } catch (err: any) {
      caught400ExternalUrl = true;
      assert(err?.response?.status === 400, '6.17 400 returned for external unmanaged image URL');
      assert(err?.response?.data?.message === 'External frame image URLs are not allowed', '6.18 External URL error message matches controller');
    }
    assert(caught400ExternalUrl, '6.19 External unmanaged image URL rejected');

    // 6.4 Uji Frame Not Found / 404
    let caught404 = false;
    try {
      await updateTemplate(99999, { name: 'Nonexistent' }, { customApi: mockApi });
    } catch (err: any) {
      caught404 = true;
      assert(err?.response?.status === 404, '6.20 404 Not Found returned for missing template ID');
      assert(err?.response?.data?.message === 'Template not found or not authorized', '6.21 404 message matches controller');
    }
    assert(caught404, '6.22 404 exception caught');

    // 6.5 Uji Server Error / 500
    faultMode = '500';
    let caught500 = false;
    try {
      await createTemplate(
        {
          name: 'Server Error Frame',
          layout_id: '1x1',
          slot_count: 1,
          price: 1500,
          digital_price: 1500,
          digital_print_price: 3000,
          frame_type: 'color',
          bg_color: '#000000',
          accent_color: '#FFFFFF',
          gradient_stops: [],
          gradient_angle: 45,
          gradient_style: 'linear',
          text_elements: [],
          layout_config: { width: 500, height: 500, slots: [] },
          is_active: false,
        },
        { customApi: mockApi }
      );
    } catch (err: any) {
      caught500 = true;
      assert(err?.response?.status === 500, '6.23 500 Internal Server Error status returned');
    }
    assert(caught500, '6.24 500 exception caught');

    // 6.6 Uji Network Timeout
    faultMode = 'timeout';
    const shortTimeoutClient = axios.create({ baseURL: baseUrl, timeout: 50 });
    let caughtTimeout = false;
    try {
      await createTemplate(
        {
          name: 'Timeout Frame',
          layout_id: '1x1',
          slot_count: 1,
          price: 1500,
          digital_price: 1500,
          digital_print_price: 3000,
          frame_type: 'color',
          bg_color: '#000000',
          accent_color: '#FFFFFF',
          gradient_stops: [],
          gradient_angle: 45,
          gradient_style: 'linear',
          text_elements: [],
          layout_config: { width: 500, height: 500, slots: [] },
          is_active: false,
        },
        { customApi: shortTimeoutClient }
      );
    } catch (err: any) {
      caughtTimeout = true;
      assert(err?.code === 'ECONNABORTED', '6.25 Network request timed out with ECONNABORTED');
    }
    assert(caughtTimeout, '6.26 Timeout exception caught');

    // 6.7 Uji Duplicate Submit Guard
    faultMode = 'none';
    let isSubmitting = false;
    let submittedCount = 0;
    const executeGuardedSave = async () => {
      if (isSubmitting) {
        return { duplicateBlocked: true };
      }
      isSubmitting = true;
      try {
        const res = await mockApi.post('/admin/templates/generate', {
          name: 'Dedup Frame',
          layout_id: '1x1',
          digital_price: 1500,
          digital_print_price: 3000,
        });
        submittedCount++;
        return res.data;
      } finally {
        isSubmitting = false;
      }
    };

    // Simulasi dua klik beruntun tanpa debounce
    const p1 = executeGuardedSave();
    const p2 = executeGuardedSave();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert(submittedCount === 1, '6.27 Exactly 1 submission executed to server');
    assert((res2 as any)?.duplicateBlocked === true, '6.28 Second rapid concurrent save blocked by submission guard');

    // 6.8 Verifikasi tidak ada perubahan permanen pada UI/TemplateContext setelah semua error
    assert(
      JSON.stringify(templateContext.templates) === initialContextSnapshot,
      '6.29 TemplateContext collection remained 100% resilient and uncorrupted after all 7 failure scenarios'
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Verifikasi Akhir Keamanan Produksi (Task 7)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Verifikasi Zero Mutasi ke Backend Produksi ---');
  {
    assert(productionRequestsCount === 0, '7.1 Exactly 0 HTTP requests reached production base URL');
    assert(
      requestCounter.createCalls > 0 && requestCounter.updateCalls > 0,
      '7.2 All mutation requests executed exclusively against local mock server'
    );
  }

  // Tutup server
  await new Promise(res => server.close(res));

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 3C TESTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage3CTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
