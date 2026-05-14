import { sql } from '@/lib/db';
import type { UserRole } from '@/lib/auth/types';
import { isPortalUserRole, isValidEmail } from '@/lib/admin/validation';

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizeName(value: unknown, fallbackEmail: string): string {
  return String(value || '').trim() || fallbackEmail;
}

export function normalizeNullableText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

export function normalizeCompanyId(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

export function normalizePortalRole(value: unknown, fallback: UserRole = 'staff'): UserRole | null {
  const role = String(value || fallback).trim();
  return isPortalUserRole(role) ? role : null;
}

export function normalizeActive(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'inactive', 'off', 'no'].includes(text)) return false;
  if (['true', '1', 'active', 'on', 'yes'].includes(text)) return true;
  return fallback;
}

export function validatePortalUserInput(input: {
  email: string;
  role: UserRole | null;
}): string | null {
  if (!input.email) return 'Email is required.';
  if (!isValidEmail(input.email)) return 'Enter a valid email.';
  if (!input.role) return 'Choose a valid role.';
  return null;
}

export async function ensureCompanyExists(companyId: string): Promise<boolean> {
  const rows = await sql`SELECT id FROM companies WHERE id = ${companyId} LIMIT 1`;
  return Boolean(rows[0]);
}

export async function assertUniqueEmail(email: string, exceptUserId?: string): Promise<boolean> {
  const rows = exceptUserId
    ? await sql`SELECT id FROM portal_users WHERE lower(email) = ${email} AND id <> ${exceptUserId} LIMIT 1`
    : await sql`SELECT id FROM portal_users WHERE lower(email) = ${email} LIMIT 1`;
  return !rows[0];
}

export async function assertUniqueClerkUserId(clerkUserId: string | null, exceptUserId?: string): Promise<boolean> {
  if (!clerkUserId) return true;
  const rows = exceptUserId
    ? await sql`SELECT id FROM portal_users WHERE clerk_user_id = ${clerkUserId} AND id <> ${exceptUserId} LIMIT 1`
    : await sql`SELECT id FROM portal_users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`;
  return !rows[0];
}

async function syncPrimaryCompany(userId: string, preferredCompanyId: string | null): Promise<void> {
  let nextCompanyId = preferredCompanyId;
  if (!nextCompanyId) {
    const rows = await sql`
      SELECT company_id
      FROM user_memberships
      WHERE user_id = ${userId} AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    nextCompanyId = String((rows[0] as { company_id?: string } | undefined)?.company_id || '') || null;
  }

  await sql`
    UPDATE portal_users
    SET company_id = ${nextCompanyId}, updated_at = datetime('now')
    WHERE id = ${userId}
  `;
}

export async function upsertPortalMembership(input: {
  userId: string;
  membershipId?: string | null;
  companyId: string | null;
  role: UserRole;
  isActive: boolean;
}): Promise<string | null> {
  const membershipId = normalizeNullableText(input.membershipId);
  const status = input.isActive ? 'active' : 'inactive';

  if (!input.companyId) {
    if (membershipId) {
      await sql`DELETE FROM user_memberships WHERE id = ${membershipId} AND user_id = ${input.userId}`;
    } else {
      await sql`DELETE FROM user_memberships WHERE user_id = ${input.userId}`;
    }
    await syncPrimaryCompany(input.userId, null);
    return null;
  }

  if (membershipId) {
    const current = await sql`
      SELECT id
      FROM user_memberships
      WHERE id = ${membershipId} AND user_id = ${input.userId}
      LIMIT 1
    `;

    if (current[0]) {
      const duplicate = await sql`
        SELECT id
        FROM user_memberships
        WHERE user_id = ${input.userId} AND company_id = ${input.companyId} AND id <> ${membershipId}
        LIMIT 1
      `;
      const duplicateId = String((duplicate[0] as { id?: string } | undefined)?.id || '');

      if (duplicateId) {
        await sql`
          UPDATE user_memberships
          SET role = ${input.role}, status = ${status}, updated_at = datetime('now')
          WHERE id = ${duplicateId}
        `;
        await sql`DELETE FROM user_memberships WHERE id = ${membershipId} AND user_id = ${input.userId}`;
        await syncPrimaryCompany(input.userId, input.companyId);
        return duplicateId;
      }

      const updated = await sql`
        UPDATE user_memberships
        SET company_id = ${input.companyId}, role = ${input.role}, status = ${status}, updated_at = datetime('now')
        WHERE id = ${membershipId} AND user_id = ${input.userId}
        RETURNING id
      `;
      await syncPrimaryCompany(input.userId, input.companyId);
      return String((updated[0] as { id?: string } | undefined)?.id || membershipId);
    }
  }

  const rows = await sql`
    INSERT INTO user_memberships (user_id, company_id, role, status)
    VALUES (${input.userId}, ${input.companyId}, ${input.role}, ${status})
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      updated_at = datetime('now')
    RETURNING id
  `;
  await syncPrimaryCompany(input.userId, input.companyId);
  return String((rows[0] as { id?: string } | undefined)?.id || '') || null;
}

export async function markUnassignedUserResolved(input: {
  email: string;
  userId: string;
  companyId: string | null;
}): Promise<void> {
  if (!input.companyId) return;
  await sql`
    UPDATE unassigned_portal_users
    SET assigned_at = datetime('now'), assigned_company_id = ${input.companyId}, assigned_user_id = ${input.userId}
    WHERE lower(email) = ${input.email}
  `;
}
