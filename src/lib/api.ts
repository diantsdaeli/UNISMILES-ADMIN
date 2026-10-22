import axios, { AxiosError } from 'axios';

/**
 * Normalisasi Base URL API
 * Memastikan path selalu berujung pada '/api/v1' tanpa duplikasi slash.
 */
function getNormalizedApiBaseUrl(): string {
  const envUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim() || (typeof process !== 'undefined' ? process.env?.VITE_API_BASE_URL : '');
  if (!envUrl) {
    return '';
  }
  const cleanUrl = envUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
}

const api = axios.create({
  baseURL: getNormalizedApiBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface AuthResponse {
  token: string;
  user?: Record<string, unknown>;
}

/**
 * Parsing respons login dari backend secara tangguh.
 * Menangani format standar { success: true, token, user } maupun envelope { data: { token, user } }.
 */
export const parseAuthResponse = (payload: unknown): AuthResponse => {
  const body = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
  const data = body.data && typeof body.data === 'object'
    ? (body.data as Record<string, unknown>)
    : body;

  const token = data.token ?? data.access_token ?? body.token ?? body.access_token;

  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Server login tidak mengembalikan token autentikasi.');
  }

  const user = (data.user ?? body.user) as Record<string, unknown> | undefined;
  return { token: token.trim(), user };
};

/**
 * Parsing profil user dari endpoint /auth/me
 */
export const getAuthUser = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const data = body.data && typeof body.data === 'object'
    ? (body.data as Record<string, unknown>)
    : null;
  const user = body.user ?? data?.user ?? data ?? body;
  return user && typeof user === 'object' ? (user as Record<string, unknown>) : null;
};

// ─── Request Interceptor: Injeksi Bearer Token ────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Validasi ketersediaan baseURL API dari environment
    if (!config.baseURL) {
      return Promise.reject(new Error('VITE_API_BASE_URL belum dikonfigurasi. Silakan tentukan URL backend pada file environment (.env / .env.local).'));
    }

    // Ambil token dari storage
    const token = localStorage.getItem('unismiles_token') || sessionStorage.getItem('unismiles_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Penanganan Error 401 & 403 Sesuai Kebijakan ─────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    const errorMessage = String(responseData?.message || '').toLowerCase();
    const requestUrl = error.config?.url || '';

    // Abaikan jika error berasal dari endpoint login itu sendiri (kredensial salah)
    const isLoginRequest = requestUrl.includes('/auth/login');

    // 1. Tangani 401 Unauthorized (Token expired, revoked, atau sesi tidak valid)
    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem('unismiles_token');
      localStorage.removeItem('unismiles_user');
      sessionStorage.removeItem('unismiles_token');
      sessionStorage.removeItem('unismiles_user');

      // Arahkan ke halaman login jika berada di halaman terproteksi
      if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/';
      }
    }

    // 2. Tangani 403 Forbidden: HANYA akhiri sesi jika akun berstatus nonaktif (Account is inactive)
    // Jika 403 karena izin akses resource/role ('Forbidden. You do not have the required role...'), JANGAN logout paksa!
    if (status === 403) {
      const isAccountInactive = errorMessage.includes('account is inactive') || errorMessage.includes('akun nonaktif');
      if (isAccountInactive) {
        localStorage.removeItem('unismiles_token');
        localStorage.removeItem('unismiles_user');
        sessionStorage.removeItem('unismiles_token');
        sessionStorage.removeItem('unismiles_user');

        if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/';
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
