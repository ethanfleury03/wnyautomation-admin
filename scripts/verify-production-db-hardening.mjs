#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const url = process.env.CANONICAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set CANONICAL_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

const requiredTables = [
  'companies',
  'portal_users',
  'user_memberships',
  'portal_destinations',
  'customers',
  'leads',
  'jobs',
  'invoices',
  'estimates',
];

const rlsTables = [
  'companies',
  'portal_users',
  'user_memberships',
  'portal_destinations',
  'company_settings',
  'branches',
  'customers',
  'leads',
  'jobs',
  'invoices',
  'estimates',
  'payments',
  'attachments',
  'service_contracts',
];

function fingerprint(input) {
  const u = new URL(input);
  return createHash('sha256')
    .update(`${u.protocol}//${u.username || 'user'}@${u.host}${u.pathname}`)
    .digest('hex')
    .slice(0, 16);
}

const pool = new Pool({ connectionString: url });
try {
  const [tables, rls, migrations] = await Promise.all([
    pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [requiredTables],
    ),
    pool.query(
      `SELECT
         c.relname AS table_name,
         c.relrowsecurity AS row_security_enabled,
         c.relforcerowsecurity AS row_security_forced,
         COUNT(p.polname)::int AS policy_count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_policy p ON p.polrelid = c.oid
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`,
      [rlsTables],
    ),
    pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations_table`),
  ]);

  const foundTables = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));
  const rlsByTable = new Map(rls.rows.map((row) => [row.table_name, row]));
  const rlsFailures = rlsTables
    .map((table) => {
      const row = rlsByTable.get(table);
      return {
        table,
        rowSecurityEnabled: Boolean(row?.row_security_enabled),
        rowSecurityForced: Boolean(row?.row_security_forced),
        policyCount: Number(row?.policy_count || 0),
      };
    })
    .filter((row) => !row.rowSecurityEnabled || !row.rowSecurityForced || row.policyCount === 0);

  const summary = {
    connectionFingerprint: fingerprint(url),
    migrationsTablePresent: Boolean(migrations.rows[0]?.migrations_table),
    missingTables,
    rlsFailures,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (missingTables.length || rlsFailures.length || !summary.migrationsTablePresent) {
    process.exit(2);
  }
} finally {
  await pool.end();
}
