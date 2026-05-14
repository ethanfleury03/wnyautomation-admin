-- Shared multi-tenant RLS hardening.
--
-- This migration is intentionally idempotent so it can repair databases that
-- predate the shared gateway/admin/AWP schema contract. All tenant-owned tables
-- with a `company_id` column get the same company isolation policy. Tables
-- scoped through a parent row get explicit parent checks.

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean AS $$
  SELECT COALESCE(current_setting('app.role', true), '') = 'super_admin';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_company() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'company_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', rec.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', rec.table_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_select ON %I;
       CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (
         app_is_super_admin() OR company_id = app_current_company()
       );',
      rec.table_name,
      rec.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_mod ON %I;
       CREATE POLICY tenant_isolation_mod ON %I FOR ALL USING (
         app_is_super_admin() OR company_id = app_current_company()
       ) WITH CHECK (
         app_is_super_admin() OR company_id = app_current_company()
       );',
      rec.table_name,
      rec.table_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE companies FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON companies;
    CREATE POLICY tenant_isolation_select ON companies FOR SELECT USING (
      app_is_super_admin() OR id = app_current_company()
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON companies;
    CREATE POLICY tenant_isolation_mod ON companies FOR ALL USING (
      app_is_super_admin() OR id = app_current_company()
    ) WITH CHECK (
      app_is_super_admin() OR id = app_current_company()
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.invoice_line_items') IS NOT NULL THEN
    ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON invoice_line_items;
    CREATE POLICY tenant_isolation_select ON invoice_line_items FOR SELECT USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = invoice_line_items.invoice_id
          AND i.company_id = app_current_company()
      )
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON invoice_line_items;
    CREATE POLICY tenant_isolation_mod ON invoice_line_items FOR ALL USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = invoice_line_items.invoice_id
          AND i.company_id = app_current_company()
      )
    ) WITH CHECK (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = invoice_line_items.invoice_id
          AND i.company_id = app_current_company()
      )
    );
  END IF;

  IF to_regclass('public.estimate_line_items') IS NOT NULL THEN
    ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE estimate_line_items FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON estimate_line_items;
    CREATE POLICY tenant_isolation_select ON estimate_line_items FOR SELECT USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_line_items.estimate_id
          AND e.company_id = app_current_company()
      )
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON estimate_line_items;
    CREATE POLICY tenant_isolation_mod ON estimate_line_items FOR ALL USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_line_items.estimate_id
          AND e.company_id = app_current_company()
      )
    ) WITH CHECK (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_line_items.estimate_id
          AND e.company_id = app_current_company()
      )
    );
  END IF;

  IF to_regclass('public.estimate_activity') IS NOT NULL THEN
    ALTER TABLE estimate_activity ENABLE ROW LEVEL SECURITY;
    ALTER TABLE estimate_activity FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON estimate_activity;
    CREATE POLICY tenant_isolation_select ON estimate_activity FOR SELECT USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_activity.estimate_id
          AND e.company_id = app_current_company()
      )
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON estimate_activity;
    CREATE POLICY tenant_isolation_mod ON estimate_activity FOR ALL USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_activity.estimate_id
          AND e.company_id = app_current_company()
      )
    ) WITH CHECK (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_activity.estimate_id
          AND e.company_id = app_current_company()
      )
    );
  END IF;

  IF to_regclass('public.estimate_delivery') IS NOT NULL THEN
    ALTER TABLE estimate_delivery ENABLE ROW LEVEL SECURITY;
    ALTER TABLE estimate_delivery FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON estimate_delivery;
    CREATE POLICY tenant_isolation_select ON estimate_delivery FOR SELECT USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_delivery.estimate_id
          AND e.company_id = app_current_company()
      )
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON estimate_delivery;
    CREATE POLICY tenant_isolation_mod ON estimate_delivery FOR ALL USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_delivery.estimate_id
          AND e.company_id = app_current_company()
      )
    ) WITH CHECK (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_delivery.estimate_id
          AND e.company_id = app_current_company()
      )
    );
  END IF;

  IF to_regclass('public.service_contract_schedules') IS NOT NULL THEN
    ALTER TABLE service_contract_schedules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE service_contract_schedules FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_select ON service_contract_schedules;
    CREATE POLICY tenant_isolation_select ON service_contract_schedules FOR SELECT USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM service_contracts sc
        WHERE sc.id = service_contract_schedules.contract_id
          AND sc.company_id = app_current_company()
      )
    );
    DROP POLICY IF EXISTS tenant_isolation_mod ON service_contract_schedules;
    CREATE POLICY tenant_isolation_mod ON service_contract_schedules FOR ALL USING (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM service_contracts sc
        WHERE sc.id = service_contract_schedules.contract_id
          AND sc.company_id = app_current_company()
      )
    ) WITH CHECK (
      app_is_super_admin()
      OR EXISTS (
        SELECT 1 FROM service_contracts sc
        WHERE sc.id = service_contract_schedules.contract_id
          AND sc.company_id = app_current_company()
      )
    );
  END IF;
END
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('receptionist_transcript_segments', 'call_id'),
        ('receptionist_events', 'call_id'),
        ('receptionist_tool_invocations', 'call_id'),
        ('receptionist_bookings', 'call_id'),
        ('receptionist_staff_tasks', 'call_id')
    ) AS v(table_name, call_column)
  LOOP
    IF to_regclass('public.' || rec.table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', rec.table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', rec.table_name);
      EXECUTE format(
        'DROP POLICY IF EXISTS tenant_isolation_select ON %I;
         CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (
           app_is_super_admin()
           OR EXISTS (
             SELECT 1 FROM receptionist_calls rc
             WHERE rc.id = %I.%I
               AND rc.company_id = app_current_company()
           )
         );',
        rec.table_name,
        rec.table_name,
        rec.table_name,
        rec.call_column
      );
      EXECUTE format(
        'DROP POLICY IF EXISTS tenant_isolation_mod ON %I;
         CREATE POLICY tenant_isolation_mod ON %I FOR ALL USING (
           app_is_super_admin()
           OR EXISTS (
             SELECT 1 FROM receptionist_calls rc
             WHERE rc.id = %I.%I
               AND rc.company_id = app_current_company()
           )
         ) WITH CHECK (
           app_is_super_admin()
           OR EXISTS (
             SELECT 1 FROM receptionist_calls rc
             WHERE rc.id = %I.%I
               AND rc.company_id = app_current_company()
           )
         );',
        rec.table_name,
        rec.table_name,
        rec.table_name,
        rec.call_column,
        rec.table_name,
        rec.call_column
      );
    END IF;
  END LOOP;
END
$$;
