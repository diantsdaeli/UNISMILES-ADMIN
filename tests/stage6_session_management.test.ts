import assert from 'assert';
import {
  normalizePhotos,
  parseSessionPhoto,
  categorizeSessionPhotos,
  normalizeSession,
  filterSessionsByRole,
  filterSessions,
  sanitizeCsvField,
  generateExportCSV,
  auditReprintSafety,
  sendDigitalCopySimulation,
  fetchSessionsService,
  SEED_SESSIONS,
  SessionItem,
  isSafePhotoUrl
} from '../src/lib/sessionService';

import {
  ENABLE_BACKEND_MUTATIONS,
  VERIFIED_STAGING_ALLOWLIST,
  isProductionApiUrl,
  assertMutationAllowed
} from '../src/lib/templates';
import { resolvePublicUrl } from '../src/lib/urls';

let passedAssertions = 0;
function testAssert(condition: boolean, message: string) {
  assert(condition, message);
  passedAssertions++;
}

console.log('\n================================================================');
console.log('MODUL 5 TAHAP 5C: SESSION MANAGEMENT & PHOTO REPOSITORY TESTS');
console.log('================================================================\n');

// ─── SECTION 1: Backend Envelope & Parsing Contracts ──────────────────────────
console.log('--- SECTION 1: Backend Envelope & Parsing Contracts ---');

// Standard envelope
const envelopeStandard = {
  success: true,
  data: [
    {
      id: '8830',
      session_code: '8830',
      kiosk_id: 'KSK-0001',
      kiosk_name: 'Kiosk Central Park',
      timestamp: '2026-10-22T12:00:00Z',
      template: 'Retro Strip',
      photos: ['/uploads/photo1.jpg', '/uploads/photo1_frame.jpg'],
      amount: 35000,
      status: 'completed'
    }
  ]
};

const norm1 = normalizeSession(envelopeStandard.data[0]);
testAssert(norm1.id === '#US-8830', 'Session code 8830 normalized to #US-8830');
testAssert(norm1.rawId === '8830', 'RawId correctly extracted as 8830');
testAssert(norm1.kiosk_name === 'Kiosk Central Park', 'Kiosk name correctly extracted');
testAssert(norm1.status === 'Success', 'Status "completed" mapped to "Success"');
testAssert(norm1.amount === 35000, 'Amount parsed as number 35000');
testAssert(norm1.photos.length === 2, '2 photos preserved');

// Varied envelopes (legacy or alternate fields)
const normLegacy = normalizeSession({
  sessionCode: 'US-9911',
  kioskId: 'KSK-0005',
  createdAt: '2026-10-20T10:00:00Z',
  templateName: 'Modern Wedding',
  photoUrls: ['/uploads/pic1.jpg'],
  totalAmount: '45000',
  status: 'failed'
});
testAssert(normLegacy.id === '#US-9911', 'US-9911 normalized to #US-9911');
testAssert(normLegacy.status === 'Failed (Paper Jam)', 'Status "failed" mapped to "Failed (Paper Jam)"');
testAssert(normLegacy.amount === 45000, 'String totalAmount "45000" converted to 45000');
testAssert(normLegacy.template === 'Modern Wedding', 'templateName mapped to template');

console.log('[PASS] Envelope parsing and status normalization verified');

// ─── SECTION 2: Photos Normalization & Multi-Type Shapes ─────────────────────
console.log('\n--- SECTION 2: Photos Normalization & Multi-Type Shapes ---');

// JSON stringified array
const jsonPhotos = normalizePhotos('["/uploads/a.jpg", "/uploads/b.jpg"]');
testAssert(jsonPhotos.length === 2 && jsonPhotos[0] === '/uploads/a.jpg', 'JSON string photos parsed correctly');

// Comma-separated string
const csvPhotos = normalizePhotos('/uploads/1.jpg, /uploads/2.jpg, /uploads/3.jpg');
testAssert(csvPhotos.length === 3 && csvPhotos[2] === '/uploads/3.jpg', 'CSV string photos parsed correctly');

// Array of objects with various URL keys
const objPhotos = normalizePhotos([
  { url: '/uploads/from_url.jpg' },
  { image_url: '/uploads/from_image_url.jpg' },
  { path: '/uploads/from_path.jpg' }
]);
testAssert(objPhotos.length === 3, 'Object array photos parsed correctly');
testAssert(objPhotos[0] === '/uploads/from_url.jpg', 'photo.url extracted');
testAssert(objPhotos[1] === '/uploads/from_image_url.jpg', 'photo.image_url extracted');
testAssert(objPhotos[2] === '/uploads/from_path.jpg', 'photo.path extracted');

// Empty or null photos
testAssert(normalizePhotos(null).length === 0, 'null photos returns empty array');
testAssert(normalizePhotos(undefined).length === 0, 'undefined photos returns empty array');
testAssert(normalizePhotos('   ').length === 0, 'empty string returns empty array');

console.log('[PASS] Photos normalization handles all schema variations');

// ─── SECTION 3: Photo Metadata & Categorization Contract ─────────────────────
console.log('\n--- SECTION 3: Photo Metadata & Categorization Contract ---');

// Case A: Explicit _frame URL
const explicitSet = ['/uploads/shot1.jpg', '/uploads/shot2.jpg', '/uploads/shot1_frame.png'];
const catA = categorizeSessionPhotos(explicitSet);
testAssert(catA.framePhoto !== null, 'Frame photo identified');
testAssert(catA.framePhoto?.url === '/uploads/shot1_frame.png', 'Explicit _frame matched');
testAssert(catA.framePhoto?.isFrame === true, 'isFrame is true for frame photo');
testAssert(catA.singlePhotos.length === 2, '2 single raw photos extracted');
testAssert(catA.singlePhotos[0].url === '/uploads/shot1.jpg', 'Single photo 1 matched');

// Case B: Multi-photo without explicit _frame (last photo is frame)
const multiSet = ['/uploads/img1.jpg', '/uploads/img2.jpg', '/uploads/img3.jpg'];
const catB = categorizeSessionPhotos(multiSet);
testAssert(catB.framePhoto?.url === '/uploads/img3.jpg', 'Last photo identified as composite frame');
testAssert(catB.singlePhotos.length === 2, 'First two photos are single raw shots');

// Case C: Single photo only
const singleSet = ['/uploads/onlyone.jpg'];
const catC = categorizeSessionPhotos(singleSet);
testAssert(catC.framePhoto?.url === '/uploads/onlyone.jpg', 'Single photo treated as main frame photo');
testAssert(catC.singlePhotos.length === 0, 'Zero single shots when only 1 photo');

// Case D: Zero photos
const catD = categorizeSessionPhotos([]);
testAssert(catD.framePhoto === null, 'framePhoto is null for empty photos');
testAssert(catD.singlePhotos.length === 0, 'singlePhotos is empty for empty photos');

// Metadata extraction via parseSessionPhoto
const metaPhoto = parseSessionPhoto('/uploads/photobooth/2026/session_8812_frame.jpg?v=1', 0, true);
testAssert(metaPhoto.filename === 'session_8812_frame.jpg', 'Filename extracted accurately without query string');
testAssert(metaPhoto.isFrame === true, 'isFrame detected from _frame substring');
testAssert(metaPhoto.isPrintAsset === false, 'Standard upload is not print asset');

// Print asset isolation
const printPhoto = parseSessionPhoto('/uploads/print/session_8812_thermal.bin', 1, false);
testAssert(printPhoto.isPrintAsset === true, 'Print asset detected from /uploads/print/');

console.log('[PASS] Photo metadata and categorization logic fully verified');

// ─── SECTION 4: Public URL Resolution Contract ───────────────────────────────
console.log('\n--- SECTION 4: Public URL Resolution Contract ---');

const relUrl = '/uploads/photos/shot1.jpg';
const resolved = resolvePublicUrl(relUrl);
testAssert(resolved.endsWith('/uploads/photos/shot1.jpg'), 'Relative path resolved');
testAssert(resolved.startsWith('http'), 'Resolved URL includes valid protocol');

const absUrl = 'https://cdn.example.com/photo.jpg';
testAssert(resolvePublicUrl(absUrl) === absUrl, 'Absolute URL preserved unchanged');

const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
testAssert(resolvePublicUrl(dataUri) === dataUri, 'Data URI preserved unchanged');

console.log('[PASS] URL resolution adheres to contract');

// ─── SECTION 5: RBAC & Tenant Data Isolation ─────────────────────────────────
console.log('\n--- SECTION 5: RBAC & Tenant Data Isolation ---');

const testSessions: SessionItem[] = [
  {
    id: '#US-001',
    rawId: '001',
    timestamp: '2026-10-22T10:00:00Z',
    template: 'Default',
    photos: [],
    detailedPhotos: [],
    amount: 35000,
    status: 'Success',
    kiosk_id: 'KSK-001',
    kiosk_name: 'Kiosk 1',
    user_id: 1, // Milik Admin 1
  },
  {
    id: '#US-002',
    rawId: '002',
    timestamp: '2026-10-22T11:00:00Z',
    template: 'Default',
    photos: [],
    detailedPhotos: [],
    amount: 35000,
    status: 'Success',
    kiosk_id: 'KSK-002',
    kiosk_name: 'Kiosk 2',
    user_id: 2, // Milik Admin 2
  },
  {
    id: '#US-003',
    rawId: '003',
    timestamp: '2026-10-22T12:00:00Z',
    template: 'Default',
    photos: [],
    detailedPhotos: [],
    amount: 25000,
    status: 'Success',
    kiosk_id: 'KSK-001',
    kiosk_name: 'Kiosk 1',
    user_id: 1, // Milik Admin 1
  }
];

const mockKiosks = [
  { id: 'KSK-001', user_id: 1 },
  { id: 'KSK-002', user_id: 2 },
];

// Super Admin access
const superAdminUser = { id: 99, role: 'Super Admin' };
const superAdminResult = filterSessionsByRole(testSessions, superAdminUser, mockKiosks);
testAssert(superAdminResult.length === 3, 'Super Admin sees all 3 sessions across tenants');

// Admin Mitra 1 access
const mitraUser1 = { id: 1, role: 'Admin Mitra' };
const mitra1Result = filterSessionsByRole(testSessions, mitraUser1, mockKiosks);
testAssert(mitra1Result.length === 2, 'Admin Mitra 1 sees exactly 2 sessions belonging to kiosk 1');
testAssert(mitra1Result.every(s => s.kiosk_id === 'KSK-001'), 'Admin Mitra 1 sees no cross-tenant sessions');

// Admin Mitra 2 access
const mitraUser2 = { id: 2, role: 'Admin Mitra' };
const mitra2Result = filterSessionsByRole(testSessions, mitraUser2, mockKiosks);
testAssert(mitra2Result.length === 1, 'Admin Mitra 2 sees exactly 1 session belonging to kiosk 2');
testAssert(mitra2Result[0].id === '#US-002', 'Admin Mitra 2 sees session #US-002');

// Unauthenticated user
testAssert(filterSessionsByRole(testSessions, null, mockKiosks).length === 0, 'Unauthenticated user rejected with empty sessions');

console.log('[PASS] Multi-tenant RBAC data isolation verified');

// ─── SECTION 6: Search & Multi-Filter Logic ──────────────────────────────────
console.log('\n--- SECTION 6: Search & Multi-Filter Logic ---');

// Search by ID
const resSearchId = filterSessions(SEED_SESSIONS, { search: '8821' });
testAssert(resSearchId.length === 1 && resSearchId[0].id === '#US-8821', 'Search by session ID #US-8821');

// Search by Template name
const resSearchTpl = filterSessions(SEED_SESSIONS, { search: 'Toy Story' });
testAssert(resSearchTpl.length === 2, 'Search by template "Toy Story" yields 2 sessions');

// Search by Kiosk name
const resSearchKiosk = filterSessions(SEED_SESSIONS, { search: 'Grand Indonesia' });
testAssert(resSearchKiosk.length === 2, 'Search by kiosk name yields 2 sessions');

// Status filter
const resStatusSuccess = filterSessions(SEED_SESSIONS, { status: 'Success' });
testAssert(resStatusSuccess.every(s => s.status === 'Success'), 'Status filter "Success" returns only Success');

const resStatusFailed = filterSessions(SEED_SESSIONS, { status: 'Failed (Paper Jam)' });
testAssert(resStatusFailed.length === 1 && resStatusFailed[0].status === 'Failed (Paper Jam)', 'Status filter "Failed" matched');

// Kiosk filter
const resKioskFilter = filterSessions(SEED_SESSIONS, { kiosk: 'KSK-0002' });
testAssert(resKioskFilter.every(s => s.kiosk_id === 'KSK-0002'), 'Kiosk filter KSK-0002 matched');

// Date range filter
const resDateFilter = filterSessions(SEED_SESSIONS, {
  startDate: '2026-10-22',
  endDate: '2026-10-22'
});
testAssert(resDateFilter.length === SEED_SESSIONS.length, 'Date range matches all today sessions');

const resDateOut = filterSessions(SEED_SESSIONS, {
  startDate: '2026-11-01',
  endDate: '2026-11-02'
});
testAssert(resDateOut.length === 0, 'Future date range returns 0 sessions');

console.log('[PASS] Search and multi-filter criteria verified');

// ─── SECTION 7: Safe CSV Export & Anti-Formula Injection (CWE-1236) ──────────
console.log('\n--- SECTION 7: Safe CSV Export & Anti-Formula Injection (CWE-1236) ---');

// Formula injection test cases
testAssert(sanitizeCsvField('=SUM(A1:A10)') === `"'=SUM(A1:A10)"`, 'Leading = is sanitized with prefix single quote');
testAssert(sanitizeCsvField('+cmd|/c calc') === `\"'+cmd|/c calc\"`, 'Leading + is sanitized with prefix single quote');
testAssert(sanitizeCsvField('-100') === `\"'-100\"`, 'Leading - is sanitized with prefix single quote');
testAssert(sanitizeCsvField('@SUM(1,2)') === `\"'@SUM(1,2)\"`, 'Leading @ is sanitized with prefix single quote');
testAssert(sanitizeCsvField('Normal Name') === `"Normal Name"`, 'Normal string preserved in quotes');
testAssert(sanitizeCsvField('Text with "quotes"') === `"Text with ""quotes"""`, 'Inner quotes escaped');

// Full CSV export test
const csvOutput = generateExportCSV(SEED_SESSIONS.slice(0, 2));
testAssert(csvOutput.includes('Session ID,Kiosk ID,Kiosk Name'), 'CSV includes standard headers');
testAssert(csvOutput.includes('"#US-8821"'), 'CSV includes session #US-8821');
testAssert(csvOutput.includes('"#US-8822"'), 'CSV includes session #US-8822');

console.log('[PASS] CSV export formula injection protection verified');

// ─── SECTION 8: Safe Reprint Guard & Anti-Hardware Execution ──────────────────
console.log('\n--- SECTION 8: Safe Reprint Guard & Anti-Hardware Execution ---');

const testSessionSuccess = SEED_SESSIONS[0]; // status: Success
const testSessionPending = SEED_SESSIONS[4]; // status: Pending

// When mutations are disabled (safeguard active)
const auditSafeguard = auditReprintSafety(testSessionSuccess, 'online');
testAssert(auditSafeguard.allowed === false, 'Reprint blocked when ENABLE_BACKEND_MUTATIONS is false');
testAssert(auditSafeguard.reason.includes('SAFEGUARD FAIL-CLOSED'), 'Safeguard message returned');

// When kiosk is offline
const auditOffline = auditReprintSafety(testSessionSuccess, 'offline');
testAssert(auditOffline.allowed === false, 'Reprint blocked when kiosk is offline');

// When session is pending
const auditPending = auditReprintSafety(testSessionPending, 'online');
testAssert(auditPending.allowed === false, 'Reprint blocked when session is Pending');

console.log('[PASS] Anti-hardware execution reprint safeguards verified');

// ─── SECTION 9: Safe Digital Copy Email Simulation Contract ──────────────────
console.log('\n--- SECTION 9: Safe Digital Copy Email Simulation Contract ---');

// Valid email
async function testEmail() {
  const res = await sendDigitalCopySimulation('#US-8821', 'customer@example.com');
  testAssert(res.success === true, 'Digital copy simulation succeeds for valid email');
  testAssert(res.message.includes('[SIMULASI]'), 'Message clearly states simulation status');
  testAssert(res.downloadUrl?.includes('/download/US-8821'), 'Download URL formatted correctly');

  // Invalid emails rejected
  let invalidCaught = false;
  try {
    await sendDigitalCopySimulation('#US-8821', 'not-an-email');
  } catch (err: any) {
    invalidCaught = true;
    testAssert(err.message.includes('tidak valid'), 'Invalid email error message verified');
  }
  testAssert(invalidCaught, 'Invalid email rejected');
}
await testEmail();

console.log('[PASS] Safe digital copy email simulation contract verified');

// ─── SECTION 10: Mock Transport, Offline, & Error Fallbacks ──────────────────
console.log('\n--- SECTION 10: Mock Transport, Offline, & Error Fallbacks ---');

// Simulation mode returns seed sessions directly
const simSessions = await fetchSessionsService({ simulate: true });
testAssert(simSessions.length === SEED_SESSIONS.length, 'Simulation returns seed sessions');
testAssert(simSessions.every(s => s.isSimulated === true), 'Seed sessions marked as simulated');

// Custom API client mock (Successful HTTP 200)
const mockSuccessApi: any = {
  get: async (url: string) => {
    testAssert(url === '/admin/sessions', 'Endpoint called is /admin/sessions');
    return {
      data: {
        success: true,
        data: [
          {
            session_code: 'TEST-101',
            kiosk_id: 'KSK-0099',
            kiosk_name: 'Test Kiosk',
            started_at: '2026-10-22T08:00:00Z',
            template: 'Vintage Frame',
            photos: ['/uploads/pic1.jpg'],
            amount: 30000,
            status: 'completed'
          }
        ]
      }
    };
  }
};

const customResult = await fetchSessionsService({ simulate: false, customApi: mockSuccessApi });
testAssert(customResult.length === 1, 'Custom API returns 1 normalized session');
testAssert(customResult[0].id === '#US-TEST-101', 'Session normalized with #US prefix');
testAssert(customResult[0].template === 'Vintage Frame', 'Template Vintage Frame extracted');

// Custom API client mock (Error 500 fallback)
const mockErrorApi: any = {
  get: async () => {
    throw new Error('500 Internal Server Error in MySQL Gateway');
  }
};

const errorFallbackResult = await fetchSessionsService({ simulate: false, customApi: mockErrorApi });
testAssert(errorFallbackResult.length === SEED_SESSIONS.length, '500 Server error gracefully falls back to seed sessions without crashing');

console.log('[PASS] Mock transport and resilience fallbacks verified');

// ─── SECTION 11: Privacy & PII Leakage Protection ───────────────────────────
console.log('\n--- SECTION 11: Privacy & PII Leakage Protection ---');

SEED_SESSIONS.forEach(session => {
  const jsonStr = JSON.stringify(session);
  testAssert(!jsonStr.includes('password'), 'Session does not expose passwords');
  testAssert(!jsonStr.includes('api_key'), 'Session does not expose api_key');
  testAssert(!jsonStr.includes('deviceToken'), 'Session does not expose deviceToken');
  testAssert(!jsonStr.includes('secret'), 'Session does not expose secret');
});

console.log('[PASS] PII and secret leakage protections verified');

// ─── SECTION 12: Fail-Closed Safeguard Invariants ─────────────────────────────
console.log('\n--- SECTION 12: Fail-Closed Safeguard Invariants ---');

testAssert(ENABLE_BACKEND_MUTATIONS === false, 'ENABLE_BACKEND_MUTATIONS is strictly false');
testAssert(Array.isArray(VERIFIED_STAGING_ALLOWLIST) && VERIFIED_STAGING_ALLOWLIST.length === 0, 'VERIFIED_STAGING_ALLOWLIST is strictly empty');
testAssert(isProductionApiUrl('https://api.uniinside.net/api/v1') === true, 'api.uniinside.net is identified as production');
testAssert(isProductionApiUrl('https://backend-photobooth.uniinside.net/api/v1') === true, 'backend-photobooth.uniinside.net is identified as production');

let mutationBlocked = false;
try {
  assertMutationAllowed('https://backend-photobooth.uniinside.net');
} catch (err: any) {
  mutationBlocked = true;
  testAssert(err.message.includes('PERLINDUNGAN PRODUKSI'), 'Direct mutation on production threw exception');
}
testAssert(mutationBlocked, 'Mutation to production blocked by safeguard');

console.log('[PASS] Fail-closed safeguard invariants verified');

// ─── SECTION 13: Edge Security, JWT Expired & URL Sanitization ────────────────
console.log('\n--- SECTION 13: Edge Security, JWT Expired & URL Sanitization ---');

// 1. HTTP 401 Unauthorized must throw and NOT fallback to mock sessions
const mock401Api: any = {
  get: async () => {
    const error: any = new Error('Unauthorized');
    error.status = 401;
    error.response = { status: 401, data: { message: 'Token expired' } };
    throw error;
  }
};

let caught401 = false;
try {
  await fetchSessionsService({ simulate: false, customApi: mock401Api });
} catch (err: any) {
  caught401 = true;
  testAssert(err.response?.status === 401 || err.status === 401, '401 Unauthorized correctly thrown without mock fallback');
}
testAssert(caught401, 'HTTP 401 did not silently fallback to mock data');

// 2. HTTP 403 Forbidden must throw and NOT fallback to mock sessions
const mock403Api: any = {
  get: async () => {
    const error: any = new Error('Forbidden');
    error.status = 403;
    error.response = { status: 403, data: { message: 'Access denied' } };
    throw error;
  }
};

let caught403 = false;
try {
  await fetchSessionsService({ simulate: false, customApi: mock403Api });
} catch (err: any) {
  caught403 = true;
  testAssert(err.response?.status === 403 || err.status === 403, '403 Forbidden correctly thrown without mock fallback');
}
testAssert(caught403, 'HTTP 403 did not silently fallback to mock data');

// 3. Unsafe Photo URLs rejection
testAssert(isSafePhotoUrl('javascript:alert(document.cookie)') === false, 'javascript: URL rejected');
testAssert(isSafePhotoUrl('vbscript:msgbox("xss")') === false, 'vbscript: URL rejected');
testAssert(isSafePhotoUrl('file:///etc/shadow') === false, 'file: URL rejected');
testAssert(isSafePhotoUrl('data:text/html,<script>alert(1)</script>') === false, 'data:text/html URL rejected');
testAssert(isSafePhotoUrl('https://example.com/photo.jpg') === true, 'https URL accepted');
testAssert(isSafePhotoUrl('/uploads/photobooth/img.jpg') === true, 'relative /uploads/ path accepted');
testAssert(isSafePhotoUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==') === true, 'data:image/png accepted');

// Normalizing photo array strips unsafe URLs
const mixedPhotos = normalizePhotos([
  '/uploads/safe1.jpg',
  'javascript:alert("attack")',
  '/uploads/safe2.jpg',
  'data:text/html;base64,PHNjcmlwdD4='
]);
testAssert(mixedPhotos.length === 2, 'Unsafe photo URLs filtered out during normalization');
testAssert(mixedPhotos[0] === '/uploads/safe1.jpg' && mixedPhotos[1] === '/uploads/safe2.jpg', 'Only safe photos preserved');

// Parsing an unsafe photo returns safe blocked placeholder
const parsedUnsafe = parseSessionPhoto('javascript:alert(1)', 0);
testAssert(parsedUnsafe.url === '', 'Unsafe photo has empty URL');
testAssert(parsedUnsafe.filename === 'unsafe-blocked.jpg', 'Unsafe photo filename sanitized');

// 4. Cross-Tenant Photo Access Check
const tenant1Kiosks = [{ id: 'KSK-0001', user_id: 1 }];
const tenant2Kiosks = [{ id: 'KSK-0002', user_id: 2 }];
const tenant1Sessions = filterSessionsByRole(SEED_SESSIONS, { id: 1, role: 'Admin Mitra' }, tenant1Kiosks);
const tenant2Sessions = filterSessionsByRole(SEED_SESSIONS, { id: 2, role: 'Admin Mitra' }, tenant2Kiosks);

// Verify no intersection in session IDs or photo URLs
const tenant1PhotoUrls = new Set(tenant1Sessions.flatMap(s => s.photos));
const tenant2PhotoUrls = new Set(tenant2Sessions.flatMap(s => s.photos));
const photoOverlap = Array.from(tenant1PhotoUrls).some(p => tenant2PhotoUrls.has(p));
testAssert(photoOverlap === false, 'Zero photo URL overlap between different partner tenants');
testAssert(tenant1Sessions.every(s => s.kiosk_id === 'KSK-0001' || s.kiosk_id === 'KSK-0003'), 'Tenant 1 only sees tenant 1 kiosks');
testAssert(tenant2Sessions.every(s => s.kiosk_id === 'KSK-0002'), 'Tenant 2 only sees tenant 2 kiosks');

// 5. Logout State Clearing
const loggedOutSessions = filterSessionsByRole(SEED_SESSIONS, null, tenant1Kiosks);
testAssert(loggedOutSessions.length === 0, 'Logged out (null user) results in empty sessions state');

// 6. CSV Formula Injection: Tab and carriage return prefixes
testAssert(sanitizeCsvField('\t=1+1') === `"'=1+1"`, 'Tab formula prefix trimmed and sanitized with quote');
testAssert(sanitizeCsvField('\r@SUM(1)') === `"'@SUM(1)"`, 'Carriage return formula prefix trimmed and sanitized with quote');


// 7. Mock Fallback Transparency
testAssert(SEED_SESSIONS.every(s => s.isSimulated === true), 'All seed sessions carry explicit isSimulated: true marker');

console.log('[PASS] Edge security, JWT error handling, and URL sanitization verified');

console.log('\n================================================================');
console.log(`TOTAL TAHAP 5C TESTS: ALL ${passedAssertions} ASSERTIONS PASSED (0 FAILED)`);
console.log('================================================================\n');

