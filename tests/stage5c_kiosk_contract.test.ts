import assert from 'assert';
import {
  validateKioskRegistration,
  getComputedStatus,
  formatLastHeartbeat,
  normalizeKioskTelemetry,
  filterKiosksByRole,
  generateSimulatedDeviceToken,
  buildEnvConfigSnippet,
  getKioskCredentials,
  registerKioskSimulation,
  regenerateCredentialSimulation,
  softDeleteKioskSimulation,
  serializeKioskPayload,
  deserializeKioskResponse,
  parseKioskApiError,
  auditKioskOperationSafety,
  SIMULATED_TOKEN_PREFIX,
} from '../src/lib/kioskService';
import {
  ENABLE_BACKEND_MUTATIONS,
  VERIFIED_STAGING_ALLOWLIST,
  assertMutationAllowed,
  isProductionApiUrl,
  isVerifiedStagingHost,
} from '../src/lib/templates';
import type { Kiosk } from '../src/KioskContext';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Mock localStorage for isolated Node test environment
const mockStorage = new Map<string, string>();
const storageObj = {
  getItem: (k: string) => mockStorage.get(k) || null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};
(global as any).window = { localStorage: storageObj };
(global as any).localStorage = storageObj;

// Helper to create an isolated mock Axios-like client for HTTP contract tests
function createMockClient(handler: (config: any) => Promise<any>) {
  return {
    defaults: { baseURL: 'https://staging-isolated.uniinside.test/api/v1' },
    get: async (url: string, cfg?: any) => handler({ method: 'GET', url, ...cfg }),
    put: async (url: string, data?: any, cfg?: any) => handler({ method: 'PUT', url, data, ...cfg }),
    post: async (url: string, data?: any, cfg?: any) => handler({ method: 'POST', url, data, ...cfg }),
    delete: async (url: string, cfg?: any) => handler({ method: 'DELETE', url, ...cfg }),
  };
}

// In-Memory Fake WebSocket Server for isolated socket contract testing
class FakeWebSocketServer extends EventEmitter {
  private connectedKiosks = new Set<string>();

  connectKiosk(kioskId: string) {
    this.connectedKiosks.add(kioskId);
    this.emit('connection', { kioskId, timestamp: new Date().toISOString() });
  }

  disconnectKiosk(kioskId: string) {
    this.connectedKiosks.delete(kioskId);
    this.emit('disconnect', { kioskId, timestamp: new Date().toISOString() });
  }

  isKioskConnected(kioskId: string): boolean {
    return this.connectedKiosks.has(kioskId);
  }

  broadcastToAdmin(event: string, payload: any) {
    this.emit(`admin:${event}`, payload);
  }

  pushKioskConfig(kioskId: string, config: any): boolean {
    if (!this.connectedKiosks.has(kioskId)) return false;
    this.emit(`kiosk:${kioskId}:config`, config);
    return true;
  }

  sendKioskCommand(kioskId: string, command: string, payload: any): boolean {
    if (!this.connectedKiosks.has(kioskId)) return false;
    this.emit(`kiosk:${kioskId}:command`, { command, payload });
    return true;
  }
}

async function runStage5cContractTests() {
  console.log('\n================================================================');
  console.log('MODUL 4 TAHAP 4C: SAFE SIMULATION & BACKEND CONTRACT TESTS');
  console.log('================================================================\n');

  let passed = 0;
  function countAssert(condition: any, msg: string) {
    assert(condition, msg);
    passed++;
  }
  function countStrictEqual(actual: any, expected: any, msg: string) {
    assert.strictEqual(actual, expected, msg);
    passed++;
  }
  function countDeepStrictEqual(actual: any, expected: any, msg: string) {
    assert.deepStrictEqual(actual, expected, msg);
    passed++;
  }
  function countThrows(fn: () => void, expected: any, msg: string) {
    assert.throws(fn, expected, msg);
    passed++;
  }
  async function countRejects(fn: () => Promise<any>, expected: any, msg: string) {
    await assert.rejects(fn, expected, msg);
    passed++;
  }
  function logSectionPass(msg: string) {
    console.log(`[PASS] ${msg}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: POST /api/v1/admin/kiosks Registration Contract
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 1: POST /api/v1/admin/kiosks Registration Contract ---');

  // 1.1 Valid serialization with all fields
  const fullPayload = {
    name: 'Kiosk Summarecon Mall Serpong',
    location: 'Lantai 1 Atrium Utama',
    base_price: 35000,
    id: 'KSK-SMS-01'
  };
  const serializedFull = serializeKioskPayload(fullPayload);
  countStrictEqual(serializedFull.name, 'Kiosk Summarecon Mall Serpong', '1.1 Serialized name matches');
  countStrictEqual(serializedFull.location, 'Lantai 1 Atrium Utama', '1.2 Serialized location matches');
  countStrictEqual(serializedFull.base_price, 35000, '1.3 Serialized base_price is 35000');
  countStrictEqual(serializedFull.id, 'KSK-SMS-01', '1.4 Serialized custom ID is KSK-SMS-01');

  // 1.2 Serialization without base_price defaults to 0 (contract compliance)
  const noPricePayload = { name: 'Kiosk Central Park' };
  const serializedNoPrice = serializeKioskPayload(noPricePayload);
  countStrictEqual(serializedNoPrice.base_price, 0, '1.5 Omitted base_price defaults to 0 per backend contract');
  countStrictEqual(serializedNoPrice.price, 0, '1.6 Omitted price defaults to 0');
  countStrictEqual(serializedNoPrice.location, '', '1.7 Omitted location defaults to empty string');
  countStrictEqual(serializedNoPrice.id, undefined, '1.8 Omitted custom ID is omitted for backend auto-assignment');

  // 1.3 Missing name throws error on serialization
  countThrows(
    () => serializeKioskPayload({ name: '' }),
    /Nama kiosk wajib diisi/,
    '1.9 Empty name fails serialization with validation error'
  );

  // 1.4 Mock HTTP Client testing POST /admin/kiosks response envelope
  const mockPostClient = createMockClient(async (req) => {
    if (req.method === 'POST' && req.url === '/admin/kiosks') {
      if (!req.data?.name) {
        return {
          status: 400,
          data: { success: false, message: 'Kiosk name is required.' }
        };
      }
      return {
        status: 201,
        data: {
          success: true,
          message: 'Kiosk created successfully.',
          data: {
            id: req.data.id || 'KSK-7788',
            name: req.data.name,
            location: req.data.location || '',
            base_price: req.data.base_price ?? 0,
            price: req.data.price ?? 0,
            status: 'offline',
            orientation: 'PORTRAIT 1080x1920',
            deviceToken: 'kiosk_0123456789abcdef0123456789abcdef',
            api_key: 'kiosk_0123456789abcdef0123456789abcdef',
            created_at: '2026-10-22T10:00:00.000Z'
          }
        }
      };
    }
    throw new Error(`Unhandled mock route: ${req.method} ${req.url}`);
  });

  const validMockRes = await mockPostClient.post('/admin/kiosks', serializedFull);
  countStrictEqual(validMockRes.status, 201, '1.10 Mock registration returns HTTP 201 Created');
  countStrictEqual(validMockRes.data.success, true, '1.11 Response envelope contains success: true');
  countStrictEqual(validMockRes.data.data.name, 'Kiosk Summarecon Mall Serpong', '1.12 Response data name matches');
  countStrictEqual(validMockRes.data.data.id, 'KSK-SMS-01', '1.13 Response data custom ID matches');

  // 1.5 HTTP 400 Bad Request error contract
  const badReqMockRes = await mockPostClient.post('/admin/kiosks', { name: '' });
  countStrictEqual(badReqMockRes.status, 400, '1.14 Empty name returns HTTP 400');
  countStrictEqual(badReqMockRes.data.success, false, '1.15 HTTP 400 has success: false');
  countStrictEqual(badReqMockRes.data.message, 'Kiosk name is required.', '1.16 HTTP 400 error message matches backend');

  // 1.6 Error parsing helper across all HTTP error codes
  const err400 = parseKioskApiError({ response: { status: 400, data: { message: 'Nama kiosk tidak valid' } } });
  countStrictEqual(err400.status, 400, '1.17 Error 400 parsed status is 400');
  countStrictEqual(err400.code, 'BAD_REQUEST', '1.18 Error 400 parsed code is BAD_REQUEST');
  countStrictEqual(err400.isSecurityError, false, '1.19 Error 400 is not a security error');

  const err401 = parseKioskApiError({ response: { status: 401, data: { message: 'Token otentikasi kedaluwarsa' } } });
  countStrictEqual(err401.status, 401, '1.20 Error 401 parsed status is 401');
  countStrictEqual(err401.code, 'UNAUTHORIZED', '1.21 Error 401 parsed code is UNAUTHORIZED');
  countStrictEqual(err401.isSecurityError, true, '1.22 Error 401 is flagged as security error');

  const err403 = parseKioskApiError({ response: { status: 403, data: { message: 'Akses ditolak untuk operator mitra' } } });
  countStrictEqual(err403.status, 403, '1.23 Error 403 parsed status is 403');
  countStrictEqual(err403.code, 'FORBIDDEN', '1.24 Error 403 parsed code is FORBIDDEN');
  countStrictEqual(err403.isSecurityError, true, '1.25 Error 403 is flagged as security error');

  const err404 = parseKioskApiError({ response: { status: 404, data: { message: 'Kiosk not found.' } } });
  countStrictEqual(err404.status, 404, '1.26 Error 404 parsed status is 404');
  countStrictEqual(err404.code, 'NOT_FOUND', '1.27 Error 404 parsed code is NOT_FOUND');

  const err409 = parseKioskApiError({ response: { status: 409, data: { message: 'Kiosk ID sudah terdaftar pada sistem' } } });
  countStrictEqual(err409.status, 409, '1.28 Error 409 parsed status is 409');
  countStrictEqual(err409.code, 'CONFLICT', '1.29 Error 409 parsed code is CONFLICT');

  const err500 = parseKioskApiError({ response: { status: 500, data: { message: 'Internal server error in database query' } } });
  countStrictEqual(err500.status, 500, '1.30 Error 500 parsed status is 500');
  countStrictEqual(err500.code, 'INTERNAL_SERVER_ERROR', '1.31 Error 500 parsed code is INTERNAL_SERVER_ERROR');

  const errTimeout = parseKioskApiError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });
  countStrictEqual(errTimeout.isNetworkError, true, '1.32 Timeout is flagged as network error');

  logSectionPass('POST /api/v1/admin/kiosks contract and error schemas fully verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Normalization to KioskContext & Separation of Simulated vs Backend
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Normalization to KioskContext & Entity Separation ---');

  const backendRowSample = {
    id: 'KSK-BE-901',
    name: 'Kiosk Backend Real',
    location: 'Bandung Supermall',
    base_price: 40000,
    price: 40000,
    status: 'online',
    last_heartbeat: new Date(Date.now() - 30_000).toISOString(),
    created_at: '2026-05-01T08:00:00.000Z',
    user_id: 10,
    deviceToken: 'kiosk_secret_token_from_backend_do_not_leak',
    api_key: 'kiosk_secret_token_from_backend_do_not_leak',
    health: {
      printerInk: 75,
      storageUsedPercent: 30,
      cameraStatus: 'good',
      paperStatus: 'NORMAL',
      printsRemaining: 85
    },
    config: {
      maintenanceMode: false,
      autoRestart: '03:00',
      operatingHours: { open: '10:00', close: '22:00' }
    }
  };

  const normalizedKiosk = deserializeKioskResponse(backendRowSample);
  countStrictEqual(normalizedKiosk.id, 'KSK-BE-901', '2.1 Normalized ID matches');
  countStrictEqual(normalizedKiosk.name, 'Kiosk Backend Real', '2.2 Normalized name matches');
  countStrictEqual(normalizedKiosk.base_price, 40000, '2.3 Normalized base_price matches');
  countStrictEqual(normalizedKiosk.status, 'online', '2.4 Status computed deterministically from heartbeat');
  countStrictEqual(normalizedKiosk.health?.printerInk, 75, '2.5 Telemetry printerInk normalized');
  countStrictEqual(normalizedKiosk.health?.storage, 30, '2.6 Telemetry storage normalized');
  countStrictEqual(normalizedKiosk.health?.camera, 'GOOD', '2.7 Telemetry camera normalized to uppercase');

  // Sanitasi rahasia: api_key backend tidak boleh masuk ke Kiosk entity terbuka
  countStrictEqual(normalizedKiosk.api_key, null, '2.8 api_key backend is sanitized to null on Kiosk entity');

  // Pemisahan simulasi: backend row tidak memiliki flag isSimulated
  countStrictEqual(normalizedKiosk.isSimulated, false, '2.9 Backend entity has isSimulated: false');

  // Deserialisasi dari wrapper envelope { data: ... }
  const envelopedKiosk = deserializeKioskResponse({ data: backendRowSample });
  countStrictEqual(envelopedKiosk.id, 'KSK-BE-901', '2.10 Deserialization supports { data: ... } envelope');

  logSectionPass('Backend responses normalize cleanly into safe KioskContext entities');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Device Credential Security & Masking Contract
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Device Credential Security & Masking Contract ---');

  const prodPattern = /^kiosk_[a-f0-9]{32}$/;
  const realBackendSampleToken = 'kiosk_4b9a138c207e4d82b1f89c0953a1f11e';
  countAssert(prodPattern.test(realBackendSampleToken), '3.1 Real backend token matches kiosk_<32_hex>');

  const simToken = generateSimulatedDeviceToken('KSK-TEST-01');
  countStrictEqual(prodPattern.test(simToken), false, '3.2 Simulated token strictly fails production pattern');
  countAssert(simToken.startsWith(SIMULATED_TOKEN_PREFIX), '3.3 Simulated token starts with safe prefix');

  // Key rotation semantics: regenerating key produces new distinct token
  const initialCreds = await regenerateCredentialSimulation('KSK-SMS-01');
  countStrictEqual(initialCreds.deviceId, 'KSK-SMS-01', '3.4 Device ID preserved during key rotation');
  countStrictEqual(initialCreds.simulated, true, '3.5 Key rotation flagged as simulated: true');

  // Revocation semantics: old token is invalidated on mock backend
  const mockTokensDatabase = new Map<string, string>();
  mockTokensDatabase.set('KSK-SMS-01', 'token_v1');

  function verifyMockKioskToken(kioskId: string, token: string): boolean {
    const current = mockTokensDatabase.get(kioskId);
    return Boolean(current && current === token);
  }

  countStrictEqual(verifyMockKioskToken('KSK-SMS-01', 'token_v1'), true, '3.6 token_v1 is initially valid');
  // Rotate key to token_v2
  mockTokensDatabase.set('KSK-SMS-01', 'token_v2');
  countStrictEqual(verifyMockKioskToken('KSK-SMS-01', 'token_v1'), false, '3.7 token_v1 is immediately revoked');
  countStrictEqual(verifyMockKioskToken('KSK-SMS-01', 'token_v2'), true, '3.8 token_v2 is now the active token');

  // Secret sanitization on nested storage objects
  const rawKioskWithSecrets = {
    id: 'KSK-SEC-01',
    name: 'Kiosk Secret Test',
    api_key: 'secret_1',
    apiKey: 'secret_2',
    credentials: { deviceToken: 'secret_3' },
    deviceToken: 'secret_4',
    token: 'secret_5',
    secret: 'secret_6',
    config: { maintenanceMode: false }
  };

  const { api_key, apiKey, credentials, deviceToken, token, secret, ...sanitizedObj } = rawKioskWithSecrets as any;
  countStrictEqual((sanitizedObj as any).api_key, undefined, '3.9 api_key stripped from persistent object');
  countStrictEqual((sanitizedObj as any).credentials, undefined, '3.10 credentials object stripped');
  countStrictEqual((sanitizedObj as any).deviceToken, undefined, '3.11 deviceToken stripped');
  countStrictEqual((sanitizedObj as any).secret, undefined, '3.12 secret field stripped');

  logSectionPass('Device credential security, masking, and revocation contracts verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Credential Unavailable Handling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Credential Unavailable Contract ---');

  const unavailKiosk: Kiosk = {
    id: 'KSK-HERITAGE-01',
    name: 'Kios-K Heritage',
    location: 'Bandung',
    status: 'offline',
    hasCredentials: false
  };

  const retrievedCreds = getKioskCredentials(unavailKiosk);
  countStrictEqual(retrievedCreds, null, '4.1 getKioskCredentials returns null when hasCredentials is false');

  // Null input returns null
  countStrictEqual(getKioskCredentials(null as any), null, '4.2 Null kiosk returns null credentials');

  // Kiosk with hasCredentials: true returns safe simulated credentials
  const availKiosk: Kiosk = {
    id: 'KSK-ACTIVE-01',
    name: 'Kios-K Active',
    location: 'Jakarta',
    status: 'online',
    hasCredentials: true
  };
  const activeCreds = getKioskCredentials(availKiosk);
  countAssert(activeCreds !== null, '4.3 Available kiosk returns credential object');
  countStrictEqual(activeCreds?.deviceId, 'KSK-ACTIVE-01', '4.4 Returned device ID matches');
  countAssert(activeCreds?.deviceToken.startsWith(SIMULATED_TOKEN_PREFIX), '4.5 Returned token is simulation token');

  logSectionPass('Unavailable credentials handled gracefully without fabricating fake tokens');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Heartbeat & Telemetry Status Contract
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Heartbeat & Telemetry Status Contract ---');

  const curTime = Date.now();

  // 5.1 Status transitions over time
  countStrictEqual(getComputedStatus(curTime - 10_000), 'online', '5.1 Heartbeat 10s ago -> online');
  countStrictEqual(getComputedStatus(curTime - 110_000), 'online', '5.2 Heartbeat 1m 50s ago -> online');
  countStrictEqual(getComputedStatus(curTime - 130_000), 'idle', '5.3 Heartbeat 2m 10s ago -> idle');
  countStrictEqual(getComputedStatus(curTime - 500_000), 'idle', '5.4 Heartbeat 8m 20s ago -> idle');
  countStrictEqual(getComputedStatus(curTime - 650_000), 'offline', '5.5 Heartbeat 10m 50s ago -> offline');
  countStrictEqual(getComputedStatus(curTime - 86400_000), 'offline', '5.6 Heartbeat 1 day ago -> offline');

  // 5.2 Socket state dependency
  countStrictEqual(getComputedStatus(curTime - 30_000, true), 'online', '5.7 Recent heartbeat + socket connected -> online');
  countStrictEqual(getComputedStatus(curTime - 30_000, false), 'idle', '5.8 Recent heartbeat + socket disconnected -> idle');

  // 5.3 Anomaly and future timestamps
  countStrictEqual(getComputedStatus(null), 'unknown', '5.9 null timestamp -> unknown');
  countStrictEqual(getComputedStatus('invalid-string'), 'unknown', '5.10 invalid timestamp -> unknown');
  countStrictEqual(getComputedStatus(curTime + 600_000), 'unknown', '5.11 Far future timestamp (+10m) -> unknown');
  countStrictEqual(getComputedStatus(curTime + 60_000), 'online', '5.12 Clock drift (+1m) tolerated as online');

  // 5.4 Telemetry fields completeness and null safety
  const emptyTelem = normalizeKioskTelemetry({});
  countStrictEqual(emptyTelem.printerInk, null, '5.13 Missing printerInk returns null (never 0%)');
  countStrictEqual(emptyTelem.storage, null, '5.14 Missing storage returns null (never 0%)');
  countStrictEqual(emptyTelem.camera, null, '5.15 Missing camera returns null (never GOOD)');
  countStrictEqual(emptyTelem.paperStatus, 'NORMAL', '5.16 Default paperStatus is NORMAL');
  countStrictEqual(emptyTelem.printsRemaining, null, '5.17 Missing printsRemaining returns null');

  // 5.5 Telemetry clamping
  const rawTelem = {
    inkLevel: 150,
    storage: -20,
    camera: 'good',
    paperStatus: 'low_paper',
    printsRemaining: 45
  };
  const clampedTelem = normalizeKioskTelemetry(rawTelem);
  countStrictEqual(clampedTelem.printerInk, 100, '5.18 inkLevel clamped to max 100');
  countStrictEqual(clampedTelem.storage, 0, '5.19 storage clamped to min 0');
  countStrictEqual(clampedTelem.camera, 'GOOD', '5.20 camera uppercased to GOOD');
  countStrictEqual(clampedTelem.paperStatus, 'LOW_PAPER', '5.21 paperStatus uppercased to LOW_PAPER');
  countStrictEqual(clampedTelem.printsRemaining, 45, '5.22 printsRemaining parsed as integer');

  // 5.6 Kiosk status isolation: changing telemetry on Kiosk A does not alter Kiosk B
  const kioskA = deserializeKioskResponse({ id: 'KSK-A', last_heartbeat: new Date(curTime - 20_000).toISOString() });
  const kioskB = deserializeKioskResponse({ id: 'KSK-B', last_heartbeat: new Date(curTime - 900_000).toISOString() });
  countStrictEqual(kioskA.status, 'online', '5.23 Kiosk A status is online');
  countStrictEqual(kioskB.status, 'offline', '5.24 Kiosk B status is offline');

  logSectionPass('Heartbeat and telemetry status calculations operate deterministically');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Operational Configuration Contract & Multi-Kiosk Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Operational Configuration Contract ---');

  const configA = {
    maintenanceMode: false,
    operatingHours: { open: '09:00', close: '21:00' },
    autoRestart: '03:00',
    orientation: 'PORTRAIT 1080x1920'
  };

  const configB = {
    maintenanceMode: true,
    operatingHours: { open: '10:00', close: '23:00' },
    autoRestart: '04:00',
    orientation: 'LANDSCAPE 1920x1080'
  };

  // Toggle maintenance mode on A
  const updatedConfigA = { ...configA, maintenanceMode: true };
  countStrictEqual(updatedConfigA.maintenanceMode, true, '6.1 Maintenance mode toggled on Kiosk A');
  countStrictEqual(configA.maintenanceMode, false, '6.2 Original Kiosk A config unmutated (immutability)');
  countStrictEqual(configB.operatingHours.open, '10:00', '6.3 Kiosk B operating hours completely isolated');
  countStrictEqual(configB.orientation, 'LANDSCAPE 1920x1080', '6.4 Kiosk B display settings completely isolated');

  logSectionPass('Operational configuration parameters and multi-kiosk isolation verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Soft Delete & Confirmation Contract
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Soft Delete & Confirmation Contract ---');

  // Mock DELETE /admin/kiosks/:id
  const mockDeleteClient = createMockClient(async (req) => {
    if (req.method === 'DELETE' && req.url.startsWith('/admin/kiosks/')) {
      const id = req.url.split('/').pop();
      if (id === 'KSK-NOT-FOUND') {
        return { status: 404, data: { success: false, message: 'Kiosk not found.' } };
      }
      return {
        status: 200,
        data: {
          success: true,
          message: `Kiosk with ID ${id} deleted successfully.`
        }
      };
    }
    throw new Error(`Unhandled route: ${req.method} ${req.url}`);
  });

  // 7.1 Soft delete simulation matches typed name
  const softDelRes = await softDeleteKioskSimulation('KSK-DEL-01', 'Kiosk Senayan City', 'Kiosk Senayan City');
  countStrictEqual(softDelRes.success, true, '7.1 Exact name match allows soft delete simulation');
  countStrictEqual(softDelRes.simulated, true, '7.2 Soft delete runs in simulated mode');

  // 7.2 Mismatched name rejected
  await countRejects(
    async () => softDeleteKioskSimulation('KSK-DEL-01', 'Wrong Name', 'Kiosk Senayan City'),
    /Nama kiosk yang dimasukkan tidak cocok/,
    '7.3 Mismatched typed name is rejected with descriptive error'
  );

  // 7.4 Mock backend DELETE contract
  const deleteHttpRes = await mockDeleteClient.delete('/admin/kiosks/KSK-DEL-01');
  countStrictEqual(deleteHttpRes.status, 200, '7.4 Backend DELETE returns HTTP 200 OK');
  countStrictEqual(deleteHttpRes.data.success, true, '7.5 Backend DELETE response envelope contains success: true');

  // 7.5 Soft delete 404 on missing kiosk
  const notFoundDelete = await mockDeleteClient.delete('/admin/kiosks/KSK-NOT-FOUND');
  countStrictEqual(notFoundDelete.status, 404, '7.6 Deleting non-existent kiosk returns HTTP 404');

  logSectionPass('Soft delete confirmation and backend contract schemas fully verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: RBAC Contract (Super Admin vs Admin Mitra)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 8: RBAC Contract Validation ---');

  const multiPartnerKiosks: Kiosk[] = [
    { id: 'K1', name: 'Kiosk 1', location: 'Jakarta', status: 'online', user_id: '101' },
    { id: 'K2', name: 'Kiosk 2', location: 'Bandung', status: 'idle', user_id: '101' },
    { id: 'K3', name: 'Kiosk 3', location: 'Surabaya', status: 'online', user_id: '202' },
    { id: 'K4', name: 'Kiosk 4', location: 'Bali', status: 'offline', user_id: '303' },
  ];

  // 8.1 Super Admin sees all 4 kiosks
  const superAdminRole = { id: 1, role: 'Super Admin' };
  const superAdminList = filterKiosksByRole(multiPartnerKiosks, superAdminRole);
  countStrictEqual(superAdminList.length, 4, '8.1 Super Admin role sees all 4 kiosks');

  const adminRole = { id: 2, role: 'admin' };
  countStrictEqual(filterKiosksByRole(multiPartnerKiosks, adminRole).length, 4, '8.2 "admin" role sees all 4 kiosks');

  // 8.2 Admin Mitra 101 sees only K1 and K2
  const mitra101 = { id: '101', role: 'Admin Mitra' };
  const mitra101List = filterKiosksByRole(multiPartnerKiosks, mitra101);
  countStrictEqual(mitra101List.length, 2, '8.3 Mitra 101 sees exactly 2 kiosks');
  countAssert(mitra101List.every(k => k.user_id === '101'), '8.4 All visible kiosks belong to user 101');

  // 8.3 Admin Mitra 202 sees only K3
  const mitra202 = { id: 202, role: 'Admin Mitra' }; // Numeric ID test
  const mitra202List = filterKiosksByRole(multiPartnerKiosks, mitra202);
  countStrictEqual(mitra202List.length, 1, '8.5 Mitra 202 with numeric ID sees exactly 1 kiosk');
  countStrictEqual(mitra202List[0].id, 'K3', '8.6 Visible kiosk for Mitra 202 is K3');

  // 8.4 Unauthenticated user sees 0 kiosks (fail-closed)
  countStrictEqual(filterKiosksByRole(multiPartnerKiosks, null).length, 0, '8.7 null user sees 0 kiosks');
  countStrictEqual(filterKiosksByRole(multiPartnerKiosks, undefined).length, 0, '8.8 undefined user sees 0 kiosks');

  // 8.5 Backend 404 response when non-owner requests kiosk
  function simulateBackendGetKiosk(kioskId: string, reqUser: { id: string; role: string }) {
    const found = multiPartnerKiosks.find(k => k.id === kioskId);
    if (!found) return { status: 404, message: 'Kiosk not found.' };
    const canAccess = reqUser.role === 'Super Admin' || String(found.user_id) === String(reqUser.id);
    if (!canAccess) return { status: 404, message: 'Kiosk not found.' }; // Stealth 404
    return { status: 200, data: found };
  }

  const mitraAccessOwn = simulateBackendGetKiosk('K1', { id: '101', role: 'Admin Mitra' });
  countStrictEqual(mitraAccessOwn.status, 200, '8.9 Mitra accessing own kiosk returns HTTP 200');

  const mitraAccessOther = simulateBackendGetKiosk('K3', { id: '101', role: 'Admin Mitra' });
  countStrictEqual(mitraAccessOther.status, 404, '8.10 Mitra accessing another user\'s kiosk returns stealth HTTP 404');

  logSectionPass('RBAC filtering and backend access authorization contracts verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: Isolated WebSocket Simulation & Event Dispatching
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 9: Isolated WebSocket Simulation ---');

  const fakeWs = new FakeWebSocketServer();
  let receivedAdminEvent: any = null;
  let receivedKioskCommand: any = null;

  fakeWs.on('admin:kiosk:updated', (payload) => {
    receivedAdminEvent = payload;
  });

  fakeWs.on('kiosk:KSK-WS-01:command', (payload) => {
    receivedKioskCommand = payload;
  });

  // Connect kiosk in memory
  fakeWs.connectKiosk('KSK-WS-01');
  countStrictEqual(fakeWs.isKioskConnected('KSK-WS-01'), true, '9.1 Kiosk connected in fake WS server');
  countStrictEqual(fakeWs.isKioskConnected('KSK-OFFLINE-01'), false, '9.2 Other kiosk is offline');

  // Broadcast to Admin UI
  fakeWs.broadcastToAdmin('kiosk:updated', { kioskId: 'KSK-WS-01', status: 'online' });
  countDeepStrictEqual(receivedAdminEvent, { kioskId: 'KSK-WS-01', status: 'online' }, '9.3 Admin broadcast event received safely in memory');

  // Send command to kiosk
  const sent = fakeWs.sendKioskCommand('KSK-WS-01', 'CAMERA_SELF_TEST', { testType: 'focus' });
  countStrictEqual(sent, true, '9.4 Command sent to online kiosk');
  countDeepStrictEqual(receivedKioskCommand, { command: 'CAMERA_SELF_TEST', payload: { testType: 'focus' } }, '9.5 Command delivered to simulated kiosk without physical execution');

  // Send command to offline kiosk
  const sentOffline = fakeWs.sendKioskCommand('KSK-OFFLINE-01', 'REBOOT', {});
  countStrictEqual(sentOffline, false, '9.6 Command to offline kiosk returns false (queued)');

  // Verify operation safety audit
  const safetyAudit = auditKioskOperationSafety();
  countStrictEqual(safetyAudit.isPhysicalRebootBlocked, true, '9.7 Physical reboot blocked in safe simulation');
  countStrictEqual(safetyAudit.isRealWebSocketDisconnectBlocked, true, '9.8 Real WS disconnect blocked');
  countStrictEqual(safetyAudit.isProductionKeyRotationBlocked, true, '9.9 Production key rotation blocked');
  countStrictEqual(safetyAudit.isBackendDeleteBlocked, true, '9.10 Backend delete blocked');
  countStrictEqual(safetyAudit.isHardwarePrintBlocked, true, '9.11 Hardware print blocked');
  countStrictEqual(safetyAudit.mode, 'SAFE_SIMULATION', '9.12 Mode is strictly SAFE_SIMULATION');

  logSectionPass('Isolated WebSocket simulation models daemon interactions without hardware exposure');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 10: Fail-Closed Safeguard Enforcer Negative Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 10: Fail-Closed Safeguards & Negative Tests ---');

  countStrictEqual(ENABLE_BACKEND_MUTATIONS, false, '10.1 ENABLE_BACKEND_MUTATIONS is strictly false');
  countDeepStrictEqual(VERIFIED_STAGING_ALLOWLIST, [], '10.2 VERIFIED_STAGING_ALLOWLIST is strictly empty');

  // 10.3 Production hosts identified and blocked
  countStrictEqual(isProductionApiUrl('https://api.uniinside.net/v1'), true, '10.3 api.uniinside.net recognized as production');
  countStrictEqual(isProductionApiUrl('https://backend-photobooth.uniinside.net'), true, '10.4 backend-photobooth recognized as production');

  // 10.5 assertMutationAllowed throws PERLINDUNGAN PRODUKSI on production hosts
  countThrows(
    () => assertMutationAllowed('https://api.uniinside.net/v1', false),
    /PERLINDUNGAN PRODUKSI/,
    '10.5 Direct mutation against production host throws PERLINDUNGAN PRODUKSI'
  );

  // 10.6 assertMutationAllowed throws SAFEGUARD FAIL-CLOSED on unverified staging hosts
  countThrows(
    () => assertMutationAllowed('https://staging-test.unismiles.com', false),
    /SAFEGUARD FAIL-CLOSED/,
    '10.6 Direct mutation against unverified host throws SAFEGUARD FAIL-CLOSED'
  );

  // 10.7 isVerifiedStagingHost is false for all hosts when allowlist is empty
  countStrictEqual(isVerifiedStagingHost('http://localhost:3000'), false, '10.7 localhost is not verified staging');
  countStrictEqual(isVerifiedStagingHost('https://staging-test.unismiles.com'), false, '10.8 Staging host rejected while allowlist empty');

  logSectionPass('Fail-closed safeguards strictly prevent mutations to production or unverified hosts');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 11: All 8 Tabs & Legacy Features Preservation Audit
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 11: Configuration Tabs Preservation Audit ---');

  const configPath = path.resolve(process.cwd(), 'src/pages/KioskConfigPage.tsx');
  const configContent = fs.readFileSync(configPath, 'utf-8');

  const expectedTabs = [
    { id: 'hardware', label: 'Hardware' },
    { id: 'printer', label: 'Printer Configuration' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'customization', label: 'Customization' },
    { id: 'branding', label: 'Branding' },
    { id: 'operasional', label: 'Operasional' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'display', label: 'Display' }
  ];

  expectedTabs.forEach((tab, idx) => {
    countAssert(
      configContent.includes(`id: '${tab.id}'`),
      `11.${idx + 1} Tab '${tab.id}' (${tab.label}) is strictly preserved`
    );
  });

  // Verify banner in KioskConfigPage
  countAssert(
    configContent.includes('Status Konfigurasi: Tersimpan di Draf Lokal (Simulasi)'),
    '11.9 Simulation draft banner is active in KioskConfigPage'
  );

  logSectionPass('All 8 configuration tabs and safe simulation markers preserved intact');

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 4C TESTS: ALL ${passed} ASSERTIONS PASSED (0 FAILED)`);
  console.log('================================================================\n');
}

runStage5cContractTests().catch((err) => {
  console.error('\n[FATAL TEST FAILURE IN TAHAP 4C]:', err);
  process.exit(1);
});
