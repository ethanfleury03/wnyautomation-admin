import { redirect } from 'next/navigation';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { StagingAdminClient } from './staging-admin-client';

export default async function AdminStagingPage() {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) {
    redirect('/not-authorized');
  }
  return <StagingAdminClient />;
}
