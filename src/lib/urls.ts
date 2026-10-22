const apiBaseUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim() || (typeof process !== 'undefined' ? process.env?.VITE_API_BASE_URL : '') || 'https://backend-photobooth.uniinside.net/api/v1';
const publicBaseUrl = (import.meta.env?.VITE_PUBLIC_BASE_URL as string | undefined)?.trim() || (typeof process !== 'undefined' ? process.env?.VITE_PUBLIC_BASE_URL : '') || 'https://backend-photobooth.uniinside.net';

export function apiOrigin(): string {
  if (!apiBaseUrl) {
    return window.location.origin;
  }
  try {
    return new URL(apiBaseUrl, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function publicAssetOrigin(): string {
  if (publicBaseUrl) {
    try {
      return new URL(publicBaseUrl, window.location.origin).origin;
    } catch {
      return publicBaseUrl;
    }
  }
  return apiOrigin();
}

export function resolvePublicUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${publicAssetOrigin()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function toStoredAssetPath(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/')) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    const trustedOrigins = new Set([
      window.location.origin,
      apiOrigin(),
      publicAssetOrigin(),
    ]);

    return trustedOrigins.has(parsed.origin)
      ? `${parsed.pathname}${parsed.search}`
      : '';
  } catch {
    return '';
  }
}
