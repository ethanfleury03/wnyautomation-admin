#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const CONFIRM_VALUE = 'reset-staging-data';

function connectionUrl() {
  return process.env.STAGING_DATABASE_ADMIN_URL || process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || '';
}

function fingerprintFor(url) {
  const parsed = new URL(url);
  const identity = `${parsed.protocol}//${parsed.username || 'user'}@${parsed.host}${parsed.pathname}`;
  return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

function requireStagingTarget(url) {
  if (process.env.APP_ENV !== 'staging') {
    throw new Error('Refusing to reset: APP_ENV must be exactly "staging".');
  }
  if (process.env.STAGING_RESET_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Refusing to reset: STAGING_RESET_CONFIRM must be "${CONFIRM_VALUE}".`);
  }
  if (!url) {
    throw new Error('Refusing to reset: STAGING_DATABASE_ADMIN_URL, DATABASE_DIRECT_URL, or DATABASE_URL is required.');
  }

  const parsed = new URL(url);
  const expectedHost = (process.env.STAGING_DATABASE_HOST || '').trim();
  const expectedFingerprint = (process.env.STAGING_DATABASE_FINGERPRINT || '').trim();
  const actualFingerprint = fingerprintFor(url);

  if (!expectedHost && !expectedFingerprint) {
    throw new Error('Refusing to reset: set STAGING_DATABASE_HOST or STAGING_DATABASE_FINGERPRINT.');
  }
  if (expectedHost && parsed.hostname !== expectedHost) {
    throw new Error(`Refusing to reset: database host ${parsed.hostname} does not match STAGING_DATABASE_HOST.`);
  }
  if (expectedFingerprint && actualFingerprint !== expectedFingerprint) {
    throw new Error('Refusing to reset: database fingerprint does not match STAGING_DATABASE_FINGERPRINT.');
  }

  return { host: parsed.hostname, fingerprint: actualFingerprint };
}

async function query(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows || [];
}

async function publicTables(client) {
  const rows = await query(
    client,
    `SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS name
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return rows.map((row) => row.name).filter(Boolean);
}

async function main() {
  const url = connectionUrl();
  const identity = requireStagingTarget(url);
  const dryRun = process.argv.includes('--dry-run');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    const tables = await publicTables(client);
    console.log('[reset-staging-data] target', identity);
    console.log('[reset-staging-data] public tables', tables.length);

    if (dryRun) {
      console.log('[reset-staging-data] dry run; no data changed');
      return;
    }

    if (tables.length === 0) {
      console.log('[reset-staging-data] no public tables to truncate');
      return;
    }

    await client.query('BEGIN');
    await client.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    await client.query('COMMIT');
    console.log('[reset-staging-data] reset complete');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[reset-staging-data] Failed', error);
  process.exit(1);
});
