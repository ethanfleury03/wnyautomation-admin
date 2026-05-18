'use client';

import { LogOut } from 'lucide-react';
import { AdminLogoutButton } from '@/components/admin-logout-button';

type NotAuthorizedActionsProps = {
  clientLoginUrl: string;
};

export function NotAuthorizedActions({ clientLoginUrl }: NotAuthorizedActionsProps) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <a
        href={clientLoginUrl}
        className="inline-flex items-center justify-center rounded-lg bg-[var(--ops-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ops-brand-strong)]"
      >
        Go to client login
      </a>
      <AdminLogoutButton
        redirectUrl={clientLoginUrl}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--ops-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ops-text)] hover:bg-[var(--ops-surface-subtle)] disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        Use a different admin account
      </AdminLogoutButton>
    </div>
  );
}
