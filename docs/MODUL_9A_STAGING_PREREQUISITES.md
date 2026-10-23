# UNISMILES — PRASYARAT LINGKUNGAN STAGING TERISOLASI
## MODUL 9A: STAGING PREREQUISITES & ENVIRONMENT READINESS

Dokumen ini mendefinisikan seluruh prasyarat teknis, arsitektur isolasi, inventarisasi variabel lingkungan, serta tata cara verifikasi yang **WAJIB** dipenuhi sebelum host staging didaftarkan ke dalam `VERIFIED_STAGING_ALLOWLIST` dan sebelum mutasi backend diaktifkan pada Modul 9B/9C.

---

## 1. Prinsip Mutlak Isolasi Staging (Staging Safeguard Invariants)

1. **Strict Invariant**:
   - `VERIFIED_STAGING_ALLOWLIST` pada [src/lib/templates.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/templates.ts) **WAJIB TETAP KOSONG `[]`** selama Modul 9A.
   - `ENABLE_BACKEND_MUTATIONS` **WAJIB TETAP BERNILAI `false`**.
   - Mode default aplikasi tetap **`SAFE_SIMULATION`**.
2. **Larangan Otomatisasi Allowlist**:
   - Mengubah `VITE_API_BASE_URL` saja (misalnya ke `localhost` atau domain yang memuat kata `'staging'`) **TIDAK MEMBUKTIKAN ISOLASI**. Host staging hanya boleh didaftarkan setelah seluruh verifikasi pada dokumen ini selesai dan disetujui secara tertulis.
3. **Pemisahan Fisik Basis Data (Database Physical/Schema Isolation)**:
   - Basis data staging wajib berjalan pada skema atau server instance terpisah dari basis data produksi (`backend-photobooth.uniinside.net`).
   - Dilarang keras menghubungkan backend staging ke database produksi, atau mengaktifkan replikasi dua arah (*master-master replication*) yang berpotensi memodifikasi data produksi.

---

## 2. Spesifikasi Domain & Infrastruktur Staging

| Komponen Infrastruktur | Target Spesifikasi Staging | Kriteria Keamanan & Validasi |
| :--- | :--- | :--- |
| **Domain Staging Backend** | `https://staging-api.uniinside.net` (atau subdomain staging terdaftar) | Wajib HTTPS dengan sertifikat SSL/TLS valid (TLS 1.3/1.2). Dilarang HTTP polos. |
| **Domain Staging Admin** | `https://staging-admin.uniinside.net` (atau localhost port terisolasi) | Terdaftar eksplisit pada variabel `CORS_ORIGINS` di backend staging. |
| **Server Runtime** | Node.js v18 LTS / v20 LTS | Berjalan di bawah process manager (PM2 / Systemd / Container). |
| **Reverse Proxy** | Nginx / Caddy dengan `trust proxy = 1` | Konfigurasi SSL termination, rate-limiting, dan header keamanan (`X-Frame-Options`, `X-Content-Type-Options`). |
| **Basis Data** | MySQL 8.0 / MariaDB 10.6 terpisah | Skema mandiri (`unismiles_staging`). Kredensial DB terpisah dari produksi. |

---

## 3. Inventarisasi Variabel Lingkungan (Environment Inventory)

> [!IMPORTANT]
> **CATATAN AUDIT KEAMANAN**: Inventarisasi di bawah ini hanya mencatat **nama kunci (*variable keys*)**, deskripsi fungsi, dan status wajib. **TIDAK ADA NILAI RAHASIA (SECRETS/PASSWORDS/TOKENS)** yang dicetak pada dokumen ini.

### A. Backend Staging Environment Variables (`.env.staging`)

| Variabel Lingkungan (Key) | Sifat Nilai | Kebutuhan Staging | Fungsi & Deskripsi |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Konfigurasi | **Wajib** | Disetel ke `staging` atau `production` (mengaktifkan validasi strict). |
| `PORT` | Konfigurasi | **Wajib** | Port listener internal backend (mis. `5017` atau `8000`). |
| `PUBLIC_BASE_URL` | URL | **Wajib** | URL publik staging (`https://staging-api.uniinside.net`). |
| `CORS_ORIGINS` | Daftar URL | **Wajib** | Daftar domain origin terpercaya tanpa wildcard `*`. |
| `DB_HOST` | Hostname/IP | **Wajib** | Host instance MySQL staging terisolasi. |
| `DB_PORT` | Port Angka | **Wajib** | Port koneksi database (default: `3306`). |
| `DB_NAME` | Nama Database | **Wajib** | Nama skema database staging (`unismiles_staging`). |
| `DB_USER` | Username | **Wajib** | Akun pengguna MySQL staging dengan hak terbatas. |
| `DB_PASSWORD` | Rahasia | **Wajib** | Kata sandi akun MySQL staging. |
| `JWT_SECRET` | Rahasia | **Wajib** | Kunci penandatanganan JWT staging (panjang minimal 32 karakter acak). |
| `DUITKU_MERCHANT_CODE` | Identitas Merchant | **Opsional (Staging)** | Kode merchant Duitku Sandbox. |
| `DUITKU_API_KEY` | Kunci API Sandbox | **Opsional (Staging)** | API Key Duitku Sandbox untuk verifikasi signature callback. |
| `DUITKU_SANDBOX_MODE` | Boolean | **Wajib (Staging)** | Disetel ke `true` agar memanggil endpoint sandbox Duitku. |
| `SMTP_HOST` | Hostname | **Opsional** | Host server SMTP pengujian (mis. Mailtrap / MailHog). |
| `SMTP_PORT` | Port Angka | **Opsional** | Port SMTP (587 atau 465). |
| `SMTP_USER` | Identitas Akun | **Opsional** | Akun autentikasi SMTP pengujian. |
| `SMTP_PASS` | Rahasia | **Opsional** | Kata sandi / App Password akun pengujian. |

### B. Frontend Staging Environment Variables (`.env.staging`)

| Variabel Lingkungan (Key) | Nilai Staging | Fungsi & Deskripsi |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://staging-api.uniinside.net/api/v1` | Basis endpoint API backend staging. |
| `VITE_PUBLIC_BASE_URL` | `https://staging-api.uniinside.net` | Basis endpoint penyajian aset statis (`/uploads`). |

---

## 4. Prosedur Uji Coba Migrasi & Cadangan Basis Data (Dry-Run & Backup)

Sebelum menerapkan perubahan skema basis data di staging:

1. **Pencadangan Penuh (*Database Dump*)**:
   ```bash
   mysqldump -u <DB_USER> -p<DB_PASS> --single-transaction --quick unismiles_staging > unismiles_staging_backup_$(date +%Y%m%d_%H%M%S).sql
   ```
2. **Dry-Run Migrasi Kolom `css_filter`**:
   - Uji eksekusi script `migrate_add_css_filter.sql` pada salinan lokal/staging.
   - Verifikasi apakah skema berhasil ditambahkan tanpa merusak indeks atau foreign key:
     ```sql
     SHOW COLUMNS FROM filters LIKE 'css_filter';
     ```
3. **Prosedur Pemulihan (*Rollback Procedure*)**:
   - Jika terjadi kegagalan skema atau inkonsistensi controller:
     ```sql
     ALTER TABLE filters DROP COLUMN css_filter;
     ```
   - Atau pulihkan seluruh dump basis data cadangan sebelumnya.

---

## 5. Prasyarat Pengujian Perangkat & Hardware Staging

### A. Perangkat Uji Kiosk Photobooth
- Unit mesin kiosk photobooth lab/staging atau mesin virtual uji yang terpasang aplikasi `frontend_uni_gateway`.
- Konfigurasi `x-api-key` perangkat terdaftar pada tabel `kiosks` staging dengan canonical ID uji `KSK-0001`.
- Kiosk disetel pada orientasi portrait standar (`1080x1920`).

### B. Prasyarat Pengujian Hardware Printer Fisik (Persiapan Modul 9D)
- Unit printer thermal (ESC/POS 58mm/80mm) atau dye-sublimation printer (DNP DS-RX1) terhubung ke kiosk uji.
- Gulungan kertas foto terpasang dan cutter mekanis dalam kondisi prima.
- Seluruh pengujian reprint dan kalibrasi wajib diawasi teknisi secara visual di lokasi lab.

---

## 6. Prosedur Verifikasi Sebelum Pendaftaran ke `VERIFIED_STAGING_ALLOWLIST`

Domain host staging HANYA boleh dimasukkan ke dalam `VERIFIED_STAGING_ALLOWLIST` pada [src/lib/templates.ts](file:///Users/dian/TA/UNISMILES-ADMIN/src/lib/templates.ts) jika **SELURUH LIMA SYARAT BERIKUT TERPENUHI**:

- [ ] **Syarat 1 (Bukti Isolasi Database)**: Telah dibuktikan bahwa host backend staging tidak menyambung ke IP/host database produksi `backend-photobooth.uniinside.net`.
- [ ] **Syarat 2 (Non-Production Host)**: Hostname target tidak cocok dan tidak berakhiran dengan entri pada `KNOWN_PRODUCTION_HOSTS`.
- [ ] **Syarat 3 (Validasi SSL/HTTPS)**: Endpoint diakses melalui protokol HTTPS yang aman dan terenkripsi.
- [ ] **Syarat 4 (Uji Bebas Modul Hilang)**: Endpoint `GET /api/filters` dan `GET /api/v1/admin/users` tidak melempar `MODULE_NOT_FOUND` atau `500 Internal Server Error`.
- [ ] **Syarat 5 (Persetujuan Tertulis)**: Pemilik sistem memberikan konfirmasi resmi tertulis (*explicit approval*) untuk pengujian mutasi staging.

---

*Spesifikasi prasyarat staging selesai disusun. Safeguard `VERIFIED_STAGING_ALLOWLIST=[]` dan `ENABLE_BACKEND_MUTATIONS=false` tetap dipertahankan.*
