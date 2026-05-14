import type Database from 'better-sqlite3';

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(table),
  );
}

function columnExists(db: Database.Database, table: string, col: string): boolean {
  if (!tableExists(db, table)) return false;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === col);
}

export function applySharedDbMigrations(db: Database.Database) {
  if (tableExists(db, 'companies') && !columnExists(db, 'companies', 'status')) {
    db.exec(`ALTER TABLE companies ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memberships_user_company
      ON user_memberships(user_id, company_id);

    CREATE TABLE IF NOT EXISTS portal_destinations (
      id TEXT PRIMARY KEY DEFAULT (uuid()) NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      destination_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      launch_url TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_portal_destinations_company
      ON portal_destinations(company_id);
    CREATE INDEX IF NOT EXISTS idx_portal_destinations_status
      ON portal_destinations(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_destinations_company_default
      ON portal_destinations(company_id)
      WHERE is_default = 1;

    CREATE TABLE IF NOT EXISTS crm_companies (
      id TEXT PRIMARY KEY DEFAULT (uuid()) NOT NULL,
      provider TEXT NOT NULL DEFAULT 'hubspot',
      external_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      domain TEXT,
      website TEXT,
      raw_json TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_companies_provider_external
      ON crm_companies(provider, external_id);
    CREATE INDEX IF NOT EXISTS idx_crm_companies_domain_lower
      ON crm_companies(lower(domain));

    CREATE TABLE IF NOT EXISTS crm_contacts (
      id TEXT PRIMARY KEY DEFAULT (uuid()) NOT NULL,
      provider TEXT NOT NULL DEFAULT 'hubspot',
      external_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      job_title TEXT,
      company_external_id TEXT,
      company_name TEXT,
      lifecycle_stage TEXT,
      raw_json TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_provider_external
      ON crm_contacts(provider, external_id);
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_email_lower
      ON crm_contacts(lower(email));
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_external
      ON crm_contacts(company_external_id);

    CREATE TABLE IF NOT EXISTS crm_sync_runs (
      id TEXT PRIMARY KEY DEFAULT (uuid()) NOT NULL,
      provider TEXT NOT NULL DEFAULT 'hubspot',
      status TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      contact_count INTEGER NOT NULL DEFAULT 0,
      company_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crm_sync_runs_started
      ON crm_sync_runs(started_at);

    CREATE TABLE IF NOT EXISTS admin_audit_events (
      id TEXT PRIMARY KEY DEFAULT (uuid()) NOT NULL,
      actor_user_id TEXT,
      actor_email TEXT,
      event_type TEXT NOT NULL,
      target_email TEXT,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      destination_key TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created
      ON admin_audit_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target_lower
      ON admin_audit_events(lower(target_email));
  `);
}
