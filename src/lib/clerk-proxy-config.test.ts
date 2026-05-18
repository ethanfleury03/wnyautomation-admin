import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClerkProxyUrl, getClerkProxyVerificationUrl } from './clerk-proxy-config';

describe('clerk proxy config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults production traffic to the Clerk production proxy', () => {
    expect(getClerkProxyUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });

  it('uses an explicit production proxy URL when provided', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', 'https://wnyautomation.com/clerk-prod-proxy/');

    expect(getClerkProxyUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });

  it('keeps the staging fallback on the shared staging proxy', () => {
    vi.stubEnv('APP_ENV', 'staging');

    expect(getClerkProxyUrl()).toBe('https://wnyautomation.com/clerk-proxy');
  });

  it('falls back to the active proxy URL for verification', () => {
    expect(getClerkProxyVerificationUrl()).toBe('https://wnyautomation.com/clerk-prod-proxy');
  });
});
