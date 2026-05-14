import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { auditFromRequest, writeAudit } from '@/lib/audit/audit';
import {
  assertUniqueClerkUserId,
  ensureCompanyExists,
  markUnassignedUserResolved,
  normalizeActive,
  normalizeCompanyId,
  normalizeEmail,
  normalizeName,
  normalizeNullableText,
  normalizePortalRole,
  upsertPortalMembership,
  validatePortalUserInput,
} from '@/lib/admin/portal-users';

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;

  const url = new URL(request.url);
  const q = `%${(url.searchParams.get('q') || '').trim().toLowerCase()}%`;

  const users = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.role AS account_role,
      u.is_active AS account_is_active,
      u.company_id AS legacy_company_id,
      u.clerk_user_id,
      u.created_at,
      u.updated_at,
      m.id AS membership_id,
      COALESCE(m.company_id, u.company_id) AS company_id,
      COALESCE(m.role, u.role) AS role,
      COALESCE(m.status, CASE WHEN u.is_active = true THEN 'active' ELSE 'inactive' END) AS membership_status,
      CASE
        WHEN u.is_active = false THEN false
        WHEN m.status IS NULL THEN u.is_active
        ELSE m.status = 'active'
      END AS is_active,
      c.name AS company_name,
      s.display_name AS company_display_name
    FROM portal_users u
    LEFT JOIN user_memberships m ON m.user_id = u.id
    LEFT JOIN companies c ON c.id = COALESCE(m.company_id, u.company_id)
    LEFT JOIN company_settings s ON s.company_id = COALESCE(m.company_id, u.company_id)
    WHERE
      ${q === '%%'} OR
      lower(u.name) LIKE ${q} OR
      lower(u.email) LIKE ${q} OR
      lower(c.name) LIKE ${q} OR
      lower(s.display_name) LIKE ${q}
    ORDER BY lower(COALESCE(s.display_name, c.name, '')), lower(u.email)
    LIMIT 200
  `;

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const name = normalizeName(body?.name, email);
  const role = normalizePortalRole(body?.role);
  const companyId = normalizeCompanyId(body?.companyId);
  const isActive = normalizeActive(body?.isActive, true);
  const clerkUserId = normalizeNullableText(body?.clerkUserId);

  const validation = validatePortalUserInput({ email, role });
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  if (!companyId) return NextResponse.json({ error: 'Choose a portal for this user.' }, { status: 400 });
  if (!(await ensureCompanyExists(companyId))) {
    return NextResponse.json({ error: 'Portal not found.' }, { status: 404 });
  }

  const existing = await sql`SELECT id, clerk_user_id FROM portal_users WHERE lower(email) = ${email} LIMIT 1`;
  const existingUser = existing[0] as { id?: string; clerk_user_id?: string | null } | undefined;
  let userId = String(existingUser?.id || '');
  const nextClerkUserId = clerkUserId ?? existingUser?.clerk_user_id ?? null;

  if (!(await assertUniqueClerkUserId(nextClerkUserId, userId || undefined))) {
    return NextResponse.json({ error: 'That Clerk user ID is already linked to another portal user.' }, { status: 409 });
  }

  if (userId) {
    await sql`
      UPDATE portal_users
      SET
        company_id = ${companyId},
        email = ${email},
        name = ${name},
        role = ${role},
        is_active = ${isActive},
        clerk_user_id = ${nextClerkUserId},
        updated_at = datetime('now')
      WHERE id = ${userId}
    `;
  } else {
    const inserted = await sql`
      INSERT INTO portal_users (company_id, email, name, hashed_pw, role, is_active, clerk_user_id)
      VALUES (${companyId}, ${email}, ${name}, '', ${role}, ${isActive}, ${nextClerkUserId})
      RETURNING id
    `;
    userId = String((inserted[0] as { id?: string }).id);
  }

  await upsertPortalMembership({ userId, companyId, role: role!, isActive });
  await markUnassignedUserResolved({ email, userId, companyId });

  const meta = auditFromRequest(request);
  await writeAudit({
    actor: auth,
    action: existing[0] ? 'tenant.user.update' : 'tenant.user.assign',
    entityType: 'portal_user',
    entityId: userId,
    summary: existing[0] ? `Updated portal user ${email}` : `Created portal user ${email}`,
    metadata: { email, name, role, companyId, isActive, clerkUserId: nextClerkUserId ? '[set]' : null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ id: userId }, { status: existing[0] ? 200 : 201 });
}
