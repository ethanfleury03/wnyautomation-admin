'use client';

import { useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';

type LogoutResponse = {
  mode?: string;
  redirectUrl?: string;
};

type AdminLogoutButtonProps = {
  children: ReactNode;
  className?: string;
  redirectUrl: string;
  ariaLabel?: string;
};

export function AdminLogoutButton({
  children,
  className,
  redirectUrl,
  ariaLabel,
}: AdminLogoutButtonProps) {
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as LogoutResponse | null;
      const nextUrl = payload?.redirectUrl || redirectUrl;

      if (payload?.mode === 'gateway-fallback') {
        window.location.assign(nextUrl);
        return;
      }

      await signOut({ redirectUrl: nextUrl });
    } catch {
      window.location.assign(redirectUrl);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={isSigningOut}
      onClick={handleLogout}
      className={className}
    >
      {children}
    </button>
  );
}
