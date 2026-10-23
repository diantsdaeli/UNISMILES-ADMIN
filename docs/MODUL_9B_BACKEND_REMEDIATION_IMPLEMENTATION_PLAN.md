# UNISMILES — RENCANA PELAKSANAAN REMEDIASI BACKEND
## MODUL 9B: BACKEND REMEDIATION IMPLEMENTATION PLAN

Dokumen ini merupakan rencana teknis pelaksanaan remediasi kode sumber backend secara *file-by-file* untuk menyelesaikan temuan **BLK-01**, **BLK-02**, dan **BLK-03** pada repositori **Backend Gateway** (`nathaniapelleng15/backend_uni_gateway`).

> [!IMPORTANT]
> **PERNYATAAN BATASAN KEAMANAN & OTORISASI**:
> 1. Repositori backend saat ini diperlakukan secara **READ-ONLY**. Dokumen ini **TIDAK** melakukan modifikasi kode, tidak membuat branch baru, dan tidak memiliki izin akses tulis (*no backend repository write access authorized*).
> 2. **Tidak ada migrasi basis data yang diizinkan (*no database migration authorized*)** dalam tahapan dokumentasi ini.
> 3. Deployment staging, modifikasi backend, dan aktivasi sandbox pembayaran **wajib memiliki persetujuan terpisah tertulis (*separate explicit approvals*)**.
> 4. Daftar delapan (8) berkas di bawah ini merupakan **estimasi cakupan awal remediasi (*initial estimated remediation scope*)**, bukan batas maksimum mutlak (*not an immutable maximum*), yang dapat disesuaikan saat pengujian integrasi staging berlangsung.

---

## 1. Daftar Berkas Target Modifikasi Awal (Initial Estimated Scope)

| No | Lokasi Berkas pada `backend_uni_gateway/` | Tipe Aksi | Tujuan & Lingkup Remediasi |
| :-: | :--- | :---: | :--- |
| 1 | `models/filterModel.js` | **NEW FILE** | Membuat implementasi model filter yang hilang guna menangani query MySQL parameterized dan mencegah crash `MODULE_NOT_FOUND`. |
| 2 | `migrate_add_css_filter.sql` | **NEW FILE** | Script DDL SQL untuk menambahkan kolom `css_filter` pada tabel `filters`. |
| 3 | `routes/v1/filterRoutes.js` | **MODIFY** | Menerapkan otorisasi per aktor: Kiosk API-Key (read-only) dan Super Admin JWT (write-only). |
| 4 | `routes/v1/userRoutes.js` | **MODIFY** | Mengunci seluruh rute pengguna dengan `verifyToken` dan `requireRole(['Super Admin'])`. |
| 5 | `controllers/userController.js` | **MODIFY** | Menambahkan paginasi (`page`, `limit`), filter `partner_name`, dan sanitasi respons JSON (stripping `password_hash`). |
| 6 | `models/userModel.js` | **MODIFY** | Menambahkan metode query `getUsersPaginated` dengan klausa `LIMIT`, `OFFSET`, dan `WHERE partner_name = ?`. |
| 7 | `middlewares/tenantMiddleware.js` | **NEW FILE** | Middleware proteksi IDOR dan verifikasi kepemilikan relasional kiosk/sesi antarmitra. |
| 8 | `server.js` | **MODIFY** | Me-mount rute filter (dual-path `/api/filters` dan `/api/v1/filters`) dan rute user (`/api/v1/admin/users`) dengan *try-catch resolution guard*. |

---

## 2. Spesifikasi Kontrak API Target (Expected API Contracts)

### A. Filter API Contracts

#### 1. `GET /api/filters` & `GET /api/v1/filters` (Active Filters Listing)
- **Aktor**: Photobooth Kiosk (`frontend_uni_gateway`) ATAU Admin Dian (`UNISMILES-ADMIN`).
- **Autentikasi**:
  - Kiosk: Header `x-api-key: <KIOSK_API_KEY>` (terdaftar di tabel `kiosks`).
  - Admin: Header `Authorization: Bearer <JWT_TOKEN>` (Super Admin / Admin Mitra).
- **Status Kode**:
  - `200 OK`: Berhasil mengembalikan array filter aktif.
  - `401 Unauthorized`: Tanpa API-Key atau tanpa Bearer token valid.
  - `403 Forbidden`: Kiosk berstatus offline (`kiosks.status = 'offline'`).
- **Bentuk Respons JSON (`200 OK`)**:
  ```json
  {
    "success": true,
    "count": 4,
    "data": [
      {
        "id": 1,
        "name": "Natural Soft",
        "css_filter": "contrast(105%) brightness(102%) saturate(110%)",
        "is_active": 1,
        "created_at": "2026-10-23T08:00:00.000Z"
      }
    ]
  }
  ```

#### 2. `POST /api/filters` & `POST /api/v1/filters` (Create Filter)
- **Aktor**: Super Admin Only (Admin Dian).
- **Autentikasi**: Header `Authorization: Bearer <SUPER_ADMIN_JWT>`.
- **Payload Request**:
  ```json
  {
    "name": "Vintage Warm",
    "css_filter": "sepia(25%) contrast(110%) brightness(95%)",
    "is_active": 1
  }
  ```
- **Status Kode**:
  - `201 Created`: Filter berhasil dibuat.
  - `400 Bad Request`: Field `name` atau `css_filter` kosong/tidak valid.
  - `401 Unauthorized`: Token tidak disertakan atau kedaluwarsa.
  - `403 Forbidden`: Ditolak jika peran pengguna bukan Super Admin (termasuk Kiosk API-Key).

#### 3. `PUT /api/filters/:id` & `DELETE /api/filters/:id`
- **Aktor**: Super Admin Only.
- **Autentikasi**: Header `Authorization: Bearer <SUPER_ADMIN_JWT>`.
- **Status Kode**: `200 OK` (Updated/Deleted), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

---

### B. User Management API Contracts

#### 1. `GET /api/v1/admin/users` & `GET /api/v1/users` (List Users)
- **Aktor**: Super Admin Only.
- **Autentikasi**: Header `Authorization: Bearer <SUPER_ADMIN_JWT>`.
- **Query Parameters**: `page` (default 1), `limit` (default 20, max 100), `partner_name`, `role`.
- **Status Kode**:
  - `200 OK`: Berhasil mengambil daftar pengguna terpaginasi.
  - `401 Unauthorized`: Token tidak ada/invalid.
  - `403 Forbidden`: Pengguna adalah Admin Mitra (`role !== 'Super Admin'`).
- **Bentuk Respons JSON Sanitasi (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "full_name": "Super Admin Uni",
        "email": "admin@unismiles.com",
        "role": "Super Admin",
        "partner_name": null,
        "status": "active",
        "created_at": "2026-07-01T00:00:00.000Z",
        "updated_at": "2026-10-23T08:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 4,
      "totalPages": 1
    }
  }
  ```
  *(Catatan Keamanan: Kolom `password_hash` WAJIB DIHILANGKAN dari output)*.

---

## 3. Script Migrasi SQL (`migrate_add_css_filter.sql`)

```sql
-- UNISMILES MODUL 9B: Penambahan kolom css_filter pada tabel filters
-- DDL dieksekusi secara idempoten pada database staging

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'filters'
    AND COLUMN_NAME = 'css_filter'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `filters` ADD COLUMN `css_filter` VARCHAR(255) NULL AFTER `name`',
  'SELECT "Column css_filter already exists" AS status'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verifikasi skema setelah eksekusi
SHOW COLUMNS FROM `filters` LIKE 'css_filter';
```

---

## 4. Urutan Middleware Express pada `server.js` (Pipeline Ordering)

Penyusunan middleware pada `server.js` wajib mematuhi hierarki preseden berikut untuk mencegah *bypassing* keamanan:

1. **Environment & Process Validation** (Pemeriksaan `JWT_SECRET`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`).
2. **Reverse Proxy Trust** (`app.set('trust proxy', 1)`).
3. **Request Identifier & Security Headers** (`app.use(requestId)`, `app.disable('x-powered-by')`).
4. **CORS Guard** (`app.use(cors({ origin: corsOrigin, credentials: true }))`).
5. **Body Parser** (`express.json({ limit: '2mb' })`).
6. **Static File Serving with CORS Headers** (`/uploads`, `/assets`).
7. **Rate Limiting** (`apiLimiter`).
8. **Public & Webhook Routes** (`/api/v1/public`, callback Duitku).
9. **Kiosk Photobooth Routes** (`/api/v1/kiosk` dengan `kioskAuthMiddleware`).
10. **Admin Assets Router (Preseden Lebih Spesifik)** (`/api/v1/admin/assets` dipasang sebelum admin umum).
11. **Filter Router (Dual Mounting)** (`/api/filters` dan `/api/v1/filters` dengan per-method auth).
12. **User Router (Super Admin Locked)** (`/api/v1/admin/users` dan `/api/v1/users`).
13. **General Admin Routes** (`/api/v1/admin`).
14. **Authentication Routes** (`/api/v1/auth`).
15. **Error Handlers** (`notFoundHandler`, lalu `errorHandler`).

---

## 5. Rencana Pengujian Keamanan (Security Test Suite)

Daftar pengujian positif dan negatif otomatis yang akan dijalankan di staging:

| Test Case | Metode | Endpoint | Kredensial Pengujian | Ekspektasi Hasil | Tujuan Verifikasi |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **SEC-TEST-01** | `GET` | `/api/filters` | Header `x-api-key: KSK-0001-KEY` | **HTTP 200 OK** | Kiosk dapat membaca filter. |
| **SEC-TEST-02** | `GET` | `/api/filters` | Tanpa Header / Tanpa Kredensial | **HTTP 401 Unauthorized** | Akses publik ditolak. |
| **SEC-TEST-03** | `POST` | `/api/filters` | Header `x-api-key: KSK-0001-KEY` | **HTTP 403 Forbidden** | Kiosk dilarang memanipulasi filter. |
| **SEC-TEST-04** | `POST` | `/api/v1/filters` | Token JWT Admin Mitra | **HTTP 403 Forbidden** | Admin Mitra dilarang membuat filter. |
| **SEC-TEST-05** | `POST` | `/api/v1/filters` | Token JWT Super Admin | **HTTP 201 Created** | Super Admin dapat menambah filter. |
| **SEC-TEST-06** | `GET` | `/api/v1/admin/users`| Token JWT Admin Mitra | **HTTP 403 Forbidden** | Isolasi menu User dari Admin Mitra. |
| **SEC-TEST-07** | `GET` | `/api/v1/admin/users`| Token JWT Super Admin | **HTTP 200 OK** | Paginasi & sanitasi respons tanpa `password_hash`. |
| **SEC-TEST-08** | `GET` | `/api/v1/admin/kiosks/K-002` | Token Admin Mitra 1 (pemilik K-001) | **HTTP 404 Not Found** | Pencegahan IDOR antarmitra. |

---

## 6. Kompatibilitas Mundur & Prosedur Rollback

### Kompatibilitas Mundur:
- **Kiosk Photobooth Lama**: Tetap berfungsi 100% tanpa perubahan URL karena rute `/api/filters` tetap tersedia dan mendukung `x-api-key`.
- **Portal Admin Dian v1**: Memanggil `/api/v1/filters` dan `/api/v1/users` dengan Bearer Token yang sudah terintegrasi pada `api.ts`.

### Prosedur Rollback Cepat (Rapid Rollback):
1. **Rollback Kode**: Hapus mounting `filterRoutes` dan `userRoutes` dari `server.js` jika terjadi kegagalan startup.
2. **Rollback Basis Data**:
   ```sql
   ALTER TABLE `filters` DROP COLUMN `css_filter`;
   ```
3. **Rollback Restart**: Restart proses Node.js gateway staging.

---

## 7. Ketergantungan & Urutan Implementasi

```
[Persetujuan User Tertulis untuk Akses Tulis Backend]
  └── Langkah 1: Eksekusi SQL Migration `migrate_add_css_filter.sql` di database staging
        └── Langkah 2: Buat file `backend_uni_gateway/models/filterModel.js`
              └── Langkah 3: Perbarui `backend_uni_gateway/routes/v1/filterRoutes.js`
                    └── Langkah 4: Perbarui `userModel.js` dan `controllers/userController.js`
                          └── Langkah 5: Pasang auth pada `routes/v1/userRoutes.js`
                                └── Langkah 6: Mount router pada `server.js` dengan guard
                                      └── Langkah 7: Eksekusi Security Test Suite Staging
```

---

*Rencana implementasi remediasi backend selesai disusun. Menunggu persetujuan terpisah sebelum tindakan teknis dijalankan pada backend.*
