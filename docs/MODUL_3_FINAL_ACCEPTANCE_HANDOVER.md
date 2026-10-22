# DOKUMEN PENUTUPAN & SERAH TERIMA MODUL 3
## Printer Configuration, Calibration, & Hardware Contract Integration

- **Repository Utama:** `diantsdaeli/UNISMILES-ADMIN`
- **Branch:** `feature/unismiles-integration`
- **Baseline Commit Tahap 3D:** `61e55f6452370f5eee1a8cbfbf03ccf9eceb111a`
- **Tanggal Selesai:** 22 Oktober 2026
- **Status Akhir Penutupan:** **MODUL 3 — SIMULATION & CONTRACT READY (1.137 Automated Assertions PASS)**

---

### 1. Executive Summary

Modul 3 mengintegrasikan fitur **Printer Configuration & Calibration** pada portal Admin Dian (`diantsdaeli/UNISMILES-ADMIN`) yang diadaptasi dari referensi Admin Nadin (`nathaniapelleng15/admin_uni_gateway`), diselaraskan dengan kontrak Backend API Gateway (`nathaniapelleng15/backend_uni_gateway`), dan disesuaikan dengan arsitektur Kiosk Photobooth (`nathaniapelleng15/frontend_uni_gateway`).

Pencapaian utama Modul 3 meliputi:
1. **Tahap 3A (Audit & Arsitektur):** Pemetaan model data printer, resolusi konflik fitur legacy (tab Hardware 4x6 / Strip vs preset baru), dan identifikasi risiko pemanggilan test-print live pada backend.
2. **Tahap 3B (UI, Geometri & Dithering):** Pembuatan tab Printer Configuration, 14 preset kertas katalog, validasi custom paper, engine 1-bit Floyd-Steinberg dithering dengan 9 opsi grayscale, live camera WebRTC capture, dan live preview kalibrasi citra.
3. **Tahap 3C (Safe Simulation & Backend Contract Tests):** Implementasi adapter printer terisolasi, validasi payload ketat anti-RCE (penolakan 5 forbidden command fields), error handling (400, 401, 403, 404, 503, timeout), isolasi multi-kiosk, mapping legacy non-destruktif, dan 18 pengujian kontrak mock HTTP dengan 116 assertions.

Status akhir Modul 3 dinyatakan sebagai:
> **MODUL 3 — SIMULATION & CONTRACT READY**  
> *(Bukan PRODUCTION READY dan Bukan HARDWARE VERIFIED)*  
> Seluruh kontrak data dan simulasi antarmuka telah terverifikasi secara matematis dan otomatis melalui 1.137 assertions lulus 100%. Namun, aktivasi mutasi jaringan riil dan pengujian pencetakan fisik tetap diblokir secara fail-closed hingga server staging dan perangkat keras fisik resmi tersedia.

---

### 2. Scope & Riwayat Commit Modul 3

| Tahap | Commit Hash | Pesan Commit | Ruang Lingkup Utama | Assertions |
| :--- | :---: | :--- | :--- | :---: |
| **Modul 2 Baseline** | `0917a16` | `docs(gallery): finalize module 2 acceptance and handover` | Handover penutupan Modul 2 (Gallery & Frame Editor) | 933 |
| **Tahap 3A** | `6e23a48` | *(Audit & Handover Modul 2 Final)* | Audit arsitektur printer, spesifikasi tabel `kiosk_printing_configs`, dan socket commands | 933 |
| **Tahap 3B** | `3f4ac5b` | `feat(printer): integrate safe printer configuration UI and preview` | UI Printer Configuration, PrintPreview, Floyd-Steinberg dithering, profil printer estimasi simulasi | 1.021 (+88) |
| **Tahap 3C** | `61e55f6` | `feat(printer): add safe simulation and backend contract validation` | Validasi payload ketat, forbidden fields rejection, mock HTTP contract tests, mitigasi test-print | 1.137 (+116) |

---

### 3. Arsitektur Layanan Printer Configuration

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Admin Dian Portal (UI)                          │
│                                                                        │
│   [KioskConfigPage] ──► [PrinterConfiguration] ──► [PrintPreview]      │
│     (Tabs: Hardware,      (Sliders, Presets,         (Canvas 1-Bit     │
│      Printer, Pricing)     Adapters, Layouts)         Dithering, Cam)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                        updatePrinterConfig()
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Printer Service Layer                            │
│                                                                        │
│   1. validatePrintingConfigPayload() [Ketat, Anti-RCE, HTTP 400]       │
│   2. serializePrinterConfig()        [Clamping Numerik Fisik]          │
│   3. Deserializer Tangguh           [Incomplete Response Fallback]     │
│   4. Legacy Mapping Helper           [4x6 / Strip Bidirectional]       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
                 ▼                                     ▼
      [Simulated Mode] (Default)             [Real Mutation Mode]
                 │                                     │
   ┌─────────────┴─────────────┐             assertMutationAllowed()
   │                           │                       │
   ▼                           ▼                       ▼
localStorage per-kiosk   Simulated Test Print    Backend API Staging
(Increment version)      (SIM-TEST-<id>)         (BLOCKED: Allowlist = [])
                         Zero Hardware Hooks
```

---

### 4. Feature Acceptance Matrix

Audit penerimaan teknis terhadap 14 fitur inti Modul 3:

| No | Fitur / Komponen | Status Penerimaan | Bukti Implementasi & File Uji |
| :---: | :--- | :---: | :--- |
| 1 | **Tab Printer Configuration** | **PASS** | Terpasang rapi di [KioskConfigPage.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskConfigPage.tsx#L568-L578) dan [PrinterConfiguration.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/PrinterConfiguration.tsx). Pengujian UI di `tests/stage4_printer_ui.test.ts` Section 7. |
| 2 | **Preset Ukuran Kertas & Custom** | **PASS** | 14 katalog kertas di [printPapers.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/printPapers.ts#L143-L200), format `CUSTOM <W>X<H> MM`. Divalidasi di `tests/stage4_printer_ui.test.ts` Section 1–2 dan `tests/stage4c_printer_simulation.test.ts` Section 4. |
| 3 | **Adapter Printer Support** | **PASS** | Mendukung `disabled`, `cups`, `windows`, `thermal`, `mock`. Terverifikasi di [printerService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/printerService.ts#L65) dan `tests/stage4c_printer_simulation.test.ts` Section 5. |
| 4 | **Kalibrasi Foto & Thermal** | **PASS** | Pengaturan kecerahan, kontras, saturasi, densitas termal, offset X/Y, margin 4 sisi, dan sharpen. Terverifikasi di `tests/stage4_printer_ui.test.ts` Section 4 & 8. |
| 5 | **9 Algoritma Grayscale & Dithering** | **PASS** | Implementasi `rec601`, `rec709`, `average`, `luma-sqrt`, `green`, `red`, `blue`, `max`, `min` + Floyd-Steinberg error diffusion di [printPapers.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/printPapers.ts#L330-L400). Terverifikasi di `tests/stage4_printer_ui.test.ts` Section 4. |
| 6 | **Preview Cetak Lokal Interaktif** | **PASS** | [PrintPreview.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/PrintPreview.tsx) mendukung pan/zoom, WebRTC camera capture, pembersihan media stream saat unmount, dan indikator clipping kepala cetak. Terverifikasi di `tests/stage4_printer_ui.test.ts` Section 3 & 10. |
| 7 | **Simulasi Test Print Aman** | **PASS** | `testPrintSimulation()` menghasilkan `jobId` simulasi (`SIM-TEST-...`) tanpa request backend dan tanpa hardware driver hooks. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 16. |
| 8 | **Konfigurasi End-Screen Kiosk** | **PASS** | Pengendalian visibilitas tombol akhir (`show_email_button`, `show_retake_button`, `show_print_button`). Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 1 & 2. |
| 9 | **Isolasi Konfigurasi Multi-Kiosk** | **PASS** | State storage independen per kiosk ID (`unismiles_kiosk_printer_config_${kioskId}`). Terverifikasi di `tests/stage4_printer_ui.test.ts` Section 11 dan `tests/stage4c_printer_simulation.test.ts` Section 15. |
| 10 | **Serializer & Deserializer** | **PASS** | `serializePrinterConfig()` & `deserializePrinterConfig()`. Menangani normalisasi, clamping, dan migrasi kolom legacy `enabled`. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 1, 2, 14. |
| 11 | **Validasi Kontrak Backend** | **PASS** | `validatePrintingConfigPayload()` menolak 5 forbidden injection fields (`command`, `shell_command`, dsb.), unknown fields, dan angka out-of-range. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 3 & 7. |
| 12 | **Mapping Konfigurasi Legacy** | **PASS** | `mapLegacyPrinterSizeToPaperPreset()` dan `mapPaperPresetToLegacyPrinterSize()` menghubungkan tab Hardware 4x6 / Strip dengan preset baru secara non-destruktif. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 18. |
| 13 | **Structured Error Handling** | **PASS** | `parsePrinterApiError()` memetakan status 400, 401, 403, 404, 503, dan ECONNABORTED network timeout ke struktur error yang informatif. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 8–12. |
| 14 | **Safeguards Keamanan Fail-Closed** | **PASS** | `ENABLE_BACKEND_MUTATIONS = false` dan `VERIFIED_STAGING_ALLOWLIST = []`. Seluruh mutasi HTTP nyata diblokir. Terverifikasi di `tests/stage4c_printer_simulation.test.ts` Section 17. |

**Ringkasan Status Penerimaan:**  
- **PASS:** 14 / 14 Item  
- **PARTIAL:** 0 Item  
- **BLOCKED (Operasional Riil):** Lihat Bagian 8 (Open Blockers)

---

### 5. Backend Contract Matrix & End-to-End Traceability

Pemetaan komprehensif alur data antara Admin Dian, Backend API, dan Kiosk Photobooth:

| Endpoint Backend | Metode | Perilaku Backend Aktual | Perilaku Admin Dian (Tahap 3C) | Status Traceability |
| :--- | :---: | :--- | :--- | :---: |
| `/api/v1/admin/kiosks/:kioskId/printing-config` | `GET` | Membaca record dari `kiosk_printing_configs`, menghasilkan envelope `{ success, data: { config, reported, status } }`. | Membaca dari storage lokal (simulasi) atau GET terautentikasi (read-only). | **VERIFIED (Mock & Contract)** |
| `/api/v1/admin/kiosks/:kioskId/printing-config` | `PUT` | Memvalidasi payload via `validatePrintingConfig`, memperbarui DB, menambah `config_version`, memancarkan config baru via WebSocket socketServer. | Menjalankan `validatePrintingConfigPayload()`, menaikkan version, dan menyimpan ke `localStorage`. Mutasi jaringan ditahan fail-closed. | **VERIFIED (Mock & Contract)** |
| `/api/v1/admin/kiosks/:kioskId/printing-config/refresh` | `POST` | Mengirim perintah WebSocket `REFRESH_PRINTER_STATUS` ke kiosk agent. Return 200 (online) atau 503 (offline). | Mengembalikan respons simulasi lokal `{ success: true, simulated: true }`. Request jaringan ditahan. | **VERIFIED (Mock & Contract)** |
| `/api/v1/admin/kiosks/:kioskId/printing-config/test` | `POST` | **KRITIS:** Membuat baris `print_jobs`, menjadwalkan timeout, memancarkan socket `PRINT_PHOTO` ke kiosk nyata. | **DICEGAT PENUH:** Fungsi `testPrintSimulation()` tidak mengirim HTTP request apa pun, melainkan mengembalikan preview feedback visual lokal. | **VERIFIED (Safeguard Protected)** |
| `/api/v1/kiosk/printing-config` | `GET` | Endpoint konsumsi Photobooth Web Bluetooth untuk membaca `paper_size`, `thermal_density`, `thermal_offset_x_px`, `print_sharpen`, dsb. | Skema dan penamaan field pada Admin Dian 100% selaras dengan endpoint konsumsi ini. | **VERIFIED (Source Audit)** |

#### Pembedaan Status Alur:
1. **Alur Teruji Penuh (Automated Unit & Mock Transport):** Validasi payload, pencegahan injeksi shell command, pembatasan numerik, penanganan response schema, serialisasi/deserialisasi, dan isolasi multi-kiosk.
2. **Alur Terverifikasi Melalui Audit Source Code:** Hubungan controller backend (`printingConfigController.js`), model database (`kioskPrintingConfigModel.js`), dan konsumsi photobooth (`unismiles-photobooth/services/oneBitImage.ts`).
3. **Alur yang Belum Diuji (Memerlukan Hardware / Staging Fisik):** Transmisi frame biner via Web Bluetooth ke printer NIIMBOT fisik, feeding kertas fisik, gap sensor detection, dan pengiriman socket `PRINT_PHOTO` antar server dan kiosk agent.

---

### 6. Bukti Pengujian Otomatis (Test Evidence)

Seluruh 9 test suites dieksekusi secara berurutan dan lulus tanpa kegagalan:

```text
================================================================
CUMULATIVE TEST SUITE VERIFICATION REPORT
================================================================
1. tests/stage2_fixes.test.ts                 :  88 PASSED (0 FAILED)
2. tests/stage3b_safeguard.test.ts             :  72 PASSED (0 FAILED)
3. tests/stage3c_isolated_integration.test.ts  :  76 PASSED (0 FAILED)
4. tests/stage3d_asset_integration.test.ts     :  74 PASSED (0 FAILED)
5. tests/stage3e_e2e_compatibility.test.ts     : 222 PASSED (0 FAILED)
6. tests/stage3e_revisions.test.ts             : 211 PASSED (0 FAILED)
7. tests/stage3g_safe_staging.test.ts          : 190 PASSED (0 FAILED)
8. tests/stage4_printer_ui.test.ts             :  88 PASSED (0 FAILED)
9. tests/stage4c_printer_simulation.test.ts    : 116 PASSED (0 FAILED)
----------------------------------------------------------------
TOTAL KESELURUHAN                             : 1.137 ASSERTIONS (100% PASS)
EXIT CODE                                     : 0
----------------------------------------------------------------
BUILD STATUS (npm run build)                   : SUCCESS (1.87s)
LINT STATUS (npm run lint)                     : SUCCESS (0 errors)
================================================================
```

---

### 7. Safeguard Keamanan yang Wajib Dipertahankan

Pengembang atau DevOps **DILARANG** memodifikasi nilai konfigurasi berikut sebelum seluruh syarat pengujian fisik dan izin staging formal terpenuhi:

1. **Backend Mutation Safeguard (`src/lib/templates.ts`):**
   ```typescript
   export const ENABLE_BACKEND_MUTATIONS = false;
   export const VERIFIED_STAGING_ALLOWLIST: readonly string[] = [];
   ```
2. **Printer Profiles Hardware Verification (`src/lib/printPapers.ts`):**
   ```typescript
   NIIMBOT_B1_PRO_PROFILE.isVerifiedHardware = false;
   GENERIC_THERMAL_PROFILE.isVerifiedHardware = false;
   PHOTO_DYESUB_PROFILE.isVerifiedHardware = false;
   ```
3. **Payload Sanitizer & Forbidden Fields (`src/lib/printerService.ts`):**
   - Menolak keras field `command`, `shell_command`, `executable_path`, `script`, `driver_command`.
   - Menolak ukuran kertas termal $W > 60\text{ mm}$ atau $H \notin [8, 350]\text{ mm}$.

---

### 8. Open Risks & Blockers (Keterbatasan & Risiko Terbuka)

| No | Risiko / Keterbatasan | Dampak Teknis | Status | Mitigasi yang Diterapkan |
| :---: | :--- | :--- | :---: | :--- |
| 1 | **Server Staging Terisolasi Belum Ada** | Mutasi HTTP nyata ke backend tidak dapat diaktifkan. | **OPEN BLOCKER** | Mutasi ditahan secara fail-closed pada level service (`ENABLE_BACKEND_MUTATIONS = false`). |
| 2 | **Database Mutasi Belum Diuji Riil** | Belum ada verifikasi penulisan baris nyata ke tabel `kiosk_printing_configs`. | **OPEN BLOCKER** | Diverifikasi menggunakan isolated mock HTTP transport yang mereplikasi skema tabel. |
| 3 | **Verifikasi Hardware Fisik Belum Dilakukan** | Kepekatan bakar termal, toleransi geser feeding kertas, dan deteksi label belum teruji pada printer fisik. | **OPEN BLOCKER** | Seluruh profil printer dikunci pada status `isVerifiedHardware: false` dengan label `"Estimasi Simulasi"`. |
| 4 | **Penyimpanan Draft Berbasis LocalStorage** | Konfigurasi tersimpan pada browser operator per-kiosk; jika cache browser dibersihkan, data kembali ke default. | **LIMITATION** | Memisahkan key storage per-kiosk (`STORAGE_PREFIX + kioskId`) dan menyertakan tombol simpan yang jelas. |
| 5 | **Pengujian Touchscreen Kiosk Belum Manual** | Gestur multi-touch dan orientasi portrait display belum diverifikasi langsung pada hardware photobooth fisik. | **LIMITATION** | Komponen UI dibangun dengan Tailwind CSS responsif dan telah divalidasi pada dev server browser. |
| 6 | **Integrasi WebSocket Kiosk Agent Belum Live** | Penerimaan frame socket `PRINT_PHOTO` pada kiosk-agent belum diuji secara end-to-end dengan kiosk photobooth. | **OPEN BLOCKER** | Pengujian test print dialihkan murni ke visual preview feedback tanpa memicu event socket. |

---

### 9. Manual Browser Acceptance Checklist

Panduan pengujian manual pada browser lokal (`http://localhost:5173`):

- [ ] **Akses Halaman:** Buka menu Kiosks $\rightarrow$ Pilih Kiosk $\rightarrow$ Tab **Printer Configuration**.
- [ ] **Status Indikator:** Pastikan label status menampilkan *Kiosk Online* atau *Kiosk Offline* sesuai data kiosk.
- [ ] **Pemilihan Adapter:** Pilih adapter *Thermal Label Printer (NIIMBOT B1/B1 Pro)*; periksa apakah field printer name dapat diisi.
- [ ] **Katalog Kertas:** Pilih preset `54 × 67 mm — SNS (bingkai)`; periksa apakah margin terisi otomatis (Top 71px, Right 83px, Left 0px, Bottom 165px).
- [ ] **Custom Paper Validation:** Masukkan `CUSTOM 70X100 MM`; pastikan toast error muncul (*Lebar 70 mm melebihi lebar kertas maksimum 60 mm*).
- [ ] **Live Dithering Preview:**
  - Pilih gambar sampel atau gunakan kamera lokal.
  - Geser slider *Photo Brightness* dan *Thermal Density*.
  - Periksa perubahan raster monokrom 1-bit Floyd-Steinberg pada kanvas secara real-time.
  - Ganti algoritma grayscale (misal *Rec.709* atau *Green*); amati kontras area wajah.
- [ ] **Simulasi Test Print:** Klik tombol *Test Print*; pastikan muncul toast notifikasi simulasi aman dengan ID pekerjaan (`SIM-TEST-...`) dan tidak ada error jaringan pada tab Network.
- [ ] **Isolasi Multi-Kiosk:** Ganti kiosk ID pada navigasi; pastikan pengaturan kiosk sebelumnya tidak bocor ke kiosk baru.

---

### 10. Syarat Sebelum Aktivasi Lingkungan Staging & Printer Fisik

#### Syarat Aktivasi Backend Staging:
1. Tersedia instance backend staging dengan host URL terpisah dan database terisolasi (bukan clone dua arah dari database produksi).
2. Host staging didaftarkan secara eksplisit ke dalam `VERIFIED_STAGING_ALLOWLIST` di [src/lib/templates.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/templates.ts).
3. Surat persetujuan tertulis dari pemilik sistem untuk pengujian mutasi aktif.
4. Nilai `ENABLE_BACKEND_MUTATIONS` diubah menjadi `true`.

#### Syarat Pengujian Hardware Fisik:
1. Perangkat printer label termal NIIMBOT B1 Pro fisik telah terpasang dengan gulungan kertas label resmi (54 × 67 mm).
2. Dilakukan kalibrasi mekanis terhadap titik 0 kepala cetak (576 dots / 48,77 mm) dan margin fisik label.
3. Hasil cetak fisik diukur menggunakan mistar/jangka sorong untuk memverifikasi akurasi koordinat kanvas $555 \times 555\text{ px}$.
4. Jika hasil pengukuran fisik cocok, nilai `isVerifiedHardware` pada profil printer dapat diubah menjadi `true`.

---

### 11. Rekomendasi Langkah Berikutnya

1. **Penutupan Modul 3:**  
   Menyetujui penutupan Modul 3 pada status **SIMULATION & CONTRACT READY**.
2. **Handover ke Pengujian Lab / Staging:**  
   Menunggu ketersediaan lingkungan staging terisolasi dan pengujian perangkat keras fisik sebelum merencanakan deployment produksi.
3. **Transisi ke Modul 4 (Jadwal Operasional / Pengaturan Lanjutan):**  
   Melanjutkan ke modul berikutnya sesuai rencana integrasi UNISMILES tanpa membuka safeguard Modul 1, Modul 2, maupun Modul 3.

---
*Dokumen ini disusun sebagai catatan resmi serah terima Modul 3 UNISMILES Integration pada status aman, terverifikasi, dan bebas regresi.*
