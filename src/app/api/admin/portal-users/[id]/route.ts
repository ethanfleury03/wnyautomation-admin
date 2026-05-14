import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { auditFromRequest, writeAudit } from '@/lib/audit/audit';
import {
  assertUniqueClerkUserId,
  assertUniqueEmail,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;
  const { id } = await params;

  const existing = await sql`
    SELECT id, email, name, role, is_active, clerk_user_id
    FROM portal_users
    WHERE id = ${id}
    LIMIT 1
  `;
  const current = existing[0] as
    | { id: string; email: string; name: string | null; role: string; is_active: boolean | number; clerk_user_id: string | null }
    | undefined;
  if (!current) return NextResponse.json({ error: 'Portal user not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email ?? current.email);
  const name = normalizeName(body?.name ?? current.name, email);
  const role = normalizePortalRole(body?.role ?? current.role);
  const isActive = normalizeActive(body?.isActive, normalizeActive(current.is_active));
  const companyId = body?.companyId === undefined ? undefined : normalizeCompanyId(body.companyId);
  const membershipId = normalizeNullableText(body?.membershipId);
  const clerkUserId = body?.clerkUserId === undefined
    ? current.clerk_user_id || null
    : normalizeNullableText(body.clerkUserId);

  const validation = validatePortalUserInput({ email, role });
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  if (!(await assertUniqueEmail(email, id))) {
    return NextResponse.json({ error: 'Another portal user already uses that email.' }, { status: 409 });
  }
  if (!(await assertUniqueClerkUserId(clerkUserId, id))) {
    return NextResponse.json({ error: 'That Clerk user ID is already linked to another portal user.' }, { status: 409 });
  }
  if (companyId && !(await ensureCompanyExists(companyId))) {
    return NextResponse.json({ error: 'Portal not found.' }, { status: 404 });
  }

  await sql`
    UPDATE portal_users
    SET
      email = ${email},
      name = ${name},
      role = ${role},
      is_active = ${isActive},
      clerk_user_id = ${clerkUserId},
      updated_at = datetime('now')
    WHERE id = ${id}
  `;

  if (body?.companyId !== undefined || membershipId) {
    await upsertPortalMembership({
      userId: id,
      membershipId,
      companyId: companyId ?? null,
      role: role!,
      isActive,
    });
    await markUnassignedUserResolved({ email, userId: id, companyId: companyId ?? null });
  }

  const meta = auditFromRequest(request);
  await writeAudit({
    actor: auth,
    action: 'tenant.user.update',
    entityType: 'portal_user',
    entityId: id,
    summary: `Updated portal user ${email}`,
    metadata: {
      email,
      name,
      role,
      companyId: companyId ?? null,
      membershipId,
      isActive,
      clerkUserId: clerkUserId ? '[set]' : null,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;
  const { id } = await params;

  const existing = await sql`
    SELECT id, email
    FROM portal_users
    WHERE id = ${id}
    LIMIT 1
  `;
  const user = existing[0] as { id: string; email: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Portal user not found.' }, { status: 404 });

  await sql`DELETE FROM user_memberships WHERE user_id = ${id}`;
  await sql`DELETE FROM portal_users WHERE id = ${id}`;
  await sql`
    UPDATE unassigned_portal_users
    SET assigned_at = null, assigned_company_id = null, assigned_user_id = null
    WHERE lower(email) = ${user.email.toLowerCase()}
  `;

  const meta = auditFromRequest(request);
  await writeAudit({
    actor: auth,
    action: 'tenant.user.delete',
    entityType: 'portal_user',
    entityId: id,
    summary: `Deleted portal user ${user.email}`,
    metadata: { email: user.email },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
