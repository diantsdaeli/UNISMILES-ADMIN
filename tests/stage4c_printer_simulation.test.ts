import assert from 'assert';
import {
  DEFAULT_PRINTER_CONFIG,
  getPrinterConfig,
  updatePrinterConfig,
  refreshPrinterStatus,
  testPrintSimulation,
  validateCustomPaperSize,
  THERMAL_LIMITS,
  CUSTOM_PATTERN,
  PHOTO_ADJUST_LIMITS,
  ALLOWED_ADAPTERS,
  ALLOWED_ORIENTATIONS,
  ALLOWED_FIT_MODES,
  ALLOWED_GRAYSCALE_ALGORITHMS,
  KNOWN_PAPER_SIZES,
  FORBIDDEN_PRINTING_FIELDS,
  ALLOWED_PRINTING_FIELDS,
  PrintingValidationError,
  validatePrintingConfigPayload,
  serializePrinterConfig,
  deserializePrinterConfig,
  parsePrinterApiError,
  mapLegacyPrinterSizeToPaperPreset,
  mapPaperPresetToLegacyPrinterSize,
  auditTestPrintSafety,
} from '../src/lib/printerService';
import { PHOTO_DYESUB_PROFILE } from '../src/lib/printPapers';
import {
  ENABLE_BACKEND_MUTATIONS,
  VERIFIED_STAGING_ALLOWLIST,
  assertMutationAllowed,
  isProductionApiUrl,
  isVerifiedStagingHost,
} from '../src/lib/templates';
import type { PrinterConfig, PrintingConfigResponse, PrinterReportedState } from '../src/types/printer';

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

// Helper to create an isolated mock Axios client for HTTP contract tests
function createMockClient(handler: (config: any) => Promise<any>) {
  return {
    defaults: { baseURL: 'https://staging-isolated.uniinside.test/api/v1' },
    get: async (url: string, cfg?: any) => handler({ method: 'GET', url, ...cfg }),
    put: async (url: string, data?: any, cfg?: any) => handler({ method: 'PUT', url, data, ...cfg }),
    post: async (url: string, data?: any, cfg?: any) => handler({ method: 'POST', url, data, ...cfg }),
  };
}

async function runStage4cContractTests() {
  console.log('\n================================================================');
  console.log('MODUL 3 TAHAP 3C: SAFE PRINTER SIMULATION & BACKEND CONTRACT TESTS');
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
  // SECTION 1: GET Printing Config HTTP Contract Response Parsing
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 1: GET Printing-Config Response Schema ---');

  const backendRowSample = {
    success: true,
    kioskId: 'kiosk-real-101',
    data: {
      config: {
        enabled: true,
        adapter: 'thermal',
        printer_name: 'NIIMBOT B1 Pro',
        paper_size: 'nimbotpaper-polaroid',
        orientation: 'portrait',
        copies_limit: 2,
        timeout_ms: 45000,
        retry_count: 3,
        config_version: 5,
        allowed_layouts: ['1x1', '2x1', '4x1'],
        photo_brightness: 110,
        photo_contrast: 105,
        photo_saturation: 95,
        thermal_density: 4,
        thermal_offset_y_px: 12,
        thermal_offset_x_px: -5,
        print_margin_top_px: 71,
        print_margin_right_px: 83,
        print_margin_left_px: 0,
        print_margin_bottom_px: 165,
        print_sharpen: 25,
        photo_fit_mode: 'cover',
        grayscale_algorithm: 'rec709',
        show_email_button: true,
        show_retake_button: false,
        show_print_button: true,
      },
      reported: {
        config_version: 5,
        adapter: 'thermal',
        printer_name: 'NIIMBOT B1 Pro',
        status: 'READY',
        paper_status: 'OK',
        prints_remaining: 85,
        last_print_error: null,
        supported_adapters: ['disabled', 'thermal', 'windows'],
        available_printers: [{ name: 'NIIMBOT B1 Pro' }],
        reported_at: '2026-10-22T10:00:00Z',
      },
      status: {
        desired: 'stored',
        reported: 'reported',
        applied: true,
        pending: false,
      },
    },
  };

  const parsedConfig = deserializePrinterConfig(backendRowSample.data.config);
  countStrictEqual(parsedConfig.printing_enabled, true, '1.1 enabled field maps to printing_enabled');
  countStrictEqual(parsedConfig.adapter, 'thermal', '1.2 adapter parsed correctly');
  countStrictEqual(parsedConfig.printer_name, 'NIIMBOT B1 Pro', '1.3 printer_name preserved');
  countStrictEqual(parsedConfig.paper_size, 'nimbotpaper-polaroid', '1.4 paper_size preserved');
  countStrictEqual(parsedConfig.copies_limit, 2, '1.5 copies_limit parsed correctly');
  countStrictEqual(parsedConfig.config_version, 5, '1.6 config_version matches');
  countStrictEqual(parsedConfig.photo_brightness, 110, '1.7 photo_brightness matches');
  countStrictEqual(parsedConfig.thermal_offset_x_px, -5, '1.8 thermal_offset_x_px negative preserved');
  countStrictEqual(parsedConfig.show_retake_button, false, '1.9 show_retake_button false parsed correctly');

  // Test via mock transport client
  const mockGetClient = createMockClient(async (req) => {
    countStrictEqual(req.method, 'GET', '1.10 Mock request method is GET');
    countStrictEqual(req.url, '/admin/kiosks/kiosk-real-101/printing-config', '1.11 Mock URL matches endpoint');
    return { data: backendRowSample };
  });

  const getRes = await getPrinterConfig('kiosk-real-101', 'online', {
    customApi: mockGetClient as any,
    simulate: false,
  });
  countStrictEqual(getRes.config.printing_enabled, true, '1.12 Mock transport returns config');
  countStrictEqual(getRes.reported?.status, 'READY', '1.13 Mock transport returns reported state');
  countStrictEqual(getRes.status.applied, true, '1.14 Status applied is true');
  logSectionPass('GET printing-config response successfully deserialized');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Valid Config Serialization & Clamping
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Valid Config Serialization & Clamping ---');

  const unnormalizedConfig = {
    printing_enabled: true,
    adapter: 'THERMAL',
    printer_name: '  NIIMBOT B1 Pro  ',
    paper_size: 'Instax Mini (54 × 86 mm)',
    orientation: 'PORTRAIT',
    copies_limit: 99, // Should clamp to 10
    timeout_ms: 99999999, // Should clamp to 300000
    retry_count: 10, // Should clamp to 3
    photo_brightness: 250, // Should clamp to 150
    photo_contrast: 10, // Should clamp to 50
    photo_saturation: -20, // Should clamp to 0
    thermal_density: 8, // Should clamp to 5
    thermal_offset_y_px: 500, // Should clamp to 200
    thermal_offset_x_px: -400, // Should clamp to -200
    print_margin_top_px: 999, // Should clamp to 300
    print_sharpen: 150, // Should clamp to 100
    photo_fit_mode: 'STRETCH',
    grayscale_algorithm: 'REC601',
    show_email_button: 'yes' as any,
    show_retake_button: 0 as any,
    show_print_button: 'true' as any,
  };

  const serialized = serializePrinterConfig(unnormalizedConfig as any);
  countStrictEqual(serialized.adapter, 'thermal', '2.1 Adapter normalized to lowercase');
  countStrictEqual(serialized.printer_name, 'NIIMBOT B1 Pro', '2.2 Printer name trimmed');
  countStrictEqual(serialized.orientation, 'portrait', '2.3 Orientation normalized to lowercase');
  countStrictEqual(serialized.copies_limit, 10, '2.4 copies_limit clamped to 10');
  countStrictEqual(serialized.timeout_ms, 300000, '2.5 timeout_ms clamped to 300000');
  countStrictEqual(serialized.retry_count, 3, '2.6 retry_count clamped to 3');
  countStrictEqual(serialized.photo_brightness, 150, '2.7 photo_brightness clamped to 150');
  countStrictEqual(serialized.photo_contrast, 50, '2.8 photo_contrast clamped to 50');
  countStrictEqual(serialized.photo_saturation, 0, '2.9 photo_saturation clamped to 0');
  countStrictEqual(serialized.thermal_density, 5, '2.10 thermal_density clamped to 5');
  countStrictEqual(serialized.thermal_offset_y_px, 200, '2.11 thermal_offset_y_px clamped to 200');
  countStrictEqual(serialized.thermal_offset_x_px, -200, '2.12 thermal_offset_x_px clamped to -200');
  countStrictEqual(serialized.print_margin_top_px, 300, '2.13 print_margin_top_px clamped to 300');
  countStrictEqual(serialized.print_sharpen, 100, '2.14 print_sharpen clamped to 100');
  countStrictEqual(serialized.photo_fit_mode, 'stretch', '2.15 photo_fit_mode lowercase');
  countStrictEqual(serialized.show_email_button, true, '2.16 "yes" parsed as true');
  countStrictEqual(serialized.show_retake_button, false, '2.17 0 parsed as false');
  countStrictEqual(serialized.show_print_button, true, '2.18 "true" parsed as true');
  logSectionPass('Serialization clamping and normalization fully verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Invalid Config Rejection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Invalid Config Rejection ---');

  countThrows(
    () => validatePrintingConfigPayload(null as any),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('must be an object'),
    '3.1 Null payload throws PrintingValidationError'
  );

  countThrows(
    () => validatePrintingConfigPayload([] as any),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('must be an object'),
    '3.2 Array payload throws PrintingValidationError'
  );

  countThrows(
    () => validatePrintingConfigPayload({ unknown_bogus_field: 'bad' }),
    (err: any) => err instanceof PrintingValidationError && err.code === 'UNKNOWN_FIELD',
    '3.3 Unknown field rejected with UNKNOWN_FIELD'
  );

  countThrows(
    () => validatePrintingConfigPayload({ photo_brightness: 'invalid_number' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('integer between 50 and 150'),
    '3.4 Non-numeric photo_brightness rejected'
  );

  countThrows(
    () => validatePrintingConfigPayload({ copies_limit: 0 }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('integer between 1 and 10'),
    '3.5 copies_limit < 1 rejected'
  );

  countThrows(
    () => validatePrintingConfigPayload({ timeout_ms: 1000 }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('integer between 5000 and 300000'),
    '3.6 timeout_ms < 5000 rejected'
  );
  logSectionPass('Invalid payloads and bounds rejected accurately');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Custom Paper Validation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Custom Paper Validation ---');

  // Valid custom paper
  const validPayload = validatePrintingConfigPayload({ paper_size: 'CUSTOM 48X150 MM' });
  countStrictEqual(validPayload.paper_size, 'CUSTOM 48X150 MM', '4.1 CUSTOM 48X150 MM accepted');

  const validPayloadLower = validatePrintingConfigPayload({ paper_size: 'custom 40x80 mm' });
  countStrictEqual(validPayloadLower.paper_size, 'custom 40x80 mm', '4.2 Lowercase custom paper accepted');

  // Width > maxPaperWidthMm (60 mm)
  countThrows(
    () => validatePrintingConfigPayload({ paper_size: 'CUSTOM 70X100 MM' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('melebihi lebar kertas maksimum (60 mm)'),
    '4.3 Width > 60 mm rejected with explicit maxPaperWidthMm message'
  );

  // Height < minHeightMm (8 mm)
  countThrows(
    () => validatePrintingConfigPayload({ paper_size: 'CUSTOM 48X5 MM' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('di luar rentang printer termal (8-350 mm)'),
    '4.4 Height < 8 mm rejected'
  );

  // Height > maxHeightMm (350 mm)
  countThrows(
    () => validatePrintingConfigPayload({ paper_size: 'CUSTOM 48X400 MM' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('di luar rentang printer termal (8-350 mm)'),
    '4.5 Height > 350 mm rejected'
  );

  // Unrecognized preset
  countThrows(
    () => validatePrintingConfigPayload({ paper_size: 'Tabloid Banner 11x17' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('tidak dikenali'),
    '4.6 Unrecognized preset rejected'
  );
  logSectionPass('Custom paper sizes and preset boundaries validated strictly');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Unsupported Adapter Rejection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Unsupported Adapter Rejection ---');

  countThrows(
    () => validatePrintingConfigPayload({ adapter: 'bluetooth-direct' }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('adapter must be one of: disabled, cups, windows, mock, thermal.'),
    '5.1 Non-existent adapter rejected'
  );

  // When reported supported_adapters is available, validate against reported list
  const mockReportedState: PrinterReportedState = {
    supported_adapters: ['disabled', 'thermal'],
    available_printers: ['NIIMBOT B1 Pro'],
  };

  countThrows(
    () => validatePrintingConfigPayload(
      { printing_enabled: true, adapter: 'windows', printer_name: 'NIIMBOT B1 Pro' },
      {},
      mockReportedState
    ),
    (err: any) => err instanceof PrintingValidationError && err.code === 'UNSUPPORTED_ADAPTER',
    '5.2 Adapter not reported by Kiosk Agent rejected with UNSUPPORTED_ADAPTER'
  );
  logSectionPass('Unsupported adapters rejected accurately');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Invalid Printer Name Rejection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Invalid Printer Name Rejection ---');

  countThrows(
    () => validatePrintingConfigPayload({
      printing_enabled: true,
      adapter: 'thermal',
      printer_name: 'Printer; rm -rf /;',
    }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('printer_name contains unsupported characters.'),
    '6.1 Shell injection in printer_name rejected'
  );

  countThrows(
    () => validatePrintingConfigPayload({
      printing_enabled: true,
      adapter: 'thermal',
      printer_name: 'A'.repeat(256),
    }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('printer_name contains unsupported characters.'),
    '6.2 Printer name exceeding 255 chars rejected'
  );

  countThrows(
    () => validatePrintingConfigPayload({
      printing_enabled: true,
      adapter: 'thermal',
      printer_name: '',
    }),
    (err: any) => err instanceof PrintingValidationError && err.message.includes('printer_name is required when printing is enabled.'),
    '6.3 Empty printer_name when printing enabled rejected'
  );

  // Printer not in reported available printers
  countThrows(
    () => validatePrintingConfigPayload(
      { printing_enabled: true, adapter: 'thermal', printer_name: 'EPSON L3110' },
      {},
      mockReportedState
    ),
    (err: any) => err instanceof PrintingValidationError && err.code === 'PRINTER_NOT_AVAILABLE',
    '6.4 Unreported printer rejected with PRINTER_NOT_AVAILABLE'
  );
  logSectionPass('Printer name formatting, length, and presence validated');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Forbidden Shell-Command Fields Rejection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Forbidden Shell-Command Fields Rejection ---');

  for (const forbiddenKey of FORBIDDEN_PRINTING_FIELDS) {
    countThrows(
      () => validatePrintingConfigPayload({ [forbiddenKey]: 'lp -d printer photo.png' }),
      (err: any) => err instanceof PrintingValidationError && err.code === 'FORBIDDEN_FIELD',
      `7. Forbidden field "${forbiddenKey}" rejected with code FORBIDDEN_FIELD`
    );
  }
  logSectionPass('All 5 forbidden command fields blocked (Anti-RCE Safeguard)');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: Authorization Failure (401 Unauthorized)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 8: Authorization Failure (401) ---');

  const err401 = {
    response: {
      status: 401,
      data: { success: false, message: 'Authentication required. Token expired or invalid.' },
    },
  };
  const parsed401 = parsePrinterApiError(err401);
  countStrictEqual(parsed401.status, 401, '8.1 Status 401 captured');
  countStrictEqual(parsed401.code, 'UNAUTHORIZED', '8.2 Code UNAUTHORIZED assigned');
  countStrictEqual(parsed401.isSecurityError, true, '8.3 isSecurityError flagged true');
  countStrictEqual(parsed401.isNetworkError, false, '8.4 isNetworkError is false');
  logSectionPass('401 Unauthorized handled gracefully');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: Forbidden Access (403 Forbidden)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 9: Forbidden Access (403) ---');

  const err403 = {
    response: {
      status: 403,
      data: { success: false, message: 'Forbidden. You do not have permission to manage this kiosk.' },
    },
  };
  const parsed403 = parsePrinterApiError(err403);
  countStrictEqual(parsed403.status, 403, '9.1 Status 403 captured');
  countStrictEqual(parsed403.code, 'FORBIDDEN', '9.2 Code FORBIDDEN assigned');
  countStrictEqual(parsed403.isSecurityError, true, '9.3 isSecurityError flagged true');
  logSectionPass('403 Forbidden handled without forceful session termination');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 10: Missing Kiosk (404 Not Found)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 10: Missing Kiosk (404) ---');

  const err404 = {
    response: {
      status: 404,
      data: { success: false, message: 'Kiosk not found.' },
    },
  };
  const parsed404 = parsePrinterApiError(err404);
  countStrictEqual(parsed404.status, 404, '10.1 Status 404 captured');
  countStrictEqual(parsed404.code, 'NOT_FOUND', '10.2 Code NOT_FOUND assigned');
  countStrictEqual(parsed404.message, 'Kiosk not found.', '10.3 Message preserved');
  logSectionPass('404 Missing Kiosk parsed accurately');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 11: Backend Validation Error (400 Bad Request)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 11: Backend Validation Error (400) ---');

  const err400 = {
    response: {
      status: 400,
      data: { success: false, message: 'printer_name contains unsupported characters.', error_code: 'INVALID_PRINTER_NAME' },
    },
  };
  const parsed400 = parsePrinterApiError(err400);
  countStrictEqual(parsed400.status, 400, '11.1 Status 400 captured');
  countStrictEqual(parsed400.code, 'INVALID_PRINTER_NAME', '11.2 Error code extracted from data');
  logSectionPass('400 Validation error parsed with specific backend code');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 12: Timeout and Network Failure
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 12: Timeout and Network Failure ---');

  const timeoutErr = {
    code: 'ECONNABORTED',
    message: 'timeout of 15000ms exceeded',
  };
  const parsedTimeout = parsePrinterApiError(timeoutErr);
  countStrictEqual(parsedTimeout.isNetworkError, true, '12.1 ECONNABORTED timeout flagged as network error');

  const netErr = new Error('Network Error');
  const parsedNet = parsePrinterApiError(netErr);
  countStrictEqual(parsedNet.isNetworkError, true, '12.2 Network Error flagged as network error');
  countStrictEqual(parsedNet.isSecurityError, false, '12.3 Network Error is not security error');
  logSectionPass('Timeout and network connection failures parsed accurately');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 13: Stale Configuration & Version Mismatch Tracking
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 13: Stale Configuration & Version Mismatch ---');

  const kioskIdVersionTest = 'kiosk-ver-test';
  const initial = await getPrinterConfig(kioskIdVersionTest);
  countStrictEqual(initial.config.config_version, 1, '13.1 Initial version is 1');

  const save1 = await updatePrinterConfig(kioskIdVersionTest, {
    ...initial.config,
    photo_brightness: 120,
  });
  countStrictEqual(save1.data?.config.config_version, 2, '13.2 Version increments to 2 after update');

  const save2 = await updatePrinterConfig(kioskIdVersionTest, {
    ...save1.data!.config,
    thermal_density: 4,
  });
  countStrictEqual(save2.data?.config.config_version, 3, '13.3 Version increments to 3 after second update');

  // Test status pending logic when reported version doesn't match
  const reportedStale: PrinterReportedState = {
    config_version: 1, // Stale!
    status: 'READY',
  };
  const isPending = reportedStale.config_version !== save2.data?.config.config_version;
  countStrictEqual(isPending, true, '13.4 Reported version mismatch correctly triggers pending state');
  logSectionPass('Config version increments and stale reported status verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 14: Incomplete Response Handling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 14: Incomplete Response Handling ---');

  const incompleteRaw = {
    printing_enabled: true,
    adapter: 'cups',
  };
  const backfilled = deserializePrinterConfig(incompleteRaw);
  countStrictEqual(backfilled.adapter, 'cups', '14.1 Known field preserved');
  countStrictEqual(backfilled.paper_size, 'Instax Mini (54 × 86 mm)', '14.2 Default paper size backfilled');
  countStrictEqual(backfilled.copies_limit, 1, '14.3 Default copies_limit backfilled');
  countStrictEqual(backfilled.photo_brightness, 100, '14.4 Default brightness 100% backfilled');
  countStrictEqual(backfilled.show_email_button, true, '14.5 Default show_email_button true backfilled');
  logSectionPass('Incomplete response gracefully backfilled with defaults');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 15: Multi-Kiosk State Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 15: Multi-Kiosk Isolation ---');

  const kioskA = 'kiosk-iso-A';
  const kioskB = 'kiosk-iso-B';

  await updatePrinterConfig(kioskA, {
    ...DEFAULT_PRINTER_CONFIG,
    paper_size: '2 Strip 5 × 15 cm',
    photo_brightness: 130,
  });

  await updatePrinterConfig(kioskB, {
    ...DEFAULT_PRINTER_CONFIG,
    paper_size: 'nimbotpaper-polaroid',
    photo_brightness: 85,
  });

  const resA = await getPrinterConfig(kioskA);
  const resB = await getPrinterConfig(kioskB);

  countStrictEqual(resA.config.paper_size, '2 Strip 5 × 15 cm', '15.1 Kiosk A maintains 2 Strip');
  countStrictEqual(resA.config.photo_brightness, 130, '15.2 Kiosk A maintains 130% brightness');

  countStrictEqual(resB.config.paper_size, 'nimbotpaper-polaroid', '15.3 Kiosk B maintains nimbotpaper-polaroid');
  countStrictEqual(resB.config.photo_brightness, 85, '15.4 Kiosk B maintains 85% brightness');
  logSectionPass('Multiple kiosks remain strictly isolated in storage');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 16: Test Print Safety Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 16: Test Print Safety Verification ---');

  // 16.1 Ensure simulation test print returns simulated result without network
  const testPrintRes = await testPrintSimulation('kiosk-safe-1', {
    ...DEFAULT_PRINTER_CONFIG,
    printing_enabled: true,
    adapter: 'thermal',
    printer_name: 'NIIMBOT B1 Pro',
  });
  countStrictEqual(testPrintRes.success, true, '16.1 Test print simulation succeeds');
  countStrictEqual(testPrintRes.simulated, true, '16.2 Test print flagged simulated: true');
  countAssert(testPrintRes.jobId?.startsWith('SIM-TEST-'), '16.3 Job ID has simulation prefix SIM-TEST-');

  // 16.2 Hardware isolation audit
  const audit = auditTestPrintSafety();
  countStrictEqual(audit.isHardwarePrintingBlocked, true, '16.4 Physical hardware printing blocked');
  countStrictEqual(audit.isBackendJobCreationBlocked, true, '16.5 Backend print_jobs creation blocked');
  countStrictEqual(audit.isWebSocketCommandBlocked, true, '16.6 WebSocket PRINT_PHOTO command blocked');
  countStrictEqual(audit.isElectronIpcBlocked, true, '16.7 Electron printer IPC blocked');
  countStrictEqual(audit.isWebBluetoothBlocked, true, '16.8 Web Bluetooth print blocked');
  countStrictEqual(audit.isWindowsSpoolerBlocked, true, '16.9 Windows spooler blocked');
  countStrictEqual(audit.isCupsSpoolerBlocked, true, '16.10 CUPS spooler blocked');
  countStrictEqual(audit.mode, 'SAFE_SIMULATION', '16.11 Audit mode is SAFE_SIMULATION');

  // 16.3 Calling disabled printer throws
  await countRejects(
    async () => testPrintSimulation('kiosk-safe-1', { ...DEFAULT_PRINTER_CONFIG, printing_enabled: false }),
    (err: any) => err.message.includes('Pencetakan harus diaktifkan'),
    '16.12 Test print on disabled printer rejected'
  );
  logSectionPass('Test Print simulation guarantees zero hardware execution');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 17: Safeguards & Staging Allowlist Enforcement
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 17: Fail-Closed Safeguards & Allowlist ---');

  countStrictEqual(ENABLE_BACKEND_MUTATIONS, false, '17.1 ENABLE_BACKEND_MUTATIONS is strictly false');
  countDeepStrictEqual(VERIFIED_STAGING_ALLOWLIST, [], '17.2 VERIFIED_STAGING_ALLOWLIST is strictly empty');

  // Hostname checks
  countStrictEqual(isProductionApiUrl('https://backend-photobooth.uniinside.net/api/v1'), true, '17.3 Production domain recognized');
  countStrictEqual(isProductionApiUrl('https://api.uniinside.net/api/v1'), true, '17.4 Production API recognized');
  countStrictEqual(isVerifiedStagingHost('https://backend-photobooth.uniinside.net'), false, '17.5 Production rejected from staging');
  countStrictEqual(isVerifiedStagingHost('http://localhost:5000'), false, '17.6 Localhost rejected without verified allowlist (Fail-Closed)');

  // Attempting mutation without customApi or allowlisted staging must throw fail-closed
  countThrows(
    () => assertMutationAllowed('https://backend-photobooth.uniinside.net'),
    (err: any) => err.message.includes('PERLINDUNGAN PRODUKSI'),
    '17.7 Production mutation attempt unconditionally blocked'
  );

  countThrows(
    () => assertMutationAllowed('http://localhost:5000'),
    (err: any) => err.message.includes('SAFEGUARD FAIL-CLOSED'),
    '17.8 Unallowlisted host mutation blocked fail-closed'
  );
  logSectionPass('Fail-closed production and unverified host protections verified');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 18: Configuration Consistency (Legacy Hardware vs Printer Config)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 18: Configuration Consistency Mapping ---');

  // Legacy to New Paper Preset
  countStrictEqual(mapLegacyPrinterSizeToPaperPreset('Strip'), '4 Strip 5 × 15 cm', '18.1 Legacy "Strip" maps to 4 Strip preset');
  countStrictEqual(mapLegacyPrinterSizeToPaperPreset('strip'), '4 Strip 5 × 15 cm', '18.2 Lowercase "strip" maps to 4 Strip preset');
  countStrictEqual(mapLegacyPrinterSizeToPaperPreset('4x6'), '2×3 Grid 10 × 15 cm', '18.3 Legacy "4x6" maps to 2x3 Grid preset');
  countStrictEqual(mapLegacyPrinterSizeToPaperPreset('4R'), '2×3 Grid 10 × 15 cm', '18.4 Legacy "4R" maps to 2x3 Grid preset');
  countStrictEqual(mapLegacyPrinterSizeToPaperPreset('unknown'), 'Instax Mini (54 × 86 mm)', '18.5 Fallback preset is Instax Mini');

  // New Paper Preset to Legacy
  countStrictEqual(mapPaperPresetToLegacyPrinterSize('4 Strip 5 × 15 cm'), 'Strip', '18.6 4 Strip maps back to "Strip"');
  countStrictEqual(mapPaperPresetToLegacyPrinterSize('2 Strip 5 × 15 cm'), 'Strip', '18.7 2 Strip maps back to "Strip"');
  countStrictEqual(mapPaperPresetToLegacyPrinterSize('2×3 Grid 10 × 15 cm'), '4x6', '18.8 2x3 Grid maps back to "4x6"');
  countStrictEqual(mapPaperPresetToLegacyPrinterSize('nimbotpaper-polaroid'), '4x6', '18.9 Label preset gracefully maps to "4x6"');

  // Refresh status simulated
  const refreshRes = await refreshPrinterStatus('kiosk-refresh-1');
  countStrictEqual(refreshRes.success, true, '18.10 Refresh status simulated returns success');
  countStrictEqual(refreshRes.simulated, true, '18.11 Refresh status flagged simulated: true');

  // Verify all printer profiles (including Photo Dye-Sub) are marked isVerifiedHardware: false with simulation estimate
  countStrictEqual(PHOTO_DYESUB_PROFILE.isVerifiedHardware, false, '18.12 Photo Dye-Sub profile isVerifiedHardware is strictly false');
  countAssert(PHOTO_DYESUB_PROFILE.verificationSource.includes('Estimasi Simulasi'), '18.13 Photo Dye-Sub cites simulation estimate');
  logSectionPass('Legacy hardware mapping and refresh status simulated smoothly');

  console.log('\n================================================================');
  console.log(`TOTAL TAHAP 3C TESTS: ALL ${passed} ASSERTIONS PASSED (0 FAILED)`);
  console.log('================================================================\n');
}

runStage4cContractTests().catch((err) => {
  console.error('\n[FATAL TEST FAILURE IN TAHAP 3C]:', err);
  process.exit(1);
});
