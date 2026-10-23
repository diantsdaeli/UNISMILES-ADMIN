# UNISMILES — AUDIT KELAYAKAN LINGKUNGAN STAGING TERISOLASI
## MODUL 9B: STAGING FEASIBILITY & BACKEND CONTRACT AUDIT

Dokumen ini menyajikan hasil audit kelayakan teknis (*feasibility audit*) terhadap ketersediaan lingkungan staging terisolasi serta audit mendalam *read-only* atas kontrak kode sumber **Backend Gateway** (`nathaniapelleng15/backend_uni_gateway`) untuk blocker BLK-01, BLK-02, BLK-03, dan BLK-06.

---

## 1. Verifikasi Keberadaan Lingkungan Staging Riil (Staging Existence)

Sesuai instruksi ketat Modul 9B: *"Determine whether a genuine isolated staging environment exists... Do not infer staging existence from .env.example or documentation... If staging cannot be verified, mark BLOCKED."*

Telah dilakukan pengujian bukti empiris (*forensic empirical check*) pada lingkungan lokal dan jaringan:

| Kriteria Verifikasi | Bukti Empiris yang Diperiksa | Temuan Audit Lapangan | Status Verifikasi |
| :--- | :--- | :--- | :---: |
| **1. Staging Backend Hostname** | Resolusi DNS `staging-api.uniinside.net` & port checking lokal | Host `staging-api.uniinside.net` mengembalikan `NXDOMAIN` (domain tidak terdaftar). Pada port `5017` dan `8000` tidak ada proses backend gateway yang aktif. | **NOT FOUND / BLOCKED** |
| **2. Database Staging Terpisah** | Pemeriksaan socket port 3306 & instance MySQL | Port 3306 menjalankan MySQL lokal dengan skema legacy `unismile_db` (milik dev server Dian). Tidak ditemukan skema resmi terisolasi `unismiles_staging` untuk gateway. | **UNVERIFIED / BLOCKED** |
| **3. Pemisahan Kredensial Produksi** | File konfigurasi `.env*` pada repositori backend | Pada `backend_uni_gateway/` hanya ditemukan `.env.example`. Tidak ada file `.env.staging` aktif atau pemisahan kredensial server. | **UNVERIFIED / BLOCKED** |
| **4. Konfigurasi HTTPS & CORS** | Pemeriksaan endpoint SSL publik | Tidak ada listener HTTPS staging aktif yang merespons certificate handshakes. | **BLOCKED** |
| **5. Test Kredensial Sandbox Duitku** | Kunci merchant pada file environment | Variabel `DUITKU_MERCHANT_CODE` dan `DUITKU_API_KEY` berstatus kosong pada file acuan. | **BLOCKED** |
| **6. Mekanisme Migrasi & Rollback** | Struktur direktori migrasi backend | Backend memiliki 15 file `migrate_*.sql` acak tanpa migration runner otomatis (mis. Knex / Sequelize / Flyway) atau tabel pelacak versi skema (`schema_migrations`). | **PARTIAL** |
| **7. Ketersediaan Device Kiosk Uji** | Koneksi WebSocket `/kiosk` | Tidak ada perangkat hardware fisik yang terhubung ke server lokal. Pengujian baru dapat dilakukan via simulasi mock virtual. | **SIMULATED** |

### Kesimpulan Kelayakan Lingkungan Staging:
**STATUS: NOT VERIFIED / BLOCKED**. Lingkungan staging fisik/cloud yang terisolasi secara sah **BELUM TERDOKUMENTASI ATAU TERVERIFIKASI**.
- **Catatan Bukti Hostname**: Hasil `NXDOMAIN` untuk hostname `staging-api.uniinside.net` merupakan bukti spesifik atas ketiadaan rekaman DNS untuk hostname tersebut saja, dan bukan bukti mutlak bahwa tidak ada lingkungan staging lain di infrastruktur eksternal. Namun demikian, karena tidak adanya domain alternatif, instance terpisah, atau kredensial yang diverifikasi, status staging tetap **BLOCKED**.
- **Status Blocker**: BLK-01, BLK-02, BLK-03, dan BLK-06 **tetap unresolved (belum terselesaikan)**.
- **Batasan Invariant**:
  - `VERIFIED_STAGING_ALLOWLIST` **wajib tetap kosong `[]`**.
  - `ENABLE_BACKEND_MUTATIONS` **wajib tetap bernilai `false`**.
  - Mode default aplikasi Admin Dian **wajib tetap `SAFE_SIMULATION`**.
  - Tidak ada migrasi basis data, deployment staging, modifikasi backend, maupun aktivasi sandbox pembayaran yang diizinkan tanpa persetujuan terpisah tertulis (*explicit approval*).

---

## 2. Audit Kontrak Kode Sumber Backend (Read-Only Code Audit)

### A. BLK-01: Filter API Contract & Missing File Analysis
Pemeriksaan mendalam pada `backend_uni_gateway`:

1. **Missing `models/filterModel.js`**:
   - `controllers/filterController.js` baris 1: `const filterModel = require('../models/filterModel');`.
   - Direktori `models/` hanya berisi 13 file (`auditLogModel.js`, `frameTemplateModel.js`, `kioskModel.js`, `kioskPrintingConfigModel.js`, `paymentProfileModel.js`, `paymentVerificationModel.js`, `photoModel.js`, `printJobModel.js`, `printModel.js`, `sessionModel.js`, `systemSettingModel.js`, `transactionModel.js`, `userModel.js`).
   - File `filterModel.js` **TIDAK ADA SAMA SEKALI**. Menjalankan controller ini saat ini akan seketika menghasilkan `Error: Cannot find module '../models/filterModel'`.
2. **Ketiadaan Kolom `css_filter` pada Database Schema**:
   - Skema `unismiles.sql` mendefinisikan tabel `filters`:
     `id (INT)`, `name (VARCHAR)`, `type (VARCHAR)`, `preview_url (VARCHAR)`, `is_active (TINYINT)`, `created_at (TIMESTAMP)`.
   - Kolom `css_filter` **TIDAK DITEMUKAN** di tabel `filters`. Padahal `filterController.js` (baris 33, 40, 60, 67) dan kiosk frontend (`storageService.ts:430`) secara eksplisit mengharuskan keberadaan field `css_filter`.
3. **Route Unmounted**:
   - `server.js` tidak mengimpor atau me-mount `filterRoutes.js`.
4. **Analisis Risiko Dual-Path (`/api/filters` vs `/api/v1/filters`)**:
   - Kiosk Photobooth (`frontend_uni_gateway/services/storageService.ts:425,461`) memanggil `${baseUrl}/api/filters` (tanpa prefix `/v1`).
   - Admin Dian v1 API client memanggil `/api/v1/filters`.
   - **Risiko Keamanan Dual-Path**: Jika `/api/filters` di-mount tanpa autentikasi agar kiosk dapat membaca data, maka endpoint mutasi (`POST /api/filters`, `DELETE /api/filters/:id`) berpotensi ikut terbuka tanpa login.
   - **Solusi Arsitektur**: Router wajib membedakan hak akses berdasarkan metode HTTP:
     - `GET`: Diizinkan untuk kiosk dengan validasi header `x-api-key` (via `kioskAuthMiddleware`) ATAU Bearer Token Admin.
     - `POST`, `PUT`, `DELETE`: **WAJIB Super Admin JWT** (`verifyToken` + `requireRole(['Super Admin'])`).

---

### B. BLK-02: User API & Super Admin Authorization Analysis
Pemeriksaan pada `backend_uni_gateway/routes/v1/userRoutes.js` dan `controllers/userController.js`:

1. **Status Implementasi Saat Ini**:
   - `routes/v1/userRoutes.js` mengekspos:
     - `GET /` -> `userController.getAllUsers`
     - `GET /:id` -> `userController.getUserById`
     - `PUT /:id` -> `userController.updateUser`
     - `DELETE /:id` -> `userController.deleteUser`
   - File `userRoutes.js` **BELUM DI-MOUNT** pada `server.js`.
   - Router sama sekali tidak memuat middleware autentikasi (`verifyToken`) maupun otorisasi peran (`requireRole`).
2. **Ketiadaan Paginasi & Resiko Denial-of-Service (DoS)**:
   - `userModel.getAllUsers()` mengeksekusi query `SELECT ... FROM users ORDER BY created_at DESC` tanpa klausa `LIMIT` dan `OFFSET`.
   - Jika data akun pengguna bertambah banyak, pembacaan seluruh tabel ke memori server akan menurunkan performa secara drastis.
3. **Sanitasi Data Respons**:
   - Fungsi `findByEmail` dan `findById` pada `userModel.js` menyertakan kolom `password_hash`. Jika data objek model dikembalikan utuh tanpa sanitasi, hash password berisiko bocor ke klien API.
4. **Keselarasan Endpoint dengan Frontend**:
   - Halaman `UserManager.tsx` pada Admin Dian memanggil `/api/v1/users` untuk pembacaan dan `/api/v1/admin/admin-mitra` untuk pembuatan Admin Mitra.
   - Server backend wajib me-mount rute pengguna ke `/api/v1/admin/users` dan `/api/v1/users` dengan pengamanan `Super Admin` penuh.

---

### C. BLK-03: Pelacakan Kepemilikan Multi-Tenant (Tenant Ownership Tracing)

Pelacakan hubungan data relasional pada skema basis data backend:
```
Users (id, partner_name, role)
  └── Kiosks (id, user_id, api_key)  <-- foreign key fk_kiosk_user
        └── Sessions (id, kiosk_id)  <-- foreign key fk_session_kiosk
              ├── Photos (id, session_id)  <-- foreign key fk_photo_session
              └── Transactions (id, session_id)  <-- relasi kode sesi
```

#### Temuan Audit Keamanan Server-Side:
1. **Kiosk Controller (`kioskController.js`)**:
   - Mengimplementasikan fungsi otorisasi `canAccessKiosk(user, kiosk)`:
     `return user?.role === 'Super Admin' || user?.role === 'admin' || String(kiosk?.user_id) === String(user?.id);`
   - Pada `getKioskById`, `getKioskConfig`, `updateKioskConfig`, dan `updateKiosk`, akses ditolak jika `canAccessKiosk` bernilai false.
   - **Evaluasi**: Kiosk Controller telah memiliki proteksi kepemilikan tenant server-side yang baik.
2. **Session Controller (`sessionController.js`)**:
   - Pada `getAdminSessions`, controller membatasi query:
     `if (user_role !== 'Super Admin') { query += ' WHERE k.user_id = ?'; params.push(user_id); }`
   - **Evaluasi**: Listing sesi admin mematuhi batas tenant.
3. **Dashboard Controller (`dashboardController.js`)**:
   - Membatasi KPI dashboard ke kiosk milik user: `if (userRole !== 'Super Admin') { kioskFilter = ' WHERE user_id = ?'; sessionFilter = ' AND k.user_id = ?'; }`
   - **Evaluasi**: Dashboard mematuhi batas tenant.
4. **Celah Keamanan Tenant yang Ditemukan (Vulnerabilities)**:
   - **`userController.getAllUsers`**: Tidak memeriksa tenant. Admin Mitra yang memanggil rute ini (jika dibuka) dapat melihat seluruh akun mitra lain.
   - **Ketiadaan Endpoint Listing Transaksi Mandiri**: Tabel `transactions` tidak memiliki controller listing dengan filter tenant. Admin Dian saat ini menyaring data transaksi di sisi browser (`filterTransactionsByRole`).
   - **Prinsip Penting**: **Penyaringan di frontend BUKAN bukti isolasi server-side**. Backend wajib menyematkan validasi kepemilikan pada seluruh query data.

---

## 3. Status Empat Blocker Modul 9B

| ID Blocker | Deskripsi | Status Audit 9B | Catatan Kelayakan |
| :--- | :--- | :---: | :--- |
| **BLK-01** | Filter API unmounted, missing `filterModel.js`, schema tanpa `css_filter`, dual-path exposure. | **BLOCKED** | Telah dibuatkan rencana teknis remediasi file-by-file pada Modul 9B. Membutuhkan izin tulis terpisah untuk implementasi backend. |
| **BLK-02** | User API unmounted, unauthenticated CRUD, missing Super Admin authorization. | **BLOCKED** | Telah dirancang middleware `verifyToken` + `requireRole(['Super Admin'])` dan paginasi sanitasi data. |
| **BLK-03** | Server-side multi-tenant isolation & IDOR prevention across all endpoints. | **BLOCKED** | Pola relasi kepemilikan telah terpetakan. Query `users` dan direct detail endpoints wajib dipagari middleware ownership. |
| **BLK-06** | Lingkungan staging terisolasi fisik & izin pendaftaran `VERIFIED_STAGING_ALLOWLIST`. | **BLOCKED** | Tidak ditemukan server/database staging aktif. Allowlist tetap kosong `[]` dan mutasi tetap `false`. |

---

*Audit kelayakan Modul 9B selesai. Menunggu persetujuan user sebelum rencana remediasi diimplementasikan.*
