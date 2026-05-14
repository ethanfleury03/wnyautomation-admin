#!/usr/bin/env node
import { Pool } from '@neondatabase/serverless';

const CONFIRM_VALUE = 'seed-staging-data';
const IDS = {
  wnyCompany: '00000000-0000-4000-8000-000000000101',
  awpCompany: '00000000-0000-4000-8000-000000000201',
  wnyBranch: '00000000-0000-4000-8000-000000000102',
  awpBranch: '00000000-0000-4000-8000-000000000202',
  awpDestination: '00000000-0000-4000-8000-000000000301',
  fakeOwner: '00000000-0000-4000-8000-000000000401',
  fakeAwpAdmin: '00000000-0000-4000-8000-000000000402',
  fakeAwpViewer: '00000000-0000-4000-8000-000000000403',
};

function requireStaging() {
  if (process.env.APP_ENV !== 'staging') {
    throw new Error('Refusing to seed: APP_ENV must be exactly "staging".');
  }
  if (process.env.STAGING_SEED_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Refusing to seed: STAGING_SEED_CONFIRM must be "${CONFIRM_VALUE}".`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Refusing to seed: DATABASE_URL is required for the shared staging database.');
  }
}

function emailList(value) {
  return String(value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function stableUuidFromEmail(email) {
  const hex = Buffer.from(email.toLowerCase()).toString('hex').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function query(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows || [];
}

async function requireTables(client) {
  const required = ['companies', 'branches', 'company_settings', 'portal_users', 'user_memberships', 'portal_destinations'];
  const rows = await query(
    client,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [required],
  );
  const found = new Set(rows.map((row) => row.table_name));
  const missing = required.filter((table) => !found.has(table));
  if (missing.length) throw new Error(`Staging DB is missing required tables: ${missing.join(', ')}`);
}

async function upsertCompany(client, { id, name, email, phone, industry }) {
  const existing = await query(client, 'SELECT id FROM companies WHERE id = $1 OR lower(email) = lower($2) LIMIT 1', [id, email]);
  const resolvedId = existing[0]?.id || id;
  if (existing[0]) {
    await query(
      client,
      `UPDATE companies SET name = $2, email = $3, phone = $4, status = 'active', updated_at = NOW() WHERE id = $1`,
      [resolvedId, name, email, phone || null],
    );
  } else {
    await query(
      client,
      `INSERT INTO companies (id, name, email, phone, status) VALUES ($1, $2, $3, $4, 'active')`,
      [resolvedId, name, email, phone || null],
    );
  }

  await query(
    client,
    `INSERT INTO company_settings (company_id, display_name, legal_name, industry, timezone, portal_title, workspace_label, default_route)
     VALUES ($1, $2, $2, $3, 'America/Toronto', $4, $5, '/app')
     ON CONFLICT (company_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       legal_name = EXCLUDED.legal_name,
       industry = EXCLUDED.industry,
       timezone = EXCLUDED.timezone,
       portal_title = EXCLUDED.portal_title,
       workspace_label = EXCLUDED.workspace_label,
       default_route = EXCLUDED.default_route,
       updated_at = NOW()`,
    [resolvedId, name, industry, `${name} Portal`, `${name} workspace`],
  );

  return resolvedId;
}

async function upsertBranch(client, { id, companyId, name, code }) {
  const existing = await query(
    client,
    `SELECT id
     FROM branches
     WHERE id = $1 OR company_id = $2
     ORDER BY CASE WHEN id = $1 THEN 0 WHEN is_primary = true THEN 1 ELSE 2 END
     LIMIT 1`,
    [id, companyId],
  );
  const resolvedId = existing[0]?.id || id;
  if (existing[0]) {
    await query(
      client,
      `UPDATE branches SET name = $2, code = $3, is_primary = true, updated_at = NOW() WHERE id = $1`,
      [resolvedId, name, code],
    );
  } else {
    await query(
      client,
      `INSERT INTO branches (id, company_id, name, code, is_primary) VALUES ($1, $2, $3, $4, true)`,
      [resolvedId, companyId, name, code],
    );
  }
  return resolvedId;
}

async function upsertUser(client, { id, email, name, companyId, branchId, role }) {
  const normalizedEmail = email.toLowerCase();
  const existing = await query(client, 'SELECT id FROM portal_users WHERE id = $1 OR lower(email) = lower($2) LIMIT 1', [
    id,
    normalizedEmail,
  ]);
  const resolvedId = existing[0]?.id || id;
  if (existing[0]) {
    await query(
      client,
      `UPDATE portal_users
       SET company_id = $2, email = $3, name = $4, role = $5, hashed_pw = '', is_active = true, updated_at = NOW()
       WHERE id = $1`,
      [resolvedId, companyId, normalizedEmail, name, role],
    );
  } else {
    await query(
      client,
      `INSERT INTO portal_users (id, company_id, email, name, hashed_pw, role, is_active)
       VALUES ($1, $2, $3, $4, '', $5, true)`,
      [resolvedId, companyId, normalizedEmail, name, role],
    );
  }

  await query(
    client,
    `INSERT INTO user_memberships (user_id, company_id, branch_id, role, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (user_id, company_id) DO UPDATE SET
       branch_id = EXCLUDED.branch_id,
       role = EXCLUDED.role,
       status = 'active',
       updated_at = NOW()`,
    [resolvedId, companyId, branchId, role],
  );
}

async function upsertDestination(client, { id, companyId, key, label, launchUrl }) {
  await query(
    client,
    `INSERT INTO portal_destinations (id, company_id, destination_key, label, launch_url, is_default, status)
     VALUES ($1, $2, $3, $4, $5, true, 'active')
     ON CONFLICT (destination_key) DO UPDATE SET
       company_id = EXCLUDED.company_id,
       label = EXCLUDED.label,
       launch_url = EXCLUDED.launch_url,
       is_default = true,
       status = 'active',
       updated_at = NOW()`,
    [id, companyId, key, label, launchUrl],
  );
}

async function main() {
  requireStaging();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.role = 'super_admin'");
    await requireTables(client);

    const wnyCompanyId = await upsertCompany(client, {
      id: IDS.wnyCompany,
      name: process.env.STAGING_WNY_COMPANY_NAME || 'WNY Automation Staging',
      email: process.env.STAGING_WNY_COMPANY_EMAIL || 'staging-platform@wnyautomation.test',
      phone: null,
      industry: 'agency',
    });
    const awpCompanyId = await upsertCompany(client, {
      id: IDS.awpCompany,
      name: process.env.STAGING_AWP_COMPANY_NAME || 'AWP Staging',
      email: process.env.STAGING_AWP_COMPANY_EMAIL || 'staging-awp@wnyautomation.test',
      phone: null,
      industry: 'generic',
    });

    const wnyBranchId = await upsertBranch(client, { id: IDS.wnyBranch, companyId: wnyCompanyId, name: 'WNY Automation', code: 'WNY-STG' });
    const awpBranchId = await upsertBranch(client, { id: IDS.awpBranch, companyId: awpCompanyId, name: 'AWP Staging', code: 'AWP-STG' });

    await upsertUser(client, {
      id: IDS.fakeOwner,
      email: 'staging.owner@wnyautomation.test',
      name: 'Staging Owner',
      companyId: wnyCompanyId,
      branchId: wnyBranchId,
      role: 'super_admin',
    });
    await upsertUser(client, {
      id: IDS.fakeAwpAdmin,
      email: process.env.STAGING_AWP_ADMIN_EMAIL || 'staging.awp.admin@wnyautomation.test',
      name: 'AWP Staging Admin',
      companyId: awpCompanyId,
      branchId: awpBranchId,
      role: 'admin',
    });
    await upsertUser(client, {
      id: IDS.fakeAwpViewer,
      email: 'staging.awp.viewer@wnyautomation.test',
      name: 'AWP Staging Viewer',
      companyId: awpCompanyId,
      branchId: awpBranchId,
      role: 'viewer',
    });

    for (const email of emailList(process.env.STAGING_OPERATOR_EMAILS || process.env.ADMIN_EMAILS)) {
      await upsertUser(client, {
        id: stableUuidFromEmail(email),
        email,
        name: email.split('@')[0].replace(/[._-]+/g, ' '),
        companyId: awpCompanyId,
        branchId: awpBranchId,
        role: 'super_admin',
      });
    }

    await upsertDestination(client, {
      id: IDS.awpDestination,
      companyId: awpCompanyId,
      key: process.env.GATEWAY_AWP_DESTINATION_KEY || 'awp-growth-portal',
      label: process.env.GATEWAY_AWP_DESTINATION_LABEL || 'AWP Growth Portal',
      launchUrl:
        process.env.STAGING_GATEWAY_AWP_PORTAL_URL ||
        process.env.GATEWAY_AWP_PORTAL_URL ||
        'https://awp-growth-portal-git-staging-ethanfleury03s-projects.vercel.app',
    });

    await client.query('COMMIT');
    console.log('[seed-staging-data] Seed complete');
    console.log({ wnyCompanyId, awpCompanyId, destinationKey: process.env.GATEWAY_AWP_DESTINATION_KEY || 'awp-growth-portal' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[seed-staging-data] Failed', error);
  process.exit(1);
});
