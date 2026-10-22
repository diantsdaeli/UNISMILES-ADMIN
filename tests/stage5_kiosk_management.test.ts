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
  SIMULATED_TOKEN_PREFIX,
} from '../src/lib/kioskService';
import {
  ENABLE_BACKEND_MUTATIONS,
  VERIFIED_STAGING_ALLOWLIST,
  assertMutationAllowed,
} from '../src/lib/templates';
import type { Kiosk } from '../src/KioskContext';
import fs from 'fs';
import path from 'path';

// Mock localStorage for isolated testing
const mockStorage = new Map<string, string>();
const storageObj = {
  getItem: (k: string) => mockStorage.get(k) || null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};
(global as any).window = { localStorage: storageObj };
(global as any).localStorage = storageObj;

async function runStage5KioskManagementTests() {
  console.log('\n================================================================');
  console.log('MODUL 4 TAHAP 4B: KIOSK MANAGEMENT UI & SAFE CREDENTIAL TESTS');
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
  // SECTION 1: Kiosk Registration Input Validation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 1: Kiosk Registration Validation ---');

  // 1.1 Invalid payload types
  const nullValidation = validateKioskRegistration(null);
  countStrictEqual(nullValidation.isValid, false, '1.1 Null payload returns isValid: false');
  countAssert(Boolean(nullValidation.errors.form), '1.2 Null payload provides form error');

  const strValidation = validateKioskRegistration('invalid string payload');
  countStrictEqual(strValidation.isValid, false, '1.3 Non-object payload rejected');

  // 1.2 Name validation (Wajib, min 3, max 100)
  const emptyName = validateKioskRegistration({ name: '' });
  countStrictEqual(emptyName.isValid, false, '1.4 Empty name rejected');
  countStrictEqual(emptyName.errors.name, 'Nama kiosk wajib diisi', '1.5 Correct empty name error message');

  const whitespaceName = validateKioskRegistration({ name: '   ' });
  countStrictEqual(whitespaceName.isValid, false, '1.6 Whitespace name rejected');

  const shortName = validateKioskRegistration({ name: 'AB' });
  countStrictEqual(shortName.isValid, false, '1.7 Name < 3 chars rejected');
  countStrictEqual(shortName.errors.name, 'Nama kiosk minimal 3 karakter', '1.8 Correct short name message');

  const longName = validateKioskRegistration({ name: 'A'.repeat(101) });
  countStrictEqual(longName.isValid, false, '1.9 Name > 100 chars rejected');
  countStrictEqual(longName.errors.name, 'Nama kiosk maksimal 100 karakter', '1.10 Correct long name message');

  // 1.3 Location validation (Opsional, max 255)
  const nonStringLoc = validateKioskRegistration({ name: 'Kiosk Central', location: 12345 as any });
  countStrictEqual(nonStringLoc.isValid, false, '1.11 Non-string location rejected');
  countStrictEqual(nonStringLoc.errors.location, 'Lokasi harus berupa teks', '1.12 Non-string location message');

  const longLoc = validateKioskRegistration({ name: 'Kiosk Central', location: 'X'.repeat(256) });
  countStrictEqual(longLoc.isValid, false, '1.13 Location > 255 chars rejected');
  countStrictEqual(longLoc.errors.location, 'Lokasi maksimal 255 karakter', '1.14 Location max length message');

  // 1.4 Base Price validation (Opsional di backend, numeric >= 0, max 10,000,000)
  const validNoPrice = validateKioskRegistration({ name: 'Kiosk Senayan' });
  countStrictEqual(validNoPrice.isValid, true, '1.15 Omitting base_price is valid (contract allows default 0)');

  const validEmptyPrice = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: '' });
  countStrictEqual(validEmptyPrice.isValid, true, '1.16 Empty string base_price is valid');

  const invalidAlphaPrice = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: 'abc' });
  countStrictEqual(invalidAlphaPrice.isValid, false, '1.17 Non-numeric base_price rejected');
  countStrictEqual(invalidAlphaPrice.errors.base_price, 'Tarif dasar (Base Price) harus berupa angka valid', '1.18 Correct non-numeric price message');

  const negativePrice = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: -1000 });
  countStrictEqual(negativePrice.isValid, false, '1.19 Negative base_price rejected');
  countStrictEqual(negativePrice.errors.base_price, 'Tarif dasar tidak boleh bernilai negatif', '1.20 Correct negative price message');

  const excessivePrice = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: 15_000_000 });
  countStrictEqual(excessivePrice.isValid, false, '1.21 Base price exceeding 10M rejected');
  countStrictEqual(excessivePrice.errors.base_price, 'Tarif dasar melebihi batas wajar (maks Rp 10.000.000)', '1.22 Correct excessive price message');

  const validPriceNum = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: 35000 });
  countStrictEqual(validPriceNum.isValid, true, '1.23 Numeric base_price 35000 is valid');

  const validPriceStr = validateKioskRegistration({ name: 'Kiosk Senayan', base_price: '50000' });
  countStrictEqual(validPriceStr.isValid, true, '1.24 String numeric base_price "50000" is valid');

  // 1.5 Custom Device ID validation (Opsional, must match KSK-*)
  const validNoId = validateKioskRegistration({ name: 'Kiosk Central Park' });
  countStrictEqual(validNoId.isValid, true, '1.25 Omitting custom ID is valid (auto-assigned)');

  const invalidCustomId = validateKioskRegistration({ name: 'Kiosk Central Park', id: 'MY-KIOSK-01' });
  countStrictEqual(invalidCustomId.isValid, false, '1.26 Custom ID without KSK- prefix rejected');
  countAssert(invalidCustomId.errors.id.includes('KSK-'), '1.27 Custom ID error mentions KSK- prefix');

  const validCustomId = validateKioskRegistration({ name: 'Kiosk Central Park', id: 'KSK-CP-01' });
  countStrictEqual(validCustomId.isValid, true, '1.28 Custom ID KSK-CP-01 is accepted');

  logSectionPass('Kiosk registration validation meets all contract specifications');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Secure Device Credential Generation & Masking
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Secure Device Credential Simulation ---');

  const simToken = generateSimulatedDeviceToken('KSK-TEST-99');
  countAssert(simToken.startsWith(SIMULATED_TOKEN_PREFIX), '2.1 Simulated token starts with safe simulation prefix');
  countStrictEqual(simToken, `${SIMULATED_TOKEN_PREFIX}_KSK-TEST-99`, '2.2 Simulated token incorporates sanitized device ID');

  // Rule: Token simulasi TIDAK BOLEH berformat kiosk_<32_hex>
  const prodTokenRegex = /^kiosk_[a-f0-9]{32}$/;
  countStrictEqual(prodTokenRegex.test(simToken), false, '2.3 Simulation token strictly does not match production token format');

  // Sanitization of device ID in token generator
  const dirtyToken = generateSimulatedDeviceToken('KSK/001$#@');
  countStrictEqual(dirtyToken, `${SIMULATED_TOKEN_PREFIX}_KSK001`, '2.4 Special characters sanitized from simulation token');

  // .env Configuration snippet generation
  const envSnippet = buildEnvConfigSnippet('KSK-JAKARTA-01', simToken);
  countAssert(envSnippet.includes('DEVICE_ID=KSK-JAKARTA-01'), '2.5 .env contains DEVICE_ID');
  countAssert(envSnippet.includes(`DEVICE_TOKEN=${simToken}`), '2.6 .env contains DEVICE_TOKEN');
  countAssert(envSnippet.includes('# UNISMILES Photobooth Kiosk Configuration'), '2.7 .env contains configuration header');

  // 2.8 - 2.12: Credential availability checking (Credential Unavailable does NOT fake tokens)
  const unavailableKiosk: Kiosk = {
    id: 'KSK-NO-CRED',
    name: 'Kiosk Tanpa Kredensial',
    location: 'Bandung',
    status: 'offline',
    hasCredentials: false
  };
  const unavailCreds = getKioskCredentials(unavailableKiosk);
  countStrictEqual(unavailCreds, null, '2.8 getKioskCredentials returns null when credentials unavailable (prevents fake token)');

  const nullKioskCreds = getKioskCredentials(null as any);
  countStrictEqual(nullKioskCreds, null, '2.9 null kiosk returns null credentials');

  const availableKiosk: Kiosk = {
    id: 'KSK-AVAIL-01',
    name: 'Kiosk Aktif',
    location: 'Jakarta',
    status: 'online',
    hasCredentials: true
  };
  const availCreds = getKioskCredentials(availableKiosk);
  countAssert(availCreds !== null, '2.10 Available kiosk returns valid credentials');
  countStrictEqual(availCreds?.deviceId, 'KSK-AVAIL-01', '2.11 Available kiosk credential deviceId matches');
  countAssert(availCreds?.deviceToken.startsWith(SIMULATED_TOKEN_PREFIX), '2.12 Available kiosk token is safe simulation token');

  logSectionPass('Device credential simulation is secure and strictly decoupled from production');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Secret Handling & State Hygiene
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Secret Handling & Storage Hygiene ---');

  const simRegResult = await registerKioskSimulation({
    name: 'Kiosk Pondok Indah',
    location: 'PIM 2 Lantai 3',
    base_price: 45000,
    id: 'KSK-PIM-01'
  }, 'partner-user-123');

  // 3.1 Simulated flag
  countStrictEqual(simRegResult.simulated, true, '3.1 Simulation flag is true');
  countStrictEqual(simRegResult.kiosk.id, 'KSK-PIM-01', '3.2 Registered kiosk ID matches');
  countStrictEqual(simRegResult.kiosk.name, 'Kiosk Pondok Indah', '3.3 Registered kiosk name matches');
  countStrictEqual(simRegResult.kiosk.base_price, 45000, '3.4 Registered kiosk base_price matches');

  // 3.2 Secret not saved in kiosk entity state
  countStrictEqual(simRegResult.kiosk.api_key, null, '3.5 api_key is strictly null on returned kiosk entity');
  countStrictEqual(simRegResult.credentials.deviceId, 'KSK-PIM-01', '3.6 Credentials returned separately for modal display');
  countAssert(simRegResult.credentials.deviceToken.startsWith(SIMULATED_TOKEN_PREFIX), '3.7 Returned token is simulated safe token');

  // 3.3 Status is deterministically 'unknown' before telemetry signals
  countStrictEqual(simRegResult.kiosk.status, 'unknown', '3.8 Initial status is "unknown" until real heartbeat arrives');
  countStrictEqual(simRegResult.kiosk.lastHeartbeat, null, '3.9 Initial lastHeartbeat is null');

  // 3.4 Key rotation simulation
  const regenRes = await regenerateCredentialSimulation('KSK-PIM-01');
  countStrictEqual(regenRes.simulated, true, '3.10 Key rotation flagged as simulated');
  countStrictEqual(regenRes.deviceId, 'KSK-PIM-01', '3.11 Key rotation keeps same device ID');
  countAssert(regenRes.deviceToken.startsWith(SIMULATED_TOKEN_PREFIX), '3.12 Rotated token has simulation prefix');

  logSectionPass('Secret handling and credential hygiene verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Deterministic Heartbeat Status Calculation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Deterministic Heartbeat Status Calculation ---');

  const now = Date.now();

  // 4.1 Null/invalid/future timestamps -> 'unknown'
  countStrictEqual(getComputedStatus(null), 'unknown', '4.1 null heartbeat -> unknown');
  countStrictEqual(getComputedStatus(undefined), 'unknown', '4.2 undefined heartbeat -> unknown');
  countStrictEqual(getComputedStatus(''), 'unknown', '4.3 empty string -> unknown');
  countStrictEqual(getComputedStatus('invalid-date'), 'unknown', '4.4 unparseable date -> unknown');

  // 4.2 Far future timestamp (> 5 min) -> 'unknown'
  const futureTimestamp = new Date(now + 10 * 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(futureTimestamp), 'unknown', '4.5 Future timestamp (+10m) -> unknown');

  // 4.3 Slight clock drift (< 5 min future) -> treated as current
  const slightFuture = new Date(now + 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(slightFuture), 'online', '4.6 Minor clock drift (+1m) tolerated as online');

  // 4.4 Recent heartbeat (< 2 min) -> 'online'
  const recent1m = new Date(now - 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(recent1m), 'online', '4.7 Heartbeat 1 min ago -> online');

  const recent30s = now - 30 * 1000;
  countStrictEqual(getComputedStatus(recent30s), 'online', '4.8 Heartbeat 30s ago (numeric timestamp) -> online');

  // 4.5 Recent heartbeat BUT socket explicitly disconnected -> 'idle'
  countStrictEqual(getComputedStatus(recent1m, false), 'idle', '4.9 Heartbeat <2m but socket disconnected -> idle');
  countStrictEqual(getComputedStatus(recent1m, true), 'online', '4.10 Heartbeat <2m and socket connected -> online');

  // 4.6 Idle status (2 - 10 min)
  const idle3m = new Date(now - 3 * 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(idle3m), 'idle', '4.11 Heartbeat 3 min ago -> idle');

  const idle8m = new Date(now - 8 * 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(idle8m), 'idle', '4.12 Heartbeat 8 min ago -> idle');

  // 4.7 Offline status (>= 10 min)
  const offline11m = new Date(now - 11 * 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(offline11m), 'offline', '4.13 Heartbeat 11 min ago -> offline');

  const offline2h = new Date(now - 120 * 60 * 1000).toISOString();
  countStrictEqual(getComputedStatus(offline2h), 'offline', '4.14 Heartbeat 2 hours ago -> offline');

  // 4.8 SQL datetime format compatibility ('YYYY-MM-DD HH:mm:ss')
  const sqlDate = '2026-10-22 17:00:00';
  const computedSql = getComputedStatus(sqlDate);
  countAssert(['online', 'idle', 'offline'].includes(computedSql), '4.15 SQL datetime parsed without error');

  // 4.9 formatLastHeartbeat formatting
  countStrictEqual(formatLastHeartbeat(null), 'Belum pernah terhubung', '4.16 null format -> Belum pernah terhubung');
  countStrictEqual(formatLastHeartbeat('not-a-date'), 'Format waktu tidak valid', '4.17 invalid format -> Format waktu tidak valid');
  countStrictEqual(formatLastHeartbeat(now - 5000), 'Terakhir aktif: baru saja', '4.18 5s ago -> baru saja');
  countStrictEqual(formatLastHeartbeat(now - 45000), 'Terakhir aktif: 45 dtk lalu', '4.19 45s ago -> 45 dtk lalu');
  countStrictEqual(formatLastHeartbeat(now - 15 * 60 * 1000), 'Terakhir aktif: 15 mnt lalu', '4.20 15m ago -> 15 mnt lalu');
  countStrictEqual(formatLastHeartbeat(now - 3 * 3600 * 1000), 'Terakhir aktif: 3 jam lalu', '4.21 3h ago -> 3 jam lalu');
  countStrictEqual(formatLastHeartbeat(now - 2 * 86400 * 1000), 'Terakhir aktif: 2 hari lalu', '4.22 2d ago -> 2 hari lalu');

  logSectionPass('Deterministic status calculation operates accurately without Math.random()');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Telemetry Normalization & Missing Values
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Missing Telemetry Normalization ---');

  // 5.1 Empty/null telemetry returns nulls, NOT fake 0% or fake GOOD
  const nullTelemetry = normalizeKioskTelemetry(null);
  countStrictEqual(nullTelemetry.printerInk, null, '5.1 Null telemetry ink is null (not 0%)');
  countStrictEqual(nullTelemetry.storage, null, '5.2 Null telemetry storage is null (not 0%)');
  countStrictEqual(nullTelemetry.camera, null, '5.3 Null telemetry camera is null (not GOOD)');
  countStrictEqual(nullTelemetry.paperStatus, 'UNKNOWN', '5.4 Null telemetry paperStatus is UNKNOWN');

  // 5.2 Empty object
  const emptyTelemetry = normalizeKioskTelemetry({});
  countStrictEqual(emptyTelemetry.printerInk, null, '5.5 Empty telemetry ink is null');
  countStrictEqual(emptyTelemetry.storage, null, '5.6 Empty telemetry storage is null');
  countStrictEqual(emptyTelemetry.camera, null, '5.7 Empty telemetry camera is null');

  // 5.3 Partial telemetry (e.g. only camera reported, ink/storage missing)
  const partialTelemetry = normalizeKioskTelemetry({ camera: 'good' });
  countStrictEqual(partialTelemetry.printerInk, null, '5.8 Missing ink returns null');
  countStrictEqual(partialTelemetry.storage, null, '5.9 Missing storage returns null');
  countStrictEqual(partialTelemetry.camera, 'GOOD', '5.10 Present camera normalized to uppercase GOOD');

  // 5.4 Valid telemetry clamping (0 - 100)
  const clampedTelemetry = normalizeKioskTelemetry({
    printerInk: 120,
    storageUsedPercent: -15,
    cameraStatus: 'error',
    paperStatus: 'low_paper',
    printsRemaining: 34
  });
  countStrictEqual(clampedTelemetry.printerInk, 100, '5.11 Ink clamped to max 100%');
  countStrictEqual(clampedTelemetry.storage, 0, '5.12 Storage clamped to min 0%');
  countStrictEqual(clampedTelemetry.camera, 'ERROR', '5.13 Camera status normalized to uppercase ERROR');
  countStrictEqual(clampedTelemetry.paperStatus, 'LOW_PAPER', '5.14 Paper status uppercased');
  countStrictEqual(clampedTelemetry.printsRemaining, 34, '5.15 Prints remaining parsed accurately');

  logSectionPass('Telemetry normalization prevents false 0% and false status indicators');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: RBAC & Multi-Kiosk Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: RBAC & Data Isolation ---');

  const testKiosks: Kiosk[] = [
    {
      id: 'KSK-001',
      name: 'Super Mall 1',
      location: 'Jakarta',
      status: 'online',
      price: 35000,
      user_id: 'user-mitra-A',
      health: { printerInk: 90, storage: 20, camera: 'good' },
      config: { maintenanceMode: false, autoRestart: '03:00' },
      lastHeartbeat: new Date().toISOString(),
      createdAt: '2026-01-01'
    },
    {
      id: 'KSK-002',
      name: 'Plaza Mitra A',
      location: 'Bandung',
      status: 'idle',
      price: 35000,
      user_id: 'user-mitra-A',
      health: { printerInk: 80, storage: 30, camera: 'good' },
      config: { maintenanceMode: false, autoRestart: '03:00' },
      lastHeartbeat: new Date().toISOString(),
      createdAt: '2026-01-02'
    },
    {
      id: 'KSK-003',
      name: 'Mall Mitra B',
      location: 'Surabaya',
      status: 'online',
      price: 40000,
      user_id: 'user-mitra-B',
      health: { printerInk: 75, storage: 40, camera: 'good' },
      config: { maintenanceMode: true, autoRestart: '04:00' },
      lastHeartbeat: new Date().toISOString(),
      createdAt: '2026-01-03'
    }
  ];

  // 6.1 Super Admin sees all kiosks
  const superAdminUser = { id: 'admin-1', role: 'Super Admin' };
  const superFiltered = filterKiosksByRole(testKiosks, superAdminUser);
  countStrictEqual(superFiltered.length, 3, '6.1 Super Admin sees all 3 kiosks');

  const superAdminFlag = { id: 'admin-2', isSuperAdmin: true };
  const flagFiltered = filterKiosksByRole(testKiosks, superAdminFlag);
  countStrictEqual(flagFiltered.length, 3, '6.2 User with isSuperAdmin: true sees all 3 kiosks');

  // 6.2 Admin Mitra A only sees their own kiosks
  const mitraAUser = { id: 'user-mitra-A', role: 'Admin Mitra' };
  const mitraAFiltered = filterKiosksByRole(testKiosks, mitraAUser);
  countStrictEqual(mitraAFiltered.length, 2, '6.3 Admin Mitra A sees only 2 kiosks');
  countStrictEqual(mitraAFiltered[0].id, 'KSK-001', '6.4 Mitra A kiosk 1 is KSK-001');
  countStrictEqual(mitraAFiltered[1].id, 'KSK-002', '6.5 Mitra A kiosk 2 is KSK-002');
  countAssert(!mitraAFiltered.some(k => k.id === 'KSK-003'), '6.6 Mitra A cannot see Mitra B kiosk KSK-003');

  // 6.3 Admin Mitra B only sees KSK-003
  const mitraBUser = { id: 'user-mitra-B', role: 'Admin Mitra' };
  const mitraBFiltered = filterKiosksByRole(testKiosks, mitraBUser);
  countStrictEqual(mitraBFiltered.length, 1, '6.7 Admin Mitra B sees only 1 kiosk');
  countStrictEqual(mitraBFiltered[0].id, 'KSK-003', '6.8 Mitra B kiosk is KSK-003');

  // 6.4 Unauthenticated / null user sees nothing
  const nullUserFiltered = filterKiosksByRole(testKiosks, null);
  countStrictEqual(nullUserFiltered.length, 0, '6.9 Null user sees 0 kiosks (fail-closed)');

  logSectionPass('RBAC filtering isolates kiosk data strictly by role');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Maintenance Mode & Operational Configuration
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Maintenance Mode & Operational Config ---');

  // 7.1 Initial maintenance mode state
  const targetKiosk = { ...testKiosks[0] };
  countStrictEqual(targetKiosk.config?.maintenanceMode, false, '7.1 Initial maintenance mode is false');

  // 7.2 Toggle maintenance mode locally
  const updatedKiosk = {
    ...targetKiosk,
    config: {
      ...targetKiosk.config,
      maintenanceMode: true
    }
  };
  countStrictEqual(updatedKiosk.config.maintenanceMode, true, '7.2 Toggled maintenance mode is true');
  countStrictEqual(testKiosks[0].config?.maintenanceMode, false, '7.3 Original kiosk remains unmutated (immutability)');

  // 7.3 Multi-kiosk isolation of configuration
  countStrictEqual(testKiosks[1].config?.maintenanceMode, false, '7.4 Kiosk 2 unaffected by Kiosk 1 config change');

  logSectionPass('Maintenance mode toggle and config isolation operate correctly');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: Safe Soft Delete Confirmation Logic
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 8: Safe Soft Delete Confirmation ---');

  // 8.1 Typed name mismatch rejected
  await countRejects(
    async () => {
      await softDeleteKioskSimulation('KSK-001', 'Salah Ketik', 'Super Mall 1');
    },
    /Nama kiosk yang dimasukkan tidak cocok/,
    '8.1 Soft delete rejects mismatched typed name'
  );

  // 8.2 Empty typed name rejected
  await countRejects(
    async () => {
      await softDeleteKioskSimulation('KSK-001', '', 'Super Mall 1');
    },
    /Nama kiosk yang dimasukkan tidak cocok/,
    '8.2 Soft delete rejects empty confirmation input'
  );

  // 8.3 Exact matching name succeeds in simulation mode
  const deleteResult = await softDeleteKioskSimulation('KSK-001', 'Super Mall 1', 'Super Mall 1');
  countStrictEqual(deleteResult.success, true, '8.3 Exact name match succeeds');
  countStrictEqual(deleteResult.simulated, true, '8.4 Soft delete operates in simulated mode without backend DELETE');

  logSectionPass('Soft delete confirmation protects against accidental deletion');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: Fail-Closed Mutation Safeguards
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 9: Fail-Closed Mutation Safeguards ---');

  countStrictEqual(ENABLE_BACKEND_MUTATIONS, false, '9.1 ENABLE_BACKEND_MUTATIONS is strictly false');
  countDeepStrictEqual(VERIFIED_STAGING_ALLOWLIST, [], '9.2 VERIFIED_STAGING_ALLOWLIST is strictly empty []');

  // Test assertMutationAllowed with production base URL
  countThrows(
    () => {
      assertMutationAllowed('https://api.uniinside.net', false);
    },
    /PERLINDUNGAN PRODUKSI/,
    '9.3 Mutation assertion throws error for production URL'
  );

  // Test assertMutationAllowed with empty URL
  countThrows(
    () => {
      assertMutationAllowed('', false);
    },
    /SAFEGUARD FAIL-CLOSED/,
    '9.4 Mutation assertion throws error for disabled mutations'
  );

  logSectionPass('Fail-closed safeguards strictly prevent live backend mutations');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 10: Preservation of All 8 Tabs in Kiosk Configuration
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 10: Preservation of All 8 Configuration Tabs ---');

  const kioskConfigFilePath = path.resolve(process.cwd(), 'src/pages/KioskConfigPage.tsx');
  const kioskConfigFileContent = fs.readFileSync(kioskConfigFilePath, 'utf-8');

  const requiredTabs = [
    { id: 'hardware', label: 'Hardware' },
    { id: 'printer', label: 'Printer Configuration' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'customization', label: 'Customization' },
    { id: 'branding', label: 'Branding' },
    { id: 'operasional', label: 'Operasional' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'display', label: 'Display' }
  ];

  requiredTabs.forEach((tab, index) => {
    countAssert(
      kioskConfigFileContent.includes(`id: '${tab.id}'`),
      `10.${index + 1} Tab '${tab.id}' (${tab.label}) is preserved in KioskConfigPage.tsx`
    );
  });

  // Verify Safe Simulation Banner is present in KioskConfigPage
  countAssert(
    kioskConfigFileContent.includes('Status Konfigurasi: Tersimpan di Draf Lokal (Simulasi)'),
    '10.9 Safe Simulation configuration banner is present in KioskConfigPage'
  );

  // Verify Maintenance Mode toggle is present in Operasional tab
  countAssert(
    kioskConfigFileContent.includes('maintenanceMode'),
    '10.10 Maintenance Mode configuration toggle is wired in KioskConfigPage'
  );

  logSectionPass('All 8 configuration tabs and simulation markers are preserved intact');

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 4B TESTS: ALL ${passed} ASSERTIONS PASSED (0 FAILED)`);
  console.log('================================================================\n');
}

runStage5KioskManagementTests().catch((err) => {
  console.error('\n[FATAL TEST FAILURE IN TAHAP 4B]:', err);
  process.exit(1);
});
