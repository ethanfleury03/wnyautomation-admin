import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await auth.protect();
  const admin = await requireSuperAdmin();
  if (isPortalResponse(admin)) {
    redirect('/not-authorized');
  }

  return <div className="min-h-screen bg-[var(--ops-bg)]">{children}</div>;
}
