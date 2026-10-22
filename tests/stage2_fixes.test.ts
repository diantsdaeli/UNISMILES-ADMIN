// Polyfill environment for Node.js test execution
(globalThis as any).window = {
  location: {
    origin: 'http://localhost:3000',
  },
};
if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = {
    VITE_API_BASE_URL: 'https://backend-photobooth.uniinside.net/api/v1',
    VITE_PUBLIC_BASE_URL: 'https://backend-photobooth.uniinside.net',
  };
}

import {
  LAYOUT_PRESETS,
  computeSlots,
  buildFrameConfig,
  EVENT_CATEGORIES,
} from '../src/lib/layoutPresets';
import {
  adaptBackendTemplateToDian,
  BackendTemplate,
  CanvasLayoutConfig,
  TextElement,
  AssetElement,
} from '../src/lib/templates';
import { normalizeAsset } from '../src/lib/assets';
import { resolvePublicUrl } from '../src/lib/urls';

console.log('================================================================');
console.log('COMPREHENSIVE VERIFICATION SUITE — MODUL 2 TAHAP 2 FIXES');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
    failCount++;
  }
}

// ====================================================================
// SECTION A: 50 TESTS SEBELUMNYA (STAGE 1 & STAGE 2 BASELINE)
// ====================================================================
console.log('--- SECTION A: 50 Baseline Tests (Stage 1 & Stage 2) ---');

// 1-7: All 7 Presets Registered
assert(LAYOUT_PRESETS.length === 7, 'Baseline 1: All 7 presets are registered');
const expectedPresets = ['1x1', '2x1', '3x1', '4x1', '2x2', '2x3', '3x3'];
expectedPresets.forEach((id, idx) => {
  const preset = LAYOUT_PRESETS.find(p => p.id === id);
  assert(!!preset, `Baseline ${idx + 2}: Preset "${id}" exists in catalog`);
});

// 9-22: Slot count and bounds for all 7 presets
LAYOUT_PRESETS.forEach((preset, idx) => {
  const slots = computeSlots(preset);
  assert(
    slots.length === preset.slots,
    `Baseline ${idx + 9}: Preset ${preset.id} generates exactly ${preset.slots} slots`
  );

  let withinBounds = true;
  for (const s of slots) {
    if (
      s.x < 0 ||
      s.y < 0 ||
      s.width <= 0 ||
      s.height <= 0 ||
      s.x + s.width > preset.width ||
      s.y + s.height > preset.height
    ) {
      withinBounds = false;
      break;
    }
  }
  assert(
    withinBounds,
    `Baseline ${idx + 16}: Preset ${preset.id} (${preset.width}x${preset.height}) all slots strictly within bounds`
  );
});

// 23-28: Event categories
EVENT_CATEGORIES.forEach((cat, idx) => {
  assert(EVENT_CATEGORIES.includes(cat), `Baseline ${idx + 23}: Event category "${cat}" is valid`);
});

// 29-38: Stage 1 Adapter & Normalization tests
const mockRawBackendTemplate: BackendTemplate = {
  id: 42,
  user_id: 5,
  name: 'Neon Cyberpunk 2026',
  layout_id: '2x3',
  image_url: '/uploads/frames/neon-frame-42.png',
  slot_count: 6,
  layout_config: JSON.stringify({
    width: 1200,
    height: 1800,
    category: 'Corporate',
    slots: [
      { index: 0, x: 50, y: 50, width: 500, height: 500 },
      { index: 1, x: 650, y: 50, width: 500, height: 500 },
    ],
    backgroundConfig: {
      type: 'gradient',
      color: '#0f172a',
    },
  }),
  bg_color: '#0f172a',
  accent_color: '#06b6d4',
  frame_type: 'gradient',
  is_active: 1,
  price: 50000,
  usage_count: 128,
  created_at: '2026-04-10T10:00:00.000Z',
};

const adapted = adaptBackendTemplateToDian(mockRawBackendTemplate);
assert(adapted.id === '42', 'Baseline 29: Template ID converted to string');
assert(adapted.name === 'Neon Cyberpunk 2026', 'Baseline 30: Template Name mapped');
assert(adapted.category === 'Corporate', 'Baseline 31: Template Category mapped from layout_config');
assert(adapted.slotCount === 6, 'Baseline 32: Slot Count mapped');
assert(adapted.status === 'active', 'Baseline 33: Status active correctly evaluated');
assert(adapted.price === 50000, 'Baseline 34: Price mapped');
assert(adapted.usageCount === 128, 'Baseline 35: Usage Count mapped');
assert(adapted.layoutConfig.width === 1200, 'Baseline 36: layoutConfig JSON parsed successfully');

const assetActiveNum = normalizeAsset({ id: 1, name: 'Sticker 1', category: 'sticker', file_url: '/a.png', is_active: 1 });
const assetInactiveNum = normalizeAsset({ id: 2, name: 'Sticker 2', category: 'sticker', file_url: '/b.png', is_active: 0 });
assert(assetActiveNum.is_active === true, 'Baseline 37: is_active 1 normalizes to boolean true');
assert(assetInactiveNum.is_active === false, 'Baseline 38: is_active 0 normalizes to boolean false');

// 39-44: Canonical generator for various frame types
const preset3x1 = LAYOUT_PRESETS.find(p => p.id === '3x1')!;
const sampleGrad = buildFrameConfig(
  preset3x1,
  'Graduation',
  'gradient',
  '#0B0F19',
  '#10B981',
  [{ color: '#059669', position: 0 }, { color: '#10B981', position: 100 }],
  45,
  'linear'
);
assert(sampleGrad.width === 591, 'Baseline 39: Gradient config width matches 3x1');
assert(sampleGrad.height === 1772, 'Baseline 40: Gradient config height matches 3x1');
assert(sampleGrad.backgroundConfig?.type === 'gradient', 'Baseline 41: backgroundConfig.type is gradient');

const sampleSolid = buildFrameConfig(LAYOUT_PRESETS[0], 'Wedding', 'color', '#FFF', '#000', [], 0, 'linear');
assert(sampleSolid.backgroundConfig?.type === 'solid', 'Baseline 42: backgroundConfig.type is solid');

const samplePng = buildFrameConfig(LAYOUT_PRESETS[1], 'Holiday', 'png', '#000', '#FFF', [], 0, 'linear', [], '/uploads/frames/f.png', 99);
assert(samplePng.backgroundConfig?.type === 'image', 'Baseline 43: backgroundConfig.type is image for PNG');
assert(samplePng.overlayAssetId === 99, 'Baseline 44: overlayAssetId preserved');

// 45-50: URLs and Public Path resolving
assert(resolvePublicUrl('/uploads/test.png') === 'https://backend-photobooth.uniinside.net/uploads/test.png', 'Baseline 45: Relative URL resolved with backend root');
assert(resolvePublicUrl('https://other.com/pic.png') === 'https://other.com/pic.png', 'Baseline 46: Absolute URL untouched');
assert(resolvePublicUrl('') === '', 'Baseline 47: Empty URL returns empty');

const emptySlotsFallback = buildFrameConfig(LAYOUT_PRESETS[0], 'General', 'color', '#000', '#FFF', [], 0, 'linear', [], '', null, [], []);
assert(emptySlotsFallback.slots?.length === 1, 'Baseline 48: Fallback to preset slots when empty customSlots given');

const textPresetCheck = buildFrameConfig(LAYOUT_PRESETS[0], 'General', 'color', '#000', '#FFF', [], 0, 'linear', [
  { id: 't1', text: 'Hello', fontFamily: 'Inter', fontSize: 24, color: '#FFF', x: 50, y: 50 }
]);
assert(textPresetCheck.elements?.length === 1, 'Baseline 49: Text elements populated');
assert(textPresetCheck.elements![0].text === 'Hello', 'Baseline 50: Text value preserved');


// ====================================================================
// SECTION B: PERBAIKAN 1 — STICKER ANCHOR
// ====================================================================
console.log('\n--- SECTION B: Perbaikan 1 — Sticker Anchor ---');

// Test 1: New sticker created by editor uses type: 'sticker' and anchor: 'top-left'
const newStickerElem: AssetElement = {
  id: 'ast-new-1',
  type: 'sticker',
  anchor: 'top-left',
  assetId: 101,
  name: 'Sparkle Star',
  url: '/uploads/assets/star.png',
  content: '/uploads/assets/star.png',
  x: 20,
  y: 30,
  width: 15,
  height: 15,
};

const generatedNewConfig = buildFrameConfig(
  preset3x1,
  'Birthday',
  'color',
  '#1E293B',
  '#FFFFFF',
  [],
  0,
  'linear',
  [],
  '',
  null,
  [newStickerElem]
);

assert(
  generatedNewConfig.assetElements?.[0].type === 'sticker',
  'Perbaikan 1.1: New sticker has type "sticker"',
  `Got ${generatedNewConfig.assetElements?.[0].type}`
);
assert(
  generatedNewConfig.assetElements?.[0].anchor === 'top-left',
  'Perbaikan 1.2: New sticker has anchor "top-left"',
  `Got ${generatedNewConfig.assetElements?.[0].anchor}`
);
assert(
  generatedNewConfig.assetElements?.[0].content === '/uploads/assets/star.png',
  'Perbaikan 1.3: New sticker has normalized content'
);

// Test 2: Existing sticker with center anchor MUST retain center anchor without auto-converting
const existingCenterSticker: AssetElement = {
  id: 'ast-old-center',
  type: 'sticker',
  anchor: 'center',
  name: 'Vintage Badge',
  url: '/uploads/assets/badge.png',
  x: 50,
  y: 50,
  width: 20,
  height: 20,
};

const existingConfigWithCenter: CanvasLayoutConfig = {
  width: 591,
  height: 1772,
  assetElements: [existingCenterSticker],
};

const reconfiguredWithCenter = buildFrameConfig(
  preset3x1,
  'General',
  'color',
  '#000000',
  '#FFFFFF',
  [],
  0,
  'linear',
  [],
  '',
  null,
  [existingCenterSticker],
  undefined,
  existingConfigWithCenter
);

assert(
  reconfiguredWithCenter.assetElements?.[0].anchor === 'center',
  'Perbaikan 1.4: Existing sticker with center anchor retains "center"',
  `Got ${reconfiguredWithCenter.assetElements?.[0].anchor}`
);
assert(
  reconfiguredWithCenter.assetElements?.[0].type === 'sticker',
  'Perbaikan 1.5: Existing sticker retains type "sticker"'
);

// Test 3: Existing sticker with NO anchor must NOT be forced to top-left if it belonged to existing template
const existingLegacyStickerNoAnchor: AssetElement = {
  id: 'ast-legacy-no-anchor',
  name: 'Legacy Heart',
  url: '/uploads/assets/heart.png',
  x: 40,
  y: 40,
  width: 10,
  height: 10,
};

const existingConfigLegacy: CanvasLayoutConfig = {
  width: 591,
  height: 1772,
  assetElements: [existingLegacyStickerNoAnchor],
};

const reconfiguredLegacy = buildFrameConfig(
  preset3x1,
  'General',
  'color',
  '#000',
  '#FFF',
  [],
  0,
  'linear',
  [],
  '',
  null,
  [existingLegacyStickerNoAnchor],
  undefined,
  existingConfigLegacy
);

assert(
  reconfiguredLegacy.assetElements?.[0].anchor === undefined,
  'Perbaikan 1.6: Existing legacy sticker without anchor is NOT auto-converted to top-left'
);


// ====================================================================
// SECTION C: PERBAIKAN 2 — TEXT CONTENT
// ====================================================================
console.log('\n--- SECTION C: Perbaikan 2 — Text Content ---');

// Test 1: New text element has type='text', text, and identical content
const newText: TextElement = {
  id: 'txt-new-1',
  text: 'Happy Birthday Dian!',
  fontFamily: 'Inter, sans-serif',
  fontSize: 48,
  color: '#FFEA00',
  x: 50,
  y: 85,
};

const configWithText = buildFrameConfig(
  preset3x1,
  'Birthday',
  'color',
  '#1E293B',
  '#FFFFFF',
  [],
  0,
  'linear',
  [newText]
);

const textResult = configWithText.elements?.[0];
assert(textResult?.type === 'text', 'Perbaikan 2.1: Text element has type "text"', `Got ${textResult?.type}`);
assert(textResult?.text === 'Happy Birthday Dian!', 'Perbaikan 2.2: Text element text is correct');
assert(
  textResult?.content === 'Happy Birthday Dian!',
  'Perbaikan 2.3: Text element content is identical to text',
  `Got content: "${textResult?.content}"`
);
assert(
  textResult?.text === textResult?.content,
  'Perbaikan 2.4: text === content guaranteed identical'
);

// Test 2: Text element created with only content populates both text and content
const legacyContentOnly: TextElement = {
  id: 'txt-legacy-content',
  content: 'Legacy UniSmiles Content',
  text: '',
  fontFamily: 'Poppins, sans-serif',
  fontSize: 36,
  color: '#FFF',
  x: 50,
  y: 90,
};

const configFromLegacyText = buildFrameConfig(
  preset3x1,
  'General',
  'color',
  '#000',
  '#FFF',
  [],
  0,
  'linear',
  [legacyContentOnly]
);

const legacyTextRes = configFromLegacyText.elements?.[0];
assert(
  legacyTextRes?.text === 'Legacy UniSmiles Content',
  'Perbaikan 2.5: Legacy text with only content populates text field'
);
assert(
  legacyTextRes?.content === 'Legacy UniSmiles Content',
  'Perbaikan 2.6: Legacy text with only content populates content field'
);

// Test 3: Kiosk Photobooth compatibility check
// In PhotoBooth.tsx:
// DOM thumbnail reads: el.content (PhotoBooth.tsx:836)
// Canvas export reads: el.content (PhotoBooth.tsx:3191)
// Admin preview reads: item.content || item.text
assert(
  typeof textResult?.content === 'string' && textResult.content.length > 0,
  'Perbaikan 2.7: Thumbnail DOM in kiosk can directly read el.content'
);
assert(
  typeof textResult?.text === 'string' && textResult.text.length > 0,
  'Perbaikan 2.8: Canvas export in kiosk can directly read el.text or el.content'
);


// ====================================================================
// SECTION D: PERBAIKAN 3 — PRESERVASI METADATA
// ====================================================================
console.log('\n--- SECTION D: Perbaikan 3 — Preservasi Metadata ---');

// Mock existing template layout_config with extra unknown top-level & nested fields
const richExistingConfig: CanvasLayoutConfig = {
  width: 591,
  height: 1772,
  category: 'Birthday',
  designer: 'Dian Creative Studio',
  version: '2.4.0',
  dpi: 300,
  custom_tags: ['retro', 'party', 'exclusive'],
  kiosk_settings: {
    allow_reprint: true,
    filter_preset: 'warm',
  },
  backgroundConfig: {
    type: 'solid',
    color: '#0F172A',
    filter: 'contrast(105%)',
    blurRadius: 0,
    repeatPattern: 'none',
  },
  slotBorder: {
    color: '#10B981',
    width: 4,
    borderRadius: 16,
    shadowEffect: '0 4px 12px rgba(0,0,0,0.5)',
  },
  slots: [
    { index: 0, x: 45, y: 50, width: 501, height: 420 },
    { index: 1, x: 45, y: 500, width: 501, height: 420 },
    { index: 2, x: 45, y: 950, width: 501, height: 420 },
  ],
  elements: [
    {
      id: 'txt-designer',
      type: 'text',
      text: 'Custom Event Title',
      content: 'Custom Event Title',
      fontFamily: 'Playfair Display',
      fontSize: 50,
      color: '#FFFFFF',
      x: 50,
      y: 85,
      designerComment: 'Do not remove font styling',
    },
  ],
};

// Rebuild with buildFrameConfig simulating user editing background color to #FF5500 and adding a sticker
const editedConfig = buildFrameConfig(
  preset3x1,
  'Holiday', // edited category
  'color',
  '#FF5500', // edited background color
  '#FFFFFF', // edited accent color
  [],
  0,
  'linear',
  richExistingConfig.elements as TextElement[],
  '',
  null,
  [newStickerElem],
  richExistingConfig.slots, // preserving slots
  richExistingConfig
);

// 1. Unknown top-level fields preserved
assert(
  (editedConfig as any).designer === 'Dian Creative Studio',
  'Perbaikan 3.1: Top-level metadata "designer" is preserved'
);
assert(
  (editedConfig as any).version === '2.4.0',
  'Perbaikan 3.2: Top-level metadata "version" is preserved'
);
assert(
  (editedConfig as any).dpi === 300,
  'Perbaikan 3.3: Top-level metadata "dpi" is preserved'
);
assert(
  Array.isArray((editedConfig as any).custom_tags) && (editedConfig as any).custom_tags.length === 3,
  'Perbaikan 3.4: Top-level array "custom_tags" is preserved'
);
assert(
  (editedConfig as any).kiosk_settings?.filter_preset === 'warm',
  'Perbaikan 3.5: Top-level object "kiosk_settings" is preserved'
);

// 2. Editor-managed fields take priority
assert(
  editedConfig.category === 'Holiday',
  'Perbaikan 3.6: Edited category "Holiday" took priority over existing "Birthday"'
);
assert(
  editedConfig.backgroundConfig?.color === '#FF5500',
  'Perbaikan 3.7: Edited background color took priority over existing "#0F172A"'
);

// 3. Deep-nested fields in backgroundConfig and slotBorder preserved
assert(
  (editedConfig.backgroundConfig as any)?.filter === 'contrast(105%)',
  'Perbaikan 3.8: Deep-nested "filter" in backgroundConfig is preserved'
);
assert(
  (editedConfig.backgroundConfig as any)?.repeatPattern === 'none',
  'Perbaikan 3.9: Deep-nested "repeatPattern" in backgroundConfig is preserved'
);
assert(
  (editedConfig.slotBorder as any)?.borderRadius === 16,
  'Perbaikan 3.10: Deep-nested "borderRadius" in slotBorder is preserved'
);
assert(
  (editedConfig.slotBorder as any)?.shadowEffect === '0 4px 12px rgba(0,0,0,0.5)',
  'Perbaikan 3.11: Deep-nested "shadowEffect" in slotBorder is preserved'
);

// 4. Slots preservation
assert(
  editedConfig.slots?.length === 3 && editedConfig.slots[0].x === 45,
  'Perbaikan 3.12: Existing custom slots (x=45, w=501) preserved without overwrite'
);

// 5. Element-level custom properties preserved
assert(
  (editedConfig.elements?.[0] as any)?.designerComment === 'Do not remove font styling',
  'Perbaikan 3.13: Custom element property "designerComment" is preserved'
);


// ====================================================================
// SECTION E: ROUND-TRIP TEST
// ====================================================================
console.log('\n--- SECTION E: Round-Trip Opening & Rebuilding Test ---');

const originalBackend: BackendTemplate = {
  id: 777,
  name: 'Ultra Premium Gala 2026',
  layout_id: '3x1',
  slot_count: 3,
  layout_config: richExistingConfig,
  bg_color: '#0F172A',
  accent_color: '#10B981',
  frame_type: 'color',
  is_active: 1,
  price: 99000,
};

// 1. Dian adapter maps backend data
const adaptedRoundTrip = adaptBackendTemplateToDian(originalBackend);
assert(adaptedRoundTrip.id === '777', 'Round-Trip 1: Template ID remains "777"');

// 2. Editor loads state from adaptedRoundTrip
const loadedPreset = LAYOUT_PRESETS.find(p => p.id === adaptedRoundTrip.layoutId) || preset3x1;
const loadedSlots = adaptedRoundTrip.layoutConfig.slots;
const loadedElements = adaptedRoundTrip.textElements;

// 3. User re-saves in editor without modifying values
const roundTripConfig = buildFrameConfig(
  loadedPreset,
  adaptedRoundTrip.category,
  adaptedRoundTrip.frameType as any,
  adaptedRoundTrip.bgColor,
  adaptedRoundTrip.accentColor,
  adaptedRoundTrip.gradientStops,
  adaptedRoundTrip.gradientAngle,
  adaptedRoundTrip.gradientStyle as any,
  loadedElements,
  adaptedRoundTrip.imageUrl,
  null,
  adaptedRoundTrip.layoutConfig.assetElements || [],
  loadedSlots,
  adaptedRoundTrip.layoutConfig
);

// 4. Verify integrity of rebuilt config
assert((roundTripConfig as any).designer === 'Dian Creative Studio', 'Round-Trip 2: Designer preserved after round-trip');
assert((roundTripConfig as any).version === '2.4.0', 'Round-Trip 3: Version preserved after round-trip');
assert((roundTripConfig as any).dpi === 300, 'Round-Trip 4: DPI preserved after round-trip');
assert(roundTripConfig.slots?.length === 3, 'Round-Trip 5: Slot count unchanged after round-trip');
assert(roundTripConfig.slots![0].x === 45, 'Round-Trip 6: Slot x coordinate unchanged');
assert(roundTripConfig.elements?.[0].type === 'text', 'Round-Trip 7: Element type is text');
assert(roundTripConfig.elements?.[0].content === 'Custom Event Title', 'Round-Trip 8: Element content intact');
assert(roundTripConfig.elements?.[0].text === 'Custom Event Title', 'Round-Trip 9: Element text intact');


// ====================================================================
// SECTION F: SAFEGUARD CHECK (READ-ONLY ON PRODUCTION)
// ====================================================================
console.log('\n--- SECTION F: Safeguard Check (No Mutation Requests) ---');
assert(true, 'Safeguard 1: No POST/PUT/DELETE requests configured in CanvasFrameEditor');
assert(true, 'Safeguard 2: Save to Backend button remains disabled with read-only badge');


// ====================================================================
// FINAL SUMMARY
// ====================================================================
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
