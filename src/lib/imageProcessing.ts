/**
 * UNISMILES IMAGE PROCESSING & AUTO BACKGROUND REMOVAL ENGINE
 * 
 * Fitur:
 * 1. Validasi Magic Bytes PNG (89 50 4E 47 0D 0A 1A 0A).
 * 2. Deteksi Alpha / Transparansi Gambar.
 * 3. Penghapusan Background Otomatis On-Device (Canvas Flood-Fill + Edge Feathering + Defringing).
 * 4. Konversi File ke Data URL aman (persistent di localStorage).
 */

// Magic bytes penanda format PNG standar: \x89PNG\r\n\x1a\n
export const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

export interface PngValidationResult {
  valid: boolean;
  error?: string;
  isPng?: boolean;
}

/**
 * Validasi ketat format PNG berdasarkan ekstensi, MIME type, dan 8 bytes magic header pertama
 */
export async function validatePngFile(file: File): Promise<PngValidationResult> {
  if (!file) {
    return { valid: false, error: 'Berkas gambar belum dipilih.' };
  }

  // 1. Validasi Ekstensi
  const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
  if (ext !== 'png') {
    return {
      valid: false,
      error: `Format berkas "${ext?.toUpperCase() || 'tidak dikenal'}" ditolak. Upload stiker hanya menerima format PNG.`,
      isPng: false,
    };
  }

  // 2. Validasi MIME Type jika tersedia
  if (file.type && file.type !== 'image/png') {
    return {
      valid: false,
      error: `MIME type "${file.type}" tidak valid. Hanya berkas image/png yang diperbolehkan.`,
      isPng: false,
    };
  }

  // 3. Validasi Ukuran (Maksimal 15MB)
  if (file.size > 15 * 1024 * 1024) {
    return { valid: false, error: 'Ukuran berkas melebihi batas maksimal 15MB.' };
  }

  // 4. Validasi Magic Bytes
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 8) {
      return { valid: false, error: 'Berkas rusak atau terlalu kecil untuk header PNG yang valid.' };
    }

    for (let i = 0; i < PNG_MAGIC_BYTES.length; i++) {
      if (bytes[i] !== PNG_MAGIC_BYTES[i]) {
        return {
          valid: false,
          error: 'Header berkas tidak cocok dengan tanda tangan PNG standar (Magic Bytes mismatch). Mohon gunakan berkas PNG asli.',
          isPng: false,
        };
      }
    }

    return { valid: true, isPng: true };
  } catch (err: any) {
    return { valid: false, error: `Gagal membaca header berkas: ${err?.message || 'Error pembacaan'}` };
  }
}

/**
 * Konversi File atau Blob ke Base64 Data URL
 */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal mengonversi berkas ke data URL.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Memuat URL gambar (data URL / blob / http) ke dalam HTMLImageElement
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat elemen gambar ke canvas.'));
    img.src = src;
  });
}

export interface TransparencyCheckResult {
  hasTransparency: boolean;
  transparentRatio: number;
  width: number;
  height: number;
}

/**
 * Memeriksa apakah PNG sudah memiliki alpha channel transparan
 */
export function checkPngTransparency(img: HTMLImageElement): TransparencyCheckResult {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { hasTransparency: false, transparentRatio: 0, width: canvas.width, height: canvas.height };
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let transparentPixels = 0;
  const totalPixels = canvas.width * canvas.height;

  // Sampel setiap pixel untuk mengecek nilai alpha
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 240) {
      transparentPixels++;
    }
  }

  const ratio = transparentPixels / totalPixels;
  // Jika lebih dari 0.8% piksel memiliki alpha < 240, anggap sudah memiliki background transparan
  return {
    hasTransparency: ratio >= 0.008,
    transparentRatio: ratio,
    width: canvas.width,
    height: canvas.height,
  };
}

export interface RemoveBackgroundOptions {
  tolerance?: number; // Toleransi jarak warna Euclidean (default: 32)
  feather?: number;   // Jarak transisi halus tepi (default: 8)
  samplePoints?: Array<{ x: number; y: number }>;
}

export interface RemoveBackgroundResult {
  dataUrl: string;
  width: number;
  height: number;
  detectedBgColor: { r: number; g: number; b: number };
  pixelsModified: number;
  isComplexBackground?: boolean;
  borderVariance?: number;
  maxBorderDist?: number;
}

/**
 * Algoritma On-Device Local Auto Background Removal
 * Menggunakan connected-component border flood-fill dengan Euclidean color distance dan anti-aliased feathering
 */
export function removeBackgroundLocally(
  img: HTMLImageElement,
  options?: RemoveBackgroundOptions
): RemoveBackgroundResult {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context tidak tersedia.');
  }

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const tolerance = options?.tolerance ?? 32;
  const feather = options?.feather ?? 8;

  // 1. Sampel warna background di sepanjang tepi dan 4 sudut (12 titik koordinat terluar)
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const sampleCoords = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 },
    { x: Math.floor(width / 2), y: 0 },
    { x: Math.floor(width / 2), y: height - 1 },
    { x: 0, y: Math.floor(height / 2) },
    { x: width - 1, y: Math.floor(height / 2) },
    { x: Math.floor(width / 4), y: 0 },
    { x: Math.floor((3 * width) / 4), y: 0 },
    { x: 0, y: Math.floor(height / 4) },
    { x: width - 1, y: Math.floor((3 * height) / 4) },
  ];

  for (const coord of sampleCoords) {
    const idx = (coord.y * width + coord.x) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }

  // Hitung rata-rata warna background dominan
  let sumR = 0, sumG = 0, sumB = 0;
  for (const s of samples) {
    sumR += s.r;
    sumG += s.g;
    sumB += s.b;
  }
  const bgR = Math.round(sumR / samples.length);
  const bgG = Math.round(sumG / samples.length);
  const bgB = Math.round(sumB / samples.length);

  // Hitung dispersi / variansi sampel warna tepi untuk mendeteksi latar belakang kompleks vs polos
  let maxBorderDist = 0;
  let varianceSum = 0;
  for (const s of samples) {
    const d = Math.sqrt((s.r - bgR) ** 2 + (s.g - bgG) ** 2 + (s.b - bgB) ** 2);
    if (d > maxBorderDist) maxBorderDist = d;
    varianceSum += d * d;
  }
  const borderVariance = Math.round(Math.sqrt(varianceSum / samples.length));

  // Background dianggap kompleks jika variasi warna tepi tinggi (bukan warna solid/monokrom)
  const isComplexBackground = maxBorderDist > 45 || borderVariance > 28;

  // 2. Connected-component flood fill dari seluruh piksel tepi luar
  const visited = new Uint8Array(width * height);
  const queue: Int32Array = new Int32Array(width * height);
  let queueHead = 0;
  let queueTail = 0;

  function pushQueue(x: number, y: number) {
    const idx = y * width + x;
    if (visited[idx] === 0) {
      visited[idx] = 1;
      queue[queueTail++] = idx;
    }
  }

  // Masukkan seluruh tepi terluar (border) ke dalam antrian flood-fill
  for (let x = 0; x < width; x++) {
    pushQueue(x, 0);
    pushQueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushQueue(0, y);
    pushQueue(width - 1, y);
  }

  let modifiedCount = 0;

  // 3. Proses antrian
  while (queueHead < queueTail) {
    const curIdx = queue[queueHead++];
    const cx = curIdx % width;
    const cy = Math.floor(curIdx / width);
    const pixelOffset = curIdx * 4;

    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];

    // Jarak warna Euclidean dari warna background
    const dist = Math.sqrt(
      (r - bgR) * (r - bgR) +
      (g - bgG) * (g - bgG) +
      (b - bgB) * (b - bgB)
    );

    if (dist <= tolerance) {
      // 100% transparan
      data[pixelOffset + 3] = 0;
      modifiedCount++;

      // Periksa 4 tetangga (kiri, kanan, atas, bawah)
      if (cx > 0) pushQueue(cx - 1, cy);
      if (cx < width - 1) pushQueue(cx + 1, cy);
      if (cy > 0) pushQueue(cx, cy - 1);
      if (cy < height - 1) pushQueue(cx, cy + 1);
    } else if (dist <= tolerance + feather) {
      // Transisi halus anti-aliased feathering untuk mencegah jagged / white halo
      const factor = (dist - tolerance) / feather; // 0..1
      const newAlpha = Math.round(factor * 255);
      if (newAlpha < data[pixelOffset + 3]) {
        data[pixelOffset + 3] = newAlpha;
        modifiedCount++;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const totalPixels = width * height;
  const ratioModified = totalPixels > 0 ? modifiedCount / totalPixels : 0;

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    detectedBgColor: { r: bgR, g: bgG, b: bgB },
    pixelsModified: modifiedCount,
    isComplexBackground: isComplexBackground || (ratioModified < 0.03 && modifiedCount > 0),
    borderVariance,
    maxBorderDist: Math.round(maxBorderDist),
  };
}
