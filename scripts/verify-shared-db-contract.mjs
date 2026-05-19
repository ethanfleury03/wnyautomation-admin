import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const drizzleDir = path.join(root, 'drizzle');
const migrations = fs
  .readdirSync(drizzleDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => fs.readFileSync(path.join(drizzleDir, file), 'utf8'))
  .join('\n');

const checks = [
  ['companies.status', /ALTER TABLE "companies"[\s\S]*"status"|CREATE TABLE "companies"[\s\S]*"status"/],
  ['portal_users', /CREATE TABLE "portal_users"/],
  ['user_memberships', /CREATE TABLE "user_memberships"/],
  ['user_memberships unique user/company', /idx_user_memberships_user_company/],
  ['company_settings', /CREATE TABLE(?: IF NOT EXISTS)? "company_settings"/],
  ['feature_flags', /CREATE TABLE "feature_flags"/],
  ['portal_destinations', /CREATE TABLE IF NOT EXISTS "portal_destinations"/],
  ['portal_destinations RLS', /portal_destinations[\s\S]*ROW LEVEL SECURITY|column_name = 'company_id'/],
  ['unassigned_portal_users', /CREATE TABLE IF NOT EXISTS "unassigned_portal_users"/],
  ['admin_ticket_buckets', /CREATE TABLE IF NOT EXISTS "admin_ticket_buckets"/],
  ['admin_tickets', /CREATE TABLE IF NOT EXISTS "admin_tickets"/],
  ['admin_ticket_comments', /CREATE TABLE IF NOT EXISTS "admin_ticket_comments"/],
  ['ticket_agent_events', /CREATE TABLE IF NOT EXISTS "ticket_agent_events"/],
  ['crm_companies', /CREATE TABLE IF NOT EXISTS "crm_companies"/],
  ['crm_contacts', /CREATE TABLE IF NOT EXISTS "crm_contacts"/],
  ['crm_sync_runs', /CREATE TABLE IF NOT EXISTS "crm_sync_runs"/],
  ['admin_audit_events', /CREATE TABLE IF NOT EXISTS "admin_audit_events"/],
  ['RLS helper app_is_super_admin', /CREATE OR REPLACE FUNCTION app_is_super_admin/],
  ['RLS helper app_current_company', /CREATE OR REPLACE FUNCTION app_current_company/],
  ['RLS forced', /FORCE ROW LEVEL SECURITY/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(migrations));

if (failures.length) {
  console.error('Shared DB contract check failed. Missing:');
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`Shared DB contract OK (${checks.length} checks).`);
