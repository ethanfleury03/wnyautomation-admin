ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "idx_companies_status"
  ON "companies" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_memberships_user_company"
  ON "user_memberships" ("user_id", "company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_users_email_lower"
  ON "portal_users" (lower("email"));

CREATE TABLE IF NOT EXISTS "portal_destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "destination_key" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "launch_url" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_portal_destinations_company"
  ON "portal_destinations" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_portal_destinations_status"
  ON "portal_destinations" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_destinations_company_default"
  ON "portal_destinations" ("company_id")
  WHERE "is_default" = true;

CREATE TABLE IF NOT EXISTS "crm_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL DEFAULT 'hubspot',
  "external_id" text NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "domain" text,
  "website" text,
  "raw_json" text,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_crm_companies_provider_external"
  ON "crm_companies" ("provider", "external_id");
CREATE INDEX IF NOT EXISTS "idx_crm_companies_domain"
  ON "crm_companies" ("domain");

CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL DEFAULT 'hubspot',
  "external_id" text NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "first_name" text,
  "last_name" text,
  "phone" text,
  "job_title" text,
  "company_external_id" text,
  "company_name" text,
  "lifecycle_stage" text,
  "raw_json" text,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_crm_contacts_provider_external"
  ON "crm_contacts" ("provider", "external_id");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_email"
  ON "crm_contacts" ("email");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_company_external"
  ON "crm_contacts" ("company_external_id");

CREATE TABLE IF NOT EXISTS "crm_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL DEFAULT 'hubspot',
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  "contact_count" integer NOT NULL DEFAULT 0,
  "company_count" integer NOT NULL DEFAULT 0,
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "idx_crm_sync_runs_started"
  ON "crm_sync_runs" ("started_at");

CREATE TABLE IF NOT EXISTS "admin_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" text,
  "actor_email" text,
  "event_type" text NOT NULL,
  "target_email" text,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "destination_key" text,
  "metadata_json" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_events_created"
  ON "admin_audit_events" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_events_target"
  ON "admin_audit_events" ("target_email");
