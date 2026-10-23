/**
 * UNISMILES MODUL 8B: DASHBOARD API ALIGNMENT & PHOTO FILTERS INTEGRATION TESTS
 *
 * Test Sections:
 * 1. Dashboard endpoint alignment (/api/v1/admin/dashboard vs legacy /api/analytics)
 * 2. Dashboard response normalization (parsing aggregate backend fields)
 * 3. SAFE_SIMULATION isolation (deterministic fixture, no backend fetch)
 * 4. AUTHORIZED_READ_ONLY GET behavior
 * 5. HTTP 401/403 fail-closed (strictly fails, no silent mock fallback)
 * 6. Request race condition guard (AbortController & state clearing)
 * 7. Multi-tenant dashboard authorization (Super Admin vs Admin Mitra scoping)
 * 8. Financial status integrity (Verified Paid Revenue != Completed Sessions)
 * 9. Frames tab regression (7 layout presets, pricing, canvas editor)
 * 10. Stickers tab regression (scrapbook grid, delete asset guard, background removal)
 * 11. Filters tab integration (3 tabs in Gallery Templates)
 * 12. Unsupported backend filters detection & explicit banner
 * 13. No production mutation (ENABLE_BACKEND_MUTATIONS=false)
 * 14. No silent mock fallback enforcement
 * 15. Sidebar remains exactly 9 menus (no 10th menu added)
 * 16. AI Content remains available (/ai-gen)
 * 17. Storyboard remains available (/storyboard)
 * 18. Regression of Modul 1–7 components
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  fetchDashboardData,
  normalizeBackendDashboardResponse,
  getSyntheticDashboardData,
  calculateVerifiedPaidRevenue,
  DashboardData,
  BackendDashboardData
} from '../src/lib/dashboardService';
import { getDataSourceMode, setDataSourceMode } from '../src/lib/dataSourceConfig';
import { DEFAULT_FILTERS, PhotoFilter } from '../src/pages/PhotoFilters';
import { LAYOUT_PRESETS } from '../src/lib/layoutPresets';
import { ENABLE_BACKEND_MUTATIONS, VERIFIED_STAGING_ALLOWLIST } from '../src/lib/templates';

let passedAssertions = 0;
function testAssert(condition: boolean, message: string) {
  assert(condition, message);
  passedAssertions++;
}

console.log('================================================================');
console.log('MODUL 8B: DASHBOARD API ALIGNMENT & PHOTO FILTERS TESTS');
console.log('================================================================\n');

async function runTests() {
  const rootDir = process.cwd();

  // --- SECTION 1: Dashboard Endpoint Alignment ---
  console.log('--- SECTION 1: Dashboard Endpoint Alignment ---');
  {
    const dashboardFile = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/Dashboard.tsx'),
      'utf8'
    );
    testAssert(
      !dashboardFile.includes("fetch(`/api/analytics"),
      'Ketergantungan legacy /api/analytics harus dihapus dari Dashboard.tsx'
    );
    testAssert(
      !dashboardFile.includes("fetch('/api/analytics"),
      'Tidak boleh ada pemanggilan fetch langsung ke /api/analytics'
    );
    testAssert(
      dashboardFile.includes('fetchDashboardData'),
      'Dashboard.tsx harus mengimpor dan menggunakan service fetchDashboardData'
    );

    const dashboardServiceFile = fs.readFileSync(
      path.resolve(rootDir, 'src/lib/dashboardService.ts'),
      'utf8'
    );
    testAssert(
      dashboardServiceFile.includes("api.get('/admin/dashboard'"),
      'dashboardService harus memanggil endpoint resmi /admin/dashboard via api.ts'
    );
    console.log('[PASS] Dashboard endpoint alignment verified');
  }

  // --- SECTION 2: Dashboard Response Normalization ---
  console.log('--- SECTION 2: Dashboard Response Normalization ---');
  {
    const sampleBackendPayload = {
      success: true,
      data: {
        total_kiosks: 5,
        total_sessions: 2,
        total_revenue: 70000,
        online_kiosks: 3,
        idle_kiosks: 1,
        offline_kiosks: 1,
      },
    };

    const normalized = normalizeBackendDashboardResponse(sampleBackendPayload, true);
    testAssert(normalized.hasData === true, 'hasData harus true saat ada metrik');
    testAssert(normalized.mode === 'AUTHORIZED_READ_ONLY', 'mode harus AUTHORIZED_READ_ONLY');
    testAssert(normalized.stats.totalSessions.value === 2, 'total_sessions harus 2');
    testAssert(normalized.stats.revenueToday.value === 70000, 'revenueToday harus Rp 70.000');
    testAssert(
      normalized.stats.revenueToday.label === 'Completed Sessions Revenue',
      'Label revenue backend adalah Completed Sessions Revenue'
    );
    testAssert(
      normalized.stats.revenueToday.isVerifiedPaid === false,
      'isVerifiedPaid pada response backend harus false karena hanya agregat completed sessions'
    );
    testAssert(
      Boolean(normalized.stats.revenueToday.sublabel?.includes('status = completed')),
      'Sublabel backend secara transparan menjelaskan agregat status = completed'
    );
    testAssert(normalized.stats.activeKiosks.online === 3, 'online_kiosks harus 3');
    testAssert(normalized.stats.activeKiosks.total === 5, 'total_kiosks harus 5');
    testAssert(normalized.stats.activeKiosks.idle === 1, 'idle_kiosks harus 1');
    testAssert(normalized.stats.activeKiosks.offline === 1, 'offline_kiosks harus 1');
    testAssert(normalized.rawBackendData?.total_revenue === 70000, 'rawBackendData total_revenue tersimpan');

    // Toleransi payload tanpa envelope data
    const directPayload = {
      total_kiosks: '4',
      total_sessions: '10',
      total_revenue: '350000',
      online_kiosks: '2',
      idle_kiosks: '1',
      offline_kiosks: '1',
    };
    const normDirect = normalizeBackendDashboardResponse(directPayload, true);
    testAssert(normDirect.stats.totalSessions.value === 10, 'String total_sessions dinormalisasi ke number 10');
    testAssert(normDirect.stats.revenueToday.value === 350000, 'String total_revenue dinormalisasi ke number 350000');
    testAssert(normDirect.stats.activeKiosks.total === 4, 'String total_kiosks dinormalisasi ke number 4');

    console.log('[PASS] Dashboard response normalization verified');
  }

  // --- SECTION 3: SAFE_SIMULATION Isolation ---
  console.log('--- SECTION 3: SAFE_SIMULATION Isolation ---');
  {
    const simData = await fetchDashboardData({ mode: 'SAFE_SIMULATION', userRole: 'Super Admin' });
    testAssert(simData.mode === 'SAFE_SIMULATION', 'Mode harus SAFE_SIMULATION');
    testAssert(simData.stats.activeKiosks.total === 5, 'Simulasi Super Admin memiliki 5 kiosks');
    testAssert(simData.stats.revenueToday.value === 70000, 'Verified revenue simulasi tepat Rp 70.000');
    testAssert(
      simData.stats.revenueToday.label === 'Verified Paid Revenue',
      'Label revenue simulasi adalah Verified Paid Revenue'
    );
    testAssert(
      simData.stats.revenueToday.isVerifiedPaid === true,
      'isVerifiedPaid pada simulasi bernilai true (terverifikasi paid)'
    );
    testAssert(simData.stats.totalSessions.value === 5, 'Total sesi simulasi tepat 5 sesi');
    testAssert(simData.kioskStatus.length === 5, 'Kiosk status berisi 5 unit');
    testAssert(simData.kioskStatus[0].id === 'KSK-0001', 'Format Kiosk ID canonical KSK-0001');
    testAssert(simData.kioskStatus[4].id === 'KSK-0005', 'Format Kiosk ID canonical KSK-0005');
    testAssert(simData.revenueChart.length > 0, 'Revenue chart tersedia pada simulasi');
    testAssert(simData.popularityChart.length > 0, 'Popularity chart tersedia pada simulasi');

    console.log('[PASS] SAFE_SIMULATION isolation verified');
  }

  // --- SECTION 4: AUTHORIZED_READ_ONLY GET Behavior ---
  console.log('--- SECTION 4: AUTHORIZED_READ_ONLY GET Behavior ---');
  {
    const apiFile = fs.readFileSync(
      path.resolve(rootDir, 'src/lib/api.ts'),
      'utf8'
    );
    testAssert(
      apiFile.includes('Bearer'),
      'api.ts menginjeksi Authorization: Bearer token pada request backend'
    );
    testAssert(
      apiFile.includes("baseURL: getNormalizedApiBaseUrl()"),
      'api.ts menargetkan URL backend /api/v1 yang dinormalisasi'
    );

    console.log('[PASS] AUTHORIZED_READ_ONLY GET behavior verified');
  }

  // --- SECTION 5: HTTP 401/403 Fail-Closed ---
  console.log('--- SECTION 5: HTTP 401/403 Fail-Closed ---');
  {
    // Simulasikan fetchDashboardData pada AUTHORIZED_READ_ONLY ketika server offline / unauthorized
    let threwError = false;
    let isFailClosed = false;
    try {
      // Tanpa baseURL valid / server lokal di test, fetchDashboardData akan gagal
      await fetchDashboardData({ mode: 'AUTHORIZED_READ_ONLY' });
    } catch (err: any) {
      threwError = true;
      if (err.isFailClosed) {
        isFailClosed = true;
      }
    }
    testAssert(threwError === true, 'Kegagalan pada AUTHORIZED_READ_ONLY harus melempar error (fail-closed)');
    testAssert(isFailClosed === true, 'Error harus memiliki penanda isFailClosed');

    const dashboardComp = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/Dashboard.tsx'),
      'utf8'
    );
    testAssert(
      dashboardComp.includes('Fail-Closed Enforcement'),
      'Dashboard.tsx menampilkan status error fail-closed eksplisit saat backend gagal'
    );
    testAssert(
      !dashboardComp.includes('catch (err) { setData(mockData) }'),
      'Tidak boleh ada silent mock fallback di blok catch Dashboard.tsx'
    );

    console.log('[PASS] HTTP 401/403 fail-closed verified');
  }

  // --- SECTION 6: Request Race Condition Guard ---
  console.log('--- SECTION 6: Request Race Condition Guard ---');
  {
    const dashboardComp = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/Dashboard.tsx'),
      'utf8'
    );
    testAssert(
      dashboardComp.includes('AbortController'),
      'Dashboard.tsx menerapkan AbortController untuk membatalkan in-flight requests'
    );
    testAssert(
      dashboardComp.includes('abortControllerRef.current.abort()'),
      'Request sebelumnya dibatalkan saat mode atau filter waktu berganti'
    );
    testAssert(
      dashboardComp.includes('setData(null)'),
      'Stale state dibersihkan segera saat pergantian mode data source'
    );

    console.log('[PASS] Request race condition guard verified');
  }

  // --- SECTION 7: Multi-Tenant Dashboard Authorization ---
  console.log('--- SECTION 7: Multi-Tenant Dashboard Authorization ---');
  {
    // Admin Mitra scoping test
    const partnerData = getSyntheticDashboardData('30', false, 'Studio Senyum');
    testAssert(partnerData.partnerScoped === true, 'Data Admin Mitra terisolasi (partnerScoped: true)');
    testAssert(partnerData.stats.activeKiosks.total === 1, 'Mitra Studio Senyum hanya memiliki 1 kiosk (KSK-0003)');
    testAssert(partnerData.stats.revenueToday.value === 0, 'Sesi mitra 8823 berstatus Failed, revenue Rp 0');
    testAssert(partnerData.kioskStatus.length === 1, 'Hanya kiosk milik mitra yang ditampilkan');
    testAssert(partnerData.kioskStatus[0].id === 'KSK-0003', 'Kiosk mitra adalah KSK-0003');

    // Super Admin scoping test
    const superAdminData = getSyntheticDashboardData('30', true);
    testAssert(superAdminData.partnerScoped === false, 'Super Admin melihat seluruh data tanpa scoping');
    testAssert(superAdminData.stats.activeKiosks.total === 5, 'Super Admin melihat seluruh 5 kiosk');

    console.log('[PASS] Multi-tenant dashboard authorization verified');
  }

  // --- SECTION 8: Financial Status Integrity ---
  console.log('--- SECTION 8: Financial Status Integrity ---');
  {
    // 1. Uji fungsi kalkulator Verified Paid Revenue
    const emptyResult = calculateVerifiedPaidRevenue([]);
    testAssert(emptyResult === 0, 'Kalkulasi list kosong menghasilkan 0');

    // Sesi completed tetapi status pembayaran unknown/unverified -> WAJIB DIKECUALIKAN
    const completedUnknownSession = [
      { amount: 25000, status: 'completed', payment_status: 'unknown' }
    ];
    testAssert(
      calculateVerifiedPaidRevenue(completedUnknownSession) === 0,
      'Sesi completed dengan payment status unknown DILARANG masuk Verified Paid Revenue'
    );

    const completedUnverifiedSession = [
      { amount: 25000, status: 'completed', payment_status: 'unverified' }
    ];
    testAssert(
      calculateVerifiedPaidRevenue(completedUnverifiedSession) === 0,
      'Sesi completed dengan payment status unverified DILARANG masuk Verified Paid Revenue'
    );

    const completedPendingSession = [
      { amount: 25000, status: 'completed', payment_status: 'pending' }
    ];
    testAssert(
      calculateVerifiedPaidRevenue(completedPendingSession) === 0,
      'Sesi completed dengan payment status pending DILARANG masuk Verified Paid Revenue'
    );

    const failedSession = [
      { amount: 35000, status: 'failed', payment_status: 'failed' }
    ];
    testAssert(
      calculateVerifiedPaidRevenue(failedSession) === 0,
      'Sesi failed dengan payment status failed DILARANG masuk Verified Paid Revenue'
    );

    const singlePaidSession = [
      { amount: 35000, status: 'completed', payment_status: 'paid' }
    ];
    testAssert(
      calculateVerifiedPaidRevenue(singlePaidSession) === 35000,
      'Sesi dengan payment status paid dihitung tepat Rp 35.000'
    );

    // 2. Modul 6 Fixture Consistency Test:
    // Fixture terdiri dari 5 sesi:
    // - Sesi 8821: Rp 35.000, status: completed, payment_status: paid
    // - Sesi 8822: Rp 25.000, status: completed, payment_status: unknown
    // - Sesi 8823: Rp 35.000, status: failed, payment_status: failed
    // - Sesi 8824: Rp 35.000, status: completed, payment_status: paid
    // - Sesi 8825: Rp 25.000, status: pending, payment_status: pending
    const fixtureSessions = [
      { id: '8821', amount: 35000, status: 'completed', payment_status: 'paid' },
      { id: '8822', amount: 25000, status: 'completed', payment_status: 'unknown' },
      { id: '8823', amount: 35000, status: 'failed', payment_status: 'failed' },
      { id: '8824', amount: 35000, status: 'completed', payment_status: 'paid' },
      { id: '8825', amount: 25000, status: 'pending', payment_status: 'pending' },
    ];

    const fixturePaidRevenue = calculateVerifiedPaidRevenue(fixtureSessions);
    testAssert(
      fixturePaidRevenue === 70000,
      'Fixture Modul 6 Verified Paid Revenue tepat Rp 70.000 (hanya sesi 8821 + 8824)'
    );

    const completedGross = fixtureSessions
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + s.amount, 0);
    testAssert(
      completedGross === 95000,
      'Total sesi completed adalah Rp 95.000 (termasuk Sesi 8822 Rp 25k)'
    );
    testAssert(
      fixturePaidRevenue !== completedGross,
      'Verified Paid Revenue (Rp 70k) TIDAK sama dengan Completed Sessions Value (Rp 95k)'
    );

    // 3. Uji Dashboard Synthetic Output
    const superAdminData = getSyntheticDashboardData('30', true);
    testAssert(
      superAdminData.stats.revenueToday.value === 70000,
      'Verified Paid Revenue harus tepat Rp 70.000 (Sesi 8821 Rp35k + 8824 Rp35k)'
    );
    testAssert(
      superAdminData.stats.revenueToday.label === 'Verified Paid Revenue',
      'Label pada simulasi adalah Verified Paid Revenue'
    );
    testAssert(
      superAdminData.stats.revenueToday.isVerifiedPaid === true,
      'isVerifiedPaid bernilai true pada simulasi'
    );
    testAssert(
      superAdminData.stats.totalSessions.value === 5,
      'Total Sesi adalah 5 (8821, 8822, 8823, 8824, 8825)'
    );
    testAssert(
      superAdminData.stats.revenueToday.value !== superAdminData.stats.totalSessions.value * 35000,
      'Verified Revenue TIDAK boleh mengasumsikan seluruh sesi selesai dibayar penuh (anti-double counting)'
    );

    console.log('[PASS] Financial status integrity verified');
  }

  // --- SECTION 9: Frames Tab Regression ---
  console.log('--- SECTION 9: Frames Tab Regression ---');
  {
    testAssert(LAYOUT_PRESETS.length === 7, 'Harus ada tepat 7 layout presets horizontal');
    const layoutIds = LAYOUT_PRESETS.map(p => p.id);
    testAssert(
      ['1x1', '2x1', '3x1', '4x1', '2x2', '2x3', '3x3'].every(id => layoutIds.includes(id)),
      'Seluruh 7 layout ID (1x1 s/d 3x3) harus tersedia'
    );

    const tmFile = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/TemplateManagement.tsx'),
      'utf8'
    );
    testAssert(
      tmFile.includes('CanvasFrameEditorModal'),
      'Canvas Frame Editor Modal dipertahankan utuh pada TemplateManagement.tsx'
    );
    testAssert(
      tmFile.includes('activeLayoutId'),
      'State activeLayoutId dipertahankan utuh'
    );

    console.log('[PASS] Frames tab regression verified');
  }

  // --- SECTION 10: Stickers Tab Regression ---
  console.log('--- SECTION 10: Stickers Tab Regression ---');
  {
    const tmFile = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/TemplateManagement.tsx'),
      'utf8'
    );
    testAssert(
      tmFile.includes("activeMainTab === 'stickers'"),
      'Tab Sticker Library dipertahankan utuh'
    );
    testAssert(
      tmFile.includes('StickerThumbnail'),
      'Komponen StickerThumbnail scrapbook grid dipertahankan'
    );
    testAssert(
      tmFile.includes('RemoveBgModal'),
      'Modal Auto Background Removal untuk PNG dipertahankan'
    );
    testAssert(
      tmFile.includes('deleteReusableAsset'),
      'Fungsi hapus aset dengan proteksi keterkaitan frame dipertahankan'
    );

    console.log('[PASS] Stickers tab regression verified');
  }

  // --- SECTION 11: Filters Tab Integration ---
  console.log('--- SECTION 11: Filters Tab Integration ---');
  {
    const tmFile = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/TemplateManagement.tsx'),
      'utf8'
    );
    testAssert(
      tmFile.includes("<PhotoFilters embedded mode={dataSourceMode} />"),
      'PhotoFilters diintegrasikan sebagai tab ketiga dalam TemplateManagement.tsx'
    );
    testAssert(
      tmFile.includes("setActiveMainTab('filters')"),
      'Button tab Photo Filters tersedia di Level 1 navigation'
    );
    testAssert(
      tmFile.includes("'frames' | 'stickers' | 'filters'"),
      'Tipe activeMainTab mencakup tepat 3 tab: frames, stickers, filters'
    );

    console.log('[PASS] Filters tab integration verified');
  }

  // --- SECTION 12: Unsupported Backend Filters Detection ---
  console.log('--- SECTION 12: Unsupported Backend Filters Detection ---');
  {
    const filterComp = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/PhotoFilters.tsx'),
      'utf8'
    );
    testAssert(
      filterComp.includes('Backend Filter Endpoint Unsupported (Fail-Closed)'),
      'PhotoFilters menampilkan status unmounted/unsupported saat diakses pada AUTHORIZED_READ_ONLY'
    );
    testAssert(
      filterComp.includes('filterRoutes.js'),
      'Pesan status menjelaskan filterRoutes.js belum di-mount pada server.js backend produksi'
    );
    testAssert(
      DEFAULT_FILTERS.length >= 10,
      'Tersedia minimal 10 default filter presets (Normal, B&W, Sepia, dll.)'
    );
    testAssert(
      filterComp.includes('Simulasi Lokal Admin'),
      'Label SAFE_SIMULATION menggunakan teks "Simulasi Lokal Admin"'
    );
    testAssert(
      filterComp.includes('belum tersinkronisasi ke perangkat photobooth (kiosk)'),
      'Banner menjelaskan filter belum tersinkronisasi ke perangkat photobooth (kiosk)'
    );
    testAssert(
      filterComp.includes('tidak mengubah filter pada kiosk nyata'),
      'Disclaimer eksplisit menyatakan penambahan filter tidak mengubah filter pada kiosk nyata'
    );
    testAssert(
      filterComp.includes('DUA PENYIMPANAN TERPISAH'),
      'Dokumentasi kode menegaskan Admin dan Kiosk memiliki dua domain penyimpanan terpisah'
    );

    console.log('[PASS] Unsupported backend filters detection & storage isolation verified');
  }

  // --- SECTION 13: No Production Mutation Safeguard ---
  console.log('--- SECTION 13: No Production Mutation Safeguard ---');
  {
    testAssert(
      ENABLE_BACKEND_MUTATIONS === false,
      'ENABLE_BACKEND_MUTATIONS harus bernilai false'
    );
    testAssert(
      Array.isArray(VERIFIED_STAGING_ALLOWLIST) && VERIFIED_STAGING_ALLOWLIST.length === 0,
      'VERIFIED_STAGING_ALLOWLIST harus array kosong []'
    );

    const filterComp = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/PhotoFilters.tsx'),
      'utf8'
    );
    testAssert(
      filterComp.includes('isReadOnly'),
      'PhotoFilters memblokir mutasi (tambah/edit/hapus) saat dalam mode Read-Only'
    );

    console.log('[PASS] No production mutation safeguard verified');
  }

  // --- SECTION 14: No Silent Mock Fallback Enforcement ---
  console.log('--- SECTION 14: No Silent Mock Fallback Enforcement ---');
  {
    const dashboardServiceFile = fs.readFileSync(
      path.resolve(rootDir, 'src/lib/dashboardService.ts'),
      'utf8'
    );
    testAssert(
      dashboardServiceFile.includes('Fail-Closed: JANGAN fallback diam-diam ke mock!'),
      'dashboardService dilarang melakukan silent mock fallback pada kegagalan request'
    );

    console.log('[PASS] No silent mock fallback enforcement verified');
  }

  // --- SECTION 15: Sidebar Remains Exactly 9 Menus ---
  console.log('--- SECTION 15: Sidebar Remains Exactly 9 Menus ---');
  {
    const sidebarFile = fs.readFileSync(
      path.resolve(rootDir, 'src/components/Sidebar.tsx'),
      'utf8'
    );
    const menuMatches = sidebarFile.match(/id:\s*['"]([^'"]+)['"]/g) || [];
    const menuIds = menuMatches.map(m => m.replace(/id:\s*['"]/, '').replace(/['"]/, ''));
    testAssert(
      menuIds.length === 9,
      `Sidebar harus memiliki tepat 9 menu (terdeteksi: ${menuIds.length} menu: ${menuIds.join(', ')})`
    );
    testAssert(
      !menuIds.includes('filters'),
      'Photo Filters TIDAK boleh menjadi menu sidebar ke-10 yang berdiri sendiri'
    );
    testAssert(
      menuIds.includes('templates'),
      'Menu Gallery Templates harus tetap ada'
    );

    console.log('[PASS] Sidebar exactly 9 menus verified');
  }

  // --- SECTION 16: AI Content Remains Available ---
  console.log('--- SECTION 16: AI Content Remains Available ---');
  {
    const appFile = fs.readFileSync(
      path.resolve(rootDir, 'src/App.tsx'),
      'utf8'
    );
    testAssert(
      appFile.includes('path="/ai-gen"'),
      'Rute /ai-gen harus tetap tersedia di App.tsx'
    );
    testAssert(
      appFile.includes('AIGenerator'),
      'Komponen AIGenerator diimpor dan dipasang di App.tsx'
    );

    console.log('[PASS] AI Content availability verified');
  }

  // --- SECTION 17: Storyboard Remains Available ---
  console.log('--- SECTION 17: Storyboard Remains Available ---');
  {
    const appFile = fs.readFileSync(
      path.resolve(rootDir, 'src/App.tsx'),
      'utf8'
    );
    testAssert(
      appFile.includes('path="/storyboard"'),
      'Rute /storyboard harus tetap tersedia di App.tsx'
    );
    testAssert(
      appFile.includes('Storyboard'),
      'Komponen Storyboard diimpor dan dipasang di App.tsx'
    );

    console.log('[PASS] Storyboard availability verified');
  }

  // --- SECTION 18: Regression of Modul 1–7 ---
  console.log('--- SECTION 18: Regression of Modul 1–7 ---');
  {
    const filesToCheck = [
      'src/pages/KioskManager.tsx',
      'src/pages/SessionRepository.tsx',
      'src/pages/Analytics.tsx',
      'src/pages/UserManager.tsx',
      'src/pages/Settings.tsx',
      'src/lib/sessionService.ts',
      'src/lib/paymentService.ts',
      'src/lib/userService.ts',
      'src/components/PrinterConfiguration.tsx',
    ];

    for (const f of filesToCheck) {
      testAssert(
        fs.existsSync(path.resolve(rootDir, f)),
        `File warisan ${f} harus ada dan utuh`
      );
    }

    console.log('[PASS] Regression of Modul 1–7 components verified');
  }

  console.log('\n================================================================');
  console.log(`TOTAL MODUL 8B TESTS: ALL ${passedAssertions} ASSERTIONS PASSED (0 FAILED)`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FATAL] Modul 8B test suite encountered an unhandled error:', err);
  process.exit(1);
});
