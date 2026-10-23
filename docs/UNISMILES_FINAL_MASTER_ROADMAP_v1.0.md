# UNISMILES FINAL MASTER ROADMAP v1.0
## Scope Frozen: Modul 1 s/d Modul 9 (Tanpa Modul 10)

Dokumen ini merupakan artefak kanonikal peta jalan (*Master Roadmap*) arsitektur dan integrasi sistem **Uni-Smiles Photobooth Ecosystem**, yang mencakup portal **Admin Dian** (`diantsdaeli/UNISMILES-ADMIN`), portal **Admin Nadin** (`nathaniapelleng15/admin_uni_gateway`), **Backend API Gateway** (`nathaniapelleng15/backend_uni_gateway`), dan **Frontend Kiosk Photobooth** (`nathaniapelleng15/frontend_uni_gateway`).

---

## 1. Prinsip & Aturan Batasan Ekosistem (Invariants)

1. **Scope Frozen (Terkunci Mutlak)**: Ruang lingkup pekerjaan berhenti secara definitif pada **Modul 9D**. **TIDAK ADA MODUL 10**.
2. **Zero Production Mutation**: Seluruh pengujian kode baru wajib berjalan di bawah proteksi `ENABLE_BACKEND_MUTATIONS=false` dan `DEFAULT_DATA_SOURCE_MODE='SAFE_SIMULATION'` hingga lingkungan staging terisolasi resmi disetujui.
3. **No Automated Deployment**: Tidak ada mekanisme CI/CD atau deployment otomatis ke server staging/produksi. Setiap perpindahan tahapan dan penerapan kode ke lingkungan operasional memerlukan persetujuan tertulis (*explicit approval*).
4. **Resolution of Critical Blockers**: Seluruh temuan berstatus *Critical* dan *High* pada Blocker Register (BLK-01 s/d BLK-06) wajib tuntas diverifikasi sebelum keputusan rilis produksi (*Production GO*).
5. **No Fictitious Endpoints or Data Fabrication**: Tidak boleh mengarang endpoint backend yang belum terpasang atau merekayasa respons sukses tanpa kontrak yang valid.

---

## 2. Struktur Master Roadmap (Modul 1 – 9)

```
[Modul 1 - 7: Foundational Modules] (CLOSED)
  ├── Modul 1: API Client, Authentication & Sidebar Layout (CLOSED)
  ├── Modul 2: Gallery Templates, Fullscreen Canvas Frame Editor & Stickers (CLOSED)
  ├── Modul 3: Printer Configuration & Thermal Calibration (CLOSED)
  ├── Modul 4: Kiosk Management & Device Authentication UI (CLOSED)
  ├── Modul 5: Session Repository, Photo Categorization & CSV Export (CLOSED)
  ├── Modul 6: Payment Verification, QRIS Transactions & Accounting Audit (CLOSED)
  └── Modul 7: User Management, Admin Mitra & Multi-Tenant Access (CLOSED)

[Modul 8: Cross-System Integration & Hardening] (CLOSED)
  ├── Modul 8A: Four-Repository Read-Only Gap Audit (CLOSED)
  ├── Modul 8B: Dashboard API Alignment & Photo Filters Integration (CLOSED)
  ├── Modul 8C: End-to-End Contract Testing & System Hardening (CLOSED)
  └── Modul 8D: Final Integration Acceptance & Handover (CLOSED)

[Modul 9: Staging Verification, E2E Validation & Release Handover] (ACTIVE)
  ├── Modul 9A: Security & Production Readiness (ACTIVE)
  │     ├── Phase 1: Read-Only Audit & Evidence Reconciliation (CLOSED)
  │     └── Phase 2: Security Remediation Design & Staging Prerequisites (ACTIVE)
  ├── Modul 9B: Isolated Staging Verification (UPCOMING)
  ├── Modul 9C: Operational E2E Validation (UPCOMING)
  └── Modul 9D: Final Release Decision & Handover (FINAL / NO MODULE 10)
```

---

## 3. Rincian Eksekusi & Status Tahapan

### A. Modul 1 s/d 7 — Pembangunan Fondasi Portal Admin (CLOSED)
- **Modul 1 (Auth & Layout)**: Integrasi JWT, normalisasi API base URL, layout responsif neon aesthetic, preservasi sidebar.
- **Modul 2 (Templates & Canvas)**: Fullscreen Canvas Frame Editor, rendering 7 layout presets, sticker library, isolasi save safeguard.
- **Modul 3 (Printer Calibration)**: Kontrak geometri thermal (lebar cetak maks 48mm, kertas 60mm, DPI 300), slider kalibrasi foto, isolasi spooler.
- **Modul 4 (Kiosk Management)**: Monitoring status kiosk, resolusi canonical KSK-0001 s/d KSK-0005, device auth UI, health JSON parsing.
- **Modul 5 (Sessions & Photos)**: Normalisasi sesi envelope ganda, kategorisasi foto (frame komposit vs single mentah), sanitasi URL foto, ekspor CSV aman (CWE-1236).
- **Modul 6 (Payment Transactions)**: Audit transaksi, deteksi provider QRIS, visual verification attempt modal, anti-double counting.
- **Modul 7 (User Management)**: Manajemen Admin Mitra, form validation, Web Crypto zero password storage, kekebalan Super Admin terakhir, isolasi URL langsung `/users`.

---

### B. Modul 8 — Integrasi Lintas Repositori & Kontrak Sistem (CLOSED)
- **Modul 8A (Four-Repo Audit)**: Audit gap 4 repositori, identifikasi unmounted route `filterRoutes.js`, endpoint user, dan keselarasan Duitku/GoPay.
- **Modul 8B (Dashboard & Filters)**: Penyelarasan endpoint `/api/v1/admin/dashboard`, pemisahan Completed Sessions vs Verified Paid Revenue, integrasi Photo Filters tab dengan storage terisolasi.
- **Modul 8C (Contract Testing & Hardening)**: Eksekusi 16 automated test suites, hardening race condition request abort, sanitasi formula CSV, pengujian fail-closed 401/403.
- **Modul 8D (Final Integration Acceptance)**: Penetapan baseline Release Candidate `RC-UNISMILES-ADMIN-v1.0.0-RC1` (identitas dokumen evaluasi), audit 12 area penerimaan, commit & push dokumentasi integrasi final (`62b4e5b`).

---

### C. Modul 9 — Kesiapan Produksi, Staging & Handover (ACTIVE)

#### 1. Modul 9A: Security & Production Readiness Audit (CURRENT)
- **Phase 1 (Read-Only Audit)**:
  - Rekonsiliasi jumlah pengujian otomatis: terbukti 16 test suites dengan **2.063 assertions PASS (0 failures)**.
  - Investigasi akar masalah inkonsistensi dokumentasi historis (kesalahan ketik tabel manual, bukan cacat runner).
  - Audit mendalam menemukan `models/filterModel.js` hilang di backend, kolom `css_filter` belum ada di tabel `filters`, dan ambiguitas path `/api/filters` vs `/api/v1/filters`.
- **Phase 2 (Security Remediation Design & Staging Prerequisites)**:
  - Penyusunan master roadmap kanonikal fisik (`UNISMILES_FINAL_MASTER_ROADMAP_v1.0.md`). Item BLK-07 hanya dianggap selesai secara repositori setelah dokumen ini berhasil di-commit dan di-push ke remote branch.
  - Rekonsiliasi test evidence formal (`MODUL_9A_TEST_EVIDENCE_RECONCILIATION.md`).
  - Spesifikasi desain remediasi backend (`MODUL_9A_BACKEND_SECURITY_REMEDIATION_PLAN.md`).
  - Prasyarat lingkungan staging terisolasi (`MODUL_9A_STAGING_PREREQUISITES.md`).
  - Penegasan status: Seluruh temuan keamanan backend tetap berstatus OPEN/BLOCKED (belum diremediasi pada repositori backend).

#### 2. Modul 9B: Isolated Staging Verification (UPCOMING)
- Penyediaan backend staging dengan skema basis data terpisah (non-produksi).
- Implementasi `filterModel.js` dan migrasi kolom `css_filter` pada tabel `filters`.
- Penyelarasan dual-path mounting `/api/filters` (photobooth kiosk) dan `/api/v1/filters` (admin client) dilengkapi token/API-key authorization.
- Pemasangan route `/api/v1/admin/users` terlindungi `verifyToken` dan `requireRole(['Super Admin'])`.
- Verifikasi isolasi multi-tenant server-side pada seluruh controller.

#### 3. Modul 9C: Operational E2E Validation (UPCOMING)
- Konfigurasi kredensial sandbox Duitku dan endpoint webhook publik staging.
- Pengujian transaksi pembayaran QRIS otomatis: alur inquiry -> pembayaran pelanggan -> webhook callback -> verifikasi database.
- Pengujian sinkronisasi filter dan frame templates langsung ke software photobooth kiosk.
- Uji beban ringan dan verifikasi penanganan timeout jaringan.

#### 4. Modul 9D: Final Release Decision & Handover (FINAL)
- Pengujian kalibrasi printer fisik pada mesin hardware photobooth di lokasi staging/lab.
- Evaluasi penutupan seluruh item Blocker Register (BLK-01 s/d BLK-07).
- Keputusan formal GO / NO-GO untuk rilis produksi.
- Penyerahan dokumentasi operasional, panduan pemeliharaan, dan prosedur penanganan insiden (*Runbook*).
- **Proyek Selesai (Tidak Ada Modul 10)**.

---

## 4. Matriks Ketergantungan Tahapan (Stage Gate Criteria)

| Tahap | Prasyarat Wajib Masuk (Input Gate) | Kriteria Kelulusan (Exit Gate) |
| :--- | :--- | :--- |
| **9A** | Baseline Modul 8D ter-commit (`62b4e5b`). | Dokumentasi remediasi keamanan, staging prerequisites, dan rekonsiliasi test selesai tanpa perubahan kode aplikasi. |
| **9B** | Persetujuan desain 9A; tersedianya server staging dengan database terisolasi. | Seluruh endpoint unmounted (`filters`, `users`) terpasang aman dan terverifikasi di staging. |
| **9C** | Kelulusan 9B; tersedianya domain HTTPS staging & merchant sandbox Duitku. | Siklus pembayaran QRIS dan sinkronisasi kiosk live tervalidasi 100% tanpa mock. |
| **9D** | Kelulusan 9C; akses ke unit mesin kiosk dan printer fisik. | Zero critical blockers; laporan audit final disetujui pemilik sistem. |

---

*Dokumen ini merupakan spesifikasi resmi UNISMILES FINAL MASTER ROADMAP v1.0. Seluruh pengembangan sistem wajib tunduk pada batasan tahapan di atas.*
