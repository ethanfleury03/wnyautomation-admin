import Link from 'next/link';

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ops-bg)] p-6 text-[var(--ops-text)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--ops-border)] bg-[var(--ops-surface)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ops-muted)]">Admin locked</p>
        <h1 className="mt-3 text-2xl font-semibold">This account is not allowed here.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ops-muted-strong)]">
          WNY Automation Admin is restricted to the owner account.
        </p>
        <Link
          href="/sign-in"
          className="mt-5 inline-flex rounded-lg bg-[var(--ops-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ops-brand-strong)]"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
