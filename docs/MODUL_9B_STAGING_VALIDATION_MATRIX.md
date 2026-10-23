# UNISMILES — MATRIKS VALIDASI LINGKUNGAN STAGING
## MODUL 9B: STAGING VALIDATION MATRIX

Dokumen ini mendefinisikan matriks validasi komprehensif untuk pengujian lingkungan staging terisolasi pada proyek **Uni-Smiles Admin** dan **Backend Gateway**. Setiap item uji diklasifikasikan secara tegas berdasarkan status pembuktian:

- **SIMULATED**: Berhasil diuji dan terbukti pada lingkungan simulasi/in-memory frontend.
- **STATIC VERIFIED**: Terverifikasi melalui audit statis kode sumber backend dan relasi basis data.
- **STAGING VERIFIED**: Terverifikasi melalui pemanggilan jaringan HTTP langsung pada lingkungan staging nyata (hanya dapat dicapai setelah staging di-provisioning).
- **BLOCKED**: Tidak dapat dieksekusi atau diverifikasi karena ketiadaan infrastruktur staging, endpoint unmounted, atau kode yang belum terpasang.

---

## 1. Matriks Validasi Keamanan, Kontrak & Integritas Sistem

| No | Kategori Validasi | Skenario Pengujian Spesifik | Lingkup Komponen | Metode Pembuktian | Status Evaluasi Saat Ini | Syarat untuk Mencapai `STAGING VERIFIED` |
| :-: | :--- | :--- | :--- | :--- | :---: | :--- |
| **1** | **JWT Authentication** | Verifikasi token valid pada protected routes dan penghentian sesi otomatis saat token expired/invalid. | `api.ts`, `authMiddleware.js` | Automated assertion + static code inspection | **STATIC VERIFIED** | Uji request HTTP langsung dengan header Authorization expired ke backend staging. |
| **2** | **Super Admin Authorization** | Akses penuh ke rute `/analytics`, `/users`, dan mutasi template frame. | `SuperAdminRoute`, `requireRole` | Automated assertion (`stage7_user_management`) | **SIMULATED** | Login akun Super Admin pada database staging dan verifikasi respons HTTP 200. |
| **3** | **Admin Mitra Access Denial** | Penolakan akses dan redirect ke `/dashboard` saat Admin Mitra mencoba membuka `/users` atau `/analytics`. | `SuperAdminRoute`, `api.ts` | Test assertion + UI navigation guard | **SIMULATED** | Login akun Admin Mitra di staging dan buktikan penolakan HTTP 403. |
| **4** | **Tenant Isolation & IDOR** | Admin Mitra 1 tidak dapat melihat, mengubah konfigurasi, atau mengakses data sesi milik kiosk Admin Mitra 2. | `kioskController.js`, `tenantMiddleware.js` | Static code inspection (`canAccessKiosk`) | **STATIC VERIFIED** | Eksekusi request `GET /api/v1/admin/kiosks/:id_milik_mitra_lain` menggunakan token Mitra 1 (ekspektasi 404/403). |
| **5** | **Kiosk API-Key Auth** | Kiosk photobooth dapat mengakses endpoint kiosk dengan header `x-api-key` terdaftar. | `kioskAuthMiddleware.js`, `kiosks` | Static code inspection | **STATIC VERIFIED** | Hubungkan instance photobooth staging dengan API-Key terdaftar dan verifikasi status 200. |
| **6** | **Kiosk Offline Gating** | Kiosk dengan kolom `status = 'offline'` ditolak dari seluruh pemanggilan API operasional. | `kioskAuthMiddleware.js:20` | Static code inspection | **STATIC VERIFIED** | Update status kiosk menjadi `'offline'` di database staging, buktikan request ditolak (HTTP 403). |
| **7** | **Filter GET Compatibility** | Endpoint `/api/filters` dan `/api/v1/filters` mengembalikan array filter aktif dengan kolom `css_filter`. | `filterController.js`, `filterModel.js` | Audit kontrak kode sumber | **BLOCKED (BLK-01)** | Implementasikan `filterModel.js`, migrasi kolom `css_filter`, dan mount rute di staging. |
| **8** | **Filter Write Restrictions** | Operasi `POST`, `PUT`, `DELETE` pada filter ditolak jika dipanggil oleh Kiosk atau Admin Mitra. | `filterRoutes.js`, `authMiddleware.js` | Desain middleware otorisasi | **BLOCKED (BLK-01)** | Uji request `POST /api/filters` dengan token Admin Mitra dan buktikan HTTP 403. |
| **9** | **User API Sanitization** | `GET /api/v1/admin/users` mengembalikan data pengguna tanpa menyertakan kolom `password_hash`. | `userController.js`, `userModel.js` | Desain sanitasi JSON | **BLOCKED (BLK-02)** | Mount rute pengguna di staging dan periksa seluruh payload respons JSON bebas dari hash password. |
| **10** | **Database Migration Integrity** | Kolom `css_filter` ditambahkan pada tabel `filters` tanpa merusak tabel relasional `photo_filters`. | MySQL schema DDL | Dry-run migration analysis | **BLOCKED (BLK-01)** | Eksekusi `migrate_add_css_filter.sql` pada basis data MySQL staging terisolasi. |
| **11** | **Fail-Closed Safeguard Invariant** | Mutasi HTTP nyata dibatalkan secara fail-closed jika `ENABLE_BACKEND_MUTATIONS=false` atau allowlist kosong. | `templates.ts:assertMutationAllowed` | Automated assertion (`stage3b_safeguard`) | **SIMULATED** | Verifikasi exception dilempar seketika saat aplikasi mencoba mutasi tanpa izin allowlist. |
| **12** | **Anti-CSV Injection (CWE-1236)** | Formula berbahaya (`=`, `+`, `-`, `@`) pada data transaksi dan sesi disanitasi saat diekspor ke file CSV. | `paymentService.ts:sanitizeCSVCell` | Automated assertion (`stage8c_integration_hardening`) | **SIMULATED** | Ekspor CSV dengan record data uji yang memuat formula dan verifikasi prepending tanda kutip (`'`). |
| **13** | **Reprint Hardware Safety** | Perintah cetak ulang hardware fisik tidak dikirim ke driver printer saat mode simulasi aktif. | `sessionService.ts:auditReprintSafety` | Automated assertion (`stage6_session_management`) | **SIMULATED** | Klik tombol cetak ulang sesi pada antarmuka admin dan buktikan eksekusi hardware terkunci. |
| **14** | **Rollback Validation** | Kemampuan membatalkan migrasi skema dan mounting route jika terjadi anomali di staging. | Prosedur DDL & Git revert | Desain arsitektur rollback | **STATIC VERIFIED** | Uji coba prosedur pembatalan migrasi (`ALTER TABLE filters DROP COLUMN css_filter`) di database staging. |

---

## 2. Ringkasan Status Validasi Sistem

```
[TOTAL ITEM UJI VALIDASI: 14 SKENARIO]
  ├── SIMULATED         : 6 item (42.9%) — Terbukti 100% pada suite pengujian frontend (2.063 assertions PASS)
  ├── STATIC VERIFIED   : 4 item (28.6%) — Terbukti pada analisis kode backend dan skema MySQL
  ├── BLOCKED           : 4 item (28.6%) — Membutuhkan implementasi backend dan database staging
  └── STAGING VERIFIED  : 0 item (0.0%)  — Menunggu provisioning lingkungan staging fisik/cloud
```

---

## 3. Aturan Eksekusi Menuju Tahap Verifikasi Staging (Modul 9C)

Untuk menaikkan status dari `BLOCKED` / `SIMULATED` menjadi `STAGING VERIFIED`:
1. **Dilarang Menjalankan Mutasi Sebelum Persetujuan**: Pengujian mutasi aktif dilarang keras dilakukan pada database apa pun sebelum lingkungan staging terisolasi resmi dinyatakan siap dan disetujui secara tertulis.
2. **Pemisahan Kredensial**: Seluruh pengujian pembayaran wajib menggunakan akun sandbox Duitku, bukan kredensial merchant live.
3. **Dokumentasi Hasil Uji**: Setiap transisi status ke `STAGING VERIFIED` wajib dilampiri log output HTTP request/response yang dapat diaudit secara independen.

---

*Matriks validasi staging selesai disusun sebagai acuan pengujian operasional pada Modul 9B/9C.*
