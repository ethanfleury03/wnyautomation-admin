const DEFAULT_CLIENT_PORTAL_URL = 'https://app.wnyautomation.com';

function normalizePublicUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getClientPortalUrl(): string {
  return (
    normalizePublicUrl(process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL) ||
    normalizePublicUrl(process.env.NEXT_PUBLIC_PORTAL_GATEWAY_URL) ||
    normalizePublicUrl(process.env.NEXT_PUBLIC_GATEWAY_URL) ||
    DEFAULT_CLIENT_PORTAL_URL
  );
}
