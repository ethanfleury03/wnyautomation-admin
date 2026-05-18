const DEFAULT_CLIENT_LOGIN_URL = 'https://app.wnyautomation.com/sign-in?redirect_url=/launch';
const PRODUCTION_PORTAL_HOSTS = new Set([
  'app.wnyautomation.com',
  'admin.wnyautomation.com',
  'awp.wnyautomation.com',
]);

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

function requireStagingClientLoginUrl(value: string | null): string {
  if (!value) {
    throw new Error('NEXT_PUBLIC_CLIENT_LOGIN_URL is required when APP_ENV=staging.');
  }
  const url = new URL(value);
  if (PRODUCTION_PORTAL_HOSTS.has(url.hostname)) {
    throw new Error('NEXT_PUBLIC_CLIENT_LOGIN_URL must not point at production when APP_ENV=staging.');
  }
  return url.toString().replace(/\/$/, '');
}

export function getClientPortalUrl(): string {
  const configured =
    normalizePublicUrl(process.env.NEXT_PUBLIC_CLIENT_LOGIN_URL) ||
    normalizePublicUrl(process.env.NEXT_PUBLIC_AWP_PORTAL_SIGN_IN_URL);

  if (process.env.APP_ENV === 'staging') {
    return requireStagingClientLoginUrl(configured);
  }

  return configured || DEFAULT_CLIENT_LOGIN_URL;
}

export function getGatewayLogoutUrl(): string {
  const url = new URL(getClientPortalUrl());
  url.pathname = '/api/staging-logout';
  url.search = '';
  return url.toString();
}
