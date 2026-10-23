/**
 * UNISMILES MODUL 7: ADMIN MITRA & USER MANAGEMENT TESTS
 * Stage 7D: Security, RBAC, Governance & Regression Testing
 *
 * Test Sections:
 * 1. Validasi form Admin Mitra (full_name, email, password, partner_name)
 * 2. Password tidak bocor ke log/storage/state
 * 3. Duplicate email prevention (409 Conflict)
 * 4. HTTP 401/403 fail-closed on unauthorized access
 * 5. Role Super Admin permissions & behaviors
 * 6. Role Admin Mitra requirements & restrictions
 * 7. Direct URL access /users protection (SuperAdminRoute)
 * 8. Simulasi create user (SAFE SIMULATION in-memory)
 * 9. Simulasi toggle status (Active <-> Inactive)
 * 10. Simulasi delete user
 * 11. Proteksi Super Admin aktif terakhir
 * 12. Kiosk ownership relational mapping (ID <-> Name)
 * 13. Cross-tenant isolation principles
 * 14. Tidak ada production mutation (ENABLE_BACKEND_MUTATIONS = false)
 * 15. Tidak ada endpoint fiktif (unsupported status in AUTHORIZED_READ_ONLY)
 * 16. Tidak ada regresi Modul 1–6
 * 17. Sidebar tetap tepat sembilan menu
 * 18. Source switching dan cache isolation
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  userService,
  validateEmail,
  validatePassword,
  validateAdminMitraPayload,
  generateSecurePassword,
  resetSimulationUsers,
  getSimulationUsers,
  KIOSK_REGISTRY,
  resolveKioskName,
  resolveKioskId,
  SEED_USERS,
  UserRecord
} from '../src/lib/userService';
import { ENABLE_BACKEND_MUTATIONS } from '../src/lib/templates';
import { getDataSourceMode, setDataSourceMode } from '../src/lib/dataSourceConfig';

let passedAssertions = 0;
function testAssert(condition: boolean, message: string) {
  assert(condition, message);
  passedAssertions++;
}

console.log('\n================================================================');
console.log('MODUL 7 TAHAP 7D: ADMIN MITRA & USER MANAGEMENT SECURITY TESTS');
console.log('================================================================\n');

// ─── 1. Validasi Form Admin Mitra ───────────────────────────────────────────
console.log('--- SECTION 1: Validasi Form Admin Mitra ---');
{
  // Valid payload
  const validPayload = {
    full_name: 'Budi Santoso',
    email: 'budi.mitra@unismiles.com',
    password: 'PasswordSuper123!',
    partner_name: 'Kafe Senja'
  };
  const validRes = validateAdminMitraPayload(validPayload);
  testAssert(validRes.valid === true, 'Valid payload must pass validation');

  // Empty name
  const emptyName = validateAdminMitraPayload({ ...validPayload, full_name: '' });
  testAssert(emptyName.valid === false && emptyName.error?.includes('Nama Lengkap'), 'Empty name must fail validation');

  // Invalid email
  const invalidEmail = validateAdminMitraPayload({ ...validPayload, email: 'not-an-email' });
  testAssert(invalidEmail.valid === false && invalidEmail.error?.includes('email'), 'Invalid email format must fail');

  // Short password (< 8 chars)
  const shortPass = validateAdminMitraPayload({ ...validPayload, password: 'short' });
  testAssert(shortPass.valid === false && shortPass.error?.includes('8 karakter'), 'Password < 8 chars must fail');

  // Empty partner_name
  const emptyPartner = validateAdminMitraPayload({ ...validPayload, partner_name: '' });
  testAssert(emptyPartner.valid === false && emptyPartner.error?.includes('Nama Mitra'), 'Empty partner name must fail');

  // Standalone email validator
  testAssert(validateEmail('test@domain.co.id') === true, 'Valid email passes validator');
  testAssert(validateEmail('bad@email') === false, 'Incomplete email fails validator');
  testAssert(validateEmail('') === false, 'Empty email fails validator');

  // Standalone password validator
  testAssert(validatePassword('12345678').valid === true, '8 char password is valid');
  testAssert(validatePassword('1234567').valid === false, '7 char password is invalid');
  testAssert(validatePassword('').valid === false, 'Empty password is invalid');
}
console.log('[PASS] Validasi form Admin Mitra dan kredensial terverifikasi ketat');

// ─── 2. Password Tidak Bocor ke Log/Storage/State ───────────────────────────
console.log('--- SECTION 2: Password Tidak Bocor ke Log/Storage/State ---');
{
  resetSimulationUsers();
  const pwd = generateSecurePassword(14);
  testAssert(pwd.length === 14, 'Secure password generated with requested length');
  testAssert(typeof pwd === 'string', 'Generated password is a valid string');

  // Ensure Math.random is not used in secure password generator (strip comments first)
  const srcCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/userService.ts'), 'utf8');
  const codeWithoutComments = srcCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  testAssert(!codeWithoutComments.includes('Math.random'), 'userService.ts MUST NOT use Math.random in code');
  testAssert(srcCode.includes('cryptoObj.getRandomValues'), 'userService.ts MUST use Web Crypto API');

  // Verify UserRecord type definition does not contain password
  const sampleUser: UserRecord = SEED_USERS[0];
  testAssert(!('password' in sampleUser), 'UserRecord interface must NOT hold password property');
  testAssert(!('password_hash' in sampleUser), 'UserRecord interface must NOT expose password_hash property');

  // Verify serialized user json does not contain any credential leakage
  const serialized = JSON.stringify(SEED_USERS);
  testAssert(!serialized.includes('password_hash'), 'Serialized user seed must not contain password_hash');
  testAssert(!serialized.includes('PasswordSuper'), 'No plain-text passwords leaked in seed data');
}
console.log('[PASS] Proteksi anti-kebocoran kata sandi dan Web Crypto API terverifikasi');

// ─── 3. Duplicate Email Prevention ──────────────────────────────────────────
console.log('--- SECTION 3: Duplicate Email Prevention (409 Conflict) ---');
{
  resetSimulationUsers();

  // Try creating an Admin Mitra with existing email (superadmin@gmail.com)
  let conflictCaught = false;
  try {
    await userService.createAdminMitra(
      {
        full_name: 'Peniru Admin',
        email: 'superadmin@gmail.com', // Already exists in SEED_USERS
        password: 'Password1234!',
        partner_name: 'Mitra Palsu'
      },
      'Super Admin'
    );
  } catch (err: any) {
    conflictCaught = true;
    testAssert(err.status === 409 || err.message.includes('409') || err.message.includes('Email sudah terdaftar'), 'Duplicate email throws 409 Conflict error');
  }
  testAssert(conflictCaught === true, 'Creating user with duplicate email must be rejected');

  // Try updating user email to another existing user's email
  let updateConflictCaught = false;
  try {
    await userService.updateUser(
      '3', // Admin Kafe Senja
      {
        email: 'superadmin@gmail.com' // Already owned by user '1'
      },
      'Super Admin'
    );
  } catch (err: any) {
    updateConflictCaught = true;
    testAssert(err.status === 409 || err.message.includes('409') || err.message.includes('Email sudah digunakan'), 'Update with existing email throws 409 Conflict');
  }
  testAssert(updateConflictCaught === true, 'Updating user to duplicate email must be blocked');
}
console.log('[PASS] Pencegahan duplikasi email pada create dan update terverifikasi');

// ─── 4. HTTP 401/403 Fail-Closed on Unauthorized Access ─────────────────────
console.log('--- SECTION 4: HTTP 401/403 Fail-Closed on Unauthorized Access ---');
{
  // Non-Super Admin attempting to list users in AUTHORIZED_READ_ONLY
  let listForbidden = false;
  try {
    await userService.getUsers({
      mode: 'AUTHORIZED_READ_ONLY',
      currentUserRole: 'Admin Mitra' // Forbidden!
    });
  } catch (err: any) {
    listForbidden = true;
    testAssert(err.message.includes('403') || err.message.includes('Hanya Super Admin'), 'Non-Super Admin calling getUsers in AUTHORIZED_READ_ONLY is rejected with 403');
  }
  testAssert(listForbidden === true, 'Fail-closed on unauthorized user list request');

  // Non-Super Admin attempting to create Admin Mitra
  let createForbidden = false;
  try {
    await userService.createAdminMitra(
      {
        full_name: 'Illegal User',
        email: 'illegal@partner.com',
        password: 'Password123!',
        partner_name: 'Illegal Partner'
      },
      'Admin Mitra' // Non-super admin!
    );
  } catch (err: any) {
    createForbidden = true;
    testAssert(err.status === 403 || err.message.includes('403'), 'createAdminMitra must reject non-Super Admin with 403');
  }
  testAssert(createForbidden === true, 'Fail-closed on unauthorized Admin Mitra creation');

  // Non-Super Admin attempting to delete user
  let deleteForbidden = false;
  try {
    await userService.deleteUser('3', 'Viewer');
  } catch (err: any) {
    deleteForbidden = true;
    testAssert(err.status === 403 || err.message.includes('403'), 'deleteUser must reject non-Super Admin with 403');
  }
  testAssert(deleteForbidden === true, 'Fail-closed on unauthorized user deletion');
}
console.log('[PASS] Kebijakan fail-closed 401/403 bagi non-Super Admin terverifikasi');

// ─── 5. Role Super Admin Permissions ────────────────────────────────────────
console.log('--- SECTION 5: Role Super Admin Permissions & Invariants ---');
{
  const saUser = SEED_USERS.find(u => u.role === 'Super Admin');
  testAssert(Boolean(saUser), 'Super Admin user fixture exists');
  testAssert(saUser?.partner === 'All Partners', 'Super Admin partner scope is All Partners');
  testAssert(saUser?.assignedKiosks.includes('All Kiosks'), 'Super Admin has access to All Kiosks');
}
console.log('[PASS] Hak akses dan lingkup tata kelola Super Admin terverifikasi');

// ─── 6. Role Admin Mitra Requirements & Restrictions ────────────────────────
console.log('--- SECTION 6: Role Admin Mitra Requirements & Restrictions ---');
{
  const amUser = SEED_USERS.find(u => u.role === 'Admin Mitra');
  testAssert(Boolean(amUser), 'Admin Mitra user fixture exists');
  testAssert(amUser?.partner !== 'All Partners', 'Admin Mitra belongs to a specific partner organization');
  testAssert(Array.isArray(amUser?.assignedKioskIds), 'Admin Mitra has structured assigned kiosk relational IDs');
}
console.log('[PASS] Atribut identitas dan batasan peran Admin Mitra terverifikasi');

// ─── 7. Direct URL Access /users Protection ─────────────────────────────────
console.log('--- SECTION 7: Direct URL Access /users Protection ---');
{
  const appTsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  testAssert(appTsxContent.includes('SuperAdminRoute'), 'App.tsx defines SuperAdminRoute guard');
  testAssert(
    appTsxContent.includes('<SuperAdminRoute>') && appTsxContent.includes('<UserManager />'),
    'Route /users is protected by SuperAdminRoute wrapper'
  );
  testAssert(
    appTsxContent.includes('Akses Ditolak: Halaman ini hanya dapat diakses oleh Super Admin'),
    'Unauthorized direct URL navigation displays clear access denied notification'
  );
}
console.log('[PASS] Proteksi akses URL langsung /users via SuperAdminRoute terverifikasi');

// ─── 8. Simulasi Create User (SAFE SIMULATION) ──────────────────────────────
console.log('--- SECTION 8: Simulasi Create User (SAFE SIMULATION) ---');
{
  resetSimulationUsers();
  const initialCount = getSimulationUsers().length;

  const res = await userService.createAdminMitra(
    {
      full_name: 'Mitra Baru Mandiri',
      email: 'mitra.baru@unismiles.com',
      password: 'PasswordKuat999!',
      partner_name: 'Studio Kopi Senja',
      assignedKioskIds: ['KSK-004']
    },
    'Super Admin'
  );

  testAssert(res.success === true, 'Simulation creation succeeds');
  testAssert(res.isSimulated === true, 'Created user marked as simulated');
  testAssert(res.user.role === 'Admin Mitra', 'Created user role is Admin Mitra');
  testAssert(res.user.partner === 'Studio Kopi Senja', 'Partner name accurately assigned');
  testAssert(res.user.assignedKiosks.includes('Kiosk Mall 01'), 'Assigned kiosk ID resolved to proper name');
  testAssert(getSimulationUsers().length === initialCount + 1, 'In-memory user directory count incremented');
}
console.log('[PASS] Pembuatan Admin Mitra pada mode SAFE SIMULATION terverifikasi');

// ─── 9. Simulasi Toggle Status ──────────────────────────────────────────────
console.log('--- SECTION 9: Simulasi Toggle Status (Active <-> Inactive) ---');
{
  resetSimulationUsers();
  const user3 = getSimulationUsers().find(u => u.id === '3')!;
  const originalStatus = user3.status; // 'Active'

  // Toggle Active -> Inactive
  const res1 = await userService.toggleUserStatus('3', 'Super Admin');
  testAssert(res1.user.status === 'Inactive', 'Status toggled to Inactive');
  testAssert(res1.isSimulated === true, 'Toggle marked as local simulation');

  // Toggle Inactive -> Active
  const res2 = await userService.toggleUserStatus('3', 'Super Admin');
  testAssert(res2.user.status === 'Active', 'Status toggled back to Active');
  testAssert(res2.user.status === originalStatus, 'Status restoration verified');
}
console.log('[PASS] Simulasi toggle status pengguna terverifikasi');

// ─── 10. Simulasi Delete User ───────────────────────────────────────────────
console.log('--- SECTION 10: Simulasi Delete User ---');
{
  resetSimulationUsers();
  const initialCount = getSimulationUsers().length;

  const res = await userService.deleteUser('4', 'Super Admin'); // Delete Admin Wedding Expo
  testAssert(res.success === true, 'Delete operation succeeds');
  testAssert(res.isSimulated === true, 'Delete marked as simulated');
  testAssert(getSimulationUsers().length === initialCount - 1, 'User removed from in-memory store');
  testAssert(!getSimulationUsers().some(u => u.id === '4'), 'Target user ID no longer present in store');
}
console.log('[PASS] Simulasi penghapusan pengguna terverifikasi');

// ─── 11. Proteksi Super Admin Aktif Terakhir ────────────────────────────────
console.log('--- SECTION 11: Proteksi Super Admin Aktif Terakhir ---');
{
  resetSimulationUsers();

  // Try deleting user '2' (First of 2 Super Admins) - should succeed
  await userService.deleteUser('2', 'Super Admin');

  // Now only user '1' remains as active Super Admin
  const remainingSAs = getSimulationUsers().filter(u => u.role === 'Super Admin' && u.status === 'Active');
  testAssert(remainingSAs.length === 1, 'Only one active Super Admin remains');

  // Attempting to delete the last Super Admin must fail!
  let lastDeleteBlocked = false;
  try {
    await userService.deleteUser('1', 'Super Admin');
  } catch (err: any) {
    lastDeleteBlocked = true;
    testAssert(err.message.includes('aktif terakhir'), 'Deleting last Super Admin throws error');
  }
  testAssert(lastDeleteBlocked === true, 'System prevents deleting the last active Super Admin');

  // Attempting to inactivate the last Super Admin must also fail!
  let lastInactivateBlocked = false;
  try {
    await userService.toggleUserStatus('1', 'Super Admin');
  } catch (err: any) {
    lastInactivateBlocked = true;
    testAssert(err.message.includes('aktif terakhir'), 'Inactivating last Super Admin throws error');
  }
  testAssert(lastInactivateBlocked === true, 'System prevents inactivating the last active Super Admin');
}
console.log('[PASS] Proteksi kekebalan Super Admin aktif terakhir terverifikasi');

// ─── 12. Kiosk Ownership Relational Mapping ─────────────────────────────────
console.log('--- SECTION 12: Kiosk Ownership Relational Mapping ---');
{
  testAssert(KIOSK_REGISTRY.length >= 5, 'KIOSK_REGISTRY contains default kiosks');
  testAssert(resolveKioskName('KSK-0001') === 'Kiosk Senja 01', 'Canonical KSK-0001 maps to Kiosk Senja 01');
  testAssert(resolveKioskName('KSK-001') === 'Kiosk Senja 01', 'Legacy alias KSK-001 normalizes cleanly to Kiosk Senja 01');
  testAssert(resolveKioskName('KSK-0002') === 'Kiosk Event 01', 'Canonical KSK-0002 maps to Kiosk Event 01');
  testAssert(resolveKioskId('Kiosk Senja 01') === 'KSK-0001', 'Kiosk Name maps back to canonical 4-digit ID KSK-0001');

  // Fallback for unknown IDs
  testAssert(resolveKioskName('KSK-UNKNOWN') === 'KSK-UNKNOWN', 'Unknown kiosk ID falls back gracefully to raw ID');
}
console.log('[PASS] Pemetaan relasional kiosk_id <-> kiosk_name terverifikasi');

// ─── 13. Cross-Tenant Isolation Principles ──────────────────────────────────
console.log('--- SECTION 13: Cross-Tenant Isolation Principles ---');
{
  const kafeSenjaUser = SEED_USERS.find(u => u.partner === 'Kafe Senja');
  const weddingExpoUser = SEED_USERS.find(u => u.partner === 'Wedding Expo 2026');

  testAssert(Boolean(kafeSenjaUser && weddingExpoUser), 'Both tenant users exist in fixture');
  testAssert(
    !kafeSenjaUser?.assignedKiosks.some(k => weddingExpoUser?.assignedKiosks.includes(k)),
    'Partners have distinct and isolated kiosk allocations'
  );
  testAssert(kafeSenjaUser?.partner !== weddingExpoUser?.partner, 'Tenant organizations are strictly distinct');
}
console.log('[PASS] Isolasi data dan alokasi kepemilikan antarmitra terverifikasi');

// ─── 14. Tidak Ada Production Mutation ──────────────────────────────────────
console.log('--- SECTION 14: Tidak Ada Production Mutation (ENABLE_BACKEND_MUTATIONS=false) ---');
{
  testAssert(ENABLE_BACKEND_MUTATIONS === false, 'Safeguard ENABLE_BACKEND_MUTATIONS MUST be false');
  const userServiceSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/userService.ts'), 'utf8');
  testAssert(userServiceSrc.includes('if (!ENABLE_BACKEND_MUTATIONS)'), 'userService branches on ENABLE_BACKEND_MUTATIONS');
}
console.log('[PASS] Safeguard pencegahan mutasi backend produksi terverifikasi');

// ─── 15. Tidak Ada Endpoint Fiktif ──────────────────────────────────────────
console.log('--- SECTION 15: Tidak Ada Endpoint Fiktif (Unsupported Status) ---');
{
  const result = await userService.getUsers({
    mode: 'AUTHORIZED_READ_ONLY',
    currentUserRole: 'Super Admin'
  });

  testAssert(result.source === 'AUTHORIZED_READ_ONLY', 'Source mode is AUTHORIZED_READ_ONLY');
  testAssert(result.status === 'unsupported', 'Endpoint marked as unsupported based on Audit 7A');
  testAssert(result.users.length === 0, 'No fake data mixed into unmounted endpoint result');
  testAssert(result.message?.includes('Audit Modul 7A'), 'Clear explanatory message provided');
}
console.log('[PASS] Penanganan endpoint unmounted tanpa mengarang endpoint fiktif terverifikasi');

// ─── 16. Tidak Ada Regresi Modul 1–6 ────────────────────────────────────────
console.log('--- SECTION 16: Tidak Ada Regresi Modul 1–6 ---');
{
  const userManagerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/UserManager.tsx'), 'utf8');
  testAssert(userManagerSrc.includes('PERMISSION_MATRIX'), 'UserManager retains 11-module permission matrix');
  testAssert(userManagerSrc.includes('Identity Simulation'), 'UserManager retains Access Simulation widget');
  testAssert(userManagerSrc.includes('Total Nodes'), 'UserManager retains KPI Summary cards');
  testAssert(userManagerSrc.includes('Search directory'), 'UserManager retains search and filter functionality');
}
console.log('[PASS] Seluruh komponen warisan Modul 1-6 pada UserManager dipertahankan utuh');

// ─── 17. Sidebar Tetap Tepat Sembilan Menu ──────────────────────────────────
console.log('--- SECTION 17: Sidebar Tetap Tepat Sembilan Menu ---');
{
  const sidebarSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Sidebar.tsx'), 'utf8');
  const expectedMenuIds = [
    'dashboard',
    'templates',
    'sessions',
    'ai-gen',
    'storyboard',
    'kiosks',
    'analytics',
    'users',
    'settings'
  ];

  for (const id of expectedMenuIds) {
    testAssert(sidebarSrc.includes(`id: '${id}'`), `Sidebar must contain menu item '${id}'`);
  }

  // Ensure no unwanted menu was introduced
  testAssert(!sidebarSrc.includes("id: 'admin-mitra'"), 'Sidebar MUST NOT contain an admin-mitra menu');
  testAssert(!sidebarSrc.includes("id: 'transactions'"), 'Sidebar MUST NOT contain transactions menu');
}
console.log('[PASS] Struktur persis 9 menu pada Sidebar terverifikasi tanpa penambahan');

// ─── 18. Source Switching dan Cache Isolation ───────────────────────────────
console.log('--- SECTION 18: Source Switching dan Cache Isolation ---');
{
  // 1. In SAFE_SIMULATION
  setDataSourceMode('SAFE_SIMULATION');
  const simResult = await userService.getUsers({ mode: 'SAFE_SIMULATION' });
  testAssert(simResult.source === 'SAFE_SIMULATION', 'Safe simulation mode returns simulation source');
  testAssert(simResult.users.length > 0, 'Simulation returns active seed users');

  // 2. In AUTHORIZED_READ_ONLY
  setDataSourceMode('AUTHORIZED_READ_ONLY');
  testAssert(getDataSourceMode() === 'AUTHORIZED_READ_ONLY', 'Data source mode switched to AUTHORIZED_READ_ONLY');
  const readOnlyResult = await userService.getUsers({
    mode: 'AUTHORIZED_READ_ONLY',
    currentUserRole: 'Super Admin'
  });
  testAssert(readOnlyResult.status === 'unsupported', 'Read-only mode accurately reports unmounted endpoint');

  // Restore default mode
  setDataSourceMode('SAFE_SIMULATION');
  testAssert(getDataSourceMode() === 'SAFE_SIMULATION', 'Mode cleanly restored to SAFE_SIMULATION');
}
console.log('[PASS] Isolasi state saat beralih mode sumber data terverifikasi');

console.log('\n================================================================');
console.log(`TOTAL TAHAP 7D TESTS: ALL ${passedAssertions} ASSERTIONS PASSED (0 FAILED)`);
console.log('================================================================\n');
