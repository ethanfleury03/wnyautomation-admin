# Shared Database Runbook

## Source Of Truth

Production DB is shared WNY Automation platform data, not AWP data. AWP is the first client portal.

For now, `wnyautomation-admin` is the canonical schema and Drizzle migration owner. The gateway and client portal repos are schema consumers and should not generate or apply production migrations.

Canonical shared tables:

- `companies`
- `company_settings`
- `portal_users`
- `user_memberships`
- `feature_flags`
- `portal_destinations`
- `unassigned_portal_users`
- `audit_logs` and `admin_audit_events`
- tenant-owned CRM/work tables such as customers, leads, jobs, invoices, estimates, growth records, and admin tickets

## Production Env Contract

Admin, gateway, and each client portal should point production `DATABASE_URL` and `DATABASE_DIRECT_URL` at the same Neon production branch after the gateway passes against canonical tables.

Keep preview/staging branches separate later. This milestone only standardizes production.

## Verification After Env Changes

1. Create a Neon branch/snapshot from the current AWP production database and take a `pg_dump` backup.
2. Apply migrations from `wnyautomation-admin` to the cloned branch first.
3. Dry-run the gateway routing merge:

```bash
GATEWAY_DATABASE_URL="..." CANONICAL_DATABASE_URL="..." npm run db:merge-gateway-routing
```

4. If the dry run has no conflicts, run it with `--apply` against the clone and verify row counts.
5. During the manual cutover window, repeat the backup, apply migrations to production, then run:

```bash
GATEWAY_DATABASE_URL="..." CANONICAL_DATABASE_URL="..." npm run db:merge-gateway-routing -- --apply
npm run db:verify-production-hardening
```

6. Deploy admin, gateway, and AWP with production `DATABASE_URL` / `DATABASE_DIRECT_URL` pointed at the canonical AWP database.
7. Compare the non-secret `connectionFingerprint` from:
   - Admin: `GET /api/admin/system-health` as a super admin.
   - Gateway: `GET /api/internal/db-info` with `GATEWAY_INTERNAL_ACCESS_TOKEN`.
   - AWP: `GET /api/internal/db-info` with `PORTAL_GATEWAY_SERVICE_TOKEN` or `WNY_INTERNAL_STATUS_TOKEN`.
8. Confirm all expected shared tables show `exists: true`.
9. Confirm existing users appear in admin user management and gateway `/api/internal/access/verify` still resolves assigned users.

## RLS And App Authorization Audit

Current app-level checks:

- Admin `/api/admin/*` routes require `requireSuperAdmin`.
- Gateway `/api/admin/*` routes require `requireGatewaySuperAdmin`.
- Gateway internal access verification requires `GATEWAY_INTERNAL_ACCESS_TOKEN`.
- AWP tenant-facing routes use portal auth helpers and explicit `company_id` filters.

Current DB-level notes:

- Existing RLS policies are installed by `drizzle/0001_rls.sql` for many tenant-owned tables.
- `drizzle/0012_shared_rls_hardening.sql` repairs/enforces RLS across all tables with `company_id`, plus parent-scoped child tables.
- Admin and gateway set `app.role = 'super_admin'` for server-side operational queries.
- AWP authenticated portal requests set `app.company_id` through the SQL runtime context after resolving an active membership and destination.
- Dedicated production DB roles are deferred to the next hardening phase.

## Local Checks

Run this before deploying schema-related changes:

```bash
npm run db:contract
npm run typecheck
npm run test
npm run build
```
