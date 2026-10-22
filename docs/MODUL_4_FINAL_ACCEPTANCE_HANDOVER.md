# DOKUMEN PENUTUPAN & SERAH TERIMA MODUL 4
## Kiosk Management, Device Authentication UI, & Operational Configuration

- **Repository Utama:** `diantsdaeli/UNISMILES-ADMIN`
- **Branch:** `feature/unismiles-integration`
- **Baseline Commit Tahap 4D:** `317027f3175b8b4000473b6cbbe59ecf653626e1`
- **Tanggal Selesai:** 22 Oktober 2026
- **Status Akhir Penutupan:** **MODUL 4 — SIMULATION & CONTRACT READY (1.389 Automated Assertions PASS)**

---

### 1. Executive Summary

Modul 4 mengintegrasikan fitur **Kiosk Management, Device Authentication UI, dan Operational Configuration** pada portal Admin Dian (`diantsdaeli/UNISMILES-ADMIN`) yang diadaptasi dari referensi Admin Nadin (`nathaniapelleng15/admin_uni_gateway`), diselaraskan dengan kontrak Backend Gateway (`nathaniapelleng15/backend_uni_gateway`), dan disinkronkan dengan arsitektur Kiosk Photobooth (`nathaniapelleng15/frontend_uni_gateway`).

Pencapaian utama Modul 4 meliputi:
1. **Tahap 4A (Audit Arsitektur & Kontrak):** Pemetaan spesifikasi kontrak REST API backend, model autentikasi `x-api-key`, struktur database `kiosks` dan `kiosk_printing_configs`, alur telemetri hardware, serta identifikasi mitigasi fail-closed terhadap mutasi produksi.
2. **Tahap 4B (UI, Kredensial Aman, & Telemetri Deterministik):** Pembaruan antarmuka Kiosk Registration, modal Device Credentials aman dengan masking token dan salin `.env`, eliminasi total `Math.random()`, helper kalkulasi status deterministik (`getComputedStatus`) dan normalisasi telemetri (`normalizeKioskTelemetry`), modal konfirmasi soft delete destruktif dengan ketik nama kiosk, toggle Maintenance Mode cepat, preservasi seluruh 8 tab konfigurasi, penegakan RBAC, serta penambahan automated test suite (120 assertions).
3. **Tahap 4C (Safe Simulation & Backend Contract Tests):** Validasi kesiapan kontrak backend menggunakan mock transport terisolasi (`createMockClient`) dan fake WebSocket server (`FakeWebSocketServer`). Pengujian menyeluruh terhadap `POST /admin/kiosks`, `GET /admin/kiosks/:id`, `PUT /admin/kiosks/:id`, `POST /admin/kiosks/:id/regenerate-key`, `DELETE /admin/kiosks/:id`, `POST /kiosk/heartbeat`, `POST /admin/kiosks/:id/commands`, semantik pembatalan kunci (*revocation*), sanitasi secret bertingkat, penolakan token simulasi sebagai token produksi, dan pengujian negatif fail-closed (132 assertions).

Status akhir Modul 4 dinyatakan sebagai:
> **MODUL 4 — SIMULATION & CONTRACT READY**  
> *(Bukan PRODUCTION READY dan Bukan HARDWARE VERIFIED)*  
> Seluruh antarmuka pengguna, validasi input, sanitasi kredensial, kalkulasi status deterministik, dan kompatibilitas kontrak backend telah teruji secara komprehensif melalui 1.389 assertions lulus 100% tanpa regresi. Namun, mutasi HTTP riil ke backend produksi dan interaksi perangkat fisik tetap diblokir secara fail-closed hingga lingkungan staging resmi dan otorisasi tertulis tersedia.

---

### 2. Scope & Riwayat Commit Modul 4

| Tahap | Commit Hash | Pesan Commit | Ruang Lingkup Utama | Assertions |
| :--- | :---: | :--- | :--- | :---: |
| **Modul 3 Baseline** | `3a84609` | `docs(printer): finalize module 3 acceptance and handover` | Handover penutupan Modul 3 (Printer Configuration) | 1.137 |
| **Tahap 4A** | `3a84609` | *(Audit Arsitektur & Kontrak)* | Audit kontrak backend kiosk, endpoint routes, skema DB, dan socket server | 1.137 |
| **Tahap 4B** | `5fc66ae` | `feat(kiosk): integrate safe kiosk management UI and deterministic telemetry` | Registration UI, Credentials Modal, deterministic status, soft delete, RBAC, 8 tabs preservation | 1.257 (+120) |
| **Tahap 4C** | `317027f` | `feat(kiosk): validate safe kiosk backend contracts and simulations` | Mock transport, fake WS, contract verification, error codes (400-500), key revocation semantics | 1.389 (+132) |

---

### 3. Arsitektur Integrasi Empat Repository

Integrasi Modul 4 menghubungkan arsitektur 4 repository dengan batasan isolasi ketat:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Admin Dian Portal (UI)                          │
│                                                                        │
│   [KioskManager] ──► [DeviceCredentialModal] ──► [DeleteConfirmModal]  │
│   [KioskConfigPage] ──► 8 Tabs (Hardware, Printer, Pricing,            │
│                         Customization, Branding, Operasional,          │
│                         Gallery, Display)                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         kioskService Layer
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Safe Service Layer                              │
│                                                                        │
│   1. validateKioskRegistration()       [Name, Price, ID format]        │
│   2. serializeKioskPayload()           [Contract Compliance, BasePrice]│
│   3. deserializeKioskResponse()        [Envelope & Status Normalizer]  │
│   4. getComputedStatus()               [Deterministic Heartbeat Calc]  │
│   5. normalizeKioskTelemetry()         [Null-Safe Hardware Telemetry]  │
│   6. getKioskCredentials()             [Masked / Unavailable Guard]    │
│   7. filterKiosksByRole()              [RBAC Isolation Helper]         │
│   8. parseKioskApiError()              [400/401/403/404/409/500 Parser]│
│   9. auditKioskOperationSafety()       [Anti-Physical Execution Guard] │
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
localStorage (Sanitized)  Fake WebSocket Server   Backend API Staging
(api_key, secrets stripped) (Zero Physical Port)  (BLOCKED: Allowlist = [])
```

---

### 4. Hasil Tahap 4A, 4B, dan 4C

#### Tahap 4A: Kiosk Architecture & Backend Contract Audit
- Menganalisis `kioskController.js` pada `backend_uni_gateway`. Menemukan bahwa `base_price` bernilai default `0` di backend jika tidak dikirimkan, sehingga tidak boleh dijadikan validasi rigid wajib basis data di frontend.
- Mengidentifikasi format token backend riil adalah `kiosk_<32_hex>` yang dihasilkan via `crypto.randomBytes(16).toString('hex')`.
- Memetakan middleware keamanan `apiKeyMiddleware.js` dan `kioskAuthMiddleware.js` (`x-api-key`), serta mekanisme rotasi token di mana token lama seketika tidak berlaku (*revocation*).
- Menetapkan aturan pemisahan token simulasi: format `SIMULATED_DEVICE_TOKEN_NOT_VALID_${kioskId}` untuk mencegah token simulasi diterima oleh backend autentikasi produksi.

#### Tahap 4B: Kiosk Management UI & Safe Device Credential Integration
- Mengembangkan antarmuka pendaftaran kiosk baru yang mendukung Name, Location, Base Price (Rp), dan Device ID kustom opsional (`KSK-*`).
- Membangun `DeviceCredentialModal` dengan fitur masking token bawaan, toggle Eye/EyeOff, tombol salin token, tombol salin format `.env` (`DEVICE_ID=... \n DEVICE_TOKEN=...`), serta peringatan simulasi aman.
- Mengeliminasi 100% pemanggilan `Math.random()` pada status dan telemetri kiosk. Menggantikannya dengan `getComputedStatus` dan `normalizeKioskTelemetry`.
- Membangun modal konfirmasi destruktif soft delete yang mengharuskan operator mengetik nama kiosk secara persis sebelum tombol hapus aktif.
- Menambahkan toggle Maintenance Mode pada Kiosk Manager dan tab Operasional di KioskConfigPage.
- Mempertahankan seluruh 8 tab konfigurasi pada KioskConfigPage tanpa ada parameter yang hilang atau terhapus.
- Menambahkan test suite `stage5_kiosk_management.test.ts` (120 assertions PASS).

#### Tahap 4C: Safe Simulation & Backend Contract Validation
- Mengembangkan mock transport client (`createMockClient`) dan in-memory WebSocket server (`FakeWebSocketServer`) terisolasi tanpa akses jaringan luar.
- Memvalidasi skema respon dan kode error HTTP backend: 200 (Success), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 500 (Internal Server Error), dan timeout `ECONNABORTED`.
- Menguji semantik pembatalan kunci (*token revocation*): token lama seketika ditolak saat rotasi token dilakukan.
- Menguji sanitasi secret bertingkat (`api_key`, `credentials`, `deviceToken`, `token`, `secret`) dari objek yang disimpan ke browser storage.
- Menguji penanganan aman `"Credential unavailable"` untuk kiosk tanpa kredensial (`hasCredentials: false`).
- Menjalankan negative tests penegakan fail-closed: mutasi terhadap host produksi (`api.uniinside.net`, `backend-photobooth.uniinside.net`) maupun unverified host langsung ditolak seketika.
- Menambahkan test suite `stage5c_kiosk_contract.test.ts` (132 assertions PASS).

---

### 5. Feature Acceptance Matrix

Audit penerimaan teknis terhadap 10 pilar fitur Modul 4:

| No | Fitur / Komponen | Klasifikasi | Bukti Implementasi & File Uji |
| :---: | :--- | :---: | :--- |
| 1 | **Kiosk Registration UI** | **PASS** | Form registrasi di [KioskManager.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskManager.tsx#L250-L380), validasi input di [kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts#L70-L130). Teruji di `tests/stage5_kiosk_management.test.ts` Section 1. |
| 2 | **Device Credentials Modal** | **PASS** | [DeviceCredentialModal.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/DeviceCredentialModal.tsx): Masking default, toggle mata, salin token, salin format `.env`, safe simulation banner. Teruji di `tests/stage5_kiosk_management.test.ts` Section 2. |
| 3 | **Safe Key Rotation Simulation** | **PASS** | `regenerateCredentialSimulation()` di [kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts#L410-L425), konfirmasi dialog rotasi token di modal. Teruji di `tests/stage5c_kiosk_contract.test.ts` Section 3. |
| 4 | **Deterministic Heartbeat** | **PASS** | `getComputedStatus()` dan `formatLastHeartbeat()` di [kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts#L140-L225). Zero `Math.random()`. Teruji di `tests/stage5_kiosk_management.test.ts` Section 4 & `tests/stage5c_kiosk_contract.test.ts` Section 5. |
| 5 | **Telemetry Normalization** | **PASS** | `normalizeKioskTelemetry()` di [kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts#L230-L290). Data kosong dikembalikan `null` (`Unknown`/`N/A`), bukan 0% atau GOOD. Teruji di `tests/stage5_kiosk_management.test.ts` Section 5. |
| 6 | **Operational Configuration** | **PASS** | Parameter `operatingHours`, `autoRestart`, dan seluruh 8 tab konfigurasi di [KioskConfigPage.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskConfigPage.tsx) terpelihara utuh. Teruji di `tests/stage5_kiosk_management.test.ts` Section 10. |
| 7 | **Maintenance Mode Toggle** | **PASS** | Tombol cepat Wrench di [KioskManager.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskManager.tsx#L490) dan switch toggle di tab Operasional [KioskConfigPage.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskConfigPage.tsx#L1195). Teruji di `tests/stage5_kiosk_management.test.ts` Section 7. |
| 8 | **Soft Delete Confirmation** | **PASS** | [DeleteKioskConfirmModal.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/DeleteKioskConfirmModal.tsx): Mengharuskan pengetikan nama kiosk secara persis. Teruji di `tests/stage5_kiosk_management.test.ts` Section 8. |
| 9 | **RBAC & Multi-Kiosk Isolation** | **PASS** | `filterKiosksByRole()` di [kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts#L300-L330). Super Admin melihat semua; Admin Mitra hanya melihat miliknya. Teruji di `tests/stage5_kiosk_management.test.ts` Section 6 & `tests/stage5c_kiosk_contract.test.ts` Section 8. |
| 10 | **Backend Contract Mock Tests** | **PASS** | [tests/stage5c_kiosk_contract.test.ts](file:///Users/dian/TA/UNISMILES-ADMIN/tests/stage5c_kiosk_contract.test.ts): Pengujian isolated HTTP transport & fake WebSocket server (132 assertions). |
| 11 | **Live Database Gateway Sync** | **PARTIAL** | Persistensi basis data MySQL gateway belum teruji live end-to-end karena lingkungan staging belum aktif. Draf lokal & memory state teruji. |
| 12 | **Live Physical Hardware Daemon** | **BLOCKED** | Eksekusi remote restart/shutdown fisik dan pencetakan printer fisik sengaja diblokir fail-closed demi keselamatan aset produksi. |

**Ringkasan Status Penerimaan:**
- **PASS (Teruji Kode & Simulasi):** 10 / 10 Fitur Utama
- **PARTIAL (Menunggu Akses Staging):** 1 Item (MySQL Persistence)
- **BLOCKED (Safeguard Keselamatan):** 1 Item (Physical Daemon & Printer Execution)

---

### 6. Backend Contract Coverage

Pemetaan detail kesesuaian implementasi terhadap kontrak backend gateway:

| Endpoint | Method | Request Payload | Response Envelope | Error Codes Didukung |
| :--- | :---: | :--- | :--- | :---: |
| `/api/v1/admin/kiosks` | `POST` | `{ name, location, price, base_price, id, orientation, config }` | `{ success: true, message, data: { id, name, ..., deviceToken, api_key } }` | 400, 401, 403, 409, 500 |
| `/api/v1/admin/kiosks` | `GET` | *(Query string optional)* | `{ success: true, count, data: [ ...kiosks ] }` | 401, 403, 500 |
| `/api/v1/admin/kiosks/:id` | `GET` | Params: `id` | `{ success: true, data: kiosk }` | 400, 401, 404 (stealth) |
| `/api/v1/admin/kiosks/:id` | `PUT` | `{ name, location, price, base_price, orientation, config }` | `{ success: true, message, data: updatedKiosk }` | 400, 401, 404 (stealth) |
| `/api/v1/admin/kiosks/:id/regenerate-key` | `POST` | Params: `id` | `{ success: true, message, data: { id, deviceToken, api_key } }` | 401, 404 (stealth) |
| `/api/v1/admin/kiosks/:id` | `DELETE` | Params: `id` | `{ success: true, message }` | 401, 404 (stealth) |
| `/api/v1/kiosk/heartbeat` | `POST` | `{ printerInk, inkLevel, storage, storageUsedPercent, camera, cameraStatus }` | `{ success: true, message, data: { kiosk_id, status, server_time, kiosk } }` | 401, 403 (offline), 500 |
| `/api/v1/admin/kiosks/:id/commands` | `POST` | `{ command, payload }` | `{ success: true, message, data: { kioskId, command, payload, dispatched, isOnline, timestamp } }` | 400, 401, 403 (role), 404, 413 |

---

### 7. Device Credential Lifecycle

Siklus hidup kredensial perangkat dirancang dengan prinsip *defense-in-depth*:

1. **Penerbitan Kredensial (Issuance):**
   - Backend produksi menerbitkan token acak 128-bit berformat `kiosk_<32_hex>`.
   - Pada mode simulasi, sistem menghasilkan token eksplisit: `SIMULATED_DEVICE_TOKEN_NOT_VALID_${kioskId}`. Token ini secara matematis ditolak oleh regex autentikasi backend riil.
2. **Penyajian & Tampilan Antarmuka (Presentation):**
   - Token disajikan dalam `DeviceCredentialModal` dalam keadaan ter-masking (`••••••••••••••••••••••••••••••••••••••••`).
   - Operator dapat melakukan unmask sementara menggunakan tombol Eye/EyeOff.
   - Peringatan keamanan tegas (*Safe Simulation Active*) menginformasikan operator bahwa kredensial adalah token simulasi.
3. **Interaksi Papan Klip (Clipboard Interaction):**
   - Akses `navigator.clipboard.writeText()` hanya dipicu oleh klik eksplisit operator (*user gesture*).
   - Format salin `.env` otomatis menyusun snippet konfigurasi:
     ```bash
     # UNISMILES Photobooth Kiosk Configuration
     DEVICE_ID=KSK-0001
     DEVICE_TOKEN=SIMULATED_DEVICE_TOKEN_NOT_VALID_KSK-0001
     ```
4. **Pembersihan State Sensitif (State Sanitization):**
   - Ketika modal ditutup, seluruh nilai sementara (`copiedToken`, `copiedId`, `copiedEnv`, konfirmasi rotasi) di-reset ke nilai default.
   - Sanitasi bertingkat sebelum persistensi browser: field `api_key`, `apiKey`, `credentials`, `deviceToken`, `token`, dan `secret` distrip secara rekursif sebelum serialisasi ke `localStorage`.
5. **Rotasi & Pembatalan Kunci (Rotation & Revocation):**
   - Dialog konfirmasi memperingatkan operator bahwa rotasi token akan memutus sambungan kiosk fisik yang sedang aktif.
   - Pada backend gateway, penyimpanan token baru secara instan membatalkan token lama (*revocation*). Reconnect kiosk dengan token lama seketika ditolak dengan HTTP 401 / 403.
6. **Graceful Unavailable Handling:**
   - Jika kredensial kiosk tidak tersedia (`hasCredentials: false`), sistem tidak mengarang token palsu, melainkan merender pesan informatif: *"Credential unavailable — Kredensial untuk kiosk ini belum tersedia pada sistem atau belum pernah diterbitkan."*

---

### 8. Heartbeat & Telemetry Architecture

Logika telemetri lama yang menggunakan `Math.random()` telah dihapus 100% dan digantikan oleh engine evaluasi deterministik:

```
[Heartbeat Timestamp Input]
          │
          ▼
Is timestamp null / invalid / future (>5m)? ──► YES ──► Status: 'unknown'
          │
          NO
          ▼
Selisih waktu (diffMin):
  ├─ diffMin < 2 menit  ──► Is Socket Connected Known Disconnected?
  │                            ├─ YES ──► Status: 'idle' (Socket Down)
  │                            └─ NO  ──► Status: 'online'
  ├─ 2 <= diffMin < 10 menit ───────────► Status: 'idle'
  └─ diffMin >= 10 menit ───────────────► Status: 'offline'
```

- **Formatting Relatif:** `formatLastHeartbeat` mengonversi selisih detik menjadi teks informatif (baru saja, $x$ dtk lalu, $x$ mnt lalu, $x$ jam lalu, $x$ hari lalu).
- **Normalisasi Nilai Kosong:** Jika telemetri hardware printer, storage, atau kamera tidak dilaporkan, sistem mengembalikan `null` sehingga antarmuka menampilkan `'Unknown'` atau `'N/A'`, bukan mengarang nilai palsu `0%` atau status `'GOOD'`.

---

### 9. Operational Configuration Mapping

Preservasi seluruh parameter konfigurasi 8 tab pada [KioskConfigPage.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskConfigPage.tsx):

1. **Hardware:** Konfigurasi legacy printer type (4x6 / Strip), camera device, audio input/output, hardware test button.
2. **Printer Configuration (Modul 3):** Preset ukuran kertas (14 katalog), kalibrasi foto (kecerahan, kontras, saturasi), kalibrasi termal (densitas, offset X/Y), 9 algoritma dithering Floyd-Steinberg, tombol layar akhir kiosk (`show_email_button`, `show_retake_button`, `show_print_button`), dan simulasi cetak.
3. **Pricing:** Tarif sesi cetak, tarif salinan digital, harga dasar kiosk (`base_price`), paket sesi.
4. **Customization:** Filter warna foto, stiker scrapbook (25 katalog cute SVG), pengaturan watermark.
5. **Branding:** Brand logo, idle screen welcome media (gambar / video MP4), custom UI theme colors.
6. **Operasional:** Toggle `maintenanceMode`, jam operasional (`operatingHours: { open, close }`), waktu auto-restart harian (`autoRestart: '03:00'`), email notifikasi darurat.
7. **Gallery:** Katalog template aktif, preview template cetak, sync template per-kiosk.
8. **Display:** Pengaturan orientasi (`PORTRAIT 1080x1920` / `LANDSCAPE 1920x1080`), rasio aspek, sinkronisasi orientasi massal ke kiosk terpilih.

---

### 10. RBAC & Multi-Kiosk Isolation

- **Super Admin:** Memiliki hak akses penuh untuk melihat seluruh kiosk pada sistem, mendaftarkan kiosk baru, mengubah konfigurasi, merotasi kunci, dan menghapus kiosk.
- **Admin Mitra (Partner Admin):** Hanya dapat melihat dan mengelola kiosk yang terikat dengan identitas kepemilikannya (`kiosk.user_id === user.id`).
- **Stealth 404 Protection:** Backend gateway tidak mengembalikan HTTP 403 saat Admin Mitra mengakses ID kiosk milik pengguna lain, melainkan mengembalikan HTTP 404 (*Not Found*) untuk mencegah kebocoran informasi keberadaan kiosk (*anti-enumeration*).
- **Disclaimer Antarmuka:** UI menyertakan catatan transparansi bahwa pemfilteran client adalah alat visualisasi operator, dan pembuktian isolasi data sejati tetap ditegakkan oleh validasi token JWT serta query basis data backend gateway.
- **Isolasi State Antar-Kiosk:** Mutasi pada Kiosk A (misalnya pergantian orientasi layar atau toggle maintenance mode) tidak pernah memengaruhi atau mengubah parameter Kiosk B.

---

### 11. Security Safeguards Verification

| Safeguard Parameter | Nilai Konfigurasi | Mekanisme Penegakan |
| :--- | :---: | :--- |
| `ENABLE_BACKEND_MUTATIONS` | `false` | Memblokir secara mutlak seluruh request HTTP `POST`, `PUT`, `DELETE` ke backend produksi. |
| `VERIFIED_STAGING_ALLOWLIST` | `[]` | Menolak seluruh host staging sampai ada bukti tertulis isolasi fisik basis data. |
| **Production Host Blacklist** | `api.uniinside.net`, `backend-photobooth.uniinside.net` | Deteksi otomatis URL produksi melempar exception `PERLINDUNGAN PRODUKSI`. |
| **Token Sanitization** | Rekursif | Menghapus `api_key`, `credentials`, `deviceToken`, `secret` sebelum disimpan ke `localStorage`. |
| **Safe Simulation Token** | `SIMULATED_DEVICE_TOKEN_NOT_VALID_*` | Pola token simulasi tidak dapat digunakan untuk membobol autentikasi gateway backend. |
| **Zero Hardware Hooks** | `auditKioskOperationSafety()` | Perintah reboot fisik, shutdown fisik, pemutusan socket fisik, dan pencetakan fisik terblokir aman. |

---

### 12. Regression Test Results

Eksekusi seluruh 11 automated test suites (`npm test`) menghasilkan kelulusan 100%:

```text
================================================================
REKAPITULASI PENGUJIAN REGRESI 11 TEST SUITES
================================================================
Suite 1  (tests/stage2_fixes.test.ts)              :  88 assertions PASS [0 FAIL]
Suite 2  (tests/stage3b_safeguard.test.ts)         :  72 assertions PASS [0 FAIL]
Suite 3  (tests/stage3c_isolated_integration.test) :  76 assertions PASS [0 FAIL]
Suite 4  (tests/stage3d_asset_integration.test.ts) :  74 assertions PASS [0 FAIL]
Suite 5  (tests/stage3e_e2e_compatibility.test.ts) : 222 assertions PASS [0 FAIL]
Suite 6  (tests/stage3e_revisions.test.ts)         : 211 assertions PASS [0 FAIL]
Suite 7  (tests/stage3g_safe_staging.test.ts)      : 190 assertions PASS [0 FAIL]
Suite 8  (tests/stage4_printer_ui.test.ts)         :  88 assertions PASS [0 FAIL]
Suite 9  (tests/stage4c_printer_simulation.test.ts): 116 assertions PASS [0 FAIL]
Suite 10 (tests/stage5_kiosk_management.test.ts)   : 120 assertions PASS [0 FAIL]
Suite 11 (tests/stage5c_kiosk_contract.test.ts)    : 132 assertions PASS [0 FAIL]
================================================================
TOTAL KESELURUHAN: 1.389 ASSERTIONS PASS (0 FAILED, EXIT CODE 0)
================================================================
```

Hasil build dan linting:
- **`npm run lint` (`tsc --noEmit`):** PASS (0 error).
- **`npm run build` (`vite build`):** PASS (2.829 modul ter-transformasi, dist bersih dalam 1.83 detik).

---

### 13. Known Limitations

1. **Local Storage Draft Persistence:** Penambahan kiosk baru atau pengeditan parameter operasional saat ini tersimpan dalam state aplikasi (`KioskContext`) dan draft lokal browser operator. Refresh browser dengan membersihkan storage akan mereset data ke seed mock kiosk awal.
2. **Koneksi Live WebSocket Daemon:** Status koneksi socket saat ini disimulasikan secara deterministik berdasarkan ketersediaan telemetri terakhir. Live WebSocket streaming dengan kiosk agent fisik belum aktif di runtime client.
3. **Frontend Filtering Boundary:** Pemfilteran antarmuka berdasarkan hak akses mitra telah diuji ketat, namun proteksi data sejati tetap bergantung pada validasi JWT middleware dan query `WHERE user_id = ?` pada backend gateway.

---

### 14. Production Readiness Checklist

Item-item yang wajib diverifikasi sebelum aktivasi lingkungan produksi di masa mendatang:

- [ ] **Isolated Staging Backend Environment:** Tersedianya server staging backend dengan URL resmi terdaftar di `VERIFIED_STAGING_ALLOWLIST`.
- [ ] **MySQL Database Persistence:** Verifikasi persistensi tabel `kiosks` dan `kiosk_printing_configs` pada database MySQL gateway.
- [ ] **Live Kiosk Heartbeat Stream:** Pengujian live heartbeat ping interval 60 detik dari kiosk hardware nyata.
- [ ] **Live WebSocket Event Propagation:** Pengujian event socket `kiosk:updated`, `kiosk:created`, dan `kiosk:deleted` ke dashboard Admin.
- [ ] **Backend RBAC Enforcement:** Pengujian penetrasi otorisasi role Admin Mitra pada endpoint gateway secara langsung.
- [ ] **Live Credential Rotation & Revocation:** Pengujian pemutusan sambungan fisik kiosk ketika token dirotasi oleh operator Admin.
- [ ] **Live Soft Delete Behavior:** Pengujian isolasi data sesi dan laporan keuangan saat kiosk dinonaktifkan di database produksi.
- [ ] **Physical Hardware & Printer Verification:** Pengujian fisik integrasi printer DNP / thermal dan kamera DSLR / WebRTC pada hardware photobooth sesungguhnya.

---

### 15. Remaining Risks

1. **Risk of Accidental Key Regeneration:** Jika operator merotasi kunci pada kiosk yang sedang beroperasi di lokasi umum, kiosk photobooth fisik akan terputus hingga file `.env` di kiosk diperbarui secara manual oleh teknisi lapangan.
2. **Clock Drift on Kiosk Hardware:** Jika sistem operasi kiosk memiliki deviasi jam sistem lebih dari 5 menit terhadap server backend, status kiosk dapat terhitung secara keliru sebagai `'unknown'`.
3. **Database Schema Drift:** Jika tabel `kiosks` di backend gateway mengalami penambahan kolom wajib baru yang belum ada pada antarmuka admin, proses pendaftaran kiosk dapat ditolak oleh backend MySQL.

---

### 16. Handover Notes

- **Struktur Kode Modul 4:**
  - [src/lib/kioskService.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/kioskService.ts): Service layer mandiri untuk seluruh operasi kiosk, validasi, telemetri, kredensial, dan RBAC.
  - [src/KioskContext.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/KioskContext.tsx): State provider yang mengelola daftar kiosk, sanitasi secret, dan timer evaluasi status deterministik.
  - [src/pages/KioskManager.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskManager.tsx): Halaman utama manajemen stasiun photobooth remote.
  - [src/pages/KioskConfigPage.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/pages/KioskConfigPage.tsx): Halaman konfigurasi 8 tab terpadu.
  - [src/components/DeviceCredentialModal.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/DeviceCredentialModal.tsx): Modal kredensial perangkat yang aman.
  - [src/components/DeleteKioskConfirmModal.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/DeleteKioskConfirmModal.tsx): Modal konfirmasi destruktif soft delete.
  - [tests/stage5_kiosk_management.test.ts](file:///Users/dian/TA/UNISMILES-ADMIN/tests/stage5_kiosk_management.test.ts): Automated test suite UI & Telemetri.
  - [tests/stage5c_kiosk_contract.test.ts](file:///Users/dian/TA/UNISMILES-ADMIN/tests/stage5c_kiosk_contract.test.ts): Automated test suite Contract & Mock WebSocket.
- **Penyimpanan Secret:** Kredensial tidak pernah disimpan dalam bentuk plaintext di persistent storage publik browser, URL parameter, konsol log, atau analytics tracking.

---

### 17. Rekomendasi Transisi ke Modul Berikutnya

Dengan selesainya Modul 4 (Kiosk Management, Device Credentials, & Operational Configuration) dengan status **SIMULATION & CONTRACT READY**, seluruh fondasi stasiun photobooth dan autentikasi perangkat telah kokoh.

Rekomendasi untuk tahap selanjutnya:
- **Kandidat Modul Berikutnya (Modul 5: Session Management & Photo Repository):** Menjadi kandidat modul berikutnya untuk integrasi manajemen sesi pemotretan pelanggan (`/sessions`), verifikasi pembayaran sandbox/live (`/sessions/:code/payment`), repositori foto hasil cetak, dan pengiriman salinan digital via email (`sendDigitalCopy`). Penetapan definitif tetap menunggu konfirmasi scope dan pengesahan resmi rencana kerja lanjutan, bukan keputusan roadmap final yang sudah disahkan.
- Seluruh prinsip *safe simulation*, *fail-closed safeguards*, dan *zero production mutations* wajib dipertahankan saat melanjutkan ke modul berikutnya.

