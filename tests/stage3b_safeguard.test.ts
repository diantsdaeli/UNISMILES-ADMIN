// Polyfill environment for Node.js test execution
(globalThis as any).window = {
  location: {
    origin: 'http://localhost:3000',
  },
};

import {
  LAYOUT_PRESETS,
  buildFrameConfig,
  buildCreateTemplatePayload,
  buildUpdateTemplatePayload,
  FrameEditorState,
} from '../src/lib/layoutPresets';
import {
  Template,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  validateTemplatePayload,
  createTemplate,
  updateTemplate,
  ENABLE_BACKEND_MUTATIONS,
} from '../src/lib/templates';
import api from '../src/lib/api';

console.log('================================================================');
console.log('VERIFIKASI INTEGRASI MODUL 2 TAHAP 3B: FRAME EDITOR & SAFEGUARD');
console.log('================================================================\n');

let pass = 0;
let fail = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    pass++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
    fail++;
  }
}

// -------------------------------------------------------------
// SECTION 1: Create Payload Tests
// -------------------------------------------------------------
console.log('--- SECTION 1: Create Payload Tests ---');

const preset3x1 = LAYOUT_PRESETS.find(p => p.id === '3x1')!;
const mockCreateState: FrameEditorState = {
  preset: preset3x1,
  name: 'Retro Strip Party',
  category: 'Birthday',
  frameType: 'gradient',
  bgColor: '#0F172A',
  accentColor: '#38BDF8',
  gradientStops: [
    { color: '#38BDF8', position: 0 },
    { color: '#818CF8', position: 100 },
  ],
  gradientAngle: 90,
  gradientStyle: 'linear',
  textElements: [
    {
      id: 'txt-1',
      type: 'text',
      text: 'Happy Birthday!',
      content: 'Happy Birthday!',
      fontFamily: 'Outfit',
      fontSize: 28,
      color: '#FFFFFF',
      x: 50,
      y: 1680,
    },
  ],
  assetElements: [
    {
      id: 'stk-1',
      type: 'sticker',
      name: 'Party Hat',
      url: 'https://backend-photobooth.uniinside.net/uploads/assets/hat.png',
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    },
  ],
  bgImageUrl: '',
  overlayAssetId: null,
  digitalPrice: 20000,
  digitalPrintPrice: 35000,
  isActive: true,
};

const createPublishPayload = buildCreateTemplatePayload(mockCreateState);

assert(createPublishPayload.name === 'Retro Strip Party', '1.1 Name set in create payload');
assert(createPublishPayload.layout_id === '3x1', '1.2 Layout ID set in create payload');
assert(createPublishPayload.slot_count === 3, '1.3 Slot count matches preset (3 slots)');
assert(createPublishPayload.price === 20000, '1.4 Base price matches digital price');
assert(createPublishPayload.digital_price === 20000, '1.5 Digital price correctly mapped');
assert(createPublishPayload.digital_print_price === 35000, '1.6 Digital print price correctly mapped');
assert(createPublishPayload.frame_type === 'gradient', '1.7 Frame type set to gradient');
assert(createPublishPayload.bg_color === '#0F172A', '1.8 Background color mapped');
assert(createPublishPayload.accent_color === '#38BDF8', '1.9 Accent color mapped');
assert(createPublishPayload.gradient_stops.length === 2, '1.10 Gradient stops populated');
assert(createPublishPayload.gradient_angle === 90, '1.11 Gradient angle mapped');
assert(createPublishPayload.gradient_style === 'linear', '1.12 Gradient style mapped');
assert(createPublishPayload.is_active === true, '1.13 Publish mode sets is_active = true');
assert(createPublishPayload.layout_config.category === 'Birthday', '1.14 Category embedded in layout_config');
assert(createPublishPayload.layout_config.width === 591, '1.15 Canvas width matches preset 591px');
assert(createPublishPayload.layout_config.height === 1772, '1.16 Canvas height matches preset 1772px');

// Draft Mode Test
const draftCreateState: FrameEditorState = {
  ...mockCreateState,
  isActive: false,
};
const createDraftPayload = buildCreateTemplatePayload(draftCreateState);
assert(createDraftPayload.is_active === false, '1.17 Draft mode sets is_active = false');

// -------------------------------------------------------------
// SECTION 2: Edit Payload Tests & Backend ID Preservation
// -------------------------------------------------------------
console.log('\n--- SECTION 2: Edit Payload Tests ---');

const existingTemplate: Template = {
  id: '888',
  backendId: 888,
  name: 'Existing Vintage Duo',
  category: 'Wedding',
  imageUrl: 'https://backend-photobooth.uniinside.net/uploads/vintage.png',
  status: 'active',
  isActive: true,
  usageCount: 42,
  layoutId: '2x1',
  slotCount: 2,
  price: 25000,
  digitalPrice: 25000,
  digitalPrintPrice: 40000,
  bgColor: '#2D3748',
  accentColor: '#ED8936',
  frameType: 'color',
  gradientStops: [],
  gradientAngle: 0,
  gradientStyle: 'linear',
  textElements: [],
  assetId: 55,
  layoutConfig: {
    width: 591,
    height: 1772,
    category: 'Wedding',
    designer: 'Studio Unismiles',
    custom_key: 'custom_val_123',
    backgroundConfig: {
      type: 'solid',
      color: '#2D3748',
      filter: 'vintage-warm',
    },
    slotBorder: {
      color: '#ED8936',
      width: 3,
      borderRadius: 8,
    },
    slots: [
      { index: 0, x: 45, y: 100, width: 501, height: 750 },
      { index: 1, x: 45, y: 900, width: 501, height: 750 },
    ],
  },
};

const mockEditState: FrameEditorState = {
  preset: LAYOUT_PRESETS.find(p => p.id === '2x1')!,
  name: 'Updated Vintage Duo Gold',
  category: 'Wedding',
  frameType: 'color',
  bgColor: '#1A202C',
  accentColor: '#D69E2E',
  gradientStops: [],
  gradientAngle: 0,
  gradientStyle: 'linear',
  textElements: [
    {
      id: 'txt-wedding',
      type: 'text',
      text: 'Forever & Always',
      fontFamily: 'Playfair Display',
      fontSize: 24,
      color: '#D69E2E',
      x: 60,
      y: 1700,
    },
  ],
  assetElements: [],
  bgImageUrl: 'https://backend-photobooth.uniinside.net/uploads/vintage.png',
  overlayAssetId: 55,
  digitalPrice: 30000,
  digitalPrintPrice: 45000,
};

const updatePayload = buildUpdateTemplatePayload(existingTemplate, mockEditState);

assert(updatePayload.name === 'Updated Vintage Duo Gold', '2.1 Updated name set');
assert(updatePayload.digital_price === 30000, '2.2 Updated digital price set');
assert(updatePayload.digital_print_price === 45000, '2.3 Updated digital print price set');
assert(updatePayload.accent_color === '#D69E2E', '2.4 Updated accent color set');
assert(updatePayload.bg_color === '#1A202C', '2.5 Updated bg color set');
assert(updatePayload.is_active === true, '2.6 Existing live template keeps is_active = true');
assert(updatePayload.asset_id === 55, '2.7 Existing asset_id preserved');

// -------------------------------------------------------------
// SECTION 3: Metadata Preservation Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 3: Metadata Preservation Tests ---');

const updatedConfig = updatePayload.layout_config!;

assert(updatedConfig.designer === 'Studio Unismiles', '3.1 Top-level metadata "designer" preserved');
assert(updatedConfig.custom_key === 'custom_val_123', '3.2 Top-level metadata "custom_key" preserved');
assert(
  (updatedConfig.backgroundConfig as any)?.filter === 'vintage-warm',
  '3.3 Deep-nested "filter" in backgroundConfig preserved'
);
assert(
  (updatedConfig.slotBorder as any)?.borderRadius === 8,
  '3.4 Deep-nested "borderRadius" in slotBorder preserved'
);
assert(updatedConfig.slotBorder?.width === 3, '3.5 Custom border width (3px) preserved');

// -------------------------------------------------------------
// SECTION 4: Slot Geometry Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 4: Slot Geometry Tests ---');

assert(Array.isArray(updatedConfig.slots), '4.1 Slots array exists');
assert(updatedConfig.slots!.length === 2, '4.2 Exactly 2 slots present');
assert(updatedConfig.slots![0].x === 45, '4.3 Custom slot 0 x=45 preserved without overwrite');
assert(updatedConfig.slots![0].y === 100, '4.4 Custom slot 0 y=100 preserved');
assert(updatedConfig.slots![0].width === 501, '4.5 Custom slot 0 width=501 preserved');
assert(updatedConfig.slots![0].height === 750, '4.6 Custom slot 0 height=750 preserved');
assert(updatedConfig.slots![1].y === 900, '4.7 Custom slot 1 y=900 preserved');

// Bounds check
const allSlotsInBounds = updatedConfig.slots!.every(
  s => s.x >= 0 && s.y >= 0 && s.x + s.width <= updatedConfig.width! && s.y + s.height <= updatedConfig.height!
);
assert(allSlotsInBounds, '4.8 All custom slots are within canvas boundaries');

// -------------------------------------------------------------
// SECTION 5: Sticker Position & Anchor Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 5: Sticker Position & Anchor Tests ---');

const stateWithStickers: FrameEditorState = {
  ...mockCreateState,
  assetElements: [
    {
      id: 'stk-new',
      name: 'New Ribbon',
      url: 'https://backend-photobooth.uniinside.net/uploads/assets/ribbon.png',
      x: 100,
      y: 200,
      width: 50,
      height: 50,
      rotation: 15,
      opacity: 0.9,
    },
    {
      id: 'stk-existing-center',
      name: 'Badge Center',
      url: 'https://backend-photobooth.uniinside.net/uploads/assets/badge.png',
      x: 300,
      y: 400,
      width: 60,
      height: 60,
      anchor: 'center',
    },
  ],
};

const payloadWithStickers = buildCreateTemplatePayload(stateWithStickers);
const stickers = payloadWithStickers.layout_config.assetElements!;

assert(stickers.length === 2, '5.1 Both stickers included in layout_config');
assert(stickers[0].type === 'sticker', '5.2 New sticker has type "sticker"');
assert(stickers[0].anchor === 'top-left', '5.3 New sticker defaults to anchor "top-left"');
assert(stickers[0].url === '/uploads/assets/ribbon.png', '5.4 New sticker url normalized to stored path');
assert(stickers[0].content === '/uploads/assets/ribbon.png', '5.5 New sticker content normalized');
assert(stickers[0].rotation === 15, '5.6 Rotation (15 deg) preserved');
assert(stickers[0].opacity === 0.9, '5.7 Opacity (0.9) preserved');

assert(stickers[1].type === 'sticker', '5.8 Existing sticker has type "sticker"');
assert(stickers[1].anchor === 'center', '5.9 Existing sticker retains anchor "center"');

// -------------------------------------------------------------
// SECTION 6: Text Elements Synchronization Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 6: Text Elements Synchronization Tests ---');

const textElements = createPublishPayload.layout_config.elements!;
assert(textElements.length === 1, '6.1 Text element included in layout_config.elements');
assert(textElements[0].type === 'text', '6.2 Text element has type "text"');
assert(textElements[0].text === 'Happy Birthday!', '6.3 text property matches input');
assert(textElements[0].content === 'Happy Birthday!', '6.4 content property matches input');
assert(textElements[0].text === textElements[0].content, '6.5 text === content strictly equal');
assert(textElements[0].fontFamily === 'Outfit', '6.6 Font family preserved');
assert(textElements[0].fontSize === 28, '6.7 Font size preserved');
assert(textElements[0].color === '#FFFFFF', '6.8 Font color preserved');

// -------------------------------------------------------------
// SECTION 7: Validation & Invalid Input Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 7: Validation & Invalid Input Tests ---');

// Valid Payload Validation
const validCheck = validateTemplatePayload(createPublishPayload, false);
assert(validCheck.valid === true, '7.1 Valid create payload passes validation');
assert(validCheck.errors.length === 0, '7.2 Zero errors on valid payload');

// Empty Name
const emptyNameCheck = validateTemplatePayload({ ...createPublishPayload, name: '' }, false);
assert(emptyNameCheck.valid === false, '7.3 Empty name fails validation');
assert(emptyNameCheck.errors.some(e => e.includes('Nama frame wajib diisi')), '7.4 Correct error message for empty name');

// Name > 100 chars
const longNameCheck = validateTemplatePayload({ ...createPublishPayload, name: 'a'.repeat(101) }, false);
assert(longNameCheck.valid === false, '7.5 Name > 100 chars fails validation');

// Invalid Slot Count (0)
const invalidSlotCheck = validateTemplatePayload({ ...createPublishPayload, slot_count: 0 }, false);
assert(invalidSlotCheck.valid === false, '7.6 slot_count = 0 fails validation');

// Negative Price
const negativePriceCheck = validateTemplatePayload({ ...createPublishPayload, digital_price: -500 }, false);
assert(negativePriceCheck.valid === false, '7.7 Negative digital_price fails validation');

// Invalid Slot Dimension (width = 0)
const invalidSlotDimCheck = validateTemplatePayload(
  {
    ...createPublishPayload,
    layout_config: {
      ...createPublishPayload.layout_config,
      slots: [{ index: 0, x: 0, y: 0, width: 0, height: 100 }],
    },
  },
  false
);
assert(invalidSlotDimCheck.valid === false, '7.8 Slot width=0 fails validation');

// -------------------------------------------------------------
// SECTION 8: Safeguard & Zero Production Mutation Tests
// -------------------------------------------------------------
console.log('\n--- SECTION 8: Safeguard & Zero Production Mutation Tests ---');

assert(ENABLE_BACKEND_MUTATIONS === false, '8.1 ENABLE_BACKEND_MUTATIONS is strictly false');

// Spy on Axios methods to mathematically prove NO HTTP call is made
let axiosCallCount = 0;
const originalPost = api.post;
const originalPut = api.put;
const originalDelete = api.delete;
const originalPatch = api.patch;

api.post = (...args: any[]) => { axiosCallCount++; return originalPost.apply(api, args as any); };
api.put = (...args: any[]) => { axiosCallCount++; return originalPut.apply(api, args as any); };
api.delete = (...args: any[]) => { axiosCallCount++; return originalDelete.apply(api, args as any); };
api.patch = (...args: any[]) => { axiosCallCount++; return originalPatch.apply(api, args as any); };

async function main() {
  // Execute createTemplate in default (safeguard) mode
  const createSimResult = await createTemplate(createPublishPayload);
  assert((createSimResult as any).simulated === true, '8.2 createTemplate returns simulated=true');
  assert((createSimResult as any).method === 'POST', '8.3 createTemplate targets method POST');
  assert((createSimResult as any).endpoint === '/api/v1/admin/templates/generate', '8.4 createTemplate targets /generate');
  assert((createSimResult as any).validation.valid === true, '8.5 createTemplate validation passed');

  // Execute updateTemplate in default (safeguard) mode
  const updateSimResult = await updateTemplate(888, updatePayload);
  assert((updateSimResult as any).simulated === true, '8.6 updateTemplate returns simulated=true');
  assert((updateSimResult as any).method === 'PUT', '8.7 updateTemplate targets method PUT');
  assert((updateSimResult as any).endpoint === '/api/v1/admin/templates/888', '8.8 updateTemplate targets /templates/888');
  assert((updateSimResult as any).validation.valid === true, '8.9 updateTemplate validation passed');

  // Check axios call count
  assert(axiosCallCount === 0, '8.10 Exactly 0 HTTP network mutation requests executed (100% safeguarded)');

  // Restore spied methods
  api.post = originalPost;
  api.put = originalPut;
  api.delete = originalDelete;
  api.patch = originalPatch;

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
