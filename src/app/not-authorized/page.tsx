import { getClientPortalUrl } from '@/lib/portal-url';
import { NotAuthorizedActions } from './not-authorized-actions';

export default function NotAuthorizedPage() {
  const clientLoginUrl = getClientPortalUrl();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ops-bg)] p-6 text-[var(--ops-text)]">
      <section className="w-full max-w-lg rounded-lg border border-[var(--ops-border)] bg-[var(--ops-surface)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ops-muted)]">Admin locked</p>
        <h1 className="mt-3 text-2xl font-semibold">This account is not allowed here.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ops-muted-strong)]">
          WNY Automation Admin is restricted to the owner account. This email may still be authorized for the client
          portal, so use the standard WNY Automation Portal login.
        </p>
        <NotAuthorizedActions clientLoginUrl={clientLoginUrl} />
      </section>
    </main>
  );
}
