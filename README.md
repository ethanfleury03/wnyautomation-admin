# WNY Automation Admin

Standalone owner-only admin app for WNY Automation operations.

- Admin UI lives at `/admin`.
- Admin API routes live under `/api/admin`.
- Access is restricted server-side to `ADMIN_EMAILS`, defaulting to `ethan@wnyautomation.com`.
- Production should point `DATABASE_URL` at the same managed database used by AWP so this app can manage tenants, modules, tickets, and webhook failures without living inside the client portal.
