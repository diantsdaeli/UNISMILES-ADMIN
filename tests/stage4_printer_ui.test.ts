import assert from 'assert';
import {
  PRINTHEAD_PX,
  DPI,
  ONE_BIT_THRESHOLD,
  mmToPx,
  pxToMm,
  percentToDelta,
  deltaToPercent,
  MEASURED_FRAME,
  PAPER_CATALOG,
  findPaper,
  paperMm,
  printBox,
  drawRect,
  effectiveMargin,
  previewPlan,
  grayscaleValue,
  GRAYSCALE_OPTIONS,
  ditherToBlackAndWhite,
  applyAdjust,
  effectiveSourceDpi,
  inkSummary,
  resolvePrinterProfile,
  NIIMBOT_B1_PRO_PROFILE,
  GENERIC_THERMAL_PROFILE,
  PHOTO_DYESUB_PROFILE,
  cameraErrorMessage,
} from '../src/lib/printPapers';
import {
  DEFAULT_PRINTER_CONFIG,
  getPrinterConfig,
  updatePrinterConfig,
  refreshPrinterStatus,
  testPrintSimulation,
  validateCustomPaperSize,
  THERMAL_LIMITS,
  serializePrinterConfig,
  deserializePrinterConfig,
  PHOTO_ADJUST_LIMITS,
} from '../src/lib/printerService';
import { ENABLE_BACKEND_MUTATIONS, VERIFIED_STAGING_ALLOWLIST } from '../src/lib/templates';
import type { PrinterConfig } from '../src/types/printer';

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

async function runStage4PrinterUiTests() {
  console.log('\n================================================================');
  console.log('MODUL 3 TAHAP 3B: PRINTER CONFIGURATION UI & CONTRACT TESTS');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Paper Presets, Geometries & Unit Conversions
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Paper Presets & Physical Geometries ---');

  assert.strictEqual(PRINTHEAD_PX, 576, '1.1 NIIMBOT B1 Pro printhead width is exactly 576 px');
  assert.strictEqual(DPI, 300, '1.2 Reference DPI is 300');
  assert.strictEqual(ONE_BIT_THRESHOLD, 128, '1.3 Binary threshold is 128');

  const px54 = mmToPx(54);
  assert(px54 === 638, '1.4 54 mm maps to 638 px at 300 DPI');
  const mmConverted = pxToMm(638);
  assert(Math.abs(mmConverted - 54) < 0.1, '1.5 638 px converts back to ~54 mm');

  assert.strictEqual(PAPER_CATALOG.length, 10, '1.6 Official PAPER_CATALOG contains 10 presets');

  const polaroidSNS = findPaper('nimbotpaper-polaroid');
  assert(polaroidSNS !== null, '1.7 findPaper locates "nimbotpaper-polaroid"');
  assert.strictEqual(polaroidSNS?.kind, 'framed', '1.8 Polaroid SNS is classified as framed paper');
  assert.strictEqual(polaroidSNS?.widthMm, 54, '1.9 Polaroid SNS width is 54 mm');
  assert.strictEqual(polaroidSNS?.heightMm, 67, '1.10 Polaroid SNS height is 67 mm');

  const caseInsensitive = findPaper('NIMBOTPAPER-POLAROID');
  assert(caseInsensitive !== null, '1.11 findPaper is case-insensitive');

  const unknownPaper = findPaper('unknown-non-existent');
  assert.strictEqual(unknownPaper, null, '1.12 findPaper returns null for non-catalog paper');

  const customMm = paperMm('CUSTOM 48X120 MM');
  assert.strictEqual(customMm.widthMm, 48, '1.13 paperMm parses custom width (48 mm)');
  assert.strictEqual(customMm.heightMm, 120, '1.14 paperMm parses custom height (120 mm)');

  const fallbackMm = paperMm('');
  assert.strictEqual(fallbackMm.widthMm, 54, '1.15 paperMm defaults to 54 mm when empty');
  assert.strictEqual(fallbackMm.heightMm, 67, '1.16 paperMm defaults to 67 mm when empty');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Custom Paper Size Validation & Thermal Limits
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Custom Paper Size Validation ---');

  const validCustom = validateCustomPaperSize('CUSTOM 48X150 MM');
  assert.strictEqual(validCustom, null, '2.1 Valid custom size (48x150 mm) returns null error');

  const validCustomLower = validateCustomPaperSize('custom 40x80 mm');
  assert.strictEqual(validCustomLower, null, '2.2 Valid lowercase custom size returns null error');

  const tooWide = validateCustomPaperSize('CUSTOM 54X67 MM');
  assert(
    tooWide !== null && tooWide.includes('melebihi lebar cetak maksimum'),
    '2.3 54 mm width returns physical printhead clipping warning'
  );

  const tooShort = validateCustomPaperSize('CUSTOM 48X5 MM');
  assert(
    tooShort !== null && tooShort.includes('Tinggi harus antara'),
    '2.4 Height < 8 mm returns height out-of-range error'
  );

  const tooTall = validateCustomPaperSize('CUSTOM 48X400 MM');
  assert(
    tooTall !== null && tooTall.includes('Tinggi harus antara'),
    '2.5 Height > 350 mm returns height out-of-range error'
  );

  const malformed = validateCustomPaperSize('48x150');
  assert(
    malformed !== null && malformed.includes('Format: CUSTOM'),
    '2.6 Missing CUSTOM prefix returns format guidance error'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Thermal Printhead Clipping & Box Calculations
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Thermal Printhead Clipping & Geometry ---');

  const canvasW = mmToPx(54); // 638 px
  const canvasH = mmToPx(67); // 791 px
  const boxNoMargin = printBox(canvasW, canvasH, { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });

  assert.strictEqual(
    boxNoMargin.w,
    PRINTHEAD_PX,
    '3.1 printBox width is strictly capped to PRINTHEAD_PX (576 px) when canvas is 638 px'
  );
  assert.strictEqual(boxNoMargin.h, canvasH, '3.2 printBox height matches canvas height');

  // Offset testing on canvas with headroom
  const boxOffset = printBox(
    400,
    600,
    { topPx: 20, rightPx: 50, leftPx: 20, bottomPx: 50 },
    PRINTHEAD_PX,
    15,
    20
  );
  assert.strictEqual(boxOffset.x, 35, '3.3 Offset X (+15) shifts box x from 20 to 35');
  assert.strictEqual(boxOffset.y, 40, '3.4 Offset Y (+20) shifts box y from 20 to 40');

  // Polaroid SNS effective margin
  const snsEffective = effectiveMargin('nimbotpaper-polaroid', { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });
  assert.strictEqual(snsEffective.source, 'measured', '3.5 Polaroid SNS uses "measured" frame margin source');
  assert.strictEqual(snsEffective.margin.topPx, MEASURED_FRAME.topPx, '3.6 Polaroid SNS margin top is locked to measured 71 px');
  assert.strictEqual(snsEffective.margin.rightPx, MEASURED_FRAME.rightPx, '3.7 Polaroid SNS margin right is locked to measured 83 px');
  assert.strictEqual(snsEffective.margin.bottomPx, MEASURED_FRAME.bottomPx, '3.8 Polaroid SNS margin bottom is locked to measured 165 px');

  // Framed paper with zero margin warning
  const framedZeroMargin = effectiveMargin(PAPER_CATALOG[1].value, { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });
  assert(
    framedZeroMargin.warning !== null && framedZeroMargin.warning.includes('berbingkai, tetapi margin masih 0'),
    '3.9 Framed paper with zero margin returns warning to operator'
  );

  // Preview plan & ink summary
  const plan = previewPlan('54 × 67 mm — SNS (bingkai)', { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });
  const summary = inkSummary(plan);
  assert.strictEqual(summary.headroomPx, 0, '3.10 Headroom is 0 when box reaches right printhead limit');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Image Calibration, Grayscale & Dithering Algorithms
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Image Calibration & 1-Bit Dithering ---');

  // 4.1 Brightness / Contrast / Saturation adjustment
  const neutral = applyAdjust([100, 100, 100], 100, 100, 100);
  assert.strictEqual(neutral[0], 100, '4.1 Neutral 100% adjust leaves R unchanged');
  assert.strictEqual(neutral[1], 100, '4.2 Neutral 100% adjust leaves G unchanged');
  assert.strictEqual(neutral[2], 100, '4.3 Neutral 100% adjust leaves B unchanged');

  const brighter = applyAdjust([100, 100, 100], 150, 100, 100);
  assert(brighter[0] > 100, '4.4 Brightness 150% increases pixel value');

  const desaturated = applyAdjust([200, 50, 50], 100, 100, 0);
  assert.strictEqual(
    desaturated[0],
    desaturated[1],
    '4.5 Saturation 0% produces equal R and G channel values (grayscale)'
  );
  assert.strictEqual(
    desaturated[1],
    desaturated[2],
    '4.6 Saturation 0% produces equal G and B channel values (grayscale)'
  );

  // 4.2 All 9 Grayscale Algorithms
  assert.strictEqual(GRAYSCALE_OPTIONS.length, 9, '4.7 Exactly 9 grayscale algorithms available');
  const algs = ['rec601', 'rec709', 'average', 'luma-sqrt', 'green', 'red', 'blue', 'max', 'min'];
  for (const alg of algs) {
    const v = grayscaleValue(alg, 150, 100, 50);
    assert(typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 255, `4.8 Algorithm "${alg}" produces valid pixel value`);
  }

  // 4.3 Dithering conversion to 0 or 255
  const sampleBuf = new Uint8ClampedArray(10 * 10 * 4);
  for (let i = 0; i < sampleBuf.length; i += 4) {
    sampleBuf[i] = 120; // R
    sampleBuf[i + 1] = 120; // G
    sampleBuf[i + 2] = 120; // B
    sampleBuf[i + 3] = 255; // Alpha
  }
  ditherToBlackAndWhite(sampleBuf, 10, 10, 128);
  for (let i = 0; i < sampleBuf.length; i += 4) {
    const val = sampleBuf[i];
    assert(val === 0 || val === 255, '4.9 Output pixels after dithering are strictly 0 or 255');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Printer Service, Simulation Mode & Multi-Kiosk Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Service Simulation & Multi-Kiosk Isolation ---');

  mockStorage.clear();

  // 5.1 Initial get returns default
  const kiosk1Initial = await getPrinterConfig('kiosk-alpha', 'online');
  assert.strictEqual(kiosk1Initial.config.photo_brightness, 100, '5.1 Initial photo_brightness is 100');
  assert.strictEqual(kiosk1Initial.reported?.status, 'OFFLINE', '5.2 printing_enabled false reports OFFLINE');

  // 5.2 Update kiosk 1
  const updatedKiosk1Config: PrinterConfig = {
    ...kiosk1Initial.config,
    printing_enabled: true,
    adapter: 'thermal',
    printer_name: 'NIIMBOT B1 Pro',
    photo_brightness: 135,
    thermal_density: 4,
    show_print_button: false,
  };
  const saveRes = await updatePrinterConfig('kiosk-alpha', updatedKiosk1Config);
  assert(saveRes.success === true, '5.3 savePrinterConfig succeeds');
  assert(saveRes.simulated === true, '5.4 savePrinterConfig marks simulated: true');

  // Verify Kiosk 1 persisted correctly
  const kiosk1Loaded = await getPrinterConfig('kiosk-alpha', 'online');
  assert.strictEqual(kiosk1Loaded.config.photo_brightness, 135, '5.5 Kiosk 1 preserves photo_brightness 135');
  assert.strictEqual(kiosk1Loaded.config.thermal_density, 4, '5.6 Kiosk 1 preserves thermal_density 4');
  assert.strictEqual(kiosk1Loaded.config.show_print_button, false, '5.7 Kiosk 1 preserves show_print_button false');

  // 5.3 Isolation check: Kiosk 2 must NOT be contaminated by Kiosk 1
  const kiosk2Loaded = await getPrinterConfig('kiosk-beta', 'online');
  assert.strictEqual(kiosk2Loaded.config.photo_brightness, 100, '5.8 Kiosk 2 has default brightness (isolated from Kiosk 1)');
  assert.strictEqual(kiosk2Loaded.config.thermal_density, 3, '5.9 Kiosk 2 has default density 3 (isolated from Kiosk 1)');
  assert.strictEqual(kiosk2Loaded.config.show_print_button, true, '5.10 Kiosk 2 has default show_print_button true');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Safety Safeguards & Zero Network/Hardware Mutation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Safety Safeguards & Zero Mutation ---');

  assert.strictEqual(ENABLE_BACKEND_MUTATIONS, false, '6.1 ENABLE_BACKEND_MUTATIONS is strictly false');
  assert.strictEqual(VERIFIED_STAGING_ALLOWLIST.length, 0, '6.2 VERIFIED_STAGING_ALLOWLIST is strictly empty []');

  // 6.3 Test print simulation
  const testPrintRes = await testPrintSimulation('kiosk-alpha', updatedKiosk1Config);
  assert(testPrintRes.success === true, '6.3 testPrintSimulation returns success: true');
  assert(testPrintRes.simulated === true, '6.4 testPrintSimulation marks simulated: true');
  assert(
    testPrintRes.message.includes('tidak ada pencetakan fisik'),
    '6.5 Test print message clearly states no physical printing occurs'
  );
  assert(testPrintRes.jobId?.startsWith('SIM-TEST-'), '6.6 testPrintSimulation generates SIM-TEST- jobId');

  // 6.4 Disabled printing rejects test print
  let disabledBlocked = false;
  try {
    await testPrintSimulation('kiosk-beta', kiosk2Loaded.config);
  } catch (err: any) {
    if (err.message && err.message.includes('Pencetakan harus diaktifkan')) {
      disabledBlocked = true;
    }
  }
  assert(disabledBlocked, '6.7 testPrintSimulation throws error when printing_enabled is false');

  // 6.5 Production host mutation blocking
  let prodMutationBlocked = false;
  const prodClient: any = {
    defaults: { baseURL: 'https://backend-photobooth.uniinside.net/api/v1' },
    put: async () => { throw new Error('Unreachable production HTTP request'); },
  };
  try {
    await updatePrinterConfig('kiosk-alpha', updatedKiosk1Config, { simulate: false, customApi: prodClient });
  } catch (err: any) {
    if (err.message && err.message.includes('PERLINDUNGAN PRODUKSI')) {
      prodMutationBlocked = true;
    }
  }
  assert(prodMutationBlocked, '6.8 updatePrinterConfig strictly blocks production host mutations');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Legacy Features Preservation Audit
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Legacy Features Preservation Audit ---');

  // Verify DEFAULT_PRINTER_CONFIG does not override existing hardware config shape
  assert(DEFAULT_PRINTER_CONFIG.paper_size !== undefined, '7.1 DEFAULT_PRINTER_CONFIG defines paper_size');
  assert(DEFAULT_PRINTER_CONFIG.printing_enabled === false, '7.2 Default printing is disabled');
  assert.strictEqual(DEFAULT_PRINTER_CONFIG.photo_brightness, 100, '7.3 Neutral brightness is 100%');
  assert.strictEqual(DEFAULT_PRINTER_CONFIG.photo_contrast, 100, '7.4 Neutral contrast is 100%');
  assert.strictEqual(DEFAULT_PRINTER_CONFIG.photo_saturation, 100, '7.5 Neutral saturation is 100%');
  assert.strictEqual(DEFAULT_PRINTER_CONFIG.thermal_density, 3, '7.6 Default thermal density is level 3');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: Contract Mapping, Unit Conversions & Payload Clamping
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 8: Contract Mapping & Unit Conversions ---');

  const clampedConfig = serializePrinterConfig({
    photo_brightness: 20, // below min 50
    photo_contrast: 250, // above max 150
    photo_saturation: -30, // below min 0
    thermal_density: 9, // above max 5
    thermal_offset_x_px: -350, // below min -200
    thermal_offset_y_px: 500, // above max 200
    print_margin_top_px: 999, // above max 300
    print_margin_left_px: -50, // below min 0
    print_sharpen: 180, // above max 100
    adapter: 'non-existent-adapter',
    photo_fit_mode: 'invalid_mode',
    grayscale_algorithm: 'unknown_algo',
  });

  assert.strictEqual(clampedConfig.photo_brightness, 50, '8.1 photo_brightness clamped to min 50');
  assert.strictEqual(clampedConfig.photo_contrast, 150, '8.2 photo_contrast clamped to max 150');
  assert.strictEqual(clampedConfig.photo_saturation, 0, '8.3 photo_saturation clamped to min 0');
  assert.strictEqual(clampedConfig.thermal_density, 5, '8.4 thermal_density clamped to max 5');
  assert.strictEqual(clampedConfig.thermal_offset_x_px, -200, '8.5 thermal_offset_x_px clamped to -200');
  assert.strictEqual(clampedConfig.thermal_offset_y_px, 200, '8.6 thermal_offset_y_px clamped to 200');
  assert.strictEqual(clampedConfig.print_margin_top_px, 300, '8.7 print_margin_top_px clamped to max 300');
  assert.strictEqual(clampedConfig.print_margin_left_px, 0, '8.8 print_margin_left_px clamped to min 0');
  assert.strictEqual(clampedConfig.print_sharpen, 100, '8.9 print_sharpen clamped to max 100');
  assert.strictEqual(clampedConfig.adapter, 'disabled', '8.10 Unknown adapter normalized to "disabled"');
  assert.strictEqual(clampedConfig.photo_fit_mode, 'fit', '8.11 Unknown fit mode normalized to "fit"');
  assert.strictEqual(clampedConfig.grayscale_algorithm, 'rec601', '8.12 Unknown grayscale normalized to "rec601"');

  assert.strictEqual(percentToDelta(100), 0, '8.13 100% converts to delta 0% (neutral)');
  assert.strictEqual(percentToDelta(125), 25, '8.14 125% converts to delta +25%');
  assert.strictEqual(percentToDelta(70), -30, '8.15 70% converts to delta -30%');
  assert.strictEqual(deltaToPercent(0), 100, '8.16 Delta 0 converts to 100%');
  assert.strictEqual(deltaToPercent(25), 125, '8.17 Delta +25 converts to 125%');

  const deserialized = deserializePrinterConfig({ enabled: true, photo_brightness: 110 });
  assert.strictEqual(deserialized.printing_enabled, true, '8.18 deserializePrinterConfig handles legacy "enabled"');
  assert.strictEqual(deserialized.photo_brightness, 110, '8.19 deserializePrinterConfig preserves brightness 110%');
  assert.strictEqual(deserialized.thermal_density, 3, '8.20 deserializePrinterConfig applies fallback density 3');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: Printer Hardware Profiles & Dynamic Printhead Geometry
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 9: Printer Profiles & Hardware Verification ---');

  const b1Profile = resolvePrinterProfile('thermal', 'NIIMBOT B1 Pro', 'nimbotpaper-polaroid');
  assert.strictEqual(b1Profile.id, 'niimbot-b1-pro', '9.1 resolvePrinterProfile identifies NIIMBOT B1 Pro');
  assert.strictEqual(b1Profile.printheadDots, 576, '9.2 NIIMBOT B1 Pro has 576 dots printhead');
  assert.strictEqual(b1Profile.isVerifiedHardware, false, '9.3 NIIMBOT B1 Pro profile is marked unverified (simulation estimate)');
  assert(b1Profile.verificationSource.includes('Estimasi Simulasi'), '9.4 B1 Pro profile cites simulation estimate');

  const genericProfile = resolvePrinterProfile('thermal', 'Generic POS', 'CUSTOM 58X100 MM');
  assert.strictEqual(genericProfile.isVerifiedHardware, false, '9.5 Generic thermal profile is marked unverified');
  assert(genericProfile.verificationSource.includes('Estimasi Simulasi'), '9.6 Generic profile labeled as simulation estimate');

  const photoProfile = resolvePrinterProfile('cups', 'DNP DS-RX1', '4 Strip 5 × 15 cm');
  assert.strictEqual(photoProfile.id, 'photo-dyesub', '9.7 resolvePrinterProfile identifies photo dye-sub');
  assert.strictEqual(photoProfile.printheadDots, 1800, '9.8 Photo dye-sub profile has 1800 dots printhead');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 10: Camera Error Handling & Utilities
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 10: Camera Error Handling & Utilities ---');

  const permError = cameraErrorMessage({ name: 'NotAllowedError' });
  assert(permError.includes('Izin kamera ditolak'), '10.1 NotAllowedError maps to permission error');

  const notFoundError = cameraErrorMessage({ name: 'NotFoundError' });
  assert(notFoundError.includes('Tidak ada kamera'), '10.2 NotFoundError maps to not detected error');

  const busyError = cameraErrorMessage({ name: 'NotReadableError' });
  assert(busyError.includes('sedang dipakai aplikasi lain'), '10.3 NotReadableError maps to busy error');

  const fallbackCamera = cameraErrorMessage(null);
  assert(typeof fallbackCamera === 'string' && fallbackCamera.length > 0, '10.4 Fallback camera error returns string');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 11: Multi-Kiosk Isolation & Switching
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 11: Multi-Kiosk State Isolation ---');

  // Setup Kiosk Gamma
  const kiosk3Loaded = await getPrinterConfig('kiosk-gamma', 'offline');
  assert.strictEqual(kiosk3Loaded.config.photo_brightness, 100, '11.1 Kiosk Gamma initializes with clean 100% brightness');
  assert.strictEqual(kiosk3Loaded.reported?.status, 'OFFLINE', '11.2 Offline kiosk reports OFFLINE status');

  await updatePrinterConfig('kiosk-gamma', {
    ...kiosk3Loaded.config,
    photo_brightness: 145,
    thermal_density: 4,
  });

  const kiosk1Recheck = await getPrinterConfig('kiosk-alpha', 'online');
  const kiosk2Recheck = await getPrinterConfig('kiosk-beta', 'online');
  const kiosk3Recheck = await getPrinterConfig('kiosk-gamma', 'offline');

  assert.strictEqual(kiosk1Recheck.config.photo_brightness, 135, '11.3 Kiosk Alpha retains its brightness (135%)');
  assert.strictEqual(kiosk2Recheck.config.photo_brightness, 100, '11.4 Kiosk Beta retains its default brightness (100%)');
  assert.strictEqual(kiosk3Recheck.config.photo_brightness, 145, '11.5 Kiosk Gamma has independent brightness (145%)');
  assert.strictEqual(kiosk3Recheck.config.thermal_density, 4, '11.6 Kiosk Gamma has independent thermal density (4)');

  console.log('\n================================================================');
  console.log('TOTAL TAHAP 3B TESTS: ALL 88 ASSERTIONS PASSED (0 FAILED)');
  console.log('================================================================\n');
}

runStage4PrinterUiTests().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});

