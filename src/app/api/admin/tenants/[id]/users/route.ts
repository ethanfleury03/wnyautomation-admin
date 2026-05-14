import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { auditFromRequest, writeAudit } from '@/lib/audit/audit';
import type { UserRole } from '@/lib/auth/types';
import { PORTAL_USER_ROLES } from '@/lib/admin/validation';

const ALLOWED_ROLES: UserRole[] = PORTAL_USER_ROLES;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;
  const { id } = await params;
  const users = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      COALESCE(m.role, u.role) AS role,
      CASE
        WHEN u.is_active = false THEN false
        WHEN m.status IS NULL THEN u.is_active
        ELSE m.status = 'active'
      END AS is_active,
      u.clerk_user_id,
      u.created_at,
      COALESCE(m.updated_at, u.updated_at) AS updated_at
    FROM portal_users u
    LEFT JOIN user_memberships m ON m.user_id = u.id AND m.company_id = ${id}
    WHERE m.company_id = ${id} OR (u.company_id = ${id} AND m.id IS NULL)
    ORDER BY lower(u.email)
  `;
  return NextResponse.json({ users });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const name = String(body?.name || '').trim() || email;
  const role = String(body?.role || 'staff').trim() as UserRole;
  const branchId = String(body?.branchId || '').trim() || null;
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Choose a valid role.' }, { status: 400 });

  const existing = await sql`SELECT id FROM portal_users WHERE lower(email) = ${email} LIMIT 1`;
  let userId = String((existing[0] as { id?: string } | undefined)?.id || '');
  if (userId) {
    await sql`
      UPDATE portal_users
      SET company_id = ${id}, name = ${name}, role = ${role}, is_active = true, updated_at = datetime('now')
      WHERE id = ${userId}
    `;
  } else {
    const inserted = await sql`
      INSERT INTO portal_users (company_id, email, name, hashed_pw, role, is_active)
      VALUES (${id}, ${email}, ${name}, '', ${role}, true)
      RETURNING id
    `;
    userId = String((inserted[0] as { id?: string }).id);
  }
  const existingMembership = await sql`
    SELECT user_id FROM user_memberships WHERE user_id = ${userId} AND company_id = ${id} LIMIT 1
  `;
  if (existingMembership[0]) {
    await sql`
      UPDATE user_memberships
      SET branch_id = ${branchId}, role = ${role}, status = 'active', updated_at = datetime('now')
      WHERE user_id = ${userId} AND company_id = ${id}
    `;
  } else {
    await sql`
      INSERT INTO user_memberships (user_id, company_id, branch_id, role, status)
      VALUES (${userId}, ${id}, ${branchId}, ${role}, 'active')
      ON CONFLICT (user_id, company_id) DO UPDATE SET
        branch_id = excluded.branch_id,
        role = excluded.role,
        status = excluded.status,
        updated_at = datetime('now')
    `;
  }

  const meta = auditFromRequest(request);
  await writeAudit({
    actor: auth,
    action: 'tenant.user.assign',
    entityType: 'portal_user',
    entityId: userId,
    summary: `Assigned ${email}`,
    metadata: { email, role, branchId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return NextResponse.json({ id: userId }, { status: 201 });
}
