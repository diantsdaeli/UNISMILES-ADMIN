/**
 * TEST SUITE: MODUL 2 TAHAP 3G - SAFE STAGING PREPARATION & INTEGRATION GAP CLOSURE (REVISI FINAL)
 *
 * Menguji:
 * 1. Environment Safeguard (Fail-Closed Architecture):
 *    - Production Blacklist Lockout: Host produksi (backend-photobooth.uniinside.net, api.uniinside.net)
 *      DIBLOKIR SECARA PERMANEN (throw error PERLINDUNGAN PRODUKSI).
 *    - Fail-Closed Staging Allowlist: Host yang tidak terdaftar di VERIFIED_STAGING_ALLOWLIST
 *      DIBLOKIR SECARA PERMANEN, meskipun berupa localhost, 127.0.0.1, atau subdomain 'staging'.
 *    - VITE_API_BASE_URL change safety: Mutasi tetap ditolak tanpa bukti isolasi basis data formal.
 * 2. Asset Production Readiness:
 *    - Penolakan mutlak URL blob (blob:...).
 *    - Penolakan Data URI biner lokal (data:image/png;base64) pada mode produksi.
 *    - Penerimaan aman URL managed backend (/uploads/assets/...) dan SVG scrapbook (data:image/svg+xml).
 *    - Penolakan aset simulasi (sim-*).
 * 3. Asset Deletion Safety & Strict Blocking:
 *    - Pemblokiran mutlak penghapusan aset yang masih digunakan oleh template (aktif maupun draft).
 *    - Deteksi akurat seluruh referensi: assetId, overlayAssetId, imageUrl, overlayUrl, backgroundConfig.imageUrl, assetElements.
 *    - Penanganan gracefully saat data dependensi template tidak lengkap / kosong (isIncompleteData: true).
 * 4. Template Mutation & Price Integrity:
 *    - Validasi harga bulat positif (> 0, Rp0 ditolak).
 *    - Preservasi template ID, backendId, category, dan metadata pada update.
 * 5. Layout Preset Consistency:
 *    - Audit ketujuh layout kanonikal: 1x1, 2x1, 3x1, 4x1, 2x2, 2x3, 3x3.
 *    - Penjelasan audit bahwa 'strip_3' dan 'strip_4' adalah label UI untuk 3x1 dan 4x1, bukan layout_id.
 *    - Verifikasi batas geometri seluruh slot pada kanvas.
 *    - Verifikasi eliminasi template draft dari kiosk.
 */

import axios from 'axios';
import {
  KNOWN_PRODUCTION_HOSTS,
  VERIFIED_STAGING_ALLOWLIST,
  isProductionApiUrl,
  isVerifiedStagingHost,
  assertMutationAllowed,
  ENABLE_BACKEND_MUTATIONS,
  validateTemplatePayload,
  createTemplate,
  updateTemplate,
  buildTemplateFromPayload,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  Template,
} from '../src/lib/templates';
import {
  checkAssetUsageInTemplates,
  uploadReusableAsset,
  deleteReusableAsset,
  validateAssetUpload,
} from '../src/lib/assets';
import { LAYOUT_PRESETS, computeSlots } from '../src/lib/layoutPresets';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
    throw new Error(`Test assertion failed: ${message}`);
  }
}

async function runStage3gTests() {
  console.log('\n================================================================');
  console.log('MODUL 2 TAHAP 3G: SAFE STAGING & INTEGRATION GAP CLOSURE (FINAL)');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: FAIL-CLOSED STAGING & PRODUCTION LOCKOUT SAFEGUARD
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Fail-Closed Staging & Production Lockout ---');

  // 1.1 Status default mutasi
  assert(ENABLE_BACKEND_MUTATIONS === false, '1.1 ENABLE_BACKEND_MUTATIONS is strictly false by default');
  assert(VERIFIED_STAGING_ALLOWLIST.length === 0, '1.2 VERIFIED_STAGING_ALLOWLIST is empty (fail-closed) until formal backend staging audit');

  // 1.2 Blacklist Produksi
  assert(KNOWN_PRODUCTION_HOSTS.includes('backend-photobooth.uniinside.net'), '1.3 backend-photobooth.uniinside.net is in protected production hosts');
  assert(KNOWN_PRODUCTION_HOSTS.includes('api.uniinside.net'), '1.4 api.uniinside.net is in protected production hosts');
  assert(isProductionApiUrl('https://backend-photobooth.uniinside.net/api/v1') === true, '1.5 Identifies production URL');
  assert(isProductionApiUrl('https://api.uniinside.net/v1') === true, '1.6 Identifies api.uniinside.net');

  // 1.3 Fail-Closed Staging Check: Localhost dan subdomain 'staging' TIDAK otomatis dianggap aman
  assert(isVerifiedStagingHost('http://localhost:8000/api/v1') === false, '1.7 Localhost is NOT automatically considered a verified staging environment');
  assert(isVerifiedStagingHost('http://127.0.0.1:5017/api/v1') === false, '1.8 127.0.0.1 is NOT automatically considered a verified staging environment');
  assert(isVerifiedStagingHost('https://staging-photobooth.uniinside.net/api/v1') === false, '1.9 Unverified subdomain with name "staging" is rejected by fail-closed allowlist');
  assert(isVerifiedStagingHost('https://staging.unismiles.com') === false, '1.10 Any arbitrary staging name is rejected without explicit allowlist entry');

  // 1.4 assertMutationAllowed: Penolakan mutasi pada lingkungan tidak terverifikasi
  let unverifiedBlocked = false;
  try {
    assertMutationAllowed('http://localhost:8000/api/v1', false);
  } catch (err: any) {
    if (err.message && err.message.includes('SAFEGUARD')) {
      unverifiedBlocked = true;
    }
  }
  assert(unverifiedBlocked, '1.11 assertMutationAllowed strictly rejects unverified localhost URL');

  let stagingNamedBlocked = false;
  try {
    assertMutationAllowed('https://staging-backend.uniinside.net/api/v1', false);
  } catch (err: any) {
    if (err.message && err.message.includes('SAFEGUARD')) {
      stagingNamedBlocked = true;
    }
  }
  assert(stagingNamedBlocked, '1.12 assertMutationAllowed strictly rejects unverified staging-named URL');

  let prodBlocked = false;
  try {
    assertMutationAllowed('https://backend-photobooth.uniinside.net/api/v1', false);
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      prodBlocked = true;
    }
  }
  assert(prodBlocked, '1.13 assertMutationAllowed strictly throws PERLINDUNGAN PRODUKSI error on production host');

  // 1.5 Service level blocking against production
  const prodClient = axios.create({ baseURL: 'https://backend-photobooth.uniinside.net/api/v1' });
  const validPayload: CreateTemplatePayload = {
    name: 'Safe Staging Test Frame',
    layout_id: '1x1',
    slot_count: 1,
    price: 15000,
    digital_price: 15000,
    digital_print_price: 30000,
    frame_type: 'color',
    bg_color: '#FFFFFF',
    accent_color: '#000000',
    gradient_stops: [],
    gradient_angle: 45,
    gradient_style: 'linear',
    text_elements: [],
    layout_config: { width: 1200, height: 1800, slots: [{ x: 100, y: 100, width: 1000, height: 1400 }] },
    is_active: false,
  };

  let createBlocked = false;
  try {
    await createTemplate(validPayload, { simulate: false, customApi: prodClient });
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      createBlocked = true;
    }
  }
  assert(createBlocked, '1.14 createTemplate strictly throws PERLINDUNGAN PRODUKSI error when targeting production host');

  let updateBlocked = false;
  try {
    await updateTemplate(123, { name: 'Updated Frame' }, { simulate: false, customApi: prodClient });
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      updateBlocked = true;
    }
  }
  assert(updateBlocked, '1.15 updateTemplate strictly throws PERLINDUNGAN PRODUKSI error when targeting production host');

  let uploadBlocked = false;
  try {
    const dummyFile = new File(['png-data'], 'test.png', { type: 'image/png' });
    await uploadReusableAsset(dummyFile, 'Test Asset', 'sticker', { simulate: false, customApi: prodClient });
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      uploadBlocked = true;
    }
  }
  assert(uploadBlocked, '1.16 uploadReusableAsset strictly throws PERLINDUNGAN PRODUKSI error when targeting production host');

  let deleteBlocked = false;
  try {
    await deleteReusableAsset(999, { simulate: false, customApi: prodClient });
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      deleteBlocked = true;
    }
  }
  assert(deleteBlocked, '1.17 deleteReusableAsset strictly throws PERLINDUNGAN PRODUKSI error when targeting production host');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: ASSET PRODUCTION READINESS (BLOB, DATA URI, AND SIM-* REJECTION)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Asset Payload Production Readiness ---');

  // 2.1 Rejection of Blob URLs in template payload
  const blobInImageUrl: CreateTemplatePayload = {
    ...validPayload,
    image_url: 'blob:http://localhost:3000/a3bf81d2-001',
  };
  const resBlobImage = validateTemplatePayload(blobInImageUrl);
  assert(resBlobImage.valid === false, '2.1 blob: in image_url is rejected');
  assert(resBlobImage.errors.some(e => e.includes('blob:')), '2.2 Explicit blob error message returned');

  const blobInOverlay: CreateTemplatePayload = {
    ...validPayload,
    layout_config: { ...validPayload.layout_config, overlayUrl: 'blob:http://localhost:3000/b4c9e8-002' },
  };
  const resBlobOverlay = validateTemplatePayload(blobInOverlay);
  assert(resBlobOverlay.valid === false, '2.3 blob: in layout_config.overlayUrl is rejected');

  const blobInBackground: CreateTemplatePayload = {
    ...validPayload,
    layout_config: {
      ...validPayload.layout_config,
      backgroundConfig: { type: 'image', imageUrl: 'blob:http://localhost:3000/c7d1f2-003' },
    },
  };
  const resBlobBg = validateTemplatePayload(blobInBackground);
  assert(resBlobBg.valid === false, '2.4 blob: in backgroundConfig.imageUrl is rejected');

  const blobInAssetElement: CreateTemplatePayload = {
    ...validPayload,
    layout_config: {
      ...validPayload.layout_config,
      assetElements: [
        { id: 'ast-1', name: 'Sticker', url: 'blob:http://localhost:3000/d9e2a4', x: 10, y: 10, width: 100, height: 100 },
      ],
    },
  };
  const resBlobAssetEl = validateTemplatePayload(blobInAssetElement);
  assert(resBlobAssetEl.valid === false, '2.5 blob: in layout_config.assetElements is rejected');

  // 2.2 Rejection of Binary Data URIs for Production Staging
  const binaryDataUriPayload: CreateTemplatePayload = {
    ...validPayload,
    image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };
  const resBinaryData = validateTemplatePayload(binaryDataUriPayload, false, { disallowSimulatedAssets: true });
  assert(resBinaryData.valid === false, '2.6 Binary data:image/png Data URI rejected for production payload');
  assert(resBinaryData.errors.some(e => e.includes('Data URI biner')), '2.7 Descriptive error against binary Data URI in production');

  // 2.3 Acceptance of Standard Managed Path and SVG Data URI
  const managedPathPayload: CreateTemplatePayload = {
    ...validPayload,
    image_url: '/uploads/assets/managed-frame-001.png',
    layout_config: {
      ...validPayload.layout_config,
      overlayUrl: '/uploads/assets/overlay-001.png',
      assetElements: [
        {
          id: 'sticker-svg',
          name: 'Sweet Strawberry',
          url: 'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="pink"/></svg>',
          x: 50,
          y: 50,
          width: 80,
          height: 80,
        },
      ],
    },
  };
  const resManaged = validateTemplatePayload(managedPathPayload, false, { disallowSimulatedAssets: true });
  assert(resManaged.valid === true, '2.8 Clean managed server paths and standard SVG scrapbook stickers are accepted for production');
  assert(resManaged.errors.length === 0, '2.9 Zero errors for compliant production payload');

  // 2.4 Rejection of sim-* assets when disallowSimulatedAssets is true
  const simulatedAssetPayload: CreateTemplatePayload = {
    ...validPayload,
    layout_config: {
      ...validPayload.layout_config,
      assetElements: [
        { id: 'sim-172900000', name: 'Simulated Sticker', url: '/uploads/assets/sim-172900000-st.png', x: 20, y: 20, width: 50, height: 50 },
      ],
    },
  };
  const resSim = validateTemplatePayload(simulatedAssetPayload, false, { disallowSimulatedAssets: true });
  assert(resSim.valid === false, '2.10 sim-* asset elements are rejected in production readiness mode');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: ASSET DELETION SAFETY & STRICT BLOCKING
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Asset Deletion Safety & Strict Blocking ---');

  const mockTemplates: Template[] = [
    {
      id: 'tmpl-1',
      backendId: 101,
      name: 'Summer Vintage Frame',
      category: 'Summer',
      imageUrl: '/uploads/assets/asset-summer-bg.png',
      status: 'active',
      isActive: true,
      usageCount: 15,
      layoutId: '2x1',
      slotCount: 2,
      price: 20000,
      digitalPrice: 20000,
      digitalPrintPrice: 35000,
      layoutConfig: {
        width: 1200,
        height: 1800,
        overlayUrl: '/uploads/assets/asset-summer-overlay.png',
        overlayAssetId: 555,
      },
      bgColor: '#FFFFFF',
      accentColor: '#000000',
      frameType: 'png',
      gradientStops: [],
      gradientAngle: 0,
      gradientStyle: 'linear',
      textElements: [],
      assetId: 555,
    },
    {
      id: 'tmpl-2',
      backendId: 102,
      name: 'Autumn Scrapbook Strip',
      category: 'Autumn',
      imageUrl: '/uploads/assets/asset-autumn.png',
      status: 'inactive',
      isActive: false,
      usageCount: 3,
      layoutId: '3x1',
      slotCount: 3,
      price: 25000,
      digitalPrice: 25000,
      digitalPrintPrice: 40000,
      layoutConfig: {
        width: 591,
        height: 1772,
        assetElements: [
          {
            id: 'el-777',
            assetId: 777,
            name: 'Maple Leaf Sticker',
            url: '/uploads/assets/maple-leaf.png',
            x: 20,
            y: 40,
            width: 60,
            height: 60,
          },
        ],
      },
      bgColor: '#FFF5EB',
      accentColor: '#D97706',
      frameType: 'color',
      gradientStops: [],
      gradientAngle: 0,
      gradientStyle: 'linear',
      textElements: [],
    },
  ];

  // 3.1 Detection of asset used by active template (tmpl-1)
  const usageOverlay = checkAssetUsageInTemplates(555, {
    assetUrl: '/uploads/assets/asset-summer-overlay.png',
    isCompleteAndVerified: true,
  }, mockTemplates);
  assert(usageOverlay.inUse === true, '3.1 Correctly detects asset #555 is in use by template');
  assert(usageOverlay.canSafelyDelete === false, '3.2 canSafelyDelete is false for asset in active template');
  assert(usageOverlay.usedBy.includes('Summer Vintage Frame'), '3.3 Accurately identifies template name "Summer Vintage Frame"');

  // 3.2 Detection of asset used by draft template (tmpl-2)
  const usageSticker = checkAssetUsageInTemplates(777, {
    assetUrl: '/uploads/assets/maple-leaf.png',
    isCompleteAndVerified: true,
  }, mockTemplates);
  assert(usageSticker.inUse === true, '3.4 Correctly detects sticker #777 in assetElements of DRAFT template is in use');
  assert(usageSticker.canSafelyDelete === false, '3.5 canSafelyDelete is false for asset in draft template');
  assert(usageSticker.usedBy.includes('Autumn Scrapbook Strip'), '3.6 Accurately identifies draft template "Autumn Scrapbook Strip"');

  // 3.3 Strict deletion blocking on deleteReusableAsset when asset is in use
  let deleteBlockedInUse = false;
  try {
    await deleteReusableAsset(555, {
      templates: mockTemplates,
      assetUrl: '/uploads/assets/asset-summer-overlay.png',
      isCompleteAndVerified: true,
    });
  } catch (err: any) {
    if (err.message && err.message.includes('ditolak: aset sedang digunakan')) {
      deleteBlockedInUse = true;
    }
  }
  assert(deleteBlockedInUse, '3.7 deleteReusableAsset strictly throws blocking Error when asset is in use by active template');

  let deleteDraftBlockedInUse = false;
  try {
    await deleteReusableAsset(777, {
      templates: mockTemplates,
      assetUrl: '/uploads/assets/maple-leaf.png',
      isCompleteAndVerified: true,
    });
  } catch (err: any) {
    if (err.message && err.message.includes('ditolak: aset sedang digunakan')) {
      deleteDraftBlockedInUse = true;
    }
  }
  assert(deleteDraftBlockedInUse, '3.8 deleteReusableAsset strictly blocks deletion of asset used by DRAFT template');

  // 3.4 Incomplete/empty dependency data handling (FAIL-CLOSED)
  // Case A: templates null / undefined
  const incompleteNull = checkAssetUsageInTemplates(123, '/uploads/test.png', null);
  assert(incompleteNull.inUse === false, '3.9 Incomplete data (null) reports inUse: false');
  assert(incompleteNull.isIncompleteData === true, '3.10 Incomplete data (null) correctly flagged with isIncompleteData: true');
  assert(incompleteNull.canSafelyDelete === false, '3.11 canSafelyDelete is false when templates is null (fail-closed)');

  let deleteNullBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: null, assetUrl: '/uploads/test.png' });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteNullBlocked = true;
    }
  }
  assert(deleteNullBlocked, '3.12 deleteReusableAsset strictly blocks deletion when templates is null');

  const incompleteUndefined = checkAssetUsageInTemplates(123, '/uploads/test.png', undefined);
  assert(incompleteUndefined.isIncompleteData === true, '3.13 Incomplete data (undefined) correctly flagged with isIncompleteData: true');
  assert(incompleteUndefined.canSafelyDelete === false, '3.14 canSafelyDelete is false when templates is undefined (fail-closed)');

  let deleteUndefinedBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: undefined, assetUrl: '/uploads/test.png' });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteUndefinedBlocked = true;
    }
  }
  assert(deleteUndefinedBlocked, '3.14b deleteReusableAsset strictly blocks deletion when templates is undefined');

  // Case B: templates [] tanpa bukti kelengkapan (isCompleteAndVerified !== true)
  const emptyUnverified = checkAssetUsageInTemplates(123, '/uploads/test.png', []);
  assert(emptyUnverified.isIncompleteData === true, '3.15 Empty templates [] without proof flagged as isIncompleteData: true');
  assert(emptyUnverified.canSafelyDelete === false, '3.16 Empty templates [] without proof blocked from deletion (canSafelyDelete: false)');

  let deleteEmptyUnverifiedBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: [], assetUrl: '/uploads/test.png', isCompleteAndVerified: false });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteEmptyUnverifiedBlocked = true;
    }
  }
  assert(deleteEmptyUnverifiedBlocked, '3.17 deleteReusableAsset strictly blocks deletion when templates [] lacks verified proof (isCompleteAndVerified: false)');

  let deleteEmptyDefaultBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: [], assetUrl: '/uploads/test.png' });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteEmptyDefaultBlocked = true;
    }
  }
  assert(deleteEmptyDefaultBlocked, '3.17b deleteReusableAsset strictly blocks deletion when templates is [] and isCompleteAndVerified is omitted');

  // Case C: templates [] DENGAN bukti kelengkapan (isCompleteAndVerified === true)
  const emptyVerified = checkAssetUsageInTemplates(123, {
    assetUrl: '/uploads/test.png',
    isCompleteAndVerified: true,
  }, []);
  assert(emptyVerified.isIncompleteData === false, '3.18 Empty templates [] WITH proof correctly flagged as verified (isIncompleteData: false)');
  assert(emptyVerified.canSafelyDelete === true, '3.19 Empty templates [] WITH proof allows safe deletion (canSafelyDelete: true)');

  // Case D: fetch templates gagal (hasError: true)
  const fetchErrorUsage = checkAssetUsageInTemplates(123, {
    assetUrl: '/uploads/test.png',
    hasError: true,
  }, mockTemplates);
  assert(fetchErrorUsage.isIncompleteData === true, '3.20 hasError: true flagged as isIncompleteData: true');
  assert(fetchErrorUsage.canSafelyDelete === false, '3.21 hasError: true blocked from deletion (canSafelyDelete: false)');

  let deleteErrorBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: mockTemplates, hasError: true });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteErrorBlocked = true;
    }
  }
  assert(deleteErrorBlocked, '3.22 deleteReusableAsset strictly blocks deletion when template fetch hasError: true');

  // Case E: fetch templates masih proses loading (isLoading: true)
  const loadingUsage = checkAssetUsageInTemplates(123, {
    assetUrl: '/uploads/test.png',
    isLoading: true,
  }, mockTemplates);
  assert(loadingUsage.isIncompleteData === true, '3.23 isLoading: true flagged as isIncompleteData: true');
  assert(loadingUsage.canSafelyDelete === false, '3.24 isLoading: true blocked from deletion (canSafelyDelete: false)');

  let deleteLoadingBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: mockTemplates, isLoading: true });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deleteLoadingBlocked = true;
    }
  }
  assert(deleteLoadingBlocked, '3.24b deleteReusableAsset strictly blocks deletion when isLoading: true');

  // Case F: pagination belum lengkap (isPaginatedIncomplete: true)
  const paginatedUsage = checkAssetUsageInTemplates(123, {
    assetUrl: '/uploads/test.png',
    isPaginatedIncomplete: true,
  }, mockTemplates);
  assert(paginatedUsage.isIncompleteData === true, '3.25 isPaginatedIncomplete: true flagged as isIncompleteData: true');
  assert(paginatedUsage.canSafelyDelete === false, '3.26 isPaginatedIncomplete: true blocked from deletion (canSafelyDelete: false)');

  let deletePaginatedBlocked = false;
  try {
    await deleteReusableAsset(123, { templates: mockTemplates, isPaginatedIncomplete: true });
  } catch (err: any) {
    if (err.message && err.message.includes('data penggunaan aset belum dapat diverifikasi secara lengkap')) {
      deletePaginatedBlocked = true;
    }
  }
  assert(deletePaginatedBlocked, '3.27 deleteReusableAsset strictly blocks deletion when templates pagination is incomplete');

  // Case G: daftar lengkap dan aset tidak digunakan sama sekali
  const usageUnused = checkAssetUsageInTemplates(999, {
    assetUrl: '/uploads/assets/unused-sticker.png',
    isCompleteAndVerified: true,
  }, mockTemplates);
  assert(usageUnused.inUse === false, '3.28 Unused asset correctly reported as inUse: false');
  assert(usageUnused.usedBy.length === 0, '3.29 usedBy list is empty for unused asset');
  assert(usageUnused.isIncompleteData === false, '3.30 Complete data check returns isIncompleteData: false');
  assert(usageUnused.canSafelyDelete === true, '3.31 Complete data and unused asset allows safe deletion (canSafelyDelete: true)');

  const simDeleteUnused = await deleteReusableAsset(999, {
    templates: mockTemplates,
    assetUrl: '/uploads/assets/unused-sticker.png',
    isCompleteAndVerified: true,
  });
  assert(simDeleteUnused.success === true, '3.32 Verified unused asset successfully deletes in safe simulation mode');
  assert(simDeleteUnused.simulated === true, '3.33 Deletion strictly maintains simulated: true safeguard (zero production mutation)');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: TEMPLATE MUTATION READINESS & PRICE INTEGRITY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Template Mutation & Price Integrity ---');

  // 4.1 Price validation
  const zeroDigitalPrice = { ...validPayload, digital_price: 0 };
  const resZeroDigital = validateTemplatePayload(zeroDigitalPrice);
  assert(resZeroDigital.valid === false, '4.1 digital_price = 0 is rejected');

  const zeroPrintPrice = { ...validPayload, digital_print_price: 0 };
  const resZeroPrint = validateTemplatePayload(zeroPrintPrice);
  assert(resZeroPrint.valid === false, '4.2 digital_print_price = 0 is rejected');

  const negativePrice = { ...validPayload, digital_price: -5000 };
  const resNeg = validateTemplatePayload(negativePrice);
  assert(resNeg.valid === false, '4.3 Negative price is rejected');

  // 4.2 Preservation of ID and metadata
  const builtTemplate = buildTemplateFromPayload(validPayload, 202, {
    createdAt: '2026-10-22T10:00:00Z',
    usageCount: 42,
  });
  assert(builtTemplate.id === '202', '4.4 Template string ID preserved');
  assert(builtTemplate.backendId === 202, '4.5 Backend numeric ID preserved');
  assert(builtTemplate.usageCount === 42, '4.6 Usage count preserved');
  assert(builtTemplate.createdAt === '2026-10-22T10:00:00Z', '4.7 CreatedAt timestamp preserved');
  assert(builtTemplate.layoutId === '1x1', '4.8 Layout ID preserved');
  assert(builtTemplate.price === 15000, '4.9 Base price mapped correctly');
  assert(builtTemplate.digitalPrice === 15000, '4.10 Digital price mapped correctly');
  assert(builtTemplate.digitalPrintPrice === 30000, '4.11 Digital print price mapped correctly');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: KIOSK COMPATIBILITY & 7 CANONICAL LAYOUT PRESETS AUDIT
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Kiosk Compatibility & 7 Canonical Layout Presets Audit ---');

  const CANONICAL_7_LAYOUTS = ['1x1', '2x1', '3x1', '4x1', '2x2', '2x3', '3x3'] as const;
  assert(LAYOUT_PRESETS.length === 7, '5.1 Exactly 7 canonical layout presets exist in Admin Gallery');

  const presetIds = LAYOUT_PRESETS.map(p => p.id);
  for (const canonicalId of CANONICAL_7_LAYOUTS) {
    assert(presetIds.includes(canonicalId), `5.2 Canonical layout ID "${canonicalId}" exists in LAYOUT_PRESETS`);
  }

  // Verify that 'strip_3' and 'strip_4' are NOT technical layout IDs but UI labels
  assert(!presetIds.includes('strip_3' as any), '5.3 "strip_3" is NOT a technical layout ID (it is label: "Strip 3" for 3x1)');
  assert(!presetIds.includes('strip_4' as any), '5.4 "strip_4" is NOT a technical layout ID (it is label: "Strip 4" for 4x1)');

  const preset3x1 = LAYOUT_PRESETS.find(p => p.id === '3x1');
  assert(preset3x1?.label === 'Strip 3', '5.5 3x1 has UI label "Strip 3" matching photobooth workflow');

  const preset4x1 = LAYOUT_PRESETS.find(p => p.id === '4x1');
  assert(preset4x1?.label === 'Strip 4', '5.6 4x1 has UI label "Strip 4" matching photobooth workflow');

  for (const preset of LAYOUT_PRESETS) {
    assert(preset.width > 0 && preset.height > 0, `5.7 Preset "${preset.id}" has positive canvas dimensions (${preset.width}x${preset.height})`);
    const slots = computeSlots(preset);
    assert(slots.length === preset.slots, `5.8 Preset "${preset.id}" computed slots count matches preset.slots (${preset.slots})`);

    // Verify all slot geometries are bounded within canvas
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      assert(s.width > 0 && s.height > 0, `5.9 Slot #${i + 1} in "${preset.id}" has valid positive width & height`);
      assert(s.x >= 0 && s.x + s.width <= preset.width, `5.10 Slot #${i + 1} in "${preset.id}" is within horizontal canvas bounds`);
      assert(s.y >= 0 && s.y + s.height <= preset.height, `5.11 Slot #${i + 1} in "${preset.id}" is within vertical canvas bounds`);
    }
  }

  // 5.12 Draft filter simulation: Inactive templates must not be sent to kiosk
  const kioskVisibleTemplates = mockTemplates.filter(t => t.isActive && !t.layoutConfig?.overlayUrl?.includes('sim-'));
  assert(kioskVisibleTemplates.length === 1, '5.12 Kiosk filter only includes active templates (1 of 2 visible)');
  assert(kioskVisibleTemplates[0].id === 'tmpl-1', '5.13 Only active template "Summer Vintage Frame" is sent to kiosk');
  assert(!kioskVisibleTemplates.some(t => t.id === 'tmpl-2'), '5.14 Draft template "Autumn Scrapbook Strip" is strictly excluded from kiosk');

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 3G TESTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStage3gTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
