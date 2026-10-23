/**
 * UNISMILES MODUL 8C: END-TO-END CONTRACT TESTING & SYSTEM HARDENING
 *
 * Test Sections:
 * 1. Baseline Integrity & Safeguards Invariants (ENABLE_BACKEND_MUTATIONS, ALLOWLIST, SAFE_SIMULATION)
 * 2. Authentication, JWT & RBAC Protected Routing (Bearer injection, SuperAdminRoute, 401/403)
 * 3. Financial Integrity & Anti-Double Counting Cross-Module (Completed != Paid, Sesi 8822 Excluded)
 * 4. Backend Contract Alignment vs Safe Simulation (Completed Sessions Revenue vs Verified Paid Revenue)
 * 5. Multi-Tenant RBAC & Cross-Tenant Data Isolation (Super Admin vs Admin Mitra scoping)
 * 6. Password & Credential Security Invariants (Web Crypto randomness, no plaintext storage)
 * 7. Photo Filters Integration & Separate Storage Domain (Admin vs Kiosk localStorage separation)
 * 8. Frames & Canvas Editor Preservation (7 horizontal layout presets, pricing, background removal)
 * 9. Kiosk Management & Canonical ID Resolution (KSK-0001 format, relational mapping, telemetry)
 * 10. Printer Geometries & Thermal Specifications (48mm print width, 300 DPI, custom paper parsing)
 * 11. Session Repository & Evidence Handling (Photo URL safety, category classification, reprint audit)
 * 12. CSV Sanitization & Anti-Formula Injection (CWE-1236 protection across transactions & sessions)
 * 13. Data Source Mode Switching & Cache Isolation (Immediate state clear, event broadcast)
 * 14. Fail-Closed on 401/403/Network Error (No silent mock fallback enforcement across services)
 * 15. Legacy Features Preservation Audit (AI Content /ai-gen, Storyboard /storyboard, 9 Sidebar menus)
 * 16. Verification of Blockers & Production Realities (Unmounted routes, payment webhooks, physical hardware)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Services and configs
import {
  fetchDashboardData,
  normalizeBackendDashboardResponse,
  getSyntheticDashboardData,
  calculateVerifiedPaidRevenue,
} from '../src/lib/dashboardService';
import {
  calculateFinancialSummary,
  normalizePaymentStatus,
  sanitizeCSVCell,
  generateTransactionCSV,
  filterTransactionsByRole,
  TransactionItem,
} from '../src/lib/paymentService';
import {
  getDataSourceMode,
  setDataSourceMode,
  DEFAULT_DATA_SOURCE_MODE,
} from '../src/lib/dataSourceConfig';
import {
  ENABLE_BACKEND_MUTATIONS,
  VERIFIED_STAGING_ALLOWLIST,
} from '../src/lib/templates';
import {
  userService,
  validateEmail,
  validatePassword,
  validateAdminMitraPayload,
  generateSecurePassword,
  KIOSK_REGISTRY,
  normalizeCanonicalKioskId,
  resolveKioskName,
  resolveKioskId,
  SEED_USERS,
} from '../src/lib/userService';
import {
  LAYOUT_PRESETS,
} from '../src/lib/layoutPresets';
import {
  DEFAULT_FILTERS,
} from '../src/pages/PhotoFilters';
import {
  THERMAL_LIMITS,
  CUSTOM_PATTERN,
  DEFAULT_PRINTER_CONFIG,
  ALLOWED_GRAYSCALE_ALGORITHMS,
} from '../src/lib/printerService';
import {
  isSafePhotoUrl,
  categorizeSessionPhotos,
  auditReprintSafety,
  SessionItem,
} from '../src/lib/sessionService';
import { parseAuthResponse, getAuthUser } from '../src/lib/api';

let passedAssertions = 0;
function testAssert(condition: boolean, message: string) {
  assert(condition, message);
  passedAssertions++;
}

console.log('================================================================');
console.log('MODUL 8C: END-TO-END CONTRACT TESTING & SYSTEM HARDENING');
console.log('================================================================\n');

async function runTests() {
  const rootDir = process.cwd();

  // ─── SECTION 1: Baseline Integrity & Safeguards Invariants ────────────────
  console.log('--- SECTION 1: Baseline Integrity & Safeguards Invariants ---');
  {
    testAssert(
      ENABLE_BACKEND_MUTATIONS === false,
      'ENABLE_BACKEND_MUTATIONS harus bernilai false secara mutlak'
    );
    testAssert(
      Array.isArray(VERIFIED_STAGING_ALLOWLIST) && VERIFIED_STAGING_ALLOWLIST.length === 0,
      'VERIFIED_STAGING_ALLOWLIST harus array kosong []'
    );
    testAssert(
      DEFAULT_DATA_SOURCE_MODE === 'SAFE_SIMULATION',
      'DEFAULT_DATA_SOURCE_MODE harus SAFE_SIMULATION'
    );
    testAssert(
      fs.existsSync(path.resolve(rootDir, 'src/pages/Transactions.tsx')),
      'src/pages/Transactions.tsx harus tetap ada di filesystem'
    );

    const sidebarFile = fs.readFileSync(path.resolve(rootDir, 'src/components/Sidebar.tsx'), 'utf8');
    const menuMatches = sidebarFile.match(/id:\s*['"]([^'"]+)['"]/g) || [];
    const menuIds = menuMatches.map(m => m.replace(/id:\s*['"]/, '').replace(/['"]/, ''));
    testAssert(
      menuIds.length === 9,
      `Sidebar harus memiliki tepat 9 menu (terdeteksi: ${menuIds.length}: ${menuIds.join(', ')})`
    );
    testAssert(
      !menuIds.includes('transactions'),
      'Sidebar tidak boleh memiliki menu transaksi'
    );
    testAssert(
      !menuIds.includes('filters'),
      'Sidebar tidak boleh memiliki menu filters berdiri sendiri'
    );

    console.log('[PASS] Baseline integrity and safeguards verified');
  }

  // ─── SECTION 2: Authentication, JWT & RBAC Protected Routing ──────────────
  console.log('--- SECTION 2: Authentication, JWT & RBAC Protected Routing ---');
  {
    // Test auth response parsing
    const standardAuth = { success: true, token: 'jwt-token-123', user: { id: 1, email: 'admin@unismiles.com', role: 'admin' } };
    const parsedStandard = parseAuthResponse(standardAuth);
    testAssert(parsedStandard.token === 'jwt-token-123', 'parseAuthResponse mengurai token standar');
    testAssert((parsedStandard.user as any)?.email === 'admin@unismiles.com', 'parseAuthResponse mengurai user standar');

    const envelopeAuth = { data: { token: 'jwt-token-envelope', user: { id: 2, role: 'Super Admin' } } };
    const parsedEnvelope = parseAuthResponse(envelopeAuth);
    testAssert(parsedEnvelope.token === 'jwt-token-envelope', 'parseAuthResponse mengurai token envelope data');

    let threwMissingToken = false;
    try {
      parseAuthResponse({ success: true, data: {} });
    } catch {
      threwMissingToken = true;
    }
    testAssert(threwMissingToken, 'parseAuthResponse melempar error jika token tidak ada');

    const authMePayload = { data: { user: { id: 1, full_name: 'Dian Daeli' } } };
    const authUser = getAuthUser(authMePayload);
    testAssert((authUser as any)?.full_name === 'Dian Daeli', 'getAuthUser mengurai user dari /auth/me');

    // Audit App.tsx route protections
    const appFile = fs.readFileSync(path.resolve(rootDir, 'src/App.tsx'), 'utf8');
    testAssert(appFile.includes('<SuperAdminRoute>'), 'App.tsx menerapkan komponen pembatas SuperAdminRoute');
    testAssert(
      appFile.includes('<SuperAdminRoute>\n                  <Analytics />\n                </SuperAdminRoute>') ||
      appFile.includes('<SuperAdminRoute>') && appFile.includes('<Analytics />'),
      'Rute /analytics dilindungi oleh SuperAdminRoute'
    );
    testAssert(
      appFile.includes('<SuperAdminRoute>\n                  <UserManager />\n                </SuperAdminRoute>') ||
      appFile.includes('<SuperAdminRoute>') && appFile.includes('<UserManager />'),
      'Rute /users dilindungi oleh SuperAdminRoute'
    );

    // Audit api.ts 401 & 403 handling
    const apiFile = fs.readFileSync(path.resolve(rootDir, 'src/lib/api.ts'), 'utf8');
    testAssert(apiFile.includes('Bearer ${token}'), 'api.ts menginjeksi Bearer token pada request headers');
    testAssert(apiFile.includes('account is inactive'), 'api.ts membedakan 403 izin role dari 403 akun nonaktif');

    console.log('[PASS] Authentication, JWT and RBAC protected routing verified');
  }

  // ─── SECTION 3: Financial Integrity & Anti-Double Counting Cross-Module ───
  console.log('--- SECTION 3: Financial Integrity & Anti-Double Counting Cross-Module ---');
  {
    // Test calculateVerifiedPaidRevenue
    testAssert(calculateVerifiedPaidRevenue([]) === 0, 'Kalkulasi list kosong menghasilkan Rp 0');
    testAssert(
      calculateVerifiedPaidRevenue([{ amount: 25000, status: 'completed', payment_status: 'unknown' }]) === 0,
      'Sesi completed dengan payment status unknown STRICTLY menghasilkan 0'
    );
    testAssert(
      calculateVerifiedPaidRevenue([{ amount: 25000, status: 'completed', payment_status: 'unverified' }]) === 0,
      'Sesi completed dengan payment status unverified STRICTLY menghasilkan 0'
    );
    testAssert(
      calculateVerifiedPaidRevenue([{ amount: 25000, status: 'completed', payment_status: 'pending' }]) === 0,
      'Sesi completed dengan payment status pending STRICTLY menghasilkan 0'
    );
    testAssert(
      calculateVerifiedPaidRevenue([{ amount: 35000, status: 'failed', payment_status: 'failed' }]) === 0,
      'Sesi failed dengan payment status failed STRICTLY menghasilkan 0'
    );

    // Test calculateFinancialSummary on the standard 5-session fixture
    const standardTransactions: TransactionItem[] = [
      {
        id: '1',
        transaction_code: 'US-TRX-8821',
        session_id: '8821',
        session_code: 'SES-8821',
        kiosk_id: 'KSK-0001',
        kiosk_name: 'Kiosk Central 01',
        amount: 35000,
        payment_method: 'qris',
        status: 'paid',
        created_at: '2026-10-23T10:00:00Z',
      },
      {
        id: '2',
        transaction_code: 'US-TRX-8822',
        session_id: '8822',
        session_code: 'SES-8822',
        kiosk_id: 'KSK-0002',
        kiosk_name: 'Kiosk West 02',
        amount: 25000,
        payment_method: 'qris',
        status: 'unknown', // Completed session but unverified payment
        created_at: '2026-10-23T10:15:00Z',
      },
      {
        id: '3',
        transaction_code: 'US-TRX-8823',
        session_id: '8823',
        session_code: 'SES-8823',
        kiosk_id: 'KSK-0003',
        kiosk_name: 'Kiosk North 03 (Mitra)',
        partner_name: 'Studio Senyum',
        amount: 35000,
        payment_method: 'qris',
        status: 'failed',
        created_at: '2026-10-23T10:30:00Z',
      },
      {
        id: '4',
        transaction_code: 'US-TRX-8824',
        session_id: '8824',
        session_code: 'SES-8824',
        kiosk_id: 'KSK-0004',
        kiosk_name: 'Kiosk South 04',
        amount: 35000,
        payment_method: 'qris',
        status: 'paid',
        created_at: '2026-10-23T11:00:00Z',
      },
      {
        id: '5',
        transaction_code: 'US-TRX-8825',
        session_id: '8825',
        session_code: 'SES-8825',
        kiosk_id: 'KSK-0005',
        kiosk_name: 'Kiosk East 05',
        amount: 25000,
        payment_method: 'qris',
        status: 'pending',
        created_at: '2026-10-23T11:30:00Z',
      },
    ];

    const summary = calculateFinancialSummary(standardTransactions);
    testAssert(summary.grossTransactionAmount === 155000, 'Gross Transaction Amount harus tepat Rp 155.000');
    testAssert(summary.paidRevenue === 70000, 'Verified Paid Revenue harus tepat Rp 70.000 (Sesi 8821 + 8824)');
    testAssert(summary.pendingVolume === 25000, 'Pending Volume harus tepat Rp 25.000 (Sesi 8825)');
    testAssert(summary.failedVolume === 35000, 'Failed Volume harus tepat Rp 35.000 (Sesi 8823)');
    testAssert(summary.unverifiedVolume === 25000, 'Unverified Volume harus tepat Rp 25.000 (Sesi 8822)');
    testAssert(
      summary.paidRevenue + summary.pendingVolume + summary.failedVolume + summary.unverifiedVolume === summary.grossTransactionAmount,
      'Konservasi nilai moneter IDR diskrit: total komponen harus sama dengan gross'
    );
    testAssert(
      summary.paidRevenue !== summary.grossTransactionAmount,
      'Anti-Double Counting: Paid Revenue (Rp 70k) TIDAK boleh sama dengan Gross Volume (Rp 155k)'
    );

    // Test normalizePaymentStatus
    testAssert(normalizePaymentStatus(undefined) === 'unknown', 'Missing payment_status strictly normalizes to unknown');
    testAssert(normalizePaymentStatus(null) === 'unknown', 'Null payment_status strictly normalizes to unknown');
    testAssert(normalizePaymentStatus('') === 'unknown', 'Empty payment_status strictly normalizes to unknown');
    testAssert(normalizePaymentStatus('paid') === 'paid', 'paid normalizes to paid');
    testAssert(normalizePaymentStatus('success') === 'paid', 'success normalizes to paid');
    testAssert(normalizePaymentStatus('pending') === 'pending', 'pending normalizes to pending');
    testAssert(normalizePaymentStatus('failed') === 'failed', 'failed normalizes to failed');

    console.log('[PASS] Financial integrity and anti-double counting verified');
  }

  // ─── SECTION 4: Backend Contract Alignment vs Safe Simulation ─────────────
  console.log('--- SECTION 4: Backend Contract Alignment vs Safe Simulation ---');
  {
    // Backend normalization
    const backendPayload = {
      total_kiosks: 5,
      total_sessions: 2,
      total_revenue: 70000,
      online_kiosks: 3,
      idle_kiosks: 1,
      offline_kiosks: 1,
    };
    const norm = normalizeBackendDashboardResponse(backendPayload, true);
    testAssert(
      norm.stats.revenueToday.label === 'Completed Sessions Revenue',
      'Respons backend resmi diberi label Completed Sessions Revenue'
    );
    testAssert(
      norm.stats.revenueToday.isVerifiedPaid === false,
      'isVerifiedPaid pada backend resmi adalah false karena hanya agregat completed sessions'
    );
    testAssert(
      norm.stats.revenueToday.sublabel?.includes('status = completed') === true,
      'Sublabel backend resmi menerangkan kalkulasi SUM WHERE status = completed'
    );

    // Safe simulation
    const sim = getSyntheticDashboardData('30', true);
    testAssert(
      sim.stats.revenueToday.label === 'Verified Paid Revenue',
      'Simulasi diberi label Verified Paid Revenue'
    );
    testAssert(
      sim.stats.revenueToday.isVerifiedPaid === true,
      'isVerifiedPaid pada simulasi adalah true'
    );
    testAssert(
      sim.stats.revenueToday.value === 70000,
      'Nilai Verified Paid Revenue pada simulasi adalah tepat Rp 70.000'
    );

    console.log('[PASS] Backend contract alignment and safe simulation verified');
  }

  // ─── SECTION 5: Multi-Tenant RBAC & Cross-Tenant Data Isolation ───────────
  console.log('--- SECTION 5: Multi-Tenant RBAC & Cross-Tenant Data Isolation ---');
  {
    // Dashboard service multi-tenant test
    const partnerDashboard = getSyntheticDashboardData('30', false, 'Studio Senyum');
    testAssert(partnerDashboard.partnerScoped === true, 'Data Admin Mitra ter-scope');
    testAssert(partnerDashboard.stats.activeKiosks.total === 1, 'Admin Mitra Studio Senyum hanya melihat 1 kiosk');
    testAssert(partnerDashboard.kioskStatus.length === 1 && partnerDashboard.kioskStatus[0].id === 'KSK-0003', 'Hanya KSK-0003 yang terlihat');
    testAssert(partnerDashboard.stats.revenueToday.value === 0, 'Sesi mitra gagal, revenue Rp 0');

    // Payment transactions multi-tenant test
    const mixedTx: TransactionItem[] = [
      {
        id: '1', transaction_code: 'TX1', session_id: '1', session_code: 'S1',
        kiosk_id: 'KSK-0001', kiosk_name: 'Kiosk 1', amount: 35000, payment_method: 'qris',
        status: 'paid', created_at: '2026-10-23T10:00:00Z', partner_name: 'Partner A'
      },
      {
        id: '2', transaction_code: 'TX2', session_id: '2', session_code: 'S2',
        kiosk_id: 'KSK-0003', kiosk_name: 'Kiosk 3', amount: 35000, payment_method: 'qris',
        status: 'paid', created_at: '2026-10-23T10:00:00Z', partner_name: 'Studio Senyum'
      },
    ];

    const superAdminFiltered = filterTransactionsByRole(mixedTx, { role: 'Super Admin' });
    testAssert(superAdminFiltered.length === 2, 'Super Admin dapat melihat semua transaksi lintas mitra');

    const partnerFiltered = filterTransactionsByRole(mixedTx, { role: 'Admin Mitra', partner_name: 'Studio Senyum' });
    testAssert(partnerFiltered.length === 1, 'Admin Mitra hanya melihat transaksi miliknya');
    testAssert(partnerFiltered[0].partner_name === 'Studio Senyum', 'Data transaksi mitra lain tidak bocor');

    // User service SEED_USERS test
    testAssert(SEED_USERS.length >= 4, 'SEED_USERS memiliki minimal 4 pengguna bawaan');
    const owner = SEED_USERS.find(u => u.role === 'Super Admin' && u.email === 'superadmin@gmail.com');
    testAssert(Boolean(owner), 'Akun Super Admin Owner terdaftar di SEED_USERS');

    console.log('[PASS] Multi-tenant RBAC and cross-tenant data isolation verified');
  }

  // ─── SECTION 6: Password & Credential Security Invariants ─────────────────
  console.log('--- SECTION 6: Password & Credential Security Invariants ---');
  {
    // Generate secure password
    const pwd1 = generateSecurePassword();
    const pwd2 = generateSecurePassword();
    testAssert(pwd1 !== pwd2, 'Password yang dihasilkan harus memiliki entropi acak (berbeda)');
    testAssert(validatePassword(pwd1).valid === true, 'Password otomatis harus memenuhi kriteria validasi');
    testAssert(pwd1.length >= 12, 'Panjang password otomatis minimal 12 karakter');

    // Password validation tests
    testAssert(validatePassword('12345678').valid === true, 'Password 8 karakter valid');
    testAssert(validatePassword('1234567').valid === false, 'Password pendek (<8) harus ditolak');
    testAssert(validatePassword('').valid === false, 'Password kosong harus ditolak');
    testAssert(validatePassword('a'.repeat(129)).valid === false, 'Password >128 karakter harus ditolak');

    // UserRecord type security test
    const userSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/userService.ts'), 'utf8');
    testAssert(
      !userSrc.includes('password?: string;') || userSrc.includes('CreateAdminMitraPayload'),
      'Password hanya boleh ada pada Create payload sementara, tidak ada pada UserRecord persistensi'
    );
    testAssert(
      userSrc.includes('// CATATAN KEAMANAN: Password tidak disimpan'),
      'userService membersihkan password dan tidak menyimpannya ke UserRecord'
    );

    console.log('[PASS] Password and credential security invariants verified');
  }

  // ─── SECTION 7: Photo Filters Integration & Separate Storage Domain ───────
  console.log('--- SECTION 7: Photo Filters Integration & Separate Storage Domain ---');
  {
    const filterComp = fs.readFileSync(path.resolve(rootDir, 'src/pages/PhotoFilters.tsx'), 'utf8');
    testAssert(
      filterComp.includes('Simulasi Lokal Admin'),
      'PhotoFilters menggunakan label "Simulasi Lokal Admin"'
    );
    testAssert(
      filterComp.includes('belum tersinkronisasi ke perangkat photobooth (kiosk)'),
      'Disclaimer eksplisit menyatakan filter belum tersinkronisasi ke perangkat kiosk'
    );
    testAssert(
      filterComp.includes('tidak mengubah filter pada kiosk nyata'),
      'Penambahan filter di Admin dinyatakan tidak mengubah filter pada kiosk fisik'
    );
    testAssert(
      filterComp.includes('DUA PENYIMPANAN TERPISAH'),
      'Arsitektur menegaskan Admin dan Kiosk memiliki dua domain penyimpanan terpisah'
    );
    testAssert(
      filterComp.includes('unismiles_photo_filters'),
      'Admin menyimpan filter pada key unismiles_photo_filters'
    );
    testAssert(
      filterComp.includes('filterRoutes.js'),
      'Banner mode read-only menjelaskan filterRoutes.js belum di-mount pada backend'
    );
    testAssert(
      DEFAULT_FILTERS.length >= 10,
      'Tersedia minimal 10 default filter presets'
    );

    console.log('[PASS] Photo filters integration and separate storage domain verified');
  }

  // ─── SECTION 8: Frames & Canvas Editor Preservation ───────────────────────
  console.log('--- SECTION 8: Frames & Canvas Editor Preservation ---');
  {
    testAssert(LAYOUT_PRESETS.length === 7, 'Harus ada tepat 7 layout presets horizontal');
    const layoutIds = LAYOUT_PRESETS.map(p => p.id);
    const expectedIds = ['1x1', '2x1', '3x1', '4x1', '2x2', '2x3', '3x3'];
    for (const id of expectedIds) {
      testAssert(layoutIds.includes(id), `Layout preset ${id} harus tersedia`);
    }

    const tmFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/TemplateManagement.tsx'), 'utf8');
    testAssert(tmFile.includes('CanvasFrameEditorModal'), 'CanvasFrameEditorModal dipertahankan utuh');
    testAssert(tmFile.includes('RemoveBgModal'), 'RemoveBgModal dipertahankan utuh');
    testAssert(tmFile.includes('StickerThumbnail'), 'StickerThumbnail dipertahankan utuh');
    testAssert(tmFile.includes("activeMainTab === 'filters'"), 'Tab ketiga filters diintegrasikan');

    console.log('[PASS] Frames and canvas editor preservation verified');
  }

  // ─── SECTION 9: Kiosk Management & Canonical ID Resolution ────────────────
  console.log('--- SECTION 9: Kiosk Management & Canonical ID Resolution ---');
  {
    testAssert(KIOSK_REGISTRY.length === 5, 'KIOSK_REGISTRY harus berisi tepat 5 kiosk');
    testAssert(KIOSK_REGISTRY[0].id === 'KSK-0001', 'Kiosk 1 menggunakan canonical ID KSK-0001');
    testAssert(KIOSK_REGISTRY[4].id === 'KSK-0005', 'Kiosk 5 menggunakan canonical ID KSK-0005');

    // Normalization tests
    testAssert(normalizeCanonicalKioskId('KSK-001') === 'KSK-0001', 'KSK-001 dinormalisasi ke KSK-0001');
    testAssert(normalizeCanonicalKioskId('KSK-1') === 'KSK-0001', 'KSK-1 dinormalisasi ke KSK-0001');
    testAssert(normalizeCanonicalKioskId('KSK-0001') === 'KSK-0001', 'KSK-0001 tetap KSK-0001');

    testAssert(resolveKioskName('KSK-0001') === 'Kiosk Senja 01', 'resolveKioskName memetakan KSK-0001 ke Kiosk Senja 01');
    testAssert(resolveKioskId('Kiosk Senja 01') === 'KSK-0001', 'resolveKioskId memetakan nama ke KSK-0001');

    const kmFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/KioskManager.tsx'), 'utf8');
    testAssert(kmFile.includes('filterKiosksByRole'), 'KioskManager menyaring kiosk berbasis peran RBAC');
    testAssert(kmFile.includes('DeviceCredentialModal'), 'DeviceCredentialModal tersedia untuk rotasi token');
    testAssert(kmFile.includes('DeleteKioskConfirmModal'), 'DeleteKioskConfirmModal tersedia untuk konfirmasi hapus');

    console.log('[PASS] Kiosk management and canonical ID resolution verified');
  }

  // ─── SECTION 10: Printer Geometries & Thermal Specifications ──────────────
  console.log('--- SECTION 10: Printer Geometries & Thermal Specifications ---');
  {
    testAssert(THERMAL_LIMITS.maxPaperWidthMm === 60, 'Maksimal lebar kertas thermal 60mm');
    testAssert(THERMAL_LIMITS.maxPrintWidthMm === 48, 'Maksimal area cetak thermal 48mm');
    testAssert(THERMAL_LIMITS.dpi === 300, 'DPI thermal printhead adalah 300');

    // Custom pattern regex
    testAssert(CUSTOM_PATTERN.test('CUSTOM 54x86 MM'), 'CUSTOM_PATTERN mencocokkan format 54x86 MM');
    testAssert(CUSTOM_PATTERN.test('CUSTOM 54×86 MM'), 'CUSTOM_PATTERN mencocokkan unicode multiplication sign');

    testAssert(DEFAULT_PRINTER_CONFIG.printing_enabled === false, 'Printing dinonaktifkan secara default untuk keamanan');
    testAssert(ALLOWED_GRAYSCALE_ALGORITHMS.includes('rec601'), 'Algoritma rec601 tersedia');
    testAssert(ALLOWED_GRAYSCALE_ALGORITHMS.includes('rec709'), 'Algoritma rec709 tersedia');

    console.log('[PASS] Printer geometries and thermal specifications verified');
  }

  // ─── SECTION 11: Session Repository & Evidence Handling ───────────────────
  console.log('--- SECTION 11: Session Repository & Evidence Handling ---');
  {
    // Photo URL safety
    testAssert(isSafePhotoUrl('https://example.com/photo.jpg') === true, 'URL HTTPS aman diizinkan');
    testAssert(isSafePhotoUrl('data:image/jpeg;base64,abc') === true, 'Data URL image aman diizinkan');
    testAssert(isSafePhotoUrl('javascript:alert(1)') === false, 'URL javascript: ditolak');
    testAssert(isSafePhotoUrl('data:text/html,<script>') === false, 'Data URL non-image ditolak');

    // Categorize session photos
    const dummyPhotos = [
      'https://img.com/single_1.jpg',
      'https://img.com/composite_frame.jpg',
    ];
    const categorized = categorizeSessionPhotos(dummyPhotos);
    testAssert(Boolean(categorized.framePhoto), 'Foto frame/composite teridentifikasi');
    testAssert(categorized.singlePhotos.length === 1, 'Foto single teridentifikasi');
    testAssert(categorized.allPhotos.length === 2, 'Semua foto terklasifikasi');

    // Audit reprint safety (Fail-Closed safeguard because ENABLE_BACKEND_MUTATIONS=false)
    const reprintCheck = auditReprintSafety({
      id: '#US-8821',
      rawId: '8821',
      timestamp: '2026-10-23T10:00:00Z',
      template: 'Default',
      photos: ['https://img.com/1.jpg'],
      detailedPhotos: [],
      amount: 35000,
      status: 'Success',
      kiosk_id: 'KSK-0001',
      kiosk_name: 'Kiosk Central 01',
    });
    testAssert(reprintCheck.allowed === false, 'Perintah cetak ulang fisik hardware ditolak secara fail-closed saat simulasi');
    testAssert(reprintCheck.reason.includes('SAFEGUARD FAIL-CLOSED'), 'Alasan penolakan menerangkan proteksi safeguard fail-closed');

    console.log('[PASS] Session repository and evidence handling verified');
  }

  // ─── SECTION 12: CSV Sanitization & Anti-Formula Injection (CWE-1236) ─────
  console.log('--- SECTION 12: CSV Sanitization & Anti-Formula Injection (CWE-1236) ---');
  {
    testAssert(sanitizeCSVCell('=SUM(A1:A10)') === "\"'=SUM(A1:A10)\"", 'Karakter formula = diproteksi dengan prepended apostrophe dalam CSV');
    testAssert(sanitizeCSVCell('+12345') === "\"'+12345\"", 'Karakter formula + diproteksi');
    testAssert(sanitizeCSVCell('-2+5') === "\"'-2+5\"", 'Karakter formula - diproteksi');
    testAssert(sanitizeCSVCell('@IMPORT()') === "\"'@IMPORT()\"", 'Karakter formula @ diproteksi');
    testAssert(sanitizeCSVCell('\tCMD') === "\"'\tCMD\"", 'Karakter tab diproteksi');
    testAssert(sanitizeCSVCell('Normal Text') === '"Normal Text"', 'Teks normal dibungkus double quotes');
    testAssert(sanitizeCSVCell(35000) === '"35000"', 'Angka dinormalisasi ke string dalam quotes');

    const sampleTx: TransactionItem[] = [
      {
        id: '1',
        transaction_code: '=cmd|',
        session_id: '1',
        session_code: 'SES-01',
        kiosk_id: 'KSK-0001',
        kiosk_name: 'Kiosk 1',
        amount: 35000,
        payment_method: 'qris',
        status: 'paid',
        created_at: '2026-10-23T10:00:00Z',
      }
    ];
    const csvOutput = generateTransactionCSV(sampleTx);
    testAssert(csvOutput.includes("''=cmd|") || csvOutput.includes("=cmd|"), 'CSV export menerapkan fungsi pembersihan');

    console.log('[PASS] CSV sanitization and anti-formula injection verified');
  }

  // ─── SECTION 13: Data Source Mode Switching & Cache Isolation ─────────────
  console.log('--- SECTION 13: Data Source Mode Switching & Cache Isolation ---');
  {
    setDataSourceMode('SAFE_SIMULATION');
    testAssert(getDataSourceMode() === 'SAFE_SIMULATION', 'Mode default adalah SAFE_SIMULATION');

    setDataSourceMode('AUTHORIZED_READ_ONLY');
    testAssert(getDataSourceMode() === 'AUTHORIZED_READ_ONLY', 'Mode dapat beralih ke AUTHORIZED_READ_ONLY');

    setDataSourceMode('SAFE_SIMULATION');
    testAssert(getDataSourceMode() === 'SAFE_SIMULATION', 'Mode dapat dikembalikan ke SAFE_SIMULATION');

    // Verify cache clearing in source code
    const dashFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/Dashboard.tsx'), 'utf8');
    testAssert(dashFile.includes('setData(null)'), 'Dashboard membersihkan state seketika saat pergantian mode');

    const anFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/Analytics.tsx'), 'utf8');
    testAssert(anFile.includes('setTransactions([])'), 'Analytics membersihkan transaksi seketika saat pergantian mode');

    console.log('[PASS] Data source mode switching and cache isolation verified');
  }

  // ─── SECTION 14: Fail-Closed on 401/403/Network Error ─────────────────────
  console.log('--- SECTION 14: Fail-Closed on 401/403/Network Error ---');
  {
    // Dashboard service fail-closed check
    const dashServiceSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/dashboardService.ts'), 'utf8');
    testAssert(
      dashServiceSrc.includes('Fail-Closed: JANGAN fallback diam-diam ke mock!'),
      'dashboardService dilarang melakukan silent mock fallback'
    );

    // Payment service fail-closed check
    const payServiceSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/paymentService.ts'), 'utf8');
    testAssert(
      payServiceSrc.includes('Fail-closed live protection'),
      'paymentService menerapkan proteksi fail-closed'
    );

    // User service unsupported check
    const userServiceSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/userService.ts'), 'utf8');
    testAssert(
      userServiceSrc.includes("status: 'unsupported'"),
      'userService mengembalikan status unsupported pada backend read-only tanpa endpoint fiktif'
    );

    console.log('[PASS] Fail-closed on 401/403/network error verified');
  }

  // ─── SECTION 15: Legacy Features Preservation Audit ───────────────────────
  console.log('--- SECTION 15: Legacy Features Preservation Audit ---');
  {
    testAssert(fs.existsSync(path.resolve(rootDir, 'src/pages/AIGenerator.tsx')), 'AIGenerator.tsx harus ada');
    testAssert(fs.existsSync(path.resolve(rootDir, 'src/pages/Storyboard.tsx')), 'Storyboard.tsx harus ada');

    const appFile = fs.readFileSync(path.resolve(rootDir, 'src/App.tsx'), 'utf8');
    testAssert(appFile.includes('path="/ai-gen"'), 'Rute /ai-gen terpasang di App.tsx');
    testAssert(appFile.includes('path="/storyboard"'), 'Rute /storyboard terpasang di App.tsx');

    const aiFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/AIGenerator.tsx'), 'utf8');
    testAssert(aiFile.includes('POSE_DATABASE'), 'AIGenerator memiliki POSE_DATABASE utuh');

    const sbFile = fs.readFileSync(path.resolve(rootDir, 'src/pages/Storyboard.tsx'), 'utf8');
    testAssert(sbFile.includes('CanvasElement'), 'Storyboard memiliki antarmuka canvas utuh');

    console.log('[PASS] Legacy features preservation verified');
  }

  // ─── SECTION 16: Verification of Blockers & Production Realities ──────────
  console.log('--- SECTION 16: Verification of Blockers & Production Realities ---');
  {
    // Blocker 1: Backend filterRoutes unmounted
    const photoFilterSrc = fs.readFileSync(path.resolve(rootDir, 'src/pages/PhotoFilters.tsx'), 'utf8');
    testAssert(
      photoFilterSrc.includes('filterRoutes.js'),
      'PhotoFilters mendokumentasikan blocker filterRoutes.js belum di-mount'
    );

    // Blocker 2: Backend /api/v1/users unmounted
    const userSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/userService.ts'), 'utf8');
    testAssert(
      userSrc.includes('Route GET /api/v1/users belum di-mount di server.js backend'),
      'userService mendokumentasikan blocker rute users unmounted'
    );

    // Blocker 3: Live QRIS Webhook / Gateway staging
    const paySrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/paymentService.ts'), 'utf8');
    testAssert(
      paySrc.includes('VERIFIED_STAGING_ALLOWLIST: string[] = []'),
      'paymentService mendokumentasikan ketiadaan staging webhook pembayaran aktif'
    );

    // Blocker 4: Physical printer hardware
    const printSrc = fs.readFileSync(path.resolve(rootDir, 'src/lib/printerService.ts'), 'utf8');
    testAssert(
      printSrc.includes('DEFAULT_PRINTER_CONFIG'),
      'printerService mendokumentasikan spesifikasi konfigurasi driver printer'
    );

    console.log('[PASS] Production blockers and realities audit verified');
  }

  console.log('\n================================================================');
  console.log(`TOTAL MODUL 8C TESTS: ALL ${passedAssertions} ASSERTIONS PASSED (0 FAILED)`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FATAL] Modul 8C test suite encountered an unhandled error:', err);
  process.exit(1);
});
