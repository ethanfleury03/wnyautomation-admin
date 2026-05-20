'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ClipboardList, LogOut, Server, Settings, Users } from 'lucide-react';
import { TicketsTab } from './_components/tickets-tab';
import { UserManagementTab } from './_components/user-management-tab';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { getClientPortalUrl } from '@/lib/portal-url';

type AdminSection = 'tickets' | 'users';

const sections = [
  {
    key: 'tickets',
    label: 'Tickets',
    description: 'Client work queue',
    icon: ClipboardList,
  },
  {
    key: 'users',
    label: 'User management',
    description: 'Portals and access',
    icon: Users,
  },
] as const;

export default function AdminHome() {
  const [section, setSection] = useState<AdminSection>('tickets');
  const clientPortalUrl = getClientPortalUrl();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--ops-bg)] lg:h-[100dvh] lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <aside className="sticky top-0 z-30 shrink-0 border-b border-[var(--ops-border-strong)] bg-[var(--ops-shell-gradient)] text-white lg:relative lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ops-brand)]">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Admin</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">WNY operations</p>
                </div>
              </div>
              <AdminLogoutButton
                redirectUrl={clientPortalUrl}
                ariaLabel="Log out"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-60 lg:hidden"
              >
                <LogOut className="h-4 w-4" />
              </AdminLogoutButton>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:overflow-visible lg:p-4" aria-label="Admin sections">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSection(item.key)}
                  className={`flex min-w-[13rem] items-center gap-3 rounded-lg px-3.5 py-3 text-left text-sm transition lg:min-w-0 ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/6 hover:text-white'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-none">{item.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 pb-4 lg:hidden">
            <Link
              href="/admin/staging"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-medium text-slate-200"
            >
              <Server className="h-4 w-4" /> Staging
            </Link>
            <Link
              href="/admin/webhook-failures"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-medium text-slate-200"
            >
              <AlertCircle className="h-4 w-4" /> Webhooks
            </Link>
          </div>

          <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Operations</p>
            <div className="mt-3 space-y-1">
              <Link
                href="/admin/staging"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/6 hover:text-white"
              >
                <Server className="h-4 w-4" /> Staging
              </Link>
              <Link
                href="/admin/webhook-failures"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/6 hover:text-white"
              >
                <AlertCircle className="h-4 w-4" /> Webhook failures
              </Link>
              <AdminLogoutButton
                redirectUrl={clientPortalUrl}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/6 hover:text-white disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" /> Log out
              </AdminLogoutButton>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:overflow-hidden lg:pb-0">
        {section === 'tickets' ? <TicketsTab /> : <UserManagementTab />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-[var(--ops-border)] bg-[var(--ops-surface-elevated)] px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_-30px_rgba(8,18,35,0.45)] backdrop-blur lg:hidden" aria-label="Admin mobile navigation">
        {sections.map((item) => {
          const Icon = item.icon;
          const active = section === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${
                active ? 'bg-[var(--ops-brand-soft)] text-[var(--ops-brand)]' : 'text-[var(--ops-muted)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label === 'User management' ? 'Users' : item.label}
            </button>
          );
        })}
        <Link href="/admin/staging" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-[var(--ops-muted)]">
          <Server className="h-4 w-4" />
          Staging
        </Link>
        <Link href="/admin/webhook-failures" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-[var(--ops-muted)]">
          <AlertCircle className="h-4 w-4" />
          Webhooks
        </Link>
      </nav>
    </div>
  );
}
