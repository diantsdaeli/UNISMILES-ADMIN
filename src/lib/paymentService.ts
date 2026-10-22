/**
 * UNISMILES PAYMENT & FINANCIAL TRANSACTION SERVICE
 * Modul 6: Payment Verification & Financial Transactions
 *
 * Invariants:
 * 1. ENABLE_BACKEND_MUTATIONS = false (Fail-closed live protection).
 * 2. Never conflate gross session amount with received paid revenue.
 * 3. Anti-CSV Formula Injection (CWE-1236) sanitization.
 * 4. Multi-Tenant RBAC isolation between Super Admin and Admin Mitra.
 * 5. Strict rejection of mock fallback on HTTP 401 / 403.
 * 6. Indonesian Rupiah discrete integer math (no floating point cents).
 */

import api from './api';

export const ENABLE_BACKEND_MUTATIONS = false;
export const VERIFIED_STAGING_ALLOWLIST: string[] = [];

export type TransactionStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';

export interface TransactionItem {
  id: string;
  transaction_code: string;
  session_id: string;
  session_code: string;
  kiosk_id: string;
  kiosk_name: string;
  partner_id?: string | number;
  partner_name?: string;
  amount: number; // Discrete IDR integer
  payment_method: 'qris' | 'cash' | 'duitku' | 'gopay' | 'manual_override' | string;
  status: TransactionStatus;
  verification_method?: string;
  provider_detected?: string;
  paid_at?: string | null;
  verified_at?: string | null;
  created_at: string;
  failure_reason_code?: string | null;
  isSimulated?: boolean;
  is_simulated_reference?: boolean; // True if transaction_code is synthetic (e.g. US-TRX-SessionID)
}

export interface PaymentVerificationAttempt {
  id: string;
  session_id: string;
  kiosk_id: string;
  attempt_number: number;
  status: 'received' | 'verified' | 'failed' | string;
  decision: 'processing' | 'verified' | 'rejected' | string;
  expected_amount: number;
  extracted_amount?: number | null;
  provider_detected?: string | null;
  screen_type?: string | null;
  evidence_private_path?: string | null;
  evidence_url?: string | null;
  reason_codes?: string[];
  ocr_confidence?: number | null;
  quality_score?: number | null;
  created_at: string;
  isSimulated?: boolean;
}

export interface PaymentProfile {
  id?: number;
  user_id?: number;
  profile_name?: string;
  merchant_name: string;
  display_name: string;
  payment_required: boolean;
  unique_amount_enabled: boolean;
  session_ttl_minutes: number;
  verification_mode: 'visual_proof' | 'duitku' | 'gopay' | string;
  merchant_aliases: string[];
  active_providers: string[];
  qris_image_url?: string | null;
  show_digital_package?: boolean;
  show_print_package?: boolean;
  show_cursor_lock_icon?: boolean;
  show_calibration_icon?: boolean;
  isSimulated?: boolean;
}

export interface KioskRevenueBreakdown {
  kiosk_id: string;
  kiosk_name: string;
  paid_revenue: number;
  gross_sales: number;
  total_transactions: number;
  successful_transactions: number;
  success_rate: number;
}

export interface PartnerRevenueBreakdown {
  partner_id: string;
  partner_name: string;
  paid_revenue: number;
  gross_sales: number;
  total_transactions: number;
  successful_transactions: number;
}

export interface FinancialSummary {
  totalTransactions: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  expiredPayments: number;
  grossTransactionAmount: number; // Nilai kotor seluruh sesi/transaksi
  paidRevenue: number;           // Pendapatan riil dari transaksi sukses/paid
  pendingVolume: number;         // Nominal pending yang belum terverifikasi
  failedVolume: number;          // Nominal transaksi gagal/kedaluwarsa
  settlementRevenue: number;     // Status settlement gateway (0 jika unsupported)
  refundVolume: number;          // Pengembalian dana (0 jika unsupported)
  netRevenue: number;            // paidRevenue - refundVolume
  revenuePerKiosk: Record<string, KioskRevenueBreakdown>;
  revenuePerPartner: Record<string, PartnerRevenueBreakdown>;
}

// Synthetic seed transactions for safe simulation and contract validation
export const SEED_TRANSACTIONS: TransactionItem[] = [
  {
    id: 'TRX-9821',
    transaction_code: 'US-TRX-20260330-001',
    session_id: 'US-9821',
    session_code: 'US-9821',
    kiosk_id: 'kiosk-01',
    kiosk_name: 'Kiosk Central Park Lt. 2',
    partner_id: 'mitra-cp',
    partner_name: 'Mitra Central Park',
    amount: 50000,
    payment_method: 'qris',
    status: 'paid',
    verification_method: 'qris_visual_proof',
    provider_detected: 'BCA Mobile',
    paid_at: '2026-03-30T14:20:15Z',
    verified_at: '2026-03-30T14:20:20Z',
    created_at: '2026-03-30T14:18:00Z',
    isSimulated: true,
    is_simulated_reference: true
  },
  {
    id: 'TRX-9820',
    transaction_code: 'US-TRX-20260330-002',
    session_id: 'US-9820',
    session_code: 'US-9820',
    kiosk_id: 'kiosk-01',
    kiosk_name: 'Kiosk Central Park Lt. 2',
    partner_id: 'mitra-cp',
    partner_name: 'Mitra Central Park',
    amount: 75000,
    payment_method: 'duitku',
    status: 'paid',
    verification_method: 'duitku_callback',
    provider_detected: 'ShopeePay QRIS',
    paid_at: '2026-03-30T14:15:30Z',
    verified_at: '2026-03-30T14:15:35Z',
    created_at: '2026-03-30T14:12:00Z',
    isSimulated: true,
    is_simulated_reference: true
  },
  {
    id: 'TRX-9819',
    transaction_code: 'US-TRX-20260330-003',
    session_id: 'US-9819',
    session_code: 'US-9819',
    kiosk_id: 'kiosk-02',
    kiosk_name: 'Kiosk Mall Kelapa Gading 3',
    partner_id: 'mitra-mkg',
    partner_name: 'Mitra MKG',
    amount: 50000,
    payment_method: 'gopay',
    status: 'paid',
    verification_method: 'gopay_merchant_poll',
    provider_detected: 'GoPay',
    paid_at: '2026-03-30T13:51:10Z',
    verified_at: '2026-03-30T13:51:12Z',
    created_at: '2026-03-30T13:48:00Z',
    isSimulated: true,
    is_simulated_reference: true
  },
  {
    id: 'TRX-9818',
    transaction_code: 'US-TRX-20260330-004',
    session_id: 'US-9818',
    session_code: 'US-9818',
    kiosk_id: 'kiosk-02',
    kiosk_name: 'Kiosk Mall Kelapa Gading 3',
    partner_id: 'mitra-mkg',
    partner_name: 'Mitra MKG',
    amount: 100000,
    payment_method: 'qris',
    status: 'pending',
    verification_method: 'qris_visual_proof',
    created_at: '2026-03-30T13:45:00Z',
    isSimulated: true,
    is_simulated_reference: true
  },
  {
    id: 'TRX-9817',
    transaction_code: 'US-TRX-20260330-005',
    session_id: 'US-9817',
    session_code: 'US-9817',
    kiosk_id: 'kiosk-03',
    kiosk_name: 'Kiosk Grand Indonesia West Mall',
    partner_id: 'mitra-gi',
    partner_name: 'Mitra Grand Indonesia',
    amount: 45000,
    payment_method: 'qris',
    status: 'failed',
    verification_method: 'qris_visual_proof',
    provider_detected: 'UNKNOWN',
    failure_reason_code: 'AMOUNT_MISMATCH',
    created_at: '2026-03-30T12:30:00Z',
    isSimulated: true,
    is_simulated_reference: true
  },
  {
    id: 'TRX-9816',
    transaction_code: 'US-TRX-20260330-006',
    session_id: 'US-9816',
    session_code: 'US-9816',
    kiosk_id: 'kiosk-03',
    kiosk_name: 'Kiosk Grand Indonesia West Mall',
    partner_id: 'mitra-gi',
    partner_name: 'Mitra Grand Indonesia',
    amount: 45000,
    payment_method: 'qris',
    status: 'expired',
    verification_method: 'timeout',
    failure_reason_code: 'EXPIRED_SESSION',
    created_at: '2026-03-30T11:15:00Z',
    isSimulated: true,
    is_simulated_reference: true
  }
];

export const SEED_VERIFICATION_ATTEMPTS: Record<string, PaymentVerificationAttempt[]> = {
  'US-9821': [
    {
      id: 'att-9821-01',
      session_id: 'US-9821',
      kiosk_id: 'kiosk-01',
      attempt_number: 1,
      status: 'verified',
      decision: 'verified',
      expected_amount: 50000,
      extracted_amount: 50000,
      provider_detected: 'BCA Mobile',
      screen_type: 'mobile_screenshot',
      ocr_confidence: 0.98,
      quality_score: 0.95,
      reason_codes: ['EXACT_AMOUNT_MATCH', 'VALID_MERCHANT_MATCH'],
      created_at: '2026-03-30T14:20:18Z',
      isSimulated: true
    }
  ],
  'US-9817': [
    {
      id: 'att-9817-01',
      session_id: 'US-9817',
      kiosk_id: 'kiosk-03',
      attempt_number: 1,
      status: 'failed',
      decision: 'rejected',
      expected_amount: 45000,
      extracted_amount: 25000,
      provider_detected: 'OVO',
      screen_type: 'mobile_camera',
      ocr_confidence: 0.89,
      quality_score: 0.91,
      reason_codes: ['AMOUNT_MISMATCH', 'UNDERPAYMENT_DETECTED'],
      created_at: '2026-03-30T12:30:15Z',
      isSimulated: true
    }
  ]
};

export const DEFAULT_PAYMENT_PROFILE: PaymentProfile = {
  merchant_name: 'UNISMILES PHOTOBOOTH',
  display_name: 'UniSmiles Official',
  payment_required: true,
  unique_amount_enabled: true,
  session_ttl_minutes: 5,
  verification_mode: 'visual_proof',
  merchant_aliases: ['unismiles', 'uni-smiles', 'pt unismiles berkah'],
  active_providers: ['qris', 'gopay', 'duitku'],
  qris_image_url: '/assets/sample-qris.png',
  show_digital_package: true,
  show_print_package: true,
  show_cursor_lock_icon: false,
  show_calibration_icon: false,
  isSimulated: true
};

/**
 * Anti-CSV Formula Injection (CWE-1236)
 * Sanitizes any cell starting with dangerous characters: =, +, -, @, \t, \r
 */
export function sanitizeCSVCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // If first character is dangerous, prepend a single quote
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some(prefix => str.startsWith(prefix))) {
    str = `'${str}`;
  }

  // Escape inner double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Generates secure CSV content from transaction records.
 */
export function generateTransactionCSV(transactions: TransactionItem[]): string {
  const headers = [
    'Transaction Code',
    'Session Code',
    'Kiosk ID',
    'Kiosk Name',
    'Partner Name',
    'Nominal (IDR)',
    'Payment Method',
    'Payment Status',
    'Provider Detected',
    'Created At',
    'Paid At',
    'Verified At',
    'Failure Reason'
  ];

  const headerLine = headers.map(sanitizeCSVCell).join(',');
  const rows = transactions.map(t => [
    sanitizeCSVCell(t.transaction_code),
    sanitizeCSVCell(t.session_code),
    sanitizeCSVCell(t.kiosk_id),
    sanitizeCSVCell(t.kiosk_name),
    sanitizeCSVCell(t.partner_name || '-'),
    sanitizeCSVCell(Math.round(t.amount || 0)),
    sanitizeCSVCell(t.payment_method.toUpperCase()),
    sanitizeCSVCell(t.status.toUpperCase()),
    sanitizeCSVCell(t.provider_detected || '-'),
    sanitizeCSVCell(t.created_at),
    sanitizeCSVCell(t.paid_at || '-'),
    sanitizeCSVCell(t.verified_at || '-'),
    sanitizeCSVCell(t.failure_reason_code || '-')
  ].join(','));

  return [headerLine, ...rows].join('\r\n');
}

/**
 * Calculates strictly verified financial metrics.
 * Critical Invariant: Unpaid/pending/failed amounts MUST NEVER be counted as paid revenue.
 */
export function calculateFinancialSummary(transactions: TransactionItem[]): FinancialSummary {
  let totalTransactions = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  let pendingPayments = 0;
  let expiredPayments = 0;
  let grossTransactionAmount = 0;
  let paidRevenue = 0;
  let pendingVolume = 0;
  let failedVolume = 0;

  const revenuePerKiosk: Record<string, KioskRevenueBreakdown> = {};
  const revenuePerPartner: Record<string, PartnerRevenueBreakdown> = {};

  for (const t of transactions) {
    totalTransactions += 1;
    const amount = Math.round(Number(t.amount) || 0);
    grossTransactionAmount += amount;

    const isPaid = t.status === 'paid' || (t.status as string) === 'success';
    const isPending = t.status === 'pending';
    const isFailed = t.status === 'failed';
    const isExpired = t.status === 'expired';

    if (isPaid) {
      successfulPayments += 1;
      paidRevenue += amount;
    } else if (isPending) {
      pendingPayments += 1;
      pendingVolume += amount;
    } else if (isFailed) {
      failedPayments += 1;
      failedVolume += amount;
    } else if (isExpired) {
      expiredPayments += 1;
      failedVolume += amount;
    }

    // Breakdown per Kiosk
    const kId = t.kiosk_id || 'unknown';
    if (!revenuePerKiosk[kId]) {
      revenuePerKiosk[kId] = {
        kiosk_id: kId,
        kiosk_name: t.kiosk_name || kId,
        paid_revenue: 0,
        gross_sales: 0,
        total_transactions: 0,
        successful_transactions: 0,
        success_rate: 0
      };
    }
    revenuePerKiosk[kId].total_transactions += 1;
    revenuePerKiosk[kId].gross_sales += amount;
    if (isPaid) {
      revenuePerKiosk[kId].successful_transactions += 1;
      revenuePerKiosk[kId].paid_revenue += amount;
    }

    // Breakdown per Partner
    const pId = String(t.partner_id || t.partner_name || 'Direct Kiosks');
    const pName = t.partner_name || 'Direct / Super Admin';
    if (!revenuePerPartner[pId]) {
      revenuePerPartner[pId] = {
        partner_id: pId,
        partner_name: pName,
        paid_revenue: 0,
        gross_sales: 0,
        total_transactions: 0,
        successful_transactions: 0
      };
    }
    revenuePerPartner[pId].total_transactions += 1;
    revenuePerPartner[pId].gross_sales += amount;
    if (isPaid) {
      revenuePerPartner[pId].successful_transactions += 1;
      revenuePerPartner[pId].paid_revenue += amount;
    }
  }

  // Calculate success rates
  for (const kId of Object.keys(revenuePerKiosk)) {
    const k = revenuePerKiosk[kId];
    k.success_rate = k.total_transactions > 0
      ? Math.round((k.successful_transactions / k.total_transactions) * 100)
      : 0;
  }

  const refundVolume = 0; // Unsupported in backend
  const settlementRevenue = 0; // Unsupported direct gateway settlement in backend
  const netRevenue = paidRevenue - refundVolume;

  return {
    totalTransactions,
    successfulPayments,
    failedPayments,
    pendingPayments,
    expiredPayments,
    grossTransactionAmount,
    paidRevenue,
    pendingVolume,
    failedVolume,
    settlementRevenue,
    refundVolume,
    netRevenue,
    revenuePerKiosk,
    revenuePerPartner
  };
}

/**
 * Multi-Tenant RBAC filter:
 * - Super Admin sees all transactions.
 * - Admin Mitra only sees transactions belonging to their kiosk or partner account.
 */
export function filterTransactionsByRole(transactions: TransactionItem[], user: any): TransactionItem[] {
  if (!user) return [];

  const isSuperAdmin = user.role === 'Super Admin' || user.role === 'admin' || user.isSuperAdmin === true;
  if (isSuperAdmin) {
    return transactions;
  }

  const partnerId = user.partner_id || user.partnerId || user.partner_name || user.id;
  const userKiosks: string[] = Array.isArray(user.kiosks)
    ? user.kiosks.map((k: any) => (typeof k === 'string' ? k : k.id))
    : [];

  return transactions.filter(t => {
    if (t.partner_id && String(t.partner_id) === String(partnerId)) return true;
    if (t.partner_name && String(t.partner_name) === String(user.partner_name)) return true;
    if (userKiosks.includes(t.kiosk_id)) return true;
    return false;
  });
}

/**
 * Redacts sensitive credentials, secret tokens, and full account numbers.
 */
export function redactSensitiveData(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(api_key|device_token|secret)[\s:=]+([a-zA-Z0-9_\-]{8,})/gi, '$1=[REDACTED_SECRET]')
    .replace(/(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})/g, '****-****-****-$4');
}

/**
 * Service to fetch transaction records.
 * Resolves against backend sessions or simulation fixtures.
 * Throws on HTTP 401/403 to prevent unauthenticated data exposure.
 */
export async function fetchTransactionsService(): Promise<TransactionItem[]> {
  try {
    // Attempt to query transactions endpoint if backend implements it
    const res = await api.get('/admin/transactions');
    if (res.data?.success && Array.isArray(res.data?.data)) {
      return res.data.data.map((raw: any) => ({
        id: String(raw.id || raw.transaction_code),
        transaction_code: raw.transaction_code || raw.id,
        session_id: raw.session_id || raw.session_code,
        session_code: raw.session_code || raw.session_id,
        kiosk_id: raw.kiosk_id || '',
        kiosk_name: raw.kiosk_name || raw.kiosk_id || 'Unknown Kiosk',
        partner_id: raw.partner_id,
        partner_name: raw.partner_name,
        amount: Math.round(Number(raw.amount) || 0),
        payment_method: raw.payment_method || 'qris',
        status: (raw.status === 'success' ? 'paid' : raw.status) || 'pending',
        verification_method: raw.verification_method,
        provider_detected: raw.provider_detected,
        paid_at: raw.paid_at,
        verified_at: raw.verified_at,
        created_at: raw.created_at || new Date().toISOString(),
        failure_reason_code: raw.failure_reason_code,
        isSimulated: false
      }));
    }
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    if (status === 401 || status === 403) {
      // Dilarang fallback ke mock saat 401/403
      throw err;
    }
    // Expected: backend currently lacks dedicated GET /admin/transactions.
    // We fall back safely to synthesis from sessions or contract seed fixtures.
  }

  // Try deriving transactions from /admin/sessions
  try {
    const sessionRes = await api.get('/admin/sessions');
    if (sessionRes.data?.success && Array.isArray(sessionRes.data?.data)) {
      const derived: TransactionItem[] = sessionRes.data.data.map((s: any, idx: number) => {
        const cleanId = String(s.id || '').replace(/^#US-|^#/, '');
        const realTxCode = s.transaction_code || s.transaction?.transaction_code || (s.transaction_id ? String(s.transaction_id) : null);
        const hasRealTx = Boolean(realTxCode);
        const txCode = realTxCode || `US-TRX-${cleanId || idx + 1}`;

        // Critical: Do NOT assume session Success/completed means verified paid.
        // Use actual payment_status if available. If none, set pending / unverified.
        const rawPaymentStatus = s.payment_status ? String(s.payment_status).toLowerCase() : undefined;
        let status: TransactionStatus = 'pending';
        if (rawPaymentStatus === 'paid' || rawPaymentStatus === 'success') {
          status = 'paid';
        } else if (rawPaymentStatus === 'failed') {
          status = 'failed';
        } else if (rawPaymentStatus === 'expired') {
          status = 'expired';
        } else {
          status = 'pending';
        }

        const isPaid = status === 'paid';
        return {
          id: realTxCode ? `TRX-${realTxCode}` : `TRX-${cleanId || idx + 1}`,
          transaction_code: txCode,
          session_id: cleanId,
          session_code: cleanId,
          kiosk_id: s.kiosk_id || 'kiosk-01',
          kiosk_name: s.kiosk_name || 'UniSmiles Kiosk',
          partner_id: s.partner_id,
          partner_name: s.partner_name,
          amount: Math.round(Number(s.amount) || 35000),
          payment_method: s.payment_method || 'qris',
          status,
          verification_method: 'qris_visual_proof',
          provider_detected: isPaid ? (s.provider_detected || 'QRIS Dynamic') : undefined,
          paid_at: isPaid ? (s.paid_at || s.timestamp) : null,
          verified_at: isPaid ? (s.verified_at || s.timestamp) : null,
          created_at: s.timestamp || new Date().toISOString(),
          isSimulated: true,
          is_simulated_reference: !hasRealTx
        };
      });
      if (derived.length > 0) {
        return derived;
      }
    }
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    if (status === 401 || status === 403) {
      throw err;
    }
  }

  // Return synthetic simulation fixtures with explicit isSimulated flag
  return SEED_TRANSACTIONS;
}

/**
 * Fetches verification attempt records for a specific session code.
 */
export async function fetchPaymentVerificationAttempts(sessionId: string): Promise<PaymentVerificationAttempt[]> {
  const cleanId = sessionId.replace(/^#US-|^#/, '').trim();
  try {
    const res = await api.get(`/admin/payment-verifications/attempts?session_id=${encodeURIComponent(cleanId)}`);
    if (res.data?.success && Array.isArray(res.data?.data)) {
      return res.data.data.map((att: any) => ({
        id: String(att.id),
        session_id: att.session_id,
        kiosk_id: att.kiosk_id,
        attempt_number: Number(att.attempt_number) || 1,
        status: att.status || 'received',
        decision: att.decision || 'processing',
        expected_amount: Math.round(Number(att.expected_amount) || 0),
        extracted_amount: att.extracted_amount ? Math.round(Number(att.extracted_amount)) : null,
        provider_detected: att.provider_detected,
        screen_type: att.screen_type,
        evidence_private_path: att.evidence_private_path,
        evidence_url: att.evidence_private_path ? `/admin/payment-verifications/attempts/${att.id}/evidence` : null,
        reason_codes: typeof att.reason_codes === 'string' ? JSON.parse(att.reason_codes) : (att.reason_codes || []),
        ocr_confidence: att.ocr_confidence,
        quality_score: att.quality_score,
        created_at: att.created_at || new Date().toISOString(),
        isSimulated: false
      }));
    }
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    if (status === 401 || status === 403) {
      throw err;
    }
  }

  // Safe simulation fallback
  return SEED_VERIFICATION_ATTEMPTS[cleanId] || [];
}

/**
 * Fetches the active payment profile configuration.
 */
export async function fetchPaymentProfileService(): Promise<PaymentProfile> {
  try {
    const res = await api.get('/admin/payment-profile');
    if (res.data?.success && res.data?.data) {
      const d = res.data.data;
      let paymentData: any = {};
      if (d.payment_data) {
        paymentData = typeof d.payment_data === 'string' ? JSON.parse(d.payment_data) : d.payment_data;
      }
      return {
        id: d.id,
        user_id: d.user_id,
        profile_name: d.profile_name,
        merchant_name: d.merchant_name || 'UNISMILES PHOTOBOOTH',
        display_name: d.display_name || 'UniSmiles Official',
        payment_required: paymentData.payment_required !== false,
        unique_amount_enabled: paymentData.unique_amount_enabled !== false,
        session_ttl_minutes: Number(paymentData.session_ttl_minutes) || 5,
        verification_mode: paymentData.verification_mode || 'visual_proof',
        merchant_aliases: Array.isArray(paymentData.merchant_aliases) ? paymentData.merchant_aliases : ['unismiles'],
        active_providers: Array.isArray(paymentData.active_providers) ? paymentData.active_providers : ['qris'],
        qris_image_url: paymentData.qris_image_url || null,
        show_digital_package: paymentData.show_digital_package !== false,
        show_print_package: paymentData.show_print_package !== false,
        show_cursor_lock_icon: !!paymentData.show_cursor_lock_icon,
        show_calibration_icon: !!paymentData.show_calibration_icon,
        isSimulated: false
      };
    }
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    if (status === 401 || status === 403) {
      throw err;
    }
  }

  return DEFAULT_PAYMENT_PROFILE;
}

/**
 * Saves payment profile settings.
 * Fail-closed safeguard: Blocks live mutation if ENABLE_BACKEND_MUTATIONS is false.
 */
export async function savePaymentProfileService(payload: Partial<PaymentProfile>): Promise<PaymentProfile> {
  if (!ENABLE_BACKEND_MUTATIONS) {
    // Return safely simulated update without sending live PUT
    return {
      ...DEFAULT_PAYMENT_PROFILE,
      ...payload,
      isSimulated: true
    };
  }

  const res = await api.put('/admin/payment-profile', payload);
  return res.data?.data || payload;
}
