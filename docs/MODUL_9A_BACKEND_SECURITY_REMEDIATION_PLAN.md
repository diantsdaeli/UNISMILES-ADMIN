# UNISMILES — RENCANA REMEDIASI KEAMANAN BACKEND
## MODUL 9A: BACKEND SECURITY REMEDIATION PLAN

Dokumen ini merupakan cetak biru (*blueprint*) spesifikasi teknis remediasi keamanan backend untuk menyelesaikan temuan audit Modul 9A Phase 1 pada repositori **Backend Gateway** (`nathaniapelleng15/backend_uni_gateway`). Spesifikasi ini dirancang sebagai acuan eksekusi pada tahap **Modul 9B** tanpa melakukan perubahan pada repositori backend saat ini.

---

## 1. Remediasi Filter API (BLK-01 & SEC-01)

### A. Bukti Kode & Temuan Audit
- File `backend_uni_gateway/controllers/filterController.js` baris 1 mengimpor `const filterModel = require('../models/filterModel');`.
- Pemeriksaan direktori membuktikan file `backend_uni_gateway/models/filterModel.js` **TIDAK ADA** pada disk (*missing file*).
- File `backend_uni_gateway/routes/v1/filterRoutes.js` mendefinisikan `@route /api/filters` tanpa middleware autentikasi apa pun (`getAllActiveFilters`, `createFilter`, `updateFilter`, `deleteFilter`).
- File `backend_uni_gateway/server.js` belum me-mount rute filter ke Express application instance.
- Tabel `filters` pada `unismiles.sql` belum memiliki kolom `css_filter VARCHAR(255)`.
- Kiosk photobooth (`frontend_uni_gateway/services/storageService.ts:425,461`) memanggil `${baseUrl}/api/filters`, sedangkan standar API Admin Dian memanggil `/api/v1/filters`.

### B. Analisis Risiko
- **Crash Server (Severity: Critical)**: Jika rute di-mount tanpa `filterModel.js`, server Express akan mengalami *unhandled fatal error* (`Cannot find module '../models/filterModel'`).
- **Data Tampering & Unauthenticated Mutation (Severity: Critical)**: Tanpa middleware autentikasi, pihak luar dapat menghapus atau menyuntikkan filter manipulatif ke mesin photobooth.
- **Breaking Kiosk Sync (Severity: High)**: Perbedaan path prefix (`/api/filters` vs `/api/v1/filters`) menyebabkan kiosk gagal menyinkronkan filter tampilan (HTTP 404).

### C. Rancangan Solusi Implementasi (Proposed Implementation)

#### 1. Pembuatan `backend_uni_gateway/models/filterModel.js`
Model baru yang mengeksekusi query database MySQL secara parameterized:
```javascript
const pool = require('../config/db');

const filterModel = {
  async getAllActiveFilters() {
    const [rows] = await pool.query(
      'SELECT id, name, css_filter, is_active, created_at FROM filters WHERE is_active = 1 ORDER BY id ASC'
    );
    return rows;
  },

  async getAllFilters() {
    const [rows] = await pool.query(
      'SELECT id, name, css_filter, is_active, created_at FROM filters ORDER BY id ASC'
    );
    return rows;
  },

  async getFilterById(id) {
    const [rows] = await pool.query(
      'SELECT id, name, css_filter, is_active, created_at FROM filters WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async createFilter({ name, css_filter, is_active = 1 }) {
    const [result] = await pool.query(
      'INSERT INTO filters (name, css_filter, is_active, created_at) VALUES (?, ?, ?, NOW())',
      [name, css_filter, is_active ? 1 : 0]
    );
    return this.getFilterById(result.insertId);
  },

  async updateFilter(id, { name, css_filter, is_active }) {
    await pool.query(
      'UPDATE filters SET name = COALESCE(?, name), css_filter = COALESCE(?, css_filter), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name, css_filter, is_active !== undefined ? (is_active ? 1 : 0) : null, id]
    );
    return this.getFilterById(id);
  },

  async deleteFilter(id) {
    const [result] = await pool.query('DELETE FROM filters WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
};

module.exports = filterModel;
```

#### 2. Migrasi Basis Data (`migrate_add_css_filter.sql`)
```sql
-- Tambahkan kolom css_filter jika belum ada pada tabel filters
ALTER TABLE `filters`
ADD COLUMN `css_filter` VARCHAR(255) NULL AFTER `name`;
```

#### 3. Proteksi Autentikasi & Otorisasi Per Aktor (`routes/v1/filterRoutes.js`)
Menerapkan Threat Modeling ketat:
- **Kiosk Photobooth**: Boleh membaca filter aktif (`GET /`) menggunakan validasi header `x-api-key` (via `kioskAuthMiddleware`) ATAU Bearer Token Admin.
- **Admin Operator (Super Admin Only)**: Operasi penulisan (`POST`, `PUT`, `DELETE`) **WAJIB** dilindungi oleh `verifyToken` dan `requireRole(['Super Admin'])`.
```javascript
const express = require('express');
const router = express.Router();
const filterController = require('../controllers/filterController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const kioskAuth = require('../middlewares/kioskAuthMiddleware');

// Middleware pemilih autentikasi untuk pembacaan (Kiosk API-Key atau Admin JWT)
const allowKioskOrAdmin = (req, res, next) => {
  if (req.headers['x-api-key']) {
    return kioskAuth(req, res, next);
  }
  return verifyToken(req, res, next);
};

// GET: Diizinkan untuk kiosk atau admin terautentikasi
router.get('/', allowKioskOrAdmin, filterController.getAllActiveFilters);

// MUTASI: Wajib Super Admin JWT (Ditolak keras untuk public atau kiosk)
router.post('/', verifyToken, requireRole(['Super Admin']), filterController.createFilter);
router.put('/:id', verifyToken, requireRole(['Super Admin']), filterController.updateFilter);
router.delete('/:id', verifyToken, requireRole(['Super Admin']), filterController.deleteFilter);

module.exports = router;
```

#### 4. Penyelarasan Dual-Mounting di `server.js`
Menjamin kompatibilitas backward terhadap kiosk lama dan admin client v1:
```javascript
// Validasi file model sebelum mounting untuk mencegah crash
try {
  require.resolve('./models/filterModel');
  const filterRoutes = require('./routes/v1/filterRoutes');
  // Mount ke kedua path (alias aman dengan auth terintegrasi)
  app.use(['/api/filters', '/api/v1/filters', '/api/v1/admin/filters'], filterRoutes);
} catch (err) {
  console.error('[CRITICAL] filterModel.js belum terpasang. Route filter dinonaktifkan secara fail-closed.');
}
```

### D. Kriteria Pengujian (Test Criteria)
1. `GET /api/filters` tanpa header mengembalikan HTTP 401 Unauthorized.
2. `GET /api/filters` dengan `x-api-key` kiosk valid mengembalikan list filter (HTTP 200).
3. `POST /api/filters` dengan token Admin Mitra ditolak (HTTP 403 Forbidden).
4. `POST /api/filters` dengan token Super Admin berhasil membuat filter (HTTP 201).
5. Eksekusi `node -e "require('./routes/v1/filterRoutes')"` tidak melempar `MODULE_NOT_FOUND`.

### E. Pertimbangan Rollback & Ketergantungan
- **Rollback**: Hapus mounting pada `server.js` jika terjadi kegagalan runtime. Kolom `css_filter` bersifat *nullable* sehingga tidak merusak data lama.
- **Ketergantungan**: Penyediaan koneksi MySQL dan implementasi `models/filterModel.js`.

---

## 2. Remediasi User API & Otorisasi Super Admin (BLK-02 & SEC-02)

### A. Bukti Kode & Temuan Audit
- `backend_uni_gateway/routes/v1/userRoutes.js` belum di-mount di `server.js`.
- `userRoutes.js` saat ini tidak memiliki middleware autentikasi pada route `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.
- `userController.js` mengembalikan seluruh field tanpa pemfilteran data sensitif (`password_hash`).

### B. Analisis Risiko
- **Kebocoran Identitas Pengguna (Severity: Critical)**: Jika di-mount tanpa pengaman, siapa pun di internet dapat melihat daftar pengguna, email, dan peran sistem.
- **Eskalasi Hak Akses (Severity: High)**: Pengguna non-admin dapat mengubah peran akun lain menjadi Super Admin via `PUT /api/users/:id`.

### C. Rancangan Solusi Implementasi

#### 1. Pengamanan Route di `routes/v1/userRoutes.js`
Seluruh rute pengguna **WAJIB** berada di balik otorisasi Super Admin:
```javascript
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Kunci seluruh rute: Wajib JWT aktif dan peran Super Admin
router.use(verifyToken);
router.use(requireRole(['Super Admin']));

router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
```

#### 2. Sanitasi Respons & Paginasi di `controllers/userController.js`
- Menjamin kolom `password_hash` di-strip secara permanen dari respons JSON.
- Menambahkan parameter query paginasi `page`, `limit`, dan `partner_name`.
```javascript
getAllUsers: async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { partner_name, role } = req.query;

    const { users, total } = await userModel.getUsersPaginated({ limit, offset, partner_name, role });

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}
```

#### 3. Mounting di `server.js`
```javascript
const userRoutes = require('./routes/v1/userRoutes');
app.use(['/api/v1/admin/users', '/api/v1/users'], userRoutes);
```

### D. Kriteria Pengujian
1. Akses `GET /api/v1/admin/users` tanpa token mengembalikan HTTP 401.
2. Akses `GET /api/v1/admin/users` dengan token Admin Mitra mengembalikan HTTP 403 Forbidden.
3. Respons JSON terbukti tidak memuat field `password_hash` atau `password`.

---

## 3. Penegakan Isolasi Multi-Tenant Server-Side (BLK-03 & SEC-03)

### A. Bukti Kode & Temuan Audit
- Dashboard (`dashboardController.js`) dan sesi (`sessionController.js`) telah menerapkan pembatasan `WHERE k.user_id = ?` jika peran pengguna bukan Super Admin.
- Namun, query raw pada `kioskModel.js`, `transactionModel.js`, dan controller kustom lainnya berpotensi diakses tanpa parameter penyaring (*unpartitioned*).

### B. Analisis Risiko
- **Insecure Direct Object Reference (IDOR) (Severity: High)**: Admin Mitra B dapat melihat atau memodifikasi data milik Admin Mitra A dengan mengganti parameter URL (misalnya `GET /api/v1/sessions/:session_code` atau `GET /api/v1/kiosks/:id`).

### C. Rancangan Solusi Implementasi

#### 1. Prinsip Pertahanan Berlapis (Defense in Depth)
Frontend [src/components/Sidebar.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/components/Sidebar.tsx) dan [src/App.tsx](file:///Users/dian/TA/UNISMILES-ADMIN/src/App.tsx) telah menyaring tampilan UI, namun **backend dilarang mempercayai frontend**. Setiap controller wajib melakukan verifikasi kepemilikan relasional:
`User (id, partner_name)` ──► `Kiosk (user_id)` ──► `Session (kiosk_id)` ──► `Transaction (session_id)`.

#### 2. Middleware Tenant Scoping Reusable (`middlewares/tenantMiddleware.js`)
```javascript
const pool = require('../config/db');

const enforceKioskOwnership = async (req, res, next) => {
  if (req.user.role === 'Super Admin') return next();

  const kioskId = req.params.kioskId || req.params.id || req.body.kiosk_id;
  if (!kioskId) return next();

  const [rows] = await pool.query(
    'SELECT id FROM kiosks WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [kioskId, req.user.id]
  );

  if (rows.length === 0) {
    return res.status(403).json({
      success: false,
      message: 'Akses Ditolak: Kiosk ini bukan milik akun mitra Anda.'
    });
  }
  next();
};

module.exports = { enforceKioskOwnership };
```

#### 3. Negative Testing Cross-Tenant
Menyusun test otomatis yang mensimulasikan login Admin Mitra 1 dan mencoba mengakses kiosk ID milik Admin Mitra 2. Ekspektasi: HTTP 403 Forbidden.

---

## 4. Penyelarasan Gateway Pembayaran: Duitku & GoPay (BLK-04)

### A. Bukti Kode & Klarifikasi
- Hasil audit membuktikan sistem menggunakan **Duitku** (`controllers/duitkuController.js`, tabel `duitku_invoices`) dan **GoPay Merchant Poller** (`services/gopayMerchantPoller.js`).
- Tidak ada implementasi Midtrans. Seluruh desain harus fokus pada standarisasi callback Duitku.

### B. Analisis Risiko
- **Replay Attack & Fake Callbacks (Severity: High)**: Pihak luar mengirim POST payload palsu untuk menandai sesi telah lunas tanpa pembayaran riil.

### C. Rancangan Solusi Implementasi
1. **Validasi Signature Duitku**:
   - Signature dihitung dan diverifikasi sesuai kontrak Duitku.
   - **Catatan Verifikasi Provider Wajib**: Formula signature (`MD5(merchantCode + amount + merchantOrderId + apiKey)`) **wajib diverifikasi secara ketat terhadap dokumentasi resmi provider Duitku** untuk jenis callback yang digunakan (misalnya HTTP notification callback vs redirect return URL, serta versi algoritma hash MD5 atau SHA256 yang aktif pada profil merchant Duitku Sandbox).
   - Kode backend di `duitkuController.js:105` sudah memiliki `if (!duitku.validCallback(body, settings)) return res.status(401)`.
2. **Double Verification (Server-to-Server Inquiry)**:
   - Sebelum mencatat status pembayaran lunas, backend wajib melakukan pemanggilan balik ke server Duitku via `duitku.checkTransaction()` untuk memastikan status transaksi di server gateway bernilai `'00'` (Success).
3. **Idempotency & Anti-Race Condition**:
   - Menggunakan transaksi database dengan klausa pesimistik:
     `SELECT * FROM duitku_invoices WHERE merchant_order_id = ? FOR UPDATE;`
     `SELECT * FROM sessions WHERE session_code = ? FOR UPDATE;`
   - Memastikan tidak ada pengkreditan ganda (*double-crediting*) jika Duitku mengirimkan callback berulang (*retry callback*).

---

## 5. Tata Kelola & Autentikasi Kiosk Device (SEC-12)

### A. Bukti Kode & Temuan Audit
- Autentikasi kiosk saat ini menggunakan kolom statis `kiosks.api_key` yang diperiksa oleh `kioskAuthMiddleware.js`.
- Belum ada kebijakan masa berlaku (*expiration*) atau audit rotasi kunci perangkat.

### B. Rancangan Solusi Implementasi
1. **Penyimpanan Hash API Key**:
   - Kolom `api_key` pada database sebaiknya menyimpan representasi hash SHA-256 (`api_key_hash`), sedangkan plain key hanya ditampilkan satu kali ke teknisi saat pendaftaran kiosk di Admin.
2. **Status Gating (Offline/Maintenance Lock)**:
   - Jika `kiosks.status = 'offline'` atau `health.maintenanceMode = true`, seluruh request kiosk ditolak seketika (HTTP 403), mencegah operasi transaksi saat unit sedang diservis.
3. **Rate Limiting Khusus Kiosk**:
   - Menerapkan bucket rate limiter terpisah untuk endpoint kiosk (`300 request / menit per IP/API-Key`) untuk mencegah kelebihan beban akibat kegagalan loop di aplikasi kiosk.

---

## 6. Rencana Tahapan Eksekusi Modul 9B

| Urutan Langkah | Komponen Backend Target | Aksi Remediasi |
| :-: | :--- | :--- |
| **Langkah 1** | Basis Data Staging | Eksekusi script migrasi `css_filter` pada tabel `filters`. |
| **Langkah 2** | `models/filterModel.js` | Buat file model filter baru dengan parameterized SQL query. |
| **Langkah 3** | `routes/v1/filterRoutes.js` | Terapkan middleware otorisasi Super Admin (mutasi) & Kiosk auth (read-only). |
| **Langkah 4** | `routes/v1/userRoutes.js` | Terapkan `verifyToken` dan `requireRole(['Super Admin'])`. |
| **Langkah 5** | `server.js` | Mount route filter dan user dengan mekanisme *try-catch resolution guard*. |
| **Langkah 6** | Automated Test Suite | Jalankan uji integrasi kontrak lintas endpoint di staging. |

---

*Spesifikasi remediasi keamanan backend selesai disusun. Menunggu persetujuan user sebelum implementasi teknis pada Modul 9B.*
