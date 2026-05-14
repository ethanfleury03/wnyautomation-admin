import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const crmCompanies = pgTable(
  'crm_companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('hubspot'),
    externalId: text('external_id').notNull(),
    name: text('name').notNull().default(''),
    domain: text('domain'),
    website: text('website'),
    rawJson: text('raw_json'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerExternalIdx: uniqueIndex('idx_crm_companies_provider_external').on(
      t.provider,
      t.externalId,
    ),
    domainIdx: index('idx_crm_companies_domain').on(t.domain),
  }),
);

export const crmContacts = pgTable(
  'crm_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('hubspot'),
    externalId: text('external_id').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    jobTitle: text('job_title'),
    companyExternalId: text('company_external_id'),
    companyName: text('company_name'),
    lifecycleStage: text('lifecycle_stage'),
    rawJson: text('raw_json'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerExternalIdx: uniqueIndex('idx_crm_contacts_provider_external').on(
      t.provider,
      t.externalId,
    ),
    emailIdx: index('idx_crm_contacts_email').on(t.email),
    companyExternalIdx: index('idx_crm_contacts_company_external').on(t.companyExternalId),
  }),
);

export const crmSyncRuns = pgTable(
  'crm_sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('hubspot'),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    contactCount: integer('contact_count').notNull().default(0),
    companyCount: integer('company_count').notNull().default(0),
    errorMessage: text('error_message'),
  },
  (t) => ({
    startedIdx: index('idx_crm_sync_runs_started').on(t.startedAt),
  }),
);

export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: text('actor_user_id'),
    actorEmail: text('actor_email'),
    eventType: text('event_type').notNull(),
    targetEmail: text('target_email'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    destinationKey: text('destination_key'),
    metadataJson: text('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    createdIdx: index('idx_admin_audit_events_created').on(t.createdAt),
    targetIdx: index('idx_admin_audit_events_target').on(t.targetEmail),
  }),
);
