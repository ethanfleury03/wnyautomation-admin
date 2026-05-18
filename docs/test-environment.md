# WNY Automation Staging/Test Environment

This is the canonical staging runbook for WNY Automation's marketing site,
gateway, admin app, and first client portal.

## Environment Shape

Production DNS stays clean:

- `https://wnyautomation.com` -> marketing site
- `https://app.wnyautomation.com` -> portal gateway
- `https://admin.wnyautomation.com` -> admin app
- `https://awp.wnyautomation.com` -> AWP portal

Staging uses durable custom domains attached to the Vercel custom
`staging` environment:

- `https://staging.wnyautomation.com` -> marketing site
- `https://staging.app.wnyautomation.com` -> portal gateway
- `https://staging.admin.wnyautomation.com` -> admin app
- `https://staging.awp.wnyautomation.com` -> AWP portal

All staging app projects and `wnyautomation.com` DNS should live under the
same Vercel team, preferably `wny-automation`, so staging aliases can be
updated by the deployment system without manual cross-team domain access.

## Branch And Vercel Setup

Use a persistent `staging` branch for each repo:

```bash
git -C /Users/ethanfleury/projects/wnyautomation-site branch staging main
git -C /Users/ethanfleury/projects/wnyautomation-admin branch staging main
git -C /Users/ethanfleury/projects/wnyautomation-portal-gateway branch staging main
# awp-growth-portal already uses staging
```

Re-link local Vercel metadata from each repo if `.vercel/project.json` points at
an old team or project:

```bash
vercel link --yes --scope wny-automation --project wnyautomation
vercel link --yes --scope ethanfleury03s-projects --project wnyautomation-admin
vercel link --yes --scope wny-automation --project wnyautomation-portal-gateway
vercel link --yes --scope wny-automation --project wnyautomation-portal
```

Keep `.vercel/` ignored. Never commit Vercel project metadata.

Use Vercel's custom `staging` environment for all app projects. The `staging`
branch should deploy to that environment and own the corresponding custom
domain. Manual deployment is only a fallback:

```bash
cd /Users/ethanfleury/projects/wnyautomation-portal-gateway
vercel deploy --target=staging --scope wny-automation --yes
```

## Staging Environment Variables

Each repo has a `.env.staging.example`. Copy its values into the Vercel
custom `staging` environment. Do not commit real secrets.

Shared platform DB:

- `wnyautomation-admin`, `wnyautomation-portal-gateway`, and
  `awp-growth-portal` must use the same isolated Neon staging branch.
- Set both `DATABASE_URL` and `DATABASE_DIRECT_URL` to that staging branch.
- Never point Preview/Staging at the production write database.

Marketing site DB:

- `wnyautomation-site` may use its own staging DB for persistent fake blogs and
  fake leads.
- Leave `N8N_LEAD_WEBHOOK_URL` empty unless testing delivery on purpose.

Routing contract:

- Gateway `GATEWAY_AWP_PORTAL_URL` points to the AWP staging custom domain.
- AWP `PORTAL_GATEWAY_URL` points to the gateway staging custom domain.
- Gateway `GATEWAY_INTERNAL_ACCESS_TOKEN` and AWP
  `PORTAL_GATEWAY_SERVICE_TOKEN` must be the same staging-only token.
- Gateway `GATEWAY_AWP_FALLBACK_SECRET` and AWP
  `PORTAL_GATEWAY_FALLBACK_SECRET` must be the same staging-only random secret.

Clerk contract:

- Create a dedicated Clerk app named `WNY Automation Staging`.
- Use that app's publishable and secret keys in gateway, admin, and AWP
  staging envs.
- Set `CLERK_EXPECTED_FAPI_HOST` to the decoded Frontend API host for that
  staging Clerk app in all three repos.
- Gateway uses `NEXT_PUBLIC_CLERK_PROXY_URL=https://staging.app.wnyautomation.com/clerk-proxy`.
- Admin and AWP use their own staging proxy URLs and
  `NEXT_PUBLIC_CLERK_IS_SATELLITE=true`.
- No staging env may use the production Clerk Frontend API host
  `clerk.wnyautomation.com`.

## Seed Order

After the Neon staging branch exists and admin migrations have been applied,
seed in this order:

```bash
cd /Users/ethanfleury/projects/wnyautomation-admin
APP_ENV=staging STAGING_SEED_CONFIRM=seed-staging-data npm run db:seed:staging

cd /Users/ethanfleury/projects/awp-growth-portal
APP_ENV=staging STAGING_SEED_CONFIRM=seed-staging-data npm run db:seed:staging

cd /Users/ethanfleury/projects/wnyautomation-site
APP_ENV=staging STAGING_SEED_CONFIRM=seed-staging-data npm run db:seed:staging
```

The staging seed scripts refuse to run unless `APP_ENV=staging` and
`STAGING_SEED_CONFIRM=seed-staging-data` are both set.

## Verification

Run local checks before pushing:

```bash
cd /Users/ethanfleury/projects/wnyautomation-admin
npm run db:contract && npm run typecheck && npm run test && npm run build

cd /Users/ethanfleury/projects/wnyautomation-portal-gateway
npm run typecheck && npm run test && npm run build

cd /Users/ethanfleury/projects/awp-growth-portal
npm run lint && npm run typecheck && npm run test && npm run build
npm run db:init && npm run db:seed:demo

cd /Users/ethanfleury/projects/wnyautomation-site
npm run test && npm run build
```

Verify deployed staging:

- Vercel deployments for all four `staging` branches are `READY`.
- Each staging deployment owns its expected custom `*.wnyautomation.com`
  domain.
- Admin `/api/admin/system-health` shows the staging DB fingerprint.
- Gateway `/api/internal/db-info` shows the same staging DB fingerprint.
- AWP `/api/internal/db-info` shows the same staging DB fingerprint.
- Gateway `/api/internal/access/verify` allows `staging.awp.admin@wnyautomation.test`.
- Gateway launches `https://staging.awp.wnyautomation.com`, not
  `https://awp.wnyautomation.com`.
- Gateway `npm run smoke:staging-auth` passes after the Clerk staging app and
  Vercel staging env values are live.
- Site `/`, `/blog`, `/api/blogs?limit=6`, and `/client-login` work.
- Staging responses include `X-Robots-Tag: noindex, nofollow`.

## Cleanup Rules

Remove any old test/staging custom domain from every layer:

- Vercel project domains
- DNS provider records
- Clerk allowed origins, redirect URLs, and OAuth callback URLs
- Vercel environment variables and app `.env` files
- Gateway destination records in the staging/prod database

Production should only reference the four approved production domains listed at
the top of this document.
