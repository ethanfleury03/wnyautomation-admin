# WNY Automation Admin

Standalone owner-only admin app for WNY Automation operations.

- Admin UI lives at `/admin`.
- Admin API routes live under `/api/admin`.
- Access is restricted server-side to `ADMIN_EMAILS`, defaulting to `ethan@wnyautomation.com`.
- Admin logout and non-admin lockout exits send users to `NEXT_PUBLIC_CLIENT_PORTAL_URL`, defaulting to `https://app.wnyautomation.com`, so client users can continue through the portal gateway.
- Production DB = shared WNY Automation platform source of truth. It is not AWP-owned data; AWP is the first client portal.
- This repo is the canonical schema and Drizzle migration owner for now. Other repos may consume shared tables, but production migrations are generated/applied from `wnyautomation-admin`.
- Shared platform tables include `companies`, `company_settings`, `portal_users`, `user_memberships`, `feature_flags`, `portal_destinations`, admin audit/ticket tables, and tenant-owned CRM/work tables.
- `/api/admin/system-health` includes an admin-only, non-secret DB fingerprint and expected-table check for production verification.

See `docs/shared-database-runbook.md` for the production DB contract, Vercel env checklist, and RLS/app-authorization audit notes.
