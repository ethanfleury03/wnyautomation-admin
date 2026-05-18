import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { readGatewayFallbackSession } from '@/lib/auth/gateway-fallback';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { getClientPortalUrl } from '@/lib/portal-url';

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fallbackSession = await readGatewayFallbackSession();
  if (!fallbackSession && process.env.APP_ENV === 'staging') redirect(getClientPortalUrl());
  if (!fallbackSession) await auth.protect();

  const admin = await requireSuperAdmin();
  if (isPortalResponse(admin)) {
    redirect('/not-authorized');
  }

  return <div className="min-h-screen bg-[var(--ops-bg)]">{children}</div>;
}
