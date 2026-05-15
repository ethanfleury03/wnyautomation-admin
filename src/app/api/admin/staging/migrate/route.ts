import { Pool } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { isPortalResponse, requireSuperAdmin } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';

const CONFIRM = 'apply-staging-migrations';

const ADMIN_TICKET_COMMENTS_SQL = `
CREATE TABLE IF NOT EXISTS "admin_ticket_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "admin_tickets"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "author_user_id" text,
  "author_role" text NOT NULL,
  "author_name" text,
  "author_email" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_admin_ticket_comments_ticket_created"
  ON "admin_ticket_comments" ("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_admin_ticket_comments_company_created"
  ON "admin_ticket_comments" ("company_id", "created_at");

ALTER TABLE "admin_ticket_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_ticket_comments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON "admin_ticket_comments";
CREATE POLICY tenant_isolation_select ON "admin_ticket_comments" FOR SELECT USING (
  app_is_super_admin() OR company_id = app_current_company()
);

DROP POLICY IF EXISTS tenant_isolation_mod ON "admin_ticket_comments";
CREATE POLICY tenant_isolation_mod ON "admin_ticket_comments" FOR ALL USING (
  app_is_super_admin() OR company_id = app_current_company()
) WITH CHECK (
  app_is_super_admin() OR company_id = app_current_company()
);
`;

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (isPortalResponse(auth)) return auth;

  if (process.env.APP_ENV !== 'staging') {
    return NextResponse.json({ error: 'Only staging can run this migration endpoint.' }, { status: 403 });
  }
  if (request.nextUrl.searchParams.get('confirm') !== CONFIRM) {
    return NextResponse.json({ error: `Missing confirm=${CONFIRM}.` }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(ADMIN_TICKET_COMMENTS_SQL);
    const result = await client.query(
      `SELECT to_regclass('public.admin_ticket_comments') AS table_name`,
    );
    return NextResponse.json({
      ok: result.rows[0]?.table_name === 'admin_ticket_comments',
      applied: ['0013_admin_ticket_comments'],
    });
  } finally {
    client.release();
    await pool.end();
  }
}
