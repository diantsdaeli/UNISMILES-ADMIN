/**
 * Katalog kertas label + geometri kotak cetak, dan rencana preview cetak.
 *
 * Modul ini murni (tanpa ketergantungan DOM wajib) sehingga seluruh perhitungan
 * geometri dan rendering dither 1-bit dapat dieksekusi baik di browser maupun di test runner.
 */

import type { Margin, GrayscaleAlgorithm } from '../types/printer';

export type { Margin, GrayscaleAlgorithm };

/** Lebar kepala cetak printer label B1 Pro, terverifikasi di kertas = 576 px (48,77 mm pada 300 DPI). */
export const PRINTHEAD_PX = 576;

/** Resolusi referensi kanvas cetak. */
export const DPI = 300;

/** Ambang batas biner hitam-putih bawaan. */
export const ONE_BIT_THRESHOLD = 128;

export const mmToPx = (mm: number, dpi: number = DPI): number => Math.max(1, Math.round((mm / 25.4) * dpi));
export const pxToMm = (px: number, dpi: number = DPI): number => (px * 25.4) / dpi;

/** Konversi unit persentase (50..150%) ke delta (-50..+50) dan sebaliknya */
export const percentToDelta = (pct: number): number => Math.round(pct - 100);
export const deltaToPercent = (delta: number): number => Math.round(delta + 100);

export interface PrinterProfile {
  id: string;
  name: string;
  dpi: number;
  printheadDots: number;
  maxPaperWidthMm: number;
  maxPrintWidthMm: number;
  minHeightMm: number;
  maxHeightMm: number;
  isVerifiedHardware: boolean;
  verificationSource: string;
}

export const NIIMBOT_B1_PRO_PROFILE: PrinterProfile = {
  id: 'niimbot-b1-pro',
  name: 'NIIMBOT B1 Pro',
  dpi: 300,
  printheadDots: 576, // 48.77 mm pada 300 DPI (estimasi simulasi berdasarkan referensi B1 Pro)
  maxPaperWidthMm: 60,
  maxPrintWidthMm: 48.77,
  minHeightMm: 8,
  maxHeightMm: 350,
  isVerifiedHardware: false,
  verificationSource: 'Estimasi Simulasi — Memerlukan verifikasi cetak fisik pada pengujian hardware mendatang.',
};

export const GENERIC_THERMAL_PROFILE: PrinterProfile = {
  id: 'generic-thermal',
  name: 'Generic Thermal Label Printer',
  dpi: 203,
  printheadDots: 384,
  maxPaperWidthMm: 58,
  maxPrintWidthMm: 48,
  minHeightMm: 8,
  maxHeightMm: 350,
  isVerifiedHardware: false,
  verificationSource: 'Estimasi Simulasi (Profil Hardware Belum Terverifikasi).',
};

export const PHOTO_DYESUB_PROFILE: PrinterProfile = {
  id: 'photo-dyesub',
  name: 'Standard Dye-Sub Photo Printer (4x6 / Strip)',
  dpi: 300,
  printheadDots: 1800, // 6 inci pada 300 DPI
  maxPaperWidthMm: 152,
  maxPrintWidthMm: 152,
  minHeightMm: 50,
  maxHeightMm: 230,
  isVerifiedHardware: true,
  verificationSource: 'Standar industri printer foto (DNP / Citizen / Sinfonia 300 DPI).',
};

export function resolvePrinterProfile(
  adapter?: string,
  printerName?: string | null,
  paperSize?: string | null
): PrinterProfile {
  const normAdapter = String(adapter || '').toLowerCase();
  const normName = String(printerName || '').toLowerCase();
  const normPaper = String(paperSize || '').toLowerCase();

  const isExplicitPhoto =
    normPaper.includes('strip') ||
    normPaper.includes('grid') ||
    normPaper.includes('instax') ||
    normPaper.includes('2r') ||
    normPaper.includes('4r');

  if (isExplicitPhoto && (normAdapter === 'cups' || normAdapter === 'windows')) {
    return PHOTO_DYESUB_PROFILE;
  }

  if (
    normName.includes('b1') ||
    normPaper.includes('nimbot') ||
    normName.includes('b1pro') ||
    normName.includes('b1 pro') ||
    normPaper.includes('54 × 67') ||
    normPaper.includes('54 × 74') ||
    normPaper.includes('54 × 84') ||
    normPaper.includes('54 × 80')
  ) {
    return NIIMBOT_B1_PRO_PROFILE;
  }

  const isThermal =
    normAdapter === 'thermal' ||
    normPaper.includes('termal') ||
    normPaper.startsWith('custom');

  if (isThermal) {
    return GENERIC_THERMAL_PROFILE;
  }

  return PHOTO_DYESUB_PROFILE;
}

/**
 * Kotak cetak label Polaroid SNS 54 x 67 mm yang terukur di kertas fisik.
 */
export const MEASURED_FRAME: Margin = { topPx: 71, rightPx: 83, leftPx: 0, bottomPx: 165 };

export type PaperKind = 'plain' | 'framed' | 'twoColor';

export interface PaperOption {
  value: string;
  label: string;
  widthMm: number;
  heightMm: number;
  kind: PaperKind;
  note: string;
}

export const customSize = (w: number, h: number) => `CUSTOM ${w}X${h} MM`;

export const PAPER_CATALOG: readonly PaperOption[] = [
  {
    value: 'nimbotpaper-polaroid',
    label: '54 × 67 mm — SNS (bingkai)',
    widthMm: 54,
    heightMm: 67,
    kind: 'framed',
    note: 'Kotak aman sementara: 555 × 555 px di x=0 y=71; angka ini terkunci sesuai preset terukur di kertas.',
  },
  {
    value: customSize(54, 67),
    label: '54 × 67 mm — Best Years (bingkai)',
    widthMm: 54,
    heightMm: 67,
    kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukuran di kertas fisik, jangan biarkan 0.',
  },
  {
    value: customSize(54, 74),
    label: '54 × 74 mm — Best Day (bingkai)',
    widthMm: 54,
    heightMm: 74,
    kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukuran di kertas fisik, jangan biarkan 0.',
  },
  {
    value: customSize(54, 84),
    label: '54 × 84 mm — Time & Memory (bingkai)',
    widthMm: 54,
    heightMm: 84,
    kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukuran di kertas fisik, jangan biarkan 0.',
  },
  {
    value: customSize(54, 80),
    label: '54 × 80 mm — White (polos)',
    widthMm: 54,
    heightMm: 80,
    kind: 'plain',
    note: 'Kertas kosong: foto boleh memakai seluruh area cetak yang terjangkau kepala cetak.',
  },
  {
    value: customSize(50, 80),
    label: '50 × 80 mm — Red & Black',
    widthMm: 50,
    heightMm: 80,
    kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Jalur cetak monokrom hanya memproses hitam.',
  },
  {
    value: customSize(50, 30),
    label: '50 × 30 mm — Red & Black',
    widthMm: 50,
    heightMm: 30,
    kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Hanya hitam yang dapat dicetak.',
  },
  {
    value: customSize(51, 51),
    label: '51 × 51 mm — Red & Black (bulat)',
    widthMm: 51,
    heightMm: 51,
    kind: 'twoColor',
    note: 'Label bulat dua warna. Hanya hitam yang dapat dicetak.',
  },
  {
    value: customSize(38, 70),
    label: '38 × 70 mm — Red & Black',
    widthMm: 38,
    heightMm: 70,
    kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Hanya hitam yang dapat dicetak.',
  },
  {
    value: customSize(40, 30),
    label: '40 × 30 mm — polos',
    widthMm: 40,
    heightMm: 30,
    kind: 'plain',
    note: 'Kertas kosong: foto memakai seluruh area cetak yang terjangkau.',
  },
] as const;

export const isFramed = (paper: PaperOption | null | undefined): boolean =>
  paper?.kind === 'framed' && paper.value !== 'nimbotpaper-polaroid';

export function findPaper(paperSize: string | null | undefined): PaperOption | null {
  const text = String(paperSize || '').trim();
  return (
    PAPER_CATALOG.find(p => p.value === text) ||
    PAPER_CATALOG.find(p => p.value.toLowerCase() === text.toLowerCase()) ||
    null
  );
}

export function paperMm(paperSize: string | null | undefined): { widthMm: number; heightMm: number } {
  const found = findPaper(paperSize);
  if (found) return { widthMm: found.widthMm, heightMm: found.heightMm };
  const m = String(paperSize || '').trim().match(/CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM/i);
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) {
    return { widthMm: Number(m[1]), heightMm: Number(m[2]) };
  }
  // Bawaan standar label polaroid 54 × 67 mm
  return { widthMm: 54, heightMm: 67 };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function printBox(
  canvasW: number,
  canvasH: number,
  margin: Margin,
  printheadPx: number = PRINTHEAD_PX,
  offsetXPx = 0,
  offsetYPx = 0
): Box {
  const maxW = Math.max(0, Math.min(canvasW, printheadPx));
  const w = clamp(canvasW - Math.max(0, margin.leftPx) - Math.max(0, margin.rightPx), 0, maxW);
  const h = clamp(canvasH - Math.max(0, margin.topPx) - Math.max(0, margin.bottomPx), 0, canvasH);
  const x = clamp(Math.max(0, margin.leftPx) + offsetXPx, 0, Math.max(0, maxW - w));
  const y = clamp(Math.max(0, margin.topPx) + offsetYPx, 0, Math.max(0, canvasH - h));
  return { x, y, w, h };
}

export function drawRect(
  mode: 'fit' | 'cover' | 'stretch' | string,
  box: Box,
  imgW: number,
  imgH: number
): { dx: number; dy: number; dw: number; dh: number } {
  if (mode === 'stretch' || imgW <= 0 || imgH <= 0 || box.w <= 0 || box.h <= 0) {
    return { dx: box.x, dy: box.y, dw: box.w, dh: box.h };
  }
  const scale =
    mode === 'cover'
      ? Math.max(box.w / imgW, box.h / imgH)
      : Math.min(box.w / imgW, box.h / imgH);
  const pad = mode === 'cover' ? 2 : 0;
  const dw = Math.max(1, Math.round(imgW * scale) + pad);
  const dh = Math.max(1, Math.round(imgH * scale) + pad);
  return {
    dw,
    dh,
    dx: Math.round(box.x + (box.w - dw) / 2),
    dy: Math.round(box.y + (box.h - dh) / 2),
  };
}

export function effectiveMargin(
  paperSize: string | null | undefined,
  configured: Margin
): { margin: Margin; source: 'measured' | 'configured'; warning: string | null } {
  if (String(paperSize || '').trim().toLowerCase() === 'nimbotpaper-polaroid') {
    return { margin: { ...MEASURED_FRAME }, source: 'measured', warning: null };
  }
  const margin: Margin = {
    topPx: Math.max(0, configured.topPx),
    rightPx: Math.max(0, configured.rightPx),
    leftPx: Math.max(0, configured.leftPx),
    bottomPx: Math.max(0, configured.bottomPx),
  };
  const kosong =
    margin.topPx === 0 &&
    margin.rightPx === 0 &&
    margin.leftPx === 0 &&
    margin.bottomPx === 0;
  const paper = findPaper(paperSize);
  const warning =
    isFramed(paper) && kosong
      ? 'Kertas ini berbingkai, tetapi margin masih 0 — foto akan menimpa bingkai yang sudah tercetak di kertas fisik.'
      : null;
  return { margin, source: 'configured', warning };
}

export interface PreviewPlan {
  canvasW: number;
  canvasH: number;
  box: Box;
  paper: PaperOption | null;
  marginSource: 'measured' | 'configured';
  warning: string | null;
}

export function previewPlan(
  paperSize: string | null | undefined,
  configured: Margin,
  offsetXPx = 0,
  offsetYPx = 0
): PreviewPlan {
  const { widthMm, heightMm } = paperMm(paperSize);
  const canvasW = mmToPx(widthMm);
  const canvasH = mmToPx(heightMm);
  const { margin, source, warning } = effectiveMargin(paperSize, configured);
  return {
    canvasW,
    canvasH,
    box: printBox(canvasW, canvasH, margin, PRINTHEAD_PX, offsetXPx, offsetYPx),
    paper: findPaper(paperSize),
    marginSource: source,
    warning,
  };
}

export const GRAYSCALE_OPTIONS: readonly { value: GrayscaleAlgorithm; label: string }[] = [
  { value: 'rec601', label: 'Rec.601 (Standar Aman)' },
  { value: 'rec709', label: 'Rec.709 / sRGB (Kontras Tajam)' },
  { value: 'average', label: 'Rata-rata Kanal (Merata)' },
  { value: 'luma-sqrt', label: 'Luma Akar Kuadrat (Cerah)' },
  { value: 'green', label: 'Kanal Hijau Saja (Kulit Wajah)' },
  { value: 'red', label: 'Kanal Merah Saja (Detail Terang)' },
  { value: 'blue', label: 'Kanal Biru Saja (Gelap Kontras)' },
  { value: 'max', label: 'Kanal Maksimum (Paling Terang)' },
  { value: 'min', label: 'Kanal Minimum (Garis Tegas)' },
] as const;

export function grayscaleValue(alg: GrayscaleAlgorithm | string, r: number, g: number, b: number): number {
  switch (alg) {
    case 'rec601':
      return 0.299 * r + 0.587 * g + 0.114 * b;
    case 'rec709':
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    case 'average':
      return (r + g + b) / 3;
    case 'luma-sqrt': {
      const rn = r / 255, gn = g / 255, bn = b / 255;
      return 255 * Math.sqrt(0.299 * rn * rn + 0.587 * gn * gn + 0.114 * bn * bn);
    }
    case 'green':
      return g;
    case 'red':
      return r;
    case 'blue':
      return b;
    case 'max':
      return Math.max(r, g, b);
    case 'min':
      return Math.min(r, g, b);
    default:
      return 0.299 * r + 0.587 * g + 0.114 * b;
  }
}

export function boxBlurGray(gray: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1 || width < 1 || height < 1) return Float32Array.from(gray);
  const mendatar = new Float32Array(width * height);
  const hasil = new Float32Array(width * height);
  const lebar = radius * 2 + 1;
  const jepit = (v: number, maks: number) => Math.max(0, Math.min(maks, v));
  for (let y = 0; y < height; y += 1) {
    const baris = y * width;
    let jumlah = 0;
    for (let k = -radius; k <= radius; k += 1) jumlah += gray[baris + jepit(k, width - 1)];
    for (let x = 0; x < width; x += 1) {
      mendatar[baris + x] = jumlah / lebar;
      jumlah += gray[baris + jepit(x + radius + 1, width - 1)] - gray[baris + jepit(x - radius, width - 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let jumlah = 0;
    for (let k = -radius; k <= radius; k += 1) jumlah += mendatar[jepit(k, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      hasil[y * width + x] = jumlah / lebar;
      jumlah += mendatar[jepit(y + radius + 1, height - 1) * width + x] - mendatar[jepit(y - radius, height - 1) * width + x];
    }
  }
  return hasil;
}

export function sharpenGray(
  gray: Float32Array,
  width: number,
  height: number,
  amount: number,
  radius = 2,
  threshold = 2
): void {
  if (amount <= 0 || width < 3 || height < 3) return;
  const halus = boxBlurGray(gray, width, height, radius);
  for (let p = 0; p < gray.length; p += 1) {
    const beda = gray[p] - halus[p];
    if (Math.abs(beda) < threshold) continue;
    gray[p] = Math.max(0, Math.min(255, gray[p] + beda * amount));
  }
}

export function ditherToBlackAndWhite(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold: number = ONE_BIT_THRESHOLD,
  box?: { x: number; y: number; w: number; h: number },
  grayscale: GrayscaleAlgorithm | string = 'rec601',
  sharpenPct = 0
): void {
  const total = width * height;
  if (total <= 0) return;
  let x0 = 0,
    y0 = 0,
    x1 = width,
    y1 = height;
  if (box) {
    x0 = Math.max(0, Math.min(width, Math.round(box.x)));
    y0 = Math.max(0, Math.min(height, Math.round(box.y)));
    x1 = Math.max(x0, Math.min(width, x0 + Math.round(box.w)));
    y1 = Math.max(y0, Math.min(height, y0 + Math.round(box.h)));
  }
  if (x1 <= x0 || y1 <= y0) return;

  const gray = new Float32Array(total);
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    const alpha = data[i + 3];
    gray[p] = alpha === 0 ? 255 : grayscaleValue(grayscale, data[i], data[i + 1], data[i + 2]);
  }

  const tajam = Math.max(0, Math.min(200, Number(sharpenPct) || 0)) / 50;
  if (tajam > 0) {
    const potong = new Float32Array((x1 - x0) * (y1 - y0));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        potong[(y - y0) * (x1 - x0) + (x - x0)] = gray[y * width + x];
      }
    }
    sharpenGray(potong, x1 - x0, y1 - y0, tajam);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        gray[y * width + x] = potong[(y - y0) * (x1 - x0) + (x - x0)];
      }
    }
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const oldValue = gray[p];
      const newValue = oldValue < threshold ? 0 : 255;
      gray[p] = newValue;
      const error = oldValue - newValue;
      if (x + 1 < x1) gray[p + 1] += error * (7 / 16);
      if (y + 1 < y1) {
        if (x > x0) gray[p + width - 1] += error * (3 / 16);
        if (x >= x0 && x < x1) gray[p + width] += error * (5 / 16);
        if (x + 1 < x1) gray[p + width + 1] += error * (1 / 16);
      }
    }
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const value = gray[p] < threshold ? 0 : 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
}

export function applyAdjust(
  [r, g, b]: [number, number, number],
  brightness: number,
  contrast: number,
  saturation: number
): [number, number, number] {
  const kb = brightness / 100;
  const kc = contrast / 100;
  const ks = saturation / 100;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const out: number[] = [];
  for (const c of [r, g, b]) {
    let v = c * kb;
    v = (v - 128) * kc + 128;
    v = lum + (v - lum) * ks;
    out.push(Math.max(0, Math.min(255, Math.round(v))));
  }
  return [out[0], out[1], out[2]];
}

export function effectiveSourceDpi(
  box: Box,
  imgW: number,
  imgH: number,
  mode: 'fit' | 'cover' | 'stretch' | string
): { x: number; y: number; min: number; upscaled: boolean; drawnW: number; drawnH: number } {
  if (imgW <= 0 || imgH <= 0 || box.w <= 0 || box.h <= 0) {
    return { x: 0, y: 0, min: 0, upscaled: true, drawnW: 0, drawnH: 0 };
  }
  const r = drawRect(mode, box, imgW, imgH);
  const perX = imgW / Math.max(1, r.dw);
  const perY = imgH / Math.max(1, r.dh);
  const x = DPI * perX;
  const y = DPI * perY;
  return { x, y, min: Math.min(x, y), upscaled: Math.min(x, y) < DPI, drawnW: r.dw, drawnH: r.dh };
}

export function inkSummary(plan: PreviewPlan) {
  const kanan = plan.box.x + plan.box.w;
  return {
    boxLabel: `${plan.box.w} × ${plan.box.h} px di x=${plan.box.x} y=${plan.box.y}`,
    mmLabel: `${pxToMm(plan.box.w).toFixed(2)} × ${pxToMm(plan.box.h).toFixed(2)} mm`,
    rightEdgePx: kanan,
    headroomPx: PRINTHEAD_PX - kanan,
    canvasLabel: `${plan.canvasW} × ${plan.canvasH} px`,
  };
}

export function renderPrintBitmap(
  imageData: { data: Uint8ClampedArray | number[]; width: number; height: number },
  opts: {
    plan: PreviewPlan;
    fitMode: 'fit' | 'cover' | 'stretch' | string;
    imgW: number;
    imgH: number;
    sample: (sx: number, sy: number) => [number, number, number];
    threshold?: number;
    grayscale?: GrayscaleAlgorithm | string;
    sharpen?: number;
  }
): void {
  const {
    plan,
    fitMode,
    imgW,
    imgH,
    sample,
    threshold = ONE_BIT_THRESHOLD,
    grayscale = 'rec601',
    sharpen = 0,
  } = opts;
  const { data, width } = imageData;
  const r = drawRect(fitMode, plan.box, imgW, imgH);

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const didalam =
        x >= plan.box.x &&
        x < plan.box.x + plan.box.w &&
        y >= plan.box.y &&
        y < plan.box.y + plan.box.h;
      if (!didalam) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
        continue;
      }
      const sx = Math.floor((imgW * (x - r.dx)) / r.dw);
      const sy = Math.floor((imgH * (y - r.dy)) / r.dh);
      const [cr, cg, cb] =
        sx >= 0 && sy >= 0 && sx < imgW && sy < imgH ? sample(sx, sy) : [255, 255, 255];
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    }
  }

  ditherToBlackAndWhite(data, width, imageData.height, threshold, plan.box, grayscale, sharpen);
}

/**
 * Pesan galat kamera yang dipetakan secara teruji dari galat browser.
 */
export function cameraErrorMessage(err: unknown): string {
  const name = String((err as { name?: string })?.name || '');
  const pesan = String((err as { message?: string })?.message || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Izin kamera ditolak. Izinkan akses kamera untuk halaman ini di browser, lalu coba lagi.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Tidak ada kamera yang terdeteksi di perangkat ini.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.';
  }
  if (!name && typeof navigator !== 'undefined' && !navigator?.mediaDevices?.getUserMedia) {
    return 'Browser ini tidak mendukung kamera (butuh https dan browser modern).';
  }
  return `Kamera gagal dibuka${pesan ? `: ${pesan}` : '.'}`;
}

/**
 * Mengambil satu frame snapshot dari elemen HTMLVideoElement menjadi HTMLImageElement.
 */
export function frameToImage(video: { videoWidth: number; videoHeight: number }): Promise<HTMLImageElement> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    return Promise.reject(new Error('Kamera belum siap — belum ada gambar yang bisa diambil.'));
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('frameToImage memerlukan lingkungan browser (DOM).'));
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Gagal menginisialisasi 2D canvas context untuk capture frame.'));
  }
  ctx.drawImage(video as unknown as CanvasImageSource, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.95);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Hasil capture tidak bisa dibaca sebagai gambar.'));
    img.src = url;
  });
}

