# DOKUMENTASI FINAL ACCEPTANCE & HANDOVER — MODUL 7
## ADMIN MITRA & USER MANAGEMENT INTEGRATION

**Repository:** `diantsdaeli/UNISMILES-ADMIN`
**Branch:** `feature/unismiles-integration`
**Baseline Commit:** `c3334247a66f2fe996b9b0e1472ea9f3fca370be`
**Status Integrasi:** **SIMULATION & CONTRACT READY** (Stage 7B → 7C → 7D Selesai)
**Safeguards:** `ENABLE_BACKEND_MUTATIONS = false`, `VERIFIED_STAGING_ALLOWLIST = []`

---

## 1. AUDIT PARITY: ADMIN DIAN VS ADMIN NADIN

| Fitur / Dimensi | Admin Dian (`UNISMILES-ADMIN`) | Admin Nadin (`admin_uni_gateway`) | Hasil Integrasi Modul 7 |
|---|---|---|---|
| **User Directory** | UI futuristik, kartu KPI 4 nodes, filter role & status, table responsive. | Desain diadopsi dari Dian, memanggil `api.get('/users')`. | **Dipertahankan UI Dian**: Terhubung dengan `userService.ts` berbasis mode sumber data. |
| **Pembuatan Admin Mitra** | Sebelumnya modal "Add Personnel" tanpa input password. | Terpisah di `AdminMitraCreate.tsx` (**orphaned**, tidak terdaftar di router). | **Terintegrasi Penuh**: Input password dengan toggle visibility dan Web Crypto generator ditambahkan langsung ke modal "Add Personnel". |
| **Login & JWT** | `Auth.tsx` & `AuthProvider.tsx` lengkap dengan verifikasi `/auth/me`. | Sama dengan Dian. | **Dipertahankan**: Sesi diverifikasi fail-closed; token kedaluwarsa atau akun nonaktif langsung logout. |
| **RBAC Super Admin** | Route guard `SuperAdminRoute` di `App.tsx` membatasi `/users` & `/analytics`. | `ProtectedRoute` dengan `allowedRoles`. | **Dipertahankan SuperAdminRoute Dian**: Proteksi ganda pada level router dan sidebar. |
| **Tata Kelola Status Akun** | Toggle status `Active` / `Inactive` pada tabel. | Sama dengan Dian. | **Terintegrasi**: Simulasi aman di memori lokal dengan toast notifikasi transparan. |
| **Kepemilikan Kiosk** | Multi-select nama kiosk di modal. | Belum tersambung ke backend. | **Relational ID Mapping**: Menggunakan `KIOSK_REGISTRY` (ID `KSK-00x` $\leftrightarrow$ Nama). |
| **Permission Matrix** | Matriks izin 11 modul visual interaktif. | Disalin dari Dian. | **Dipertahankan Utuh**: Dokumentasi transparan privilese Super Admin, Mitra, dan Viewer. |
| **Access Simulation** | Impersonasi pengguna untuk uji kebijakan izin. | Disalin dari Dian. | **Dipertahankan Utuh**: Menggunakan state `currentUserSim`. |
| **Sidebar Navigation** | Persis 9 menu asli. | 9 menu asli. | **Dipelihara Ketat**: Tanpa penambahan menu "Admin Mitra" atau menu baru apa pun. |

---

## 2. KONTRAK BACKEND YANG TERSEDIA

### A. Endpoint Pembuatan Admin Mitra
- **Route:** `POST /api/v1/admin/admin-mitra`
- **Otorisasi:** `Bearer <token>` (Wajib `Super Admin`)
- **Controller:** `backend_uni_gateway/controllers/adminController.js`
- **Payload:**
  ```json
  {
    "full_name": "Nama Lengkap Mitra",
    "email": "mitra@unismiles.com",
    "password": "PasswordMinimal8Karakter!",
    "partner_name": "Nama Bisnis / Brand Mitra"
  }
  ```
- **Logika Backend:**
  - Validasi field non-empty (HTTP 400).
  - Cek duplikasi email pada database MySQL (HTTP 409).
  - Hashing password dengan `bcrypt.hash(password, 10)`.
  - Simpan ke tabel `users` dengan `role = 'Admin Mitra'`, `status = 'Active'`.
  - Respons sukses: HTTP 201 `{ success: true, message: "Admin Mitra berhasil dibuat" }`.

### B. Endpoint Verifikasi Sesi
- **Route:** `GET /api/v1/auth/me`
- **Otorisasi:** `Bearer <token>` (Validasi JWT & status user `Active`)
- **Controller:** `backend_uni_gateway/routes/v1/authRoutes.js`
- **Respons:**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "full_name": "Uni Inside Owner",
      "email": "superadmin@gmail.com",
      "role": "Super Admin",
      "partner_name": "All Partners"
    }
  }
  ```

---

## 3. BACKEND GAPS (TEMUAN AUDIT ARSITEKTUR)

1. **Route `/api/v1/users` Tidak Di-mount:**
   - File `userRoutes.js` dan `userController.js` tersedia di backend, tetapi `server.js` **tidak me-mount** route tersebut.
   - Panggilan ke `/api/v1/users` mengembalikan HTTP 404 (Not Found).
2. **Ketiadaan Kolom `status` pada Kueri Update:**
   - Fungsi `userModel.updateUser` pada backend hanya memperbarui `name`, `email`, `role`, dan `partner_name`. Kolom `status` belum disertakan dalam kueri SQL `UPDATE`.
3. **Ketiadaan Endpoint Create untuk Super Admin:**
   - Backend tidak menyediakan endpoint pendaftaran akun publik atau pembuatan Super Admin baru (Super Admin hanya diisi melalui seed awal atau akses database langsung demi keamanan).

---

## 4. SERVICE ARCHITECTURE (`src/lib/userService.ts`)

Service layer `userService.ts` dirancang mengikuti arsitektur isolasi Modul 1–6:
- **Tipe Data:** `UserRecord`, `CreateAdminMitraPayload`, `UpdateUserPayload`, `UserStats`, `UserListResult`.
- **Mode Sumber Data (`DataSourceMode`):**
  - `SAFE_SIMULATION`: Membaca dan memutasi state in-memory `_simulatedUsers` yang diinisialisasi dari `SEED_USERS`.
  - `AUTHORIZED_READ_ONLY`: Hanya menjalankan GET yang sah. Jika endpoint user list tidak tersedia di backend, service mengembalikan status `'unsupported'` secara eksplisit tanpa rekayasa data fiktif.
- **Fail-Closed Safeguard:**
  - Jika `ENABLE_BACKEND_MUTATIONS === false`, seluruh mutasi (`createAdminMitra`, `updateUser`, `toggleUserStatus`, `deleteUser`) dieksekusi di memori lokal.
  - Jika `ENABLE_BACKEND_MUTATIONS === true`, `assertMutationAllowed` memastikan host terverifikasi di `VERIFIED_STAGING_ALLOWLIST`.

---

## 5. USER CREATION WORKFLOW

1. Super Admin membuka modal "Add Personnel" di `/users`.
2. Super Admin memilih Role = "Admin Mitra".
3. Form menampilkan field:
   - Full Name (wajib)
   - Email Address (wajib, format valid)
   - Password (wajib, min 8 karakter, visibility toggle, Web Crypto generator)
   - Partner Name (wajib)
   - Service Mode & Status
   - Assigned Kiosks (pilihan relasional `KSK-001` s/d `KSK-005`)
4. Validasi frontend dijalankan sebelum submit.
5. `userService.createAdminMitra` dipanggil dengan role Super Admin.
6. Kata sandi **dibersihkan seketika** dari state form setelah modal ditutup.

---

## 6. ROLE-BASED ACCESS CONTROL (RBAC) & TENANT ISOLATION

- **Proteksi Halaman `/users`:**
  - Komponen `SuperAdminRoute` di `src/App.tsx` memverifikasi sesi dan memastikan `user.role === 'Super Admin'`.
  - Jika Admin Mitra atau unauthenticated user mencoba mengakses `/users` melalui URL langsung, aplikasi langsung mengalihkan ke `/dashboard` dengan toast peringatan: *"Akses Ditolak: Halaman ini hanya dapat diakses oleh Super Admin."*
- **Sidebar Filtering:**
  - Menu `Analytics` dan `Users` hanya ditampilkan pada sidebar jika pengguna memiliki peran `Super Admin`.
- **Isolasi Antarmitra:**
  - Admin Mitra terikat pada `partner_name` spesifik dan kiosk tertentu.
  - Backend mengisolasi kueri sesi, template, dan kiosk dengan predikat SQL `WHERE user_id = ?`.

---

## 7. KIOSK OWNERSHIP MAPPING

- Diidentifikasi melalui registry relasional `KIOSK_REGISTRY`:
  - `KSK-001` $\leftrightarrow$ *Kiosk Senja 01* (Lobi Kafe Senja, Mitra: Kafe Senja)
  - `KSK-002` $\leftrightarrow$ *Kiosk Event 01* (Ballroom Convention, Mitra: Wedding Expo 2026)
  - `KSK-003` $\leftrightarrow$ *Kiosk Event 02* (Exhibition Hall B, Mitra: Wedding Expo 2026)
  - `KSK-004` $\leftrightarrow$ *Kiosk Mall 01* (Grand Atrium Lt. 1)
  - `KSK-005` $\leftrightarrow$ *Kiosk Campus 01* (Student Lounge Fasilkom)
- Fungsi pembantu `resolveKioskName(id)` dan `resolveKioskId(name)` menjamin konsistensi antara identitas relasional backend dan label UI.

---

## 8. SECURITY SAFEGUARDS

1. **Perlindungan Password:**
   - Password tidak disimpan di `localStorage`, `sessionStorage`, atau cookie.
   - Password tidak di-log ke `console.log`.
   - Generator password menggunakan Web Crypto API (`cryptoObj.getRandomValues`), tanpa `Math.random()`.
   - State password dibersihkan segera saat modal ditutup.
2. **Proteksi Super Admin Terakhir:**
   - Sistem mencegah penghapusan (*delete*) atau penonaktifan (*inactivate*) akun Super Admin aktif terakhir untuk menghindari penguncian sistem (*lockout*).
3. **Pencegahan Mutasi Produksi:**
   - `ENABLE_BACKEND_MUTATIONS = false` dan `VERIFIED_STAGING_ALLOWLIST = []` aktif permanen.
   - Panggilan mutasi produksi diblokir secara fail-closed.

---

## 9. HASIL PENGUJIAN REGRESI & KEAMANAN (STAGE 7D)

Seluruh 14 test suites dijalankan melalui `npm test`:

```
================================================================
MODUL 7 TAHAP 7D: ADMIN MITRA & USER MANAGEMENT SECURITY TESTS
================================================================

--- SECTION 1: Validasi Form Admin Mitra ---
[PASS] Validasi form Admin Mitra dan kredensial terverifikasi ketat
--- SECTION 2: Password Tidak Bocor ke Log/Storage/State ---
[PASS] Proteksi anti-kebocoran kata sandi dan Web Crypto API terverifikasi
--- SECTION 3: Duplicate Email Prevention (409 Conflict) ---
[PASS] Pencegahan duplikasi email pada create dan update terverifikasi
--- SECTION 4: HTTP 401/403 Fail-Closed on Unauthorized Access ---
[PASS] Kebijakan fail-closed 401/403 bagi non-Super Admin terverifikasi
--- SECTION 5: Role Super Admin Permissions & Invariants ---
[PASS] Hak akses dan lingkup tata kelola Super Admin terverifikasi
--- SECTION 6: Role Admin Mitra Requirements & Restrictions ---
[PASS] Atribut identitas dan batasan peran Admin Mitra terverifikasi
--- SECTION 7: Direct URL Access /users Protection ---
[PASS] Proteksi akses URL langsung /users via SuperAdminRoute terverifikasi
--- SECTION 8: Simulasi Create User (SAFE SIMULATION) ---
[PASS] Pembuatan Admin Mitra pada mode SAFE SIMULATION terverifikasi
--- SECTION 9: Simulasi Toggle Status (Active <-> Inactive) ---
[PASS] Simulasi toggle status pengguna terverifikasi
--- SECTION 10: Simulasi Delete User ---
[PASS] Simulasi penghapusan pengguna terverifikasi
--- SECTION 11: Proteksi Super Admin Aktif Terakhir ---
[PASS] Proteksi kekebalan Super Admin aktif terakhir terverifikasi
--- SECTION 12: Kiosk Ownership Relational Mapping ---
[PASS] Pemetaan relasional kiosk_id <-> kiosk_name terverifikasi
--- SECTION 13: Cross-Tenant Isolation Principles ---
[PASS] Isolasi data dan alokasi kepemilikan antarmitra terverifikasi
--- SECTION 14: Tidak Ada Production Mutation (ENABLE_BACKEND_MUTATIONS=false) ---
[PASS] Safeguard pencegahan mutasi backend produksi terverifikasi
--- SECTION 15: Tidak Ada Endpoint Fiktif (Unsupported Status) ---
[PASS] Penanganan endpoint unmounted tanpa mengarang endpoint fiktif terverifikasi
--- SECTION 16: Tidak Ada Regresi Modul 1–6 ---
[PASS] Seluruh komponen warisan Modul 1-6 pada UserManager dipertahankan utuh
--- SECTION 17: Sidebar Tetap Tepat Sembilan Menu ---
[PASS] Struktur persis 9 menu pada Sidebar terverifikasi tanpa penambahan
--- SECTION 18: Source Switching dan Cache Isolation ---
[PASS] Isolasi state saat beralih mode sumber data terverifikasi

================================================================
TOTAL TAHAP 7D TESTS: ALL 91 ASSERTIONS PASSED (0 FAILED)
================================================================
```

### Ringkasan Eksekusi Lengkap:
- **Test Suites:** **14 suites** (Baseline 13 + 1 Suite Modul 7).
- **Total Assertions:** **1.831 assertions PASS** (Baseline 1.740 + 91 Modul 7), **0 Failed**.
- **Lint Check (`npm run lint`):** 0 Errors (`tsc --noEmit` PASS).
- **Build Check (`npm run build`):** Vite production bundle sukses tanpa issue.

---

## 10. CHECKLIST PENERIMAAN UI (UI ACCEPTANCE CHECKLIST)

- [x] Sembilan menu sidebar asli (`Dashboard`, `Gallery Templates`, `Sessions`, `AI Content`, `Storyboard`, `Kiosks`, `Analytics`, `Users`, `Settings`) utuh.
- [x] Tidak ada menu tambahan seperti "Admin Mitra" atau "Transactions".
- [x] Halaman `UserManager.tsx` mempertahankan 4 kartu KPI summary nodes.
- [x] Search directory berfungsi real-time berdasarkan nama, email, dan mitra.
- [x] Filter dropdown Role (`Super Admin`, `Admin Mitra`, `Viewer`) dan Status (`Active`, `Inactive`) berfungsi sinkron dengan KPI.
- [x] Modal "Add Personnel" menampilkan field password dengan toggle visibility saat role Admin Mitra dipilih.
- [x] Generator kata sandi aman berbasis Web Crypto tersedia pada modal.
- [x] Penugasan kiosk menggunakan relasi `KIOSK_REGISTRY` (`KSK-00x`).
- [x] Matriks permission 11 modul visual interaktif tetap hadir.
- [x] Widget Access Simulation untuk impersonasi role tetap aktif.
- [x] Indikator mode sumber data menampilkan badge `SAFE SIMULATION` / `AUTHORIZED READ-ONLY`.
- [x] Banner unsupported tampil informatif saat berada dalam mode `AUTHORIZED READ-ONLY`.
- [x] File arsip `src/pages/Transactions.tsx` tetap dipertahankan tidak disentuh.

---

## 11. KNOWN LIMITATIONS & PRODUCTION READINESS GAPS

1. **Backend Route `/api/v1/users`:**
   - Memerlukan patch pada backend gateway untuk me-mount `app.use('/api/v1/users', verifyToken, requireRole(['Super Admin']), userRoutes)` sebelum fitur live user listing dapat digunakan di luar simulasi.
2. **Backend Model `updateUser`:**
   - Memerlukan penambahan kolom `status` pada kueri `UPDATE users SET status = ?` di `userModel.js` agar perubahan status akun dapat dipersistensi ke database MySQL.
3. **Penyimpanan Password:**
   - Password Admin Mitra baru memerlukan koneksi langsung ke backend staging yang diotorisasi (`ENABLE_BACKEND_MUTATIONS=true`) saat migrasi dari simulasi ke produksi dilakukan.
