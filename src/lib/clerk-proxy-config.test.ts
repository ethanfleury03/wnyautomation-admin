import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClerkProxyUrl, getClerkProxyVerificationUrl } from './clerk-proxy-config';

describe('clerk proxy config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function publishableKeyFor(host: string) {
    return `pk_test_${Buffer.from(`${host}$`).toString('base64url')}`;
  }

  it('defaults production traffic to the Clerk production proxy', () => {
    expect(getClerkProxyUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });

  it('uses an explicit production proxy URL when provided', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', 'https://wnyautomation.com/clerk-prod-proxy/');

    expect(getClerkProxyUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });

  it('disables Clerk proxying when staging gateway fallback auth is enabled', () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PORTAL_GATEWAY_FALLBACK_SECRET', 'shared-staging-secret');

    expect(getClerkProxyUrl()).toBeUndefined();
  });

  it('can still use the staging Clerk proxy when satellite testing is explicitly enabled', () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PORTAL_GATEWAY_FALLBACK_SECRET', 'shared-staging-secret');
    vi.stubEnv('STAGING_USE_CLERK_SATELLITES', '1');
    vi.stubEnv('NEXT_PUBLIC_APP_BASE_URL', 'https://staging.admin.wnyautomation.com');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', publishableKeyFor('staging-clerk.example'));

    expect(getClerkProxyUrl()).toBe('https://staging.admin.wnyautomation.com/clerk-proxy');
  });

  it('falls back to the active proxy URL for verification', () => {
    expect(getClerkProxyVerificationUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });
});
