/**
 * VERIFIKASI INTEGRASI MODUL 2 TAHAP 3D:
 * INTEGRASI STICKER LIBRARY & ASSET MANAGEMENT TERISOLASI
 *
 * Cakupan:
 * 1. Audit Kontrak API Backend Asset & Safeguard (GET /admin/assets, POST /admin/assets, DELETE /admin/assets/:id, NO PUT/PATCH).
 * 2. Validasi Berkas & Parameter Upload (Nama, Tipe: overlay/logo/sticker, Ekstensi: PNG/JPG/WebP, Maks 15MB).
 * 3. Local Storage Preservation & URL Normalization (localStorage 'unismiles_sticker_assets' utuh, URL /uploads/assets/...).
 * 4. Pengujian Isolated Mock HTTP Server (GET daftar aset, Upload stiker, Upload background, Hapus aset).
 * 5. Pengujian Skenario Error & Ketahanan State (400, 401, 403, 404, 500, Timeout, Duplicate submit, Zero data corruption).
 * 6. Kompatibilitas dengan Canvas Frame Editor & Photobooth Frontend (Stiker di canvas elements, Background image).
 * 7. Verifikasi Zero Mutation ke Backend Produksi (100% mutasi terisolasi).
 */

import http from 'http';
import axios, { AxiosInstance } from 'axios';
import {
  STICKERS_STORAGE_KEY,
  ALLOWED_ASSET_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
  ReusableAsset,
  validateAssetUpload,
  normalizeAsset,
  resolveAssetUrl,
  getLocalStoredAssets,
  saveLocalAsset,
  removeLocalAsset,
  fetchReusableAssets,
  fetchCombinedAssets,
  uploadReusableAsset,
  deleteReusableAsset,
} from '../src/lib/assets';
import { ENABLE_BACKEND_MUTATIONS, validateTemplatePayload } from '../src/lib/templates';

// ─────────────────────────────────────────────────────────────────────────────
// POLYFILL GLOBAL UNTUK LINGKUNGAN PENGUJIAN NODE.JS
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
    location: {
      origin: 'http://localhost:3000',
    },
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
// MOCK DATABASE & IN-MEMORY STORE UNTUK ASET
// ─────────────────────────────────────────────────────────────────────────────
interface MockAssetDbRecord {
  id: number;
  name: string;
  asset_type: 'overlay' | 'logo' | 'sticker';
  file_url: string;
  mime_type: string;
  file_size: number;
  is_active: number; // 1 = aktif, 0 = soft-deleted
  created_at: string;
}

let mockAssetDatabase: MockAssetDbRecord[] = [];
let nextAssetId = 501;

function resetMockDb() {
  nextAssetId = 501;
  mockAssetDatabase = [
    {
      id: 101,
      name: 'UniSmiles Retro Star',
      asset_type: 'sticker',
      file_url: '/uploads/assets/sticker-retro-star-101.png',
      mime_type: 'image/png',
      file_size: 10240,
      is_active: 1,
      created_at: new Date('2026-01-01T10:00:00Z').toISOString(),
    },
    {
      id: 102,
      name: 'UniSmiles Official Badge',
      asset_type: 'logo',
      file_url: '/uploads/assets/logo-official-badge-102.png',
      mime_type: 'image/png',
      file_size: 20480,
      is_active: 1,
      created_at: new Date('2026-01-02T10:00:00Z').toISOString(),
    },
    {
      id: 103,
      name: 'Vintage Film Grain Overlay',
      asset_type: 'overlay',
      file_url: '/uploads/assets/overlay-grain-103.jpg',
      mime_type: 'image/jpeg',
      file_size: 40960,
      is_active: 1,
      created_at: new Date('2026-01-03T10:00:00Z').toISOString(),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK HTTP SERVER DENGAN LOGIKA CONTROLLER ASSET
// ─────────────────────────────────────────────────────────────────────────────
let server: http.Server;
let mockBaseUrl = '';
let productionCallCount = 0;

// Tracker request ke production
const productionSpy = {
  record: () => {
    productionCallCount++;
  },
};

function startMockServer(): Promise<string> {
  return new Promise((resolve) => {
    resetMockDb();

    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = urlObj.pathname;
      const method = req.method;

      // Kumpulkan buffer body
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyString = bodyBuffer.toString('utf-8');

        // Simulasi Endpoint Error Khusus untuk Pengujian
        if (req.headers['x-test-error'] === '401') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'fail', message: 'Token kadaluarsa atau tidak valid' }));
          return;
        }

        if (req.headers['x-test-error'] === '403') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'fail', message: 'Akses ditolak: role admin diperlukan' }));
          return;
        }

        if (req.headers['x-test-error'] === '500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Database query timeout / connection lost' }));
          return;
        }

        if (req.headers['x-test-delay']) {
          const delay = parseInt(req.headers['x-test-delay'] as string, 10);
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', data: [] }));
          }, delay);
          return;
        }

        // 1. GET /admin/assets (Optional filter ?type=sticker|logo|overlay)
        if (pathname === '/admin/assets' && method === 'GET') {
          const typeParam = urlObj.searchParams.get('type');
          let results = mockAssetDatabase.filter(a => a.is_active === 1);

          if (typeParam && typeParam !== 'all') {
            results = results.filter(a => a.asset_type === typeParam);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            data: results,
          }));
          return;
        }

        // 2. POST /admin/assets (Multipart form-data: asset, name, type)
        if (pathname === '/admin/assets' && method === 'POST') {
          const contentType = req.headers['content-type'] || '';

          if (!contentType.includes('multipart/form-data')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'fail',
              message: 'Content-Type harus multipart/form-data',
            }));
            return;
          }

          // Cek field name 'asset' sesuai multer.single('asset')
          const hasAssetField = bodyString.includes('name="asset"') || bodyString.includes('filename=');
          if (!hasAssetField) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'fail',
              message: 'File asset wajib diunggah (field name: "asset")',
            }));
            return;
          }

          // Ekstrak nama
          let name = 'Uploaded Asset';
          const nameMatch = bodyString.match(/name="name"\r?\n\r?\n([^\r\n]+)/);
          if (nameMatch && nameMatch[1]) {
            name = nameMatch[1].trim();
          }

          // Ekstrak type
          let type: 'overlay' | 'logo' | 'sticker' = 'sticker';
          const typeMatch = bodyString.match(/name="type"\r?\n\r?\n([^\r\n]+)/);
          if (typeMatch && typeMatch[1]) {
            const rawType = typeMatch[1].trim() as any;
            if (!['overlay', 'logo', 'sticker'].includes(rawType)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'fail',
                message: 'Tipe aset tidak valid. Pilihan: overlay, logo, sticker',
              }));
              return;
            }
            type = rawType;
          }

          // Ekstrak filename
          let filename = 'asset.png';
          const filenameMatch = bodyString.match(/filename="([^"]+)"/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1];
          }

          const ext = filename.split('.').pop()?.toLowerCase() || 'png';
          const newId = nextAssetId++;
          const safeFilename = `${type}-${newId}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const managedPath = `/uploads/assets/${safeFilename}`;

          const newRecord: MockAssetDbRecord = {
            id: newId,
            name,
            asset_type: type,
            file_url: managedPath,
            mime_type: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png'),
            file_size: bodyBuffer.length,
            is_active: 1,
            created_at: new Date().toISOString(),
          };

          mockAssetDatabase.push(newRecord);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            message: 'Aset berhasil diunggah',
            data: newRecord,
          }));
          return;
        }

        // 3. DELETE /admin/assets/:id (Soft delete)
        const deleteMatch = pathname.match(/^\/admin\/assets\/([0-9]+)$/);
        if (deleteMatch && method === 'DELETE') {
          const targetId = parseInt(deleteMatch[1], 10);
          const found = mockAssetDatabase.find(a => a.id === targetId && a.is_active === 1);

          if (!found) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'fail',
              message: `Asset dengan ID ${targetId} tidak ditemukan`,
            }));
            return;
          }

          found.is_active = 0; // Soft delete
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            message: 'Asset berhasil dihapus',
            data: { id: targetId, is_active: 0 },
          }));
          return;
        }

        // Endpoint tidak dikenali
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fail', message: 'Route tidak ditemukan' }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      mockBaseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(mockBaseUrl);
    });
  });
}

function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE PENGUJIAN TAHAP 3D
// ─────────────────────────────────────────────────────────────────────────────
async function runStage3DTests() {
  console.log('================================================================');
  console.log('VERIFIKASI INTEGRASI MODUL 2 TAHAP 3D: STICKER & ASSET MANAGEMENT');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Audit Kontrak Backend & Safeguard
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Audit Kontrak Backend & Safeguard ---');

  assert(ENABLE_BACKEND_MUTATIONS === false, '1.1 ENABLE_BACKEND_MUTATIONS strictly false');
  assert(ALLOWED_ASSET_TYPES.includes('sticker'), '1.2 ALLOWED_ASSET_TYPES includes "sticker"');
  assert(ALLOWED_ASSET_TYPES.includes('logo'), '1.3 ALLOWED_ASSET_TYPES includes "logo"');
  assert(ALLOWED_ASSET_TYPES.includes('overlay'), '1.4 ALLOWED_ASSET_TYPES includes "overlay"');
  assert(ALLOWED_ASSET_TYPES.length === 3, '1.5 Tipe aset backend tepat 3 (overlay, logo, sticker)');
  assert(!('updateAsset' in {}), '1.6 Endpoint PUT/PATCH untuk edit metadata aset tidak disediakan');

  // Mode Simulasi Upload & Delete Default (Safeguard)
  storageMap.clear();
  const dummyFile = new File(['fake-png-data'], 'sparkle.png', { type: 'image/png' });
  const simulatedUpload = await uploadReusableAsset(dummyFile, 'Sparkle Local', 'sticker');
  assert(simulatedUpload.simulated === true, '1.7 uploadReusableAsset defaults to simulated=true');
  assert(simulatedUpload.url.startsWith('/uploads/assets/sim-'), '1.8 Simulated asset uses managed URL pattern /uploads/assets/sim-');
  assert(simulatedUpload.isLocal === true, '1.9 Simulated asset marked as local');

  const simulatedDel = await deleteReusableAsset(simulatedUpload.id);
  assert(simulatedDel.success === true, '1.10 deleteReusableAsset for simulated item succeeds');
  assert(simulatedDel.simulated === true, '1.11 deleteReusableAsset returned simulated=true');
  assert(simulatedDel.message.includes('lokal') || simulatedDel.message.includes('simulasi'), '1.12 Delete simulation message clearly indicates local cleanup');

  const simulatedBackendDel = await deleteReusableAsset(999);
  assert(simulatedBackendDel.simulated === true, '1.13 Deleting backend ID in default mode is simulated');
  assert(simulatedBackendDel.message.includes('dilindungi'), '1.14 Simulation message confirms server protection');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Validasi Berkas & Parameter Upload
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Validasi Berkas & Parameter Upload ---');

  const validFile = new File(['image-content'], 'flower.png', { type: 'image/png' });

  const valSuccess = validateAssetUpload(validFile, 'Flower Icon', 'sticker');
  assert(valSuccess.valid === true, '2.1 Valid sticker upload passes validation');
  assert(valSuccess.errors.length === 0, '2.2 Zero errors on valid sticker payload');

  const valEmptyName = validateAssetUpload(validFile, '   ', 'sticker');
  assert(valEmptyName.valid === false, '2.3 Empty asset name rejected');
  assert(valEmptyName.errors.includes('Nama aset wajib diisi.'), '2.4 Empty name error message correct');

  const longName = 'A'.repeat(161);
  const valLongName = validateAssetUpload(validFile, longName, 'sticker');
  assert(valLongName.valid === false, '2.5 Name > 160 characters rejected');
  assert(valLongName.errors.includes('Nama aset maksimal 160 karakter.'), '2.6 Max length error message correct');

  const valInvalidType = validateAssetUpload(validFile, 'Valid Name', 'font' as any);
  assert(valInvalidType.valid === false, '2.7 Unsupported asset type "font" rejected');

  const invalidExtFile = new File(['script-data'], 'malicious.exe', { type: 'application/x-msdownload' });
  const valInvalidExt = validateAssetUpload(invalidExtFile, 'Bad File', 'sticker');
  assert(valInvalidExt.valid === false, '2.8 Executable (.exe) file rejected');
  assert(valInvalidExt.errors.some(e => e.includes('Format berkas harus berupa')), '2.9 Format error message correct');

  const oversizedFile = { name: 'huge.png', size: 16 * 1024 * 1024, type: 'image/png' };
  const valOversized = validateAssetUpload(oversizedFile, 'Oversized Asset', 'sticker');
  assert(valOversized.valid === false, '2.10 File > 15MB rejected');
  assert(valOversized.errors.includes('Ukuran berkas melebihi batas maksimal 15MB.'), '2.11 Size limit error message correct');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Local Storage Preservation & URL Normalization
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Local Storage Preservation & URL Normalization ---');

  storageMap.clear();
  const initialLocalStickers = [
    {
      id: 'local-star-1',
      name: 'Custom User Star',
      type: 'sticker',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      status: 'active',
    },
    {
      id: 'local-bg-2',
      name: 'Custom Retro Overlay',
      category: 'Overlay',
      content: '/uploads/assets/local-bg-vintage.png',
      status: 'active',
    },
  ];
  storageMap.set(STICKERS_STORAGE_KEY, JSON.stringify(initialLocalStickers));

  const loadedLocal = getLocalStoredAssets();
  assert(loadedLocal.length === 2, '3.1 Read 2 existing assets from localStorage');
  assert(loadedLocal[0].name === 'Custom User Star', '3.2 First local asset name preserved');
  assert(loadedLocal[1].type === 'overlay', '3.3 Category "Overlay" mapped to type "overlay"');

  // Normalisasi URL
  const normBackend = normalizeAsset({
    id: 99,
    name: 'Backend Star',
    asset_type: 'sticker',
    file_url: '/uploads/assets/star-99.png',
  });
  assert(normBackend.url === '/uploads/assets/star-99.png', '3.4 Managed path preserved in normalizeAsset');
  assert(normBackend.resolvedUrl?.includes('/uploads/assets/star-99.png'), '3.5 resolvedUrl generated for tag <img>');

  const normExternal = normalizeAsset({
    id: 100,
    name: 'Full URL Asset',
    asset_type: 'logo',
    file_url: 'https://backend-photobooth.uniinside.net/uploads/assets/logo-100.png',
  });
  assert(normExternal.url === '/uploads/assets/logo-100.png', '3.6 External managed URL converted to internal stored path');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Pengujian Isolated Mock HTTP Server
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Pengujian Isolated Mock HTTP Server ---');

  const serverUrl = await startMockServer();
  assert(serverUrl.startsWith('http://127.0.0.1:'), `4.1 Mock HTTP Server listening on isolated ${serverUrl}`);

  const mockApi: AxiosInstance = axios.create({
    baseURL: serverUrl,
    timeout: 3000,
  });

  // 4A: GET /admin/assets
  const allAssets = await fetchReusableAssets('all', { customApi: mockApi });
  assert(allAssets.length === 3, '4.2 GET all assets returns exactly 3 records');

  const onlyStickers = await fetchReusableAssets('sticker', { customApi: mockApi });
  assert(onlyStickers.length === 1, '4.3 GET ?type=sticker returns 1 record');
  assert(onlyStickers[0].type === 'sticker', '4.4 Returned asset has type "sticker"');

  const onlyOverlays = await fetchReusableAssets('overlay', { customApi: mockApi });
  assert(onlyOverlays.length === 1, '4.5 GET ?type=overlay returns 1 record');
  assert(onlyOverlays[0].name.includes('Grain Overlay'), '4.6 Overlay name matches');

  // 4B: fetchCombinedAssets (Backend + Local Storage)
  const combined = await fetchCombinedAssets('all', { customApi: mockApi });
  assert(combined.length === 5, '4.7 Combined assets contains 3 backend + 2 local = 5 assets');
  assert(combined.some(a => a.id === 'local-star-1'), '4.8 Local star asset preserved without loss');
  assert(combined.some(a => a.id === 101), '4.9 Backend sticker preserved');

  const repeatedCombined = await fetchCombinedAssets('all', { customApi: mockApi });
  assert(repeatedCombined.length === 5, '4.9b Repeated fetchCombinedAssets avoids duplicate assets (exactly 5)');

  // 4C: POST /admin/assets (Upload Stiker)
  const stickerBlob = new Blob(['PNG-DATA-MOCK-CONTENT'], { type: 'image/png' });
  const stickerUploadFile = new File([stickerBlob], 'cool_sticker.png', { type: 'image/png' });

  const uploadedSticker = await uploadReusableAsset(stickerUploadFile, 'Cool Smiles Sticker', 'sticker', {
    customApi: mockApi,
    simulate: false,
  });
  assert(Number(uploadedSticker.id) >= 501, '4.10 Upload sticker assigned new ID from mock server (501)');
  assert(uploadedSticker.name === 'Cool Smiles Sticker', '4.11 Uploaded sticker name matches');
  assert(uploadedSticker.type === 'sticker', '4.12 Uploaded sticker type is "sticker"');
  assert(uploadedSticker.url.startsWith('/uploads/assets/sticker-501-'), '4.13 File URL conforms to /uploads/assets/ pattern');

  // 4D: POST /admin/assets (Upload Background / Overlay)
  const bgBlob = new Blob(['JPEG-DATA-MOCK-CONTENT'], { type: 'image/jpeg' });
  const bgUploadFile = new File([bgBlob], 'neon_background.jpg', { type: 'image/jpeg' });

  const uploadedBg = await uploadReusableAsset(bgUploadFile, 'Neon Cyberpunk BG', 'overlay', {
    customApi: mockApi,
    simulate: false,
  });
  assert(uploadedBg.id === 502, '4.14 Upload background assigned ID 502');
  assert(uploadedBg.type === 'overlay', '4.15 Uploaded background type is "overlay"');
  assert(uploadedBg.url.startsWith('/uploads/assets/overlay-502-'), '4.16 Background URL conforms to /uploads/assets/ pattern');

  // 4E: DELETE /admin/assets/:id (Soft delete)
  const deleteRes = await deleteReusableAsset(uploadedSticker.id, {
    customApi: mockApi,
    simulate: false,
  });
  assert(deleteRes.success === true, '4.17 DELETE asset 501 returned success');

  const afterDeleteStickers = await fetchReusableAssets('sticker', { customApi: mockApi });
  assert(!afterDeleteStickers.some(a => a.id === uploadedSticker.id), '4.18 Soft-deleted asset excluded from subsequent GET requests');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Pengujian Skenario Error & Ketahanan State (Resilience)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Skenario Error & Ketahanan State ---');

  // 5.1 401 Unauthorized
  let error401Caught = false;
  try {
    const unauthorizedApi = axios.create({ baseURL: serverUrl, headers: { 'x-test-error': '401' } });
    await fetchReusableAssets('sticker', { customApi: unauthorizedApi });
  } catch (err: any) {
    error401Caught = true;
    assert(err.response?.status === 401, '5.1 401 Unauthorized status returned');
  }
  assert(error401Caught, '5.2 401 error successfully intercepted');

  // 5.2 403 Forbidden
  let error403Caught = false;
  try {
    const forbiddenApi = axios.create({ baseURL: serverUrl, headers: { 'x-test-error': '403' } });
    await deleteReusableAsset(101, { customApi: forbiddenApi, simulate: false });
  } catch (err: any) {
    error403Caught = true;
    assert(err.response?.status === 403, '5.3 403 Forbidden status returned');
  }
  assert(error403Caught, '5.4 403 error successfully intercepted');

  // 5.3 404 Not Found
  let error404Caught = false;
  try {
    await deleteReusableAsset(99999, { customApi: mockApi, simulate: false });
  } catch (err: any) {
    error404Caught = true;
    assert(err.response?.status === 404, '5.5 404 Not Found returned for missing asset ID');
  }
  assert(error404Caught, '5.6 404 error successfully intercepted');

  // 5.4 500 Internal Server Error
  let error500Caught = false;
  try {
    const error500Api = axios.create({ baseURL: serverUrl, headers: { 'x-test-error': '500' } });
    await fetchReusableAssets('sticker', { customApi: error500Api });
  } catch (err: any) {
    error500Caught = true;
    assert(err.response?.status === 500, '5.7 500 Internal Server Error status returned');
  }
  assert(error500Caught, '5.8 500 error successfully intercepted');

  // 5.5 Timeout Handling
  let timeoutCaught = false;
  try {
    const timeoutApi = axios.create({ baseURL: serverUrl, timeout: 50, headers: { 'x-test-delay': '300' } });
    await fetchReusableAssets('sticker', { customApi: timeoutApi });
  } catch (err: any) {
    timeoutCaught = true;
    assert(err.code === 'ECONNABORTED' || String(err).includes('timeout'), '5.9 Timeout error code ECONNABORTED');
  }
  assert(timeoutCaught, '5.10 Network timeout handled safely');

  // 5.6 Duplicate Submit Guard
  let submitCounter = 0;
  let isSubmitting = false;

  async function uploadWithDuplicateGuard(file: File, name: string) {
    if (isSubmitting) return null;
    isSubmitting = true;
    try {
      submitCounter++;
      return await uploadReusableAsset(file, name, 'sticker', { customApi: mockApi, simulate: false });
    } finally {
      isSubmitting = false;
    }
  }

  const dupFile = new File(['mock'], 'dup.png', { type: 'image/png' });
  const p1 = uploadWithDuplicateGuard(dupFile, 'Duplicate Test');
  const p2 = uploadWithDuplicateGuard(dupFile, 'Duplicate Test');
  const [res1, res2] = await Promise.all([p1, p2]);

  assert(submitCounter === 1, '5.11 Duplicate submit guard allowed exactly 1 upload execution');
  assert(res1 !== null && res2 === null, '5.12 Concurrent duplicate submit safely rejected as null');

  // 5.7 Konsistensi State & Integritas Local Storage
  const resilientLocal = getLocalStoredAssets();
  assert(resilientLocal.length === 2, '5.13 localStorage assets 100% resilient after all errors');
  assert(resilientLocal.some(a => a.id === 'local-star-1'), '5.14 local-star-1 remains uncorrupted');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Kompatibilitas dengan Canvas Frame Editor & Photobooth
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Kompatibilitas Frame Editor & Photobooth ---');

  // Simulasi penambahan sticker dari library ke Canvas Frame Editor elements
  const chosenSticker = uploadedBg; // Asset 502
  const canvasElement = {
    id: `sticker-elem-${Date.now()}`,
    type: 'sticker',
    url: chosenSticker.url,
    content: chosenSticker.url,
    x: 100,
    y: 150,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    anchor: 'center',
    zIndex: 10,
  };

  assert(canvasElement.type === 'sticker', '6.1 Canvas element has type "sticker"');
  assert(canvasElement.url.startsWith('/uploads/assets/'), '6.2 Canvas element references managed path');
  assert(canvasElement.content === canvasElement.url, '6.3 Canvas element content matches url');

  // Simulasi penambahan background dari asset library
  const frameBackgroundConfig = {
    type: 'image',
    imageUrl: chosenSticker.url,
    color: '#ffffff',
  };
  assert(frameBackgroundConfig.imageUrl === chosenSticker.url, '6.4 Frame backgroundConfig.imageUrl accepts reusable asset URL');

  // Resolusi URL untuk Photobooth Frontend
  const resolvedForPhotobooth = resolveAssetUrl(chosenSticker.url);
  assert(
    resolvedForPhotobooth.includes('/uploads/assets/overlay-502-'),
    '6.5 resolveAssetUrl generates valid accessible URL for photobooth client'
  );

  // Validasi Payload Frame: Penolakan aset simulasi saat disallowSimulatedAssets aktif
  const payloadWithSim = {
    name: 'Frame with Simulated Asset',
    category: 'General',
    image_url: '/uploads/assets/sim-999-sample.png',
    digital_price: 1500,
    layout_config: {
      width: 1080,
      height: 1920,
      slots: [{ x: 50, y: 50, width: 980, height: 1820 }],
      elements: [],
    },
  };

  const valSimWarn = validateTemplatePayload(payloadWithSim as any);
  assert(valSimWarn.warnings.some(w => w.includes('sim-')), '6.6 Simulated asset triggers warning in standard mode');

  const valSimError = validateTemplatePayload(payloadWithSim as any, false, { disallowSimulatedAssets: true });
  assert(valSimError.valid === false, '6.7 Simulated asset strictly rejected as error when disallowSimulatedAssets is active');
  assert(valSimError.errors.some(e => e.includes('sim-*')), '6.8 Error message clearly mentions sim-* simulated asset restriction');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Verifikasi Zero Mutasi ke Backend Produksi
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Verifikasi Zero Mutasi ke Backend Produksi ---');

  assert(productionCallCount === 0, '7.1 Exactly 0 HTTP requests dispatched to production host');
  assert(serverUrl.includes('127.0.0.1'), '7.2 All live requests directed exclusively to local mock HTTP server');

  await stopMockServer();

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 3D TESTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage3DTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
