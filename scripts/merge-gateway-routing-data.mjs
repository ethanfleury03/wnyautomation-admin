#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const sourceUrl = process.env.GATEWAY_DATABASE_URL;
const targetUrl = process.env.CANONICAL_DATABASE_URL || process.env.DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  console.error(
    'Missing database URL. Set GATEWAY_DATABASE_URL and CANONICAL_DATABASE_URL or DATABASE_URL.',
  );
  process.exit(1);
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const isActive = (value) => !['0', 'false', 'blocked', 'inactive', 'disabled'].includes(String(value ?? 'active').toLowerCase());
const boolValue = (value) => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

function parseCompanyMap() {
  const raw = process.env.COMPANY_ID_MAP || '';
  if (!raw.trim()) return new Map();
  const parsed = JSON.parse(raw);
  return new Map(Object.entries(parsed).map(([from, to]) => [String(from), String(to)]));
}

async function withPool(url, fn) {
  const pool = new Pool({ connectionString: url });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function tableExists(pool, table) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
  return Boolean(rows[0]?.name);
}

async function columnExists(pool, table, column) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS ok`,
    [table, column],
  );
  return Boolean(rows[0]?.ok);
}

async function requireTargetSchema(pool) {
  const required = {
    companies: ['id', 'name', 'email', 'status'],
    portal_users: ['id', 'clerk_user_id', 'email', 'name', 'role', 'hashed_pw', 'is_active'],
    user_memberships: ['id', 'user_id', 'company_id', 'role', 'status'],
    portal_destinations: ['id', 'company_id', 'destination_key', 'label', 'launch_url', 'is_default', 'status'],
    unassigned_portal_users: ['email', 'clerk_user_id', 'name', 'last_seen_at'],
    admin_audit_events: ['id', 'event_type', 'created_at'],
  };
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    if (!(await tableExists(pool, table))) {
      missing.push(table);
      continue;
    }
    for (const column of columns) {
      if (!(await columnExists(pool, table, column))) missing.push(`${table}.${column}`);
    }
  }
  if (missing.length) {
    throw new Error(
      `Canonical DB is missing required tables (${missing.join(', ')}). Run admin migrations before merging gateway routing data.`,
    );
  }
}

async function readRows(pool, table, order = '1') {
  if (!(await tableExists(pool, table))) return [];
  const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY ${order}`);
  return rows;
}

function pickCompanyEmail(company) {
  const email = normalizeEmail(company.email);
  return email || `${normalizeKey(company.name || company.id) || 'company'}@gateway.local`;
}

function buildCompanyPlan(sourceCompanies, targetCompanies) {
  const explicitMap = parseCompanyMap();
  const byId = new Map(targetCompanies.map((row) => [String(row.id), row]));
  const byEmail = new Map(
    targetCompanies
      .map((row) => [normalizeEmail(row.email), row])
      .filter(([email]) => email),
  );
  const byName = new Map(
    targetCompanies
      .map((row) => [normalizeKey(row.name), row])
      .filter(([name]) => name),
  );

  const companyMap = new Map();
  const actions = [];
  const conflicts = [];
  const warnings = [];

  for (const source of sourceCompanies) {
    const sourceId = String(source.id || '');
    const explicitTarget = explicitMap.get(sourceId);
    if (explicitTarget) {
      if (!byId.has(explicitTarget)) {
        conflicts.push(`COMPANY_ID_MAP maps ${sourceId} to missing target company ${explicitTarget}`);
      } else {
        companyMap.set(sourceId, explicitTarget);
      }
      continue;
    }

    const sameId = byId.get(sourceId);
    if (sameId) {
      companyMap.set(sourceId, sourceId);
      continue;
    }

    const emailMatch = byEmail.get(pickCompanyEmail(source));
    if (emailMatch) {
      companyMap.set(sourceId, String(emailMatch.id));
      warnings.push(`Mapped gateway company ${sourceId} to canonical company ${emailMatch.id} by email.`);
      continue;
    }

    const nameMatch = byName.get(normalizeKey(source.name));
    if (nameMatch) {
      companyMap.set(sourceId, String(nameMatch.id));
      warnings.push(`Mapped gateway company ${sourceId} to canonical company ${nameMatch.id} by name.`);
      continue;
    }

    if (sourceCompanies.length === 1 && targetCompanies.length === 1) {
      const target = targetCompanies[0];
      companyMap.set(sourceId, String(target.id));
      warnings.push(`Mapped the only gateway company ${sourceId} to the only canonical company ${target.id}.`);
      continue;
    }

    if (!uuidRe.test(sourceId)) {
      conflicts.push(`Gateway company ${sourceId} is not a UUID and cannot be inserted into canonical companies.id.`);
      continue;
    }

    companyMap.set(sourceId, sourceId);
    actions.push({
      type: 'insert_company',
      row: {
        id: sourceId,
        name: String(source.name || 'Gateway Company'),
        email: pickCompanyEmail(source),
        status: String(source.status || 'active'),
      },
    });
  }

  return { companyMap, actions, conflicts, warnings };
}

function buildUserPlan(sourceUsers, targetUsers) {
  const byId = new Map(targetUsers.map((row) => [String(row.id), row]));
  const byClerk = new Map(
    targetUsers
      .map((row) => [String(row.clerk_user_id || '').trim(), row])
      .filter(([id]) => id),
  );
  const byEmail = new Map(
    targetUsers
      .map((row) => [normalizeEmail(row.email), row])
      .filter(([email]) => email),
  );
  const userMap = new Map();
  const actions = [];
  const conflicts = [];
  const warnings = [];

  for (const source of sourceUsers) {
    const sourceId = String(source.id || '');
    const clerkId = String(source.clerk_user_id || '').trim();
    const email = normalizeEmail(source.email);
    const matches = [byId.get(sourceId), clerkId ? byClerk.get(clerkId) : null, email ? byEmail.get(email) : null]
      .filter(Boolean);
    const uniqueIds = new Set(matches.map((row) => String(row.id)));
    if (uniqueIds.size > 1) {
      conflicts.push(`Gateway user ${sourceId}/${email} matches multiple canonical users: ${[...uniqueIds].join(', ')}`);
      continue;
    }

    const existing = matches[0];
    if (existing) {
      userMap.set(sourceId, String(existing.id));
      if (clerkId && !existing.clerk_user_id) {
        actions.push({ type: 'update_user_clerk', id: String(existing.id), clerkUserId: clerkId });
      }
      if (source.name && !existing.name) {
        actions.push({ type: 'update_user_name', id: String(existing.id), name: String(source.name) });
      }
      continue;
    }

    const newId = uuidRe.test(sourceId) ? sourceId : randomUUID();
    if (newId !== sourceId) {
      warnings.push(`Gateway user ${sourceId}/${email} is not a UUID; inserting as ${newId}.`);
    }
    userMap.set(sourceId, newId);
    actions.push({
      type: 'insert_user',
      row: {
        id: newId,
        clerkUserId: clerkId || null,
        email,
        name: String(source.name || email),
        role: String(source.role || 'staff'),
        isActive: isActive(source.is_active),
      },
    });
  }

  return { userMap, actions, conflicts, warnings };
}

function buildMembershipPlan(sourceMemberships, targetMemberships, userMap, companyMap) {
  const existing = new Map(
    targetMemberships.map((row) => [`${row.user_id}:${row.company_id}`, row]),
  );
  const actions = [];
  const conflicts = [];
  const warnings = [];

  for (const source of sourceMemberships) {
    const userId = userMap.get(String(source.user_id || ''));
    const companyId = companyMap.get(String(source.company_id || ''));
    if (!userId || !companyId) {
      conflicts.push(`Membership ${source.id || `${source.user_id}:${source.company_id}`} references unmapped user/company.`);
      continue;
    }

    const key = `${userId}:${companyId}`;
    const current = existing.get(key);
    const role = String(source.role || 'viewer');
    const status = String(source.status || 'active');
    if (current) {
      if (String(current.status || 'active') !== status || String(current.role || 'viewer') !== role) {
        warnings.push(`Preserving existing membership ${key}; gateway has ${role}/${status}, canonical has ${current.role}/${current.status}.`);
      }
      continue;
    }

    actions.push({
      type: 'insert_membership',
      row: {
        id: uuidRe.test(String(source.id || '')) ? String(source.id) : randomUUID(),
        userId,
        companyId,
        role,
        status,
      },
    });
  }

  return { actions, conflicts, warnings };
}

function buildDestinationPlan(sourceDestinations, targetDestinations, companyMap) {
  const byKey = new Map(targetDestinations.map((row) => [String(row.destination_key), row]));
  const byCompanyDefault = new Map(
    targetDestinations.filter((row) => boolValue(row.is_default)).map((row) => [String(row.company_id), row]),
  );
  const actions = [];
  const conflicts = [];
  const warnings = [];

  for (const source of sourceDestinations) {
    const companyId = companyMap.get(String(source.company_id || ''));
    if (!companyId) {
      conflicts.push(`Destination ${source.destination_key} references unmapped company ${source.company_id}.`);
      continue;
    }

    const key = String(source.destination_key || '').trim();
    if (!key) {
      conflicts.push(`Gateway destination ${source.id || ''} is missing destination_key.`);
      continue;
    }

    const current = byKey.get(key);
    if (current) {
      if (String(current.company_id) !== companyId) {
        conflicts.push(`Destination ${key} exists on canonical company ${current.company_id}, not mapped company ${companyId}.`);
      } else if (String(current.launch_url) !== String(source.launch_url || '')) {
        warnings.push(`Preserving canonical launch_url for destination ${key}; gateway has ${source.launch_url}.`);
      }
      continue;
    }

    const sourceDefault = boolValue(source.is_default);
    if (sourceDefault && byCompanyDefault.has(companyId)) {
      warnings.push(`Destination ${key} will be inserted as non-default because canonical company ${companyId} already has a default destination.`);
    }

    actions.push({
      type: 'insert_destination',
      row: {
        id: uuidRe.test(String(source.id || '')) ? String(source.id) : randomUUID(),
        companyId,
        destinationKey: key,
        label: String(source.label || key),
        launchUrl: String(source.launch_url || ''),
        isDefault: sourceDefault && !byCompanyDefault.has(companyId),
        status: String(source.status || 'active'),
      },
    });
  }

  return { actions, conflicts, warnings };
}

function buildUnassignedPlan(sourceRows, targetRows) {
  const existing = new Set(targetRows.map((row) => normalizeEmail(row.email)));
  return {
    actions: sourceRows
      .filter((row) => normalizeEmail(row.email) && !existing.has(normalizeEmail(row.email)))
      .map((row) => ({
        type: 'insert_unassigned',
        row: {
          email: normalizeEmail(row.email),
          clerkUserId: String(row.clerk_user_id || '') || null,
          name: String(row.name || '') || null,
        },
      })),
    conflicts: [],
    warnings: [],
  };
}

function buildAuditPlan(sourceRows, targetRows, companyMap) {
  const existing = new Set(targetRows.map((row) => String(row.id)));
  const actions = [];
  const warnings = [];
  for (const row of sourceRows) {
    const id = String(row.id || '');
    if (!uuidRe.test(id)) {
      warnings.push(`Skipping gateway audit event with non-UUID id ${id}.`);
      continue;
    }
    if (existing.has(id)) continue;
    actions.push({
      type: 'insert_audit',
      row: {
        id,
        actorUserId: row.actor_user_id || null,
        actorEmail: row.actor_email || null,
        eventType: String(row.event_type || 'gateway_imported_event'),
        targetEmail: row.target_email || null,
        companyId: row.company_id ? companyMap.get(String(row.company_id)) || null : null,
        destinationKey: row.destination_key || null,
        metadataJson: row.metadata_json || null,
      },
    });
  }
  return { actions, conflicts: [], warnings };
}

async function applyActions(pool, actions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.role', 'super_admin', true)`);
    for (const action of actions) {
      const row = action.row;
      if (action.type === 'insert_company') {
        await client.query(
          `INSERT INTO companies (id, name, email, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.name, row.email, row.status],
        );
      } else if (action.type === 'insert_user') {
        await client.query(
          `INSERT INTO portal_users (id, clerk_user_id, email, name, role, hashed_pw, is_active)
           VALUES ($1, $2, $3, $4, $5, '', $6)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.clerkUserId, row.email, row.name, row.role, row.isActive],
        );
      } else if (action.type === 'update_user_clerk') {
        await client.query(
          `UPDATE portal_users SET clerk_user_id = $2, updated_at = NOW()
           WHERE id = $1 AND clerk_user_id IS NULL`,
          [action.id, action.clerkUserId],
        );
      } else if (action.type === 'update_user_name') {
        await client.query(
          `UPDATE portal_users SET name = $2, updated_at = NOW()
           WHERE id = $1 AND COALESCE(name, '') = ''`,
          [action.id, action.name],
        );
      } else if (action.type === 'insert_membership') {
        await client.query(
          `INSERT INTO user_memberships (id, user_id, company_id, role, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, company_id) DO NOTHING`,
          [row.id, row.userId, row.companyId, row.role, row.status],
        );
      } else if (action.type === 'insert_destination') {
        await client.query(
          `INSERT INTO portal_destinations (id, company_id, destination_key, label, launch_url, is_default, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (destination_key) DO NOTHING`,
          [row.id, row.companyId, row.destinationKey, row.label, row.launchUrl, row.isDefault, row.status],
        );
      } else if (action.type === 'insert_unassigned') {
        await client.query(
          `INSERT INTO unassigned_portal_users (email, clerk_user_id, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET
             clerk_user_id = COALESCE(EXCLUDED.clerk_user_id, unassigned_portal_users.clerk_user_id),
             name = COALESCE(EXCLUDED.name, unassigned_portal_users.name),
             last_seen_at = NOW()`,
          [row.email, row.clerkUserId, row.name],
        );
      } else if (action.type === 'insert_audit') {
        await client.query(
          `INSERT INTO admin_audit_events
             (id, actor_user_id, actor_email, event_type, target_email, company_id, destination_key, metadata_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            row.actorUserId,
            row.actorEmail,
            row.eventType,
            row.targetEmail,
            row.companyId,
            row.destinationKey,
            row.metadataJson,
          ],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

await withPool(targetUrl, async (targetPool) => {
  await requireTargetSchema(targetPool);
  await withPool(sourceUrl, async (sourcePool) => {
    const [
      sourceCompanies,
      targetCompanies,
      sourceUsers,
      targetUsers,
      sourceMemberships,
      targetMemberships,
      sourceDestinations,
      targetDestinations,
      sourceUnassigned,
      targetUnassigned,
      sourceAudit,
      targetAudit,
    ] = await Promise.all([
      readRows(sourcePool, 'companies', 'id'),
      readRows(targetPool, 'companies', 'id'),
      readRows(sourcePool, 'portal_users', 'id'),
      readRows(targetPool, 'portal_users', 'id'),
      readRows(sourcePool, 'user_memberships', 'user_id, company_id'),
      readRows(targetPool, 'user_memberships', 'user_id, company_id'),
      readRows(sourcePool, 'portal_destinations', 'destination_key'),
      readRows(targetPool, 'portal_destinations', 'destination_key'),
      readRows(sourcePool, 'unassigned_portal_users', 'email'),
      readRows(targetPool, 'unassigned_portal_users', 'email'),
      readRows(sourcePool, 'admin_audit_events', 'created_at'),
      readRows(targetPool, 'admin_audit_events', 'created_at'),
    ]);

    const companyPlan = buildCompanyPlan(sourceCompanies, targetCompanies);
    const userPlan = buildUserPlan(sourceUsers, targetUsers);
    const membershipPlan = buildMembershipPlan(
      sourceMemberships,
      targetMemberships,
      userPlan.userMap,
      companyPlan.companyMap,
    );
    const destinationPlan = buildDestinationPlan(
      sourceDestinations,
      targetDestinations,
      companyPlan.companyMap,
    );
    const unassignedPlan = buildUnassignedPlan(sourceUnassigned, targetUnassigned);
    const auditPlan = buildAuditPlan(sourceAudit, targetAudit, companyPlan.companyMap);

    const actions = [
      ...companyPlan.actions,
      ...userPlan.actions,
      ...membershipPlan.actions,
      ...destinationPlan.actions,
      ...unassignedPlan.actions,
      ...auditPlan.actions,
    ];
    const conflicts = [
      ...companyPlan.conflicts,
      ...userPlan.conflicts,
      ...membershipPlan.conflicts,
      ...destinationPlan.conflicts,
      ...unassignedPlan.conflicts,
      ...auditPlan.conflicts,
    ];
    const warnings = [
      ...companyPlan.warnings,
      ...userPlan.warnings,
      ...membershipPlan.warnings,
      ...destinationPlan.warnings,
      ...unassignedPlan.warnings,
      ...auditPlan.warnings,
    ];

    const summary = actions.reduce((acc, action) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {});

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summary, warnings, conflicts }, null, 2));

    if (conflicts.length) {
      console.error('Aborting because conflicts require a human mapping decision.');
      process.exit(2);
    }

    if (apply) {
      await applyActions(targetPool, actions);
      console.log(`Applied ${actions.length} gateway routing import actions.`);
    } else {
      console.log('Dry run only. Re-run with --apply after backup/snapshot verification.');
    }
  });
});
