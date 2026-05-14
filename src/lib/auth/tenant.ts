import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { SessionUser, UserRole } from '@/lib/auth/types';
import { roleAtLeast } from '@/lib/auth/types';

const DEFAULT_ADMIN_EMAIL = 'ethan@wnyautomation.com';
const DEFAULT_AUDIT_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export type TenantContext = Pick<SessionUser, 'id' | 'companyId' | 'branchId' | 'role'>;

function configuredAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function initialsFor(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export async function getAdminSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses.find((entry) => entry.emailAddress)?.emailAddress ||
    '';
  const normalizedEmail = email.trim().toLowerCase();
  if (!configuredAdminEmails().has(normalizedEmail)) return null;

  const name = user?.fullName || user?.firstName || normalizedEmail;
  return {
    id: user?.id || userId,
    email: normalizedEmail,
    name,
    role: 'super_admin',
    companyId: process.env.ADMIN_AUDIT_COMPANY_ID || DEFAULT_AUDIT_COMPANY_ID,
    branchId: null,
    avatarInitials: initialsFor(name, normalizedEmail),
  };
}

export async function requirePortalUser(): Promise<SessionUser> {
  const user = await getAdminSessionUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireTenantContext(): Promise<TenantContext> {
  const user = await requirePortalUser();
  return {
    id: user.id,
    companyId: user.companyId,
    branchId: user.branchId,
    role: user.role,
  };
}

export function hasRequiredRole(
  role: UserRole,
  allowedRoles: readonly UserRole[],
): boolean {
  return allowedRoles.includes(role);
}

export async function requirePortalOrRespond(
  minRole?: UserRole,
): Promise<SessionUser | NextResponse> {
  const user = await getAdminSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (minRole && !roleAtLeast(user.role, minRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}

export function isPortalResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export async function requireSuperAdmin(): Promise<SessionUser | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await getAdminSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}
