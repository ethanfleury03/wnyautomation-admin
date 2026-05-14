import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';
import { auditFromRequest, writeAudit } from '@/lib/audit/audit';
import { getIndustryPreset } from '@/lib/modules/presets';
import { MODULE_CATALOG, expandModuleDependencies, type ModuleKey } from '@/lib/modules/catalog';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;
  const url = new URL(request.url);
  const q = `%${(url.searchParams.get('q') || '').trim().toLowerCase()}%`;

  const tenants = await sql`
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      c.created_at,
      s.display_name,
      s.industry,
      s.portal_title,
      c.stripe_connect_status,
      (SELECT COUNT(DISTINCT user_id) FROM user_memberships WHERE company_id = c.id AND status = 'active') AS user_count,
      (SELECT COUNT(*) FROM feature_flags WHERE company_id = c.id AND flag_key LIKE 'module.%' AND enabled = true) AS enabled_module_count,
      (SELECT COUNT(*) FROM invoices WHERE company_id = c.id) AS invoice_count,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE company_id = c.id AND status = 'paid') AS paid_cents,
      (SELECT MAX(created_at) FROM audit_logs WHERE company_id = c.id) AS last_activity_at,
      (SELECT COUNT(*) FROM audit_logs WHERE company_id = c.id) AS audit_event_count,
      (SELECT MAX(created_at) FROM leads WHERE company_id = c.id) AS last_lead_at,
      (SELECT MAX(updated_at) FROM user_memberships WHERE company_id = c.id) AS last_user_activity_at
    FROM companies c
    LEFT JOIN company_settings s ON s.company_id = c.id
    WHERE ${q === '%%'} OR lower(c.name) LIKE ${q} OR lower(c.email) LIKE ${q}
    ORDER BY c.created_at DESC
  `;
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
    WHERE ${q === '%%'} OR lower(u.name) LIKE ${q} OR lower(u.email) LIKE ${q} OR lower(c.name) LIKE ${q} OR lower(s.display_name) LIKE ${q}
    ORDER BY lower(COALESCE(s.display_name, c.name, '')), lower(u.email)
    LIMIT 100
  `;
  const summaryRows = await sql`
    SELECT
      (SELECT COUNT(*) FROM companies) AS total_tenants,
      (SELECT COUNT(*) FROM portal_users WHERE is_active = true) AS active_users,
      (SELECT COUNT(*) FROM audit_logs) AS recent_activity,
      (SELECT COALESCE(AVG(module_count), 0) FROM (
        SELECT COUNT(*) AS module_count
        FROM feature_flags
        WHERE flag_key LIKE 'module.%' AND enabled = true
        GROUP BY company_id
      ) m) AS average_enabled_modules
  `;
  return NextResponse.json({ tenants, users, summary: summaryRows[0] ?? {} });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = String(body?.phone || '').trim() || null;
  const industry = String(body?.industry || 'generic').trim();
  const timezone = String(body?.timezone || 'America/New_York').trim();
  const preset = getIndustryPreset(body?.preset || industry);
  const adminEmail = String(body?.adminEmail || '').trim().toLowerCase();
  const adminName = String(body?.adminName || '').trim() || adminEmail;
  const moduleKeys = expandModuleDependencies(
    ((Array.isArray(body?.modules) ? body.modules : preset.modules) as ModuleKey[]).filter((key) =>
      MODULE_CATALOG.some((m) => m.key === key),
    ),
  );

  if (!name || !email) {
    return NextResponse.json({ error: 'Company name and contact email are required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid contact email.' }, { status: 400 });
  }
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    return NextResponse.json({ error: 'Enter a valid first admin email.' }, { status: 400 });
  }
  const duplicate = await sql`SELECT id FROM companies WHERE lower(email) = ${email} LIMIT 1`;
  if (duplicate[0]) {
    return NextResponse.json({ error: 'A tenant with that contact email already exists.' }, { status: 409 });
  }

  let companyRows;
  try {
    companyRows = await sql`
      INSERT INTO companies (name, email, phone)
      VALUES (${name}, ${email}, ${phone})
      RETURNING id, name, email, phone, created_at
    `;
  } catch {
    return NextResponse.json({ error: 'Could not create tenant. Check for duplicate company details and try again.' }, { status: 400 });
  }
  const company = companyRows[0] as { id: string };

  await sql`
    INSERT INTO company_settings (
      company_id, display_name, legal_name, industry, timezone, portal_title, workspace_label
    ) VALUES (
      ${company.id}, ${name}, ${name}, ${industry || preset.key}, ${timezone},
      ${`${name} Portal`}, ${`${name} workspace`}
    )
    ON CONFLICT (company_id) DO UPDATE SET
      display_name = excluded.display_name,
      legal_name = excluded.legal_name,
      industry = excluded.industry,
      timezone = excluded.timezone,
      updated_at = datetime('now')
  `;

  for (const mod of MODULE_CATALOG) {
    await sql`
      INSERT INTO feature_flags (company_id, flag_key, enabled, payload_json)
      VALUES (${company.id}, ${mod.flagKey}, ${moduleKeys.includes(mod.key)}, null)
      ON CONFLICT (company_id, flag_key) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = datetime('now')
    `;
  }

  await applyPresetConfig(company.id, preset.key);

  if (adminEmail) {
    const existing = await sql`
      SELECT id FROM portal_users WHERE lower(email) = ${adminEmail} LIMIT 1
    `;
    let userId = String((existing[0] as { id?: string } | undefined)?.id || '');
    if (userId) {
      await sql`
        UPDATE portal_users
        SET company_id = ${company.id}, name = ${adminName}, role = 'admin', is_active = true, updated_at = datetime('now')
        WHERE id = ${userId}
      `;
    } else {
      const inserted = await sql`
        INSERT INTO portal_users (company_id, email, name, hashed_pw, role, is_active)
        VALUES (${company.id}, ${adminEmail}, ${adminName}, '', 'admin', true)
        RETURNING id
      `;
      userId = String((inserted[0] as { id?: string }).id);
    }
    await sql`
      INSERT INTO user_memberships (user_id, company_id, role, status)
      VALUES (${userId}, ${company.id}, 'admin', 'active')
    `;
  }

  const meta = auditFromRequest(request);
  await writeAudit({
    actor: auth,
    action: 'tenant.create',
    entityType: 'company',
    entityId: company.id,
    summary: `Created tenant ${name}`,
    metadata: { industry, preset: preset.key, modules: moduleKeys, adminEmail: adminEmail || null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ tenant: company }, { status: 201 });
}

async function applyPresetConfig(companyId: string, presetKey: string) {
  const preset = getIndustryPreset(presetKey);
  for (const [idx, stage] of preset.leadStages.entries()) {
    await upsertStage(companyId, 'lead', stage.key, stage.label, stage.color, idx);
  }
  for (const [idx, stage] of preset.jobStages.entries()) {
    await upsertStage(companyId, 'job', stage.key, stage.label, stage.color, idx);
  }
  for (const [idx, field] of preset.customFields.entries()) {
    await sql`
      INSERT INTO company_custom_fields (
        company_id, entity_type, field_key, label, field_type, required, options_json, sort_order, is_active
      ) VALUES (
        ${companyId}, ${field.entityType}, ${field.fieldKey}, ${field.label}, ${field.fieldType},
        ${Boolean(field.required)}, ${field.options ? JSON.stringify(field.options) : null}, ${idx}, true
      )
      ON CONFLICT (company_id, entity_type, field_key) DO UPDATE SET
        label = excluded.label,
        field_type = excluded.field_type,
        required = excluded.required,
        options_json = excluded.options_json,
        sort_order = excluded.sort_order,
        is_active = true,
        updated_at = datetime('now')
    `;
  }
}

async function upsertStage(
  companyId: string,
  entityType: string,
  stageKey: string,
  label: string,
  color: string,
  sortOrder: number,
) {
  await sql`
    INSERT INTO company_pipeline_stages (
      company_id, entity_type, stage_key, label, color, sort_order, is_active
    ) VALUES (
      ${companyId}, ${entityType}, ${stageKey}, ${label}, ${color}, ${sortOrder}, true
    )
    ON CONFLICT (company_id, entity_type, stage_key) DO UPDATE SET
      label = excluded.label,
      color = excluded.color,
      sort_order = excluded.sort_order,
      is_active = true,
      updated_at = datetime('now')
  `;
}
