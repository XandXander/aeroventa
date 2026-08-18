import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED = Object.freeze({
  repoHead: '346a16560719a83b6e3e1fbbadd63a16c60a9612',
  planFormat: 'aeroventa-directus-import-plan-v1',
  planSafety: 'DRAFT_ONLY_NO_PUBLISH',
  sourceFingerprint: '4a33c77aa5578bf6272a2f2763c9a16e6a7dc678ff88596c11da1c233cd23c78',
  v11ApplyHash: 'b3ed8151ee5f641550d4893369a1f46894f804cb',
  targetDirectus: '12.1.1',
  targetVendor: 'postgres',
  collections: [
    'content',
    'content_blocks',
    'content_block_map',
    'content_categories',
    'content_category_map',
    'project_details',
    'service_details',
    'redirects',
    'site_settings',
  ],
  unsupportedPopulatedCollections: ['content_blocks', 'content_block_map', 'content_category_map'],
  counts: {
    content: 29,
    content_categories: 8,
    redirects: 67,
    project_details: 6,
    service_details: 2,
    site_settings: 1,
    schema_collections: 9,
    schema_fields: 110,
    schema_relations: 9,
    schema_system_fields: 12,
  },
  writeApprovalSentinel: 'YES_I_HAVE_FRESH_OWNER_APPROVAL',
});

export const rootFromMeta = (metaUrl) => {
  const here = path.dirname(fileURLToPath(metaUrl));
  return path.resolve(here, '..');
};

export const readJson = async (root, relativePath) =>
  JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));

export const writePrivateJson = async (root, name, data) => {
  const outDir = path.join(root, 'migration/private/directus');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, name);
  await fs.writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`);
  return outPath;
};

export const stableStringify = (value) => {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, normalize(input[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
};

export const deepEqual = (a, b) => stableStringify(a) === stableStringify(b);

const duplicates = (values) => {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return [...result];
};

const assertExactCount = (failures, label, actual, expected) => {
  if (actual !== expected) failures.push({ code: 'COUNT_MISMATCH', detail: { label, expected, actual } });
};

export function validatePlan(plan) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });

  if (plan?.format !== EXPECTED.planFormat) fail('PLAN_FORMAT_INVALID', plan?.format ?? null);
  if (plan?.safety !== EXPECTED.planSafety) fail('PLAN_SAFETY_INVALID', plan?.safety ?? null);
  if (plan?.generated_at !== null) fail('PLAN_NON_DETERMINISTIC_TIMESTAMP', plan?.generated_at ?? null);
  if (plan?.source_fingerprint_sha256 !== EXPECTED.sourceFingerprint) {
    fail('PLAN_SOURCE_FINGERPRINT_DRIFT', {
      expected: EXPECTED.sourceFingerprint,
      actual: plan?.source_fingerprint_sha256 ?? null,
    });
  }

  const groups = plan?.collections ?? {};
  const content = Array.isArray(groups.content) ? groups.content : [];
  const categories = Array.isArray(groups.content_categories) ? groups.content_categories : [];
  const redirects = Array.isArray(groups.redirects) ? groups.redirects : [];
  const projects = Array.isArray(groups.project_details) ? groups.project_details : [];
  const services = Array.isArray(groups.service_details) ? groups.service_details : [];
  const settings = groups.site_settings ?? null;

  assertExactCount(failures, 'content', content.length, EXPECTED.counts.content);
  assertExactCount(failures, 'content_categories', categories.length, EXPECTED.counts.content_categories);
  assertExactCount(failures, 'redirects', redirects.length, EXPECTED.counts.redirects);
  assertExactCount(failures, 'project_details', projects.length, EXPECTED.counts.project_details);
  assertExactCount(failures, 'service_details', services.length, EXPECTED.counts.service_details);
  assertExactCount(failures, 'site_settings', settings ? 1 : 0, EXPECTED.counts.site_settings);

  for (const name of EXPECTED.unsupportedPopulatedCollections) {
    const value = groups[name];
    if (value !== undefined && (!Array.isArray(value) || value.length !== 0)) {
      fail('UNSUPPORTED_DETERMINISTIC_MAPPING_PRESENT', { collection: name });
    }
  }

  for (const duplicate of duplicates(content.map((row) => row.path))) fail('DUPLICATE_CONTENT_PATH', duplicate);
  for (const duplicate of duplicates(categories.map((row) => row.path))) fail('DUPLICATE_CATEGORY_PATH', duplicate);
  for (const duplicate of duplicates(redirects.map((row) => row.source_path))) fail('DUPLICATE_REDIRECT_SOURCE', duplicate);
  for (const duplicate of duplicates(projects.map((row) => row.path_ref))) fail('DUPLICATE_PROJECT_PATH_REF', duplicate);
  for (const duplicate of duplicates(services.map((row) => row.path_ref))) fail('DUPLICATE_SERVICE_PATH_REF', duplicate);

  const contentByPath = new Map(content.map((row) => [row.path, row]));
  const contentPaths = new Set(contentByPath.keys());
  for (const row of content) {
    if (row.status !== 'draft') fail('NON_DRAFT_CONTENT', row.path);
    if (row.owner_approved_at !== null) fail('OWNER_APPROVAL_PRESET', row.path);
    if (row.robots_index !== false) fail('ROBOTS_INDEX_ENABLED', row.path);
    if (row.robots_follow !== true) fail('ROBOTS_FOLLOW_DISABLED', row.path);
    if (row.sitemap_include !== false) fail('SITEMAP_ENABLED', row.path);
    if (row.knowledge_allowed !== false) fail('KNOWLEDGE_ALLOWED_PRESET', row.path);
    if (row.ai_origin !== false) fail('AI_ORIGIN_PRESET', row.path);
    if (!['pending_review', 'not_applicable'].includes(row.body_html_safety_status)) {
      fail('BODY_HTML_SAFETY_INVALID', { path: row.path, value: row.body_html_safety_status });
    }
  }

  for (const row of categories) {
    if (row.status !== 'draft') fail('NON_DRAFT_CATEGORY', row.path);
    if (row.robots_index !== false) fail('CATEGORY_ROBOTS_INDEX_ENABLED', row.path);
  }

  for (const row of redirects) {
    if (![301, 410].includes(Number(row.status_code))) fail('REDIRECT_STATUS_INVALID', row.source_path);
    if (Number(row.status_code) === 410 && row.target_path !== null) fail('GONE_TARGET_NOT_NULL', row.source_path);
    if (row.active !== true) fail('REDIRECT_NOT_ACTIVE', row.source_path);
    if (contentPaths.has(row.source_path)) fail('CONTENT_REDIRECT_COLLISION', row.source_path);
  }

  for (const row of projects) {
    const contentRow = contentByPath.get(row.path_ref);
    if (!contentRow) fail('PROJECT_PATH_REF_MISSING', row.path_ref);
    else if (contentRow.content_type !== 'project') {
      fail('PROJECT_PATH_REF_TYPE_INVALID', { path: row.path_ref, content_type: contentRow.content_type });
    }
  }
  for (const row of services) {
    const contentRow = contentByPath.get(row.path_ref);
    if (!contentRow) fail('SERVICE_PATH_REF_MISSING', row.path_ref);
    else if (contentRow.content_type !== 'service') {
      fail('SERVICE_PATH_REF_TYPE_INVALID', { path: row.path_ref, content_type: contentRow.content_type });
    }
  }

  const montage = services.find((row) => row.path_ref === '/montazh-ventiliacii/');
  if (!montage || montage.direct_execution !== true || montage.fulfillment_model !== 'mixed') {
    fail('MONTAGE_SERVICE_CONTRACT_INVALID', montage ?? null);
  }
  const drilling = services.find((row) => row.path_ref === '/almaznoe-burenie/');
  if (!drilling || drilling.direct_execution !== false || drilling.fulfillment_model !== 'partner') {
    fail('DRILLING_SERVICE_CONTRACT_INVALID', drilling ?? null);
  }
  if (settings?.primary_business !== 'Монтаж вентиляции') fail('PRIMARY_BUSINESS_INVALID', settings?.primary_business ?? null);
  if (settings?.ai_consultant_enabled !== false || settings?.emergency_disable_ai !== true) {
    fail('AI_DEFAULT_SAFETY_INVALID', settings ?? null);
  }

  return failures;
}

const fieldSchemaSubset = (schema) => {
  if (schema === null) return null;
  if (!schema) return undefined;
  return {
    data_type: schema.data_type ?? null,
    max_length: schema.max_length ?? null,
    numeric_precision: schema.numeric_precision ?? null,
    numeric_scale: schema.numeric_scale ?? null,
    default_value: schema.default_value ?? null,
    is_nullable: schema.is_nullable ?? null,
    is_unique: schema.is_unique ?? null,
    is_indexed: schema.is_indexed ?? null,
    is_primary_key: schema.is_primary_key ?? null,
    is_generated: schema.is_generated ?? null,
    generation_expression: schema.generation_expression ?? null,
    has_auto_increment: schema.has_auto_increment ?? null,
    foreign_key_table: schema.foreign_key_table ?? null,
    foreign_key_column: schema.foreign_key_column ?? null,
  };
};

const relationSchemaSubset = (schema) => ({
  table: schema?.table ?? null,
  column: schema?.column ?? null,
  foreign_key_table: schema?.foreign_key_table ?? null,
  foreign_key_column: schema?.foreign_key_column ?? null,
  on_update: schema?.on_update ?? null,
  on_delete: schema?.on_delete ?? null,
});

export function schemaSignature(snapshot) {
  const allowed = new Set(EXPECTED.collections);
  return {
    directus: snapshot?.directus ?? null,
    vendor: snapshot?.vendor ?? null,
    collections: (snapshot?.collections ?? [])
      .filter((row) => allowed.has(row.collection))
      .map((row) => ({
        collection: row.collection,
        singleton: row?.meta?.singleton ?? false,
        schema_name: row?.schema?.name ?? null,
      }))
      .sort((a, b) => a.collection.localeCompare(b.collection)),
    fields: (snapshot?.fields ?? [])
      .filter((row) => allowed.has(row.collection))
      .map((row) => ({
        collection: row.collection,
        field: row.field,
        type: row.type,
        required: row?.meta?.required ?? false,
        special: row?.meta?.special ?? null,
        schema: fieldSchemaSubset(row.schema),
      }))
      .sort((a, b) => `${a.collection}.${a.field}`.localeCompare(`${b.collection}.${b.field}`)),
    relations: (snapshot?.relations ?? [])
      .filter((row) => allowed.has(row.collection))
      .map((row) => ({
        collection: row.collection,
        field: row.field,
        related_collection: row.related_collection,
        schema: relationSchemaSubset(row.schema),
      }))
      .sort((a, b) => `${a.collection}.${a.field}`.localeCompare(`${b.collection}.${b.field}`)),
    systemFields: (snapshot?.systemFields ?? [])
      .map((row) => ({
        collection: row.collection,
        field: row.field,
        is_indexed: row?.schema?.is_indexed ?? null,
      }))
      .sort((a, b) => `${a.collection}.${a.field}`.localeCompare(`${b.collection}.${b.field}`)),
  };
}

export function validateTargetSchema(target) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });

  if (target?.directus !== EXPECTED.targetDirectus || target?.vendor !== EXPECTED.targetVendor) {
    fail('TARGET_IDENTITY_INVALID', { directus: target?.directus ?? null, vendor: target?.vendor ?? null });
  }
  assertExactCount(failures, 'schema.collections', target?.collections?.length ?? 0, EXPECTED.counts.schema_collections);
  assertExactCount(failures, 'schema.fields', target?.fields?.length ?? 0, EXPECTED.counts.schema_fields);
  assertExactCount(failures, 'schema.relations', target?.relations?.length ?? 0, EXPECTED.counts.schema_relations);
  assertExactCount(failures, 'schema.systemFields', target?.systemFields?.length ?? 0, EXPECTED.counts.schema_system_fields);

  const names = (target?.collections ?? []).map((row) => row.collection);
  if (!deepEqual([...names].sort(), [...EXPECTED.collections].sort())) fail('TARGET_COLLECTION_SET_INVALID', names);

  const fields = target?.fields ?? [];
  for (const collection of ['project_details', 'service_details']) {
    const id = fields.find((row) => row.collection === collection && row.field === 'id');
    const contentId = fields.find((row) => row.collection === collection && row.field === 'content_id');
    if (!id || id.type !== 'uuid' || id.schema?.is_primary_key !== true || id.schema?.foreign_key_table !== null) {
      fail('DETAIL_ID_PRIMARY_KEY_INVALID', { collection, id: id ?? null });
    }
    if (
      !contentId ||
      contentId.type !== 'uuid' ||
      contentId.schema?.is_primary_key !== false ||
      contentId.schema?.is_nullable !== false ||
      contentId.schema?.is_unique !== true ||
      contentId.schema?.foreign_key_table !== 'content' ||
      contentId.schema?.foreign_key_column !== 'id'
    ) {
      fail('DETAIL_CONTENT_ID_O2O_INVALID', { collection, content_id: contentId ?? null });
    }
  }
  return failures;
}

export function compareRemoteSchema(remote, target) {
  const failures = [];
  const targetFailures = validateTargetSchema(target);
  failures.push(...targetFailures);
  if (remote?.directus !== EXPECTED.targetDirectus || remote?.vendor !== EXPECTED.targetVendor) {
    failures.push({
      code: 'REMOTE_DIRECTUS_IDENTITY_DRIFT',
      detail: { expected: [EXPECTED.targetDirectus, EXPECTED.targetVendor], actual: [remote?.directus, remote?.vendor] },
    });
  }
  const expectedSig = schemaSignature(target);
  const actualSig = schemaSignature(remote);
  if (!deepEqual(actualSig, expectedSig)) {
    failures.push({ code: 'REMOTE_SCHEMA_STRUCTURAL_DRIFT', detail: { expected: expectedSig, actual: actualSig } });
  }
  return failures;
}

const isLocalHttp = (url) => ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && url.protocol === 'http:';

export function requireDirectusEnv() {
  const baseRaw = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_ADMIN_TOKEN;
  if (!baseRaw) throw new Error('DIRECTUS_URL is required');
  if (!token) throw new Error('DIRECTUS_ADMIN_TOKEN is required');
  const base = new URL(baseRaw);
  if (base.protocol !== 'https:' && !isLocalHttp(base)) {
    throw new Error('DIRECTUS_URL must use HTTPS (HTTP is allowed only for localhost tests)');
  }
  return { base, token };
}

export async function directusRequest({ base, token, pathname, method = 'GET', body = undefined, timeoutMs = 20000 }) {
  const url = new URL(pathname, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text.slice(0, 2000) };
      }
    }
    if (!response.ok) {
      const error = new Error(`Directus request failed: ${method} ${url.pathname} HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSchemaSnapshot(env) {
  const payload = await directusRequest({ ...env, pathname: '/schema/snapshot' });
  if (!payload?.data) throw new Error('Directus schema snapshot payload.data missing');
  return payload.data;
}

export async function fetchAll(env, collection, fields = '*') {
  const out = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const url = new URL(`/items/${collection}`, env.base);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('fields', fields);
    const payload = await directusRequest({ ...env, pathname: `${url.pathname}${url.search}` });
    if (!Array.isArray(payload?.data)) throw new Error(`Directus ${collection} payload.data is not an array`);
    out.push(...payload.data);
    if (payload.data.length < limit) break;
    if (offset > 10000) throw new Error(`Pagination safety limit exceeded for ${collection}`);
  }
  return out;
}

export async function fetchSingleton(env, collection, fields = '*') {
  const url = new URL(`/items/${collection}`, env.base);
  url.searchParams.set('fields', fields);
  const payload = await directusRequest({ ...env, pathname: `${url.pathname}${url.search}` });
  if (payload?.data === undefined) throw new Error(`Directus singleton ${collection} payload.data missing`);
  return payload.data;
}

export async function fetchRemoteState(env) {
  const [
    content,
    contentCategories,
    redirects,
    projectDetails,
    serviceDetails,
    contentBlocks,
    contentBlockMap,
    contentCategoryMap,
    siteSettings,
  ] = await Promise.all([
    fetchAll(env, 'content'),
    fetchAll(env, 'content_categories'),
    fetchAll(env, 'redirects'),
    fetchAll(env, 'project_details'),
    fetchAll(env, 'service_details'),
    fetchAll(env, 'content_blocks', 'id'),
    fetchAll(env, 'content_block_map', 'id'),
    fetchAll(env, 'content_category_map', 'id'),
    fetchSingleton(env, 'site_settings'),
  ]);
  return {
    content,
    content_categories: contentCategories,
    redirects,
    project_details: projectDetails,
    service_details: serviceDetails,
    content_blocks: contentBlocks,
    content_block_map: contentBlockMap,
    content_category_map: contentCategoryMap,
    site_settings: siteSettings,
  };
}

const assertUniqueRemote = (failures, rows, key, code) => {
  for (const duplicate of duplicates(rows.map((row) => row[key]))) {
    failures.push({ code, detail: duplicate });
  }
};

export function validatePreWriteState(plan, state) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const groups = plan.collections;

  assertUniqueRemote(failures, state.content, 'path', 'REMOTE_DUPLICATE_CONTENT_PATH');
  assertUniqueRemote(failures, state.content_categories, 'path', 'REMOTE_DUPLICATE_CATEGORY_PATH');
  assertUniqueRemote(failures, state.redirects, 'source_path', 'REMOTE_DUPLICATE_REDIRECT_SOURCE');
  assertUniqueRemote(failures, state.project_details, 'content_id', 'REMOTE_DUPLICATE_PROJECT_CONTENT_ID');
  assertUniqueRemote(failures, state.service_details, 'content_id', 'REMOTE_DUPLICATE_SERVICE_CONTENT_ID');

  const plannedContentPaths = new Set(groups.content.map((row) => row.path));
  const plannedCategoryPaths = new Set(groups.content_categories.map((row) => row.path));
  const plannedRedirectPaths = new Set(groups.redirects.map((row) => row.source_path));
  const plannedProjectPaths = new Set(groups.project_details.map((row) => row.path_ref));
  const plannedServicePaths = new Set(groups.service_details.map((row) => row.path_ref));

  for (const row of state.content) {
    if (!plannedContentPaths.has(row.path)) fail('UNMANAGED_REMOTE_CONTENT', { id: row.id, path: row.path });
    if (row.status !== 'draft') fail('REMOTE_CONTENT_NOT_DRAFT', { path: row.path, status: row.status });
    if (row.owner_approved_at != null) fail('REMOTE_CONTENT_ALREADY_APPROVED', row.path);
    if (row.robots_index !== false) fail('REMOTE_CONTENT_INDEXABLE', row.path);
    if (row.sitemap_include !== false) fail('REMOTE_CONTENT_IN_SITEMAP', row.path);
    if (row.knowledge_allowed !== false) fail('REMOTE_CONTENT_KNOWLEDGE_ENABLED', row.path);
  }
  for (const row of state.content_categories) {
    if (!plannedCategoryPaths.has(row.path)) fail('UNMANAGED_REMOTE_CATEGORY', { id: row.id, path: row.path });
    if (row.status !== 'draft') fail('REMOTE_CATEGORY_NOT_DRAFT', { path: row.path, status: row.status });
    if (row.robots_index !== false) fail('REMOTE_CATEGORY_INDEXABLE', row.path);
  }
  for (const row of state.redirects) {
    if (!plannedRedirectPaths.has(row.source_path)) fail('UNMANAGED_REMOTE_REDIRECT', { id: row.id, source_path: row.source_path });
  }

  const contentPathById = new Map(state.content.map((row) => [row.id, row.path]));
  for (const row of state.project_details) {
    const contentPath = contentPathById.get(row.content_id);
    if (!contentPath || !plannedProjectPaths.has(contentPath)) {
      fail('UNMANAGED_REMOTE_PROJECT_DETAIL', { id: row.id, content_id: row.content_id, content_path: contentPath ?? null });
    }
  }
  for (const row of state.service_details) {
    const contentPath = contentPathById.get(row.content_id);
    if (!contentPath || !plannedServicePaths.has(contentPath)) {
      fail('UNMANAGED_REMOTE_SERVICE_DETAIL', { id: row.id, content_id: row.content_id, content_path: contentPath ?? null });
    }
  }

  for (const collection of EXPECTED.unsupportedPopulatedCollections) {
    if ((state[collection] ?? []).length !== 0) {
      fail('STRUCTURED_COLLECTION_NOT_EMPTY', { collection, count: state[collection].length });
    }
  }

  return failures;
}

export const withoutKeys = (object, keys) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

export function comparableActual(actual, desired) {
  const out = {};
  for (const key of Object.keys(desired)) out[key] = actual?.[key] ?? null;
  return out;
}

export function desiredDetail(row, contentId) {
  const { path_ref: _ignored, ...rest } = row;
  return { ...rest, content_id: contentId };
}

export function operationSummary(plan, state) {
  const groups = plan.collections;
  const summary = {};
  const classify = (plannedRows, existingRows, key) => {
    const existing = new Map(existingRows.map((row) => [row[key], row]));
    const result = { create: 0, update: 0, noop: 0 };
    for (const desired of plannedRows) {
      const actual = existing.get(desired[key]);
      if (!actual) result.create += 1;
      else if (deepEqual(comparableActual(actual, desired), desired)) result.noop += 1;
      else result.update += 1;
    }
    return result;
  };
  summary.content_categories = classify(groups.content_categories, state.content_categories, 'path');
  summary.content = classify(groups.content, state.content, 'path');
  summary.redirects = classify(groups.redirects, state.redirects, 'source_path');

  const contentByPath = new Map(state.content.map((row) => [row.path, row]));
  const classifyDetails = (plannedRows, existingRows) => {
    const existing = new Map(existingRows.map((row) => [row.content_id, row]));
    const result = { create: 0, update: 0, noop: 0, deferred_until_content_exists: 0 };
    for (const row of plannedRows) {
      const content = contentByPath.get(row.path_ref);
      if (!content) {
        result.deferred_until_content_exists += 1;
        continue;
      }
      const desired = desiredDetail(row, content.id);
      const actual = existing.get(content.id);
      if (!actual) result.create += 1;
      else if (deepEqual(comparableActual(actual, desired), desired)) result.noop += 1;
      else result.update += 1;
    }
    return result;
  };
  summary.project_details = classifyDetails(groups.project_details, state.project_details);
  summary.service_details = classifyDetails(groups.service_details, state.service_details);
  summary.site_settings = deepEqual(comparableActual(state.site_settings ?? {}, groups.site_settings), groups.site_settings)
    ? { update: 0, noop: 1 }
    : { update: 1, noop: 0 };
  return summary;
}

export async function upsertByNaturalKey(env, collection, key, desired, existingRows) {
  const existing = existingRows.find((row) => row[key] === desired[key]);
  if (existing) {
    if (deepEqual(comparableActual(existing, desired), desired)) {
      return { action: 'noop', id: existing.id, before: existing, after: existing };
    }
    const payload = await directusRequest({
      ...env,
      pathname: `/items/${collection}/${encodeURIComponent(existing.id)}`,
      method: 'PATCH',
      body: desired,
    });
    return { action: 'update', id: existing.id, before: existing, after: payload?.data ?? null };
  }
  const payload = await directusRequest({ ...env, pathname: `/items/${collection}`, method: 'POST', body: desired });
  return { action: 'create', id: payload?.data?.id ?? null, before: null, after: payload?.data ?? null };
}

export async function upsertDetailByContentId(env, collection, desired, existingRows) {
  const existing = existingRows.find((row) => row.content_id === desired.content_id);
  if (existing) {
    if (deepEqual(comparableActual(existing, desired), desired)) {
      return { action: 'noop', id: existing.id, before: existing, after: existing };
    }
    const payload = await directusRequest({
      ...env,
      pathname: `/items/${collection}/${encodeURIComponent(existing.id)}`,
      method: 'PATCH',
      body: desired,
    });
    return { action: 'update', id: existing.id, before: existing, after: payload?.data ?? null };
  }
  const payload = await directusRequest({ ...env, pathname: `/items/${collection}`, method: 'POST', body: desired });
  return { action: 'create', id: payload?.data?.id ?? null, before: null, after: payload?.data ?? null };
}

export async function updateSingleton(env, collection, desired, actual) {
  if (deepEqual(comparableActual(actual ?? {}, desired), desired)) {
    return { action: 'noop', id: actual?.id ?? null, before: actual, after: actual };
  }
  const payload = await directusRequest({ ...env, pathname: `/items/${collection}`, method: 'PATCH', body: desired });
  return { action: 'update', id: payload?.data?.id ?? actual?.id ?? null, before: actual, after: payload?.data ?? null };
}

export function verifyExactReadback(plan, state) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const groups = plan.collections;

  const exactSet = (collection, plannedRows, actualRows, key) => {
    assertExactCount(failures, collection, actualRows.length, plannedRows.length);
    assertUniqueRemote(failures, actualRows, key, `DUPLICATE_${collection.toUpperCase()}_${key.toUpperCase()}`);
    const actualByKey = new Map(actualRows.map((row) => [row[key], row]));
    for (const desired of plannedRows) {
      const actual = actualByKey.get(desired[key]);
      if (!actual) fail('READBACK_MISSING_ROW', { collection, key, value: desired[key] });
      else if (!deepEqual(comparableActual(actual, desired), desired)) {
        fail('READBACK_ROW_DRIFT', {
          collection,
          key,
          value: desired[key],
          expected: desired,
          actual: comparableActual(actual, desired),
        });
      }
    }
    for (const actual of actualRows) {
      if (!plannedRows.some((row) => row[key] === actual[key])) {
        fail('READBACK_UNMANAGED_ROW', { collection, key, value: actual[key] });
      }
    }
  };

  exactSet('content', groups.content, state.content, 'path');
  exactSet('content_categories', groups.content_categories, state.content_categories, 'path');
  exactSet('redirects', groups.redirects, state.redirects, 'source_path');

  const contentByPath = new Map(state.content.map((row) => [row.path, row]));
  const verifyDetails = (collection, plannedRows, actualRows) => {
    assertExactCount(failures, collection, actualRows.length, plannedRows.length);
    assertUniqueRemote(failures, actualRows, 'content_id', `DUPLICATE_${collection.toUpperCase()}_CONTENT_ID`);
    const actualByContent = new Map(actualRows.map((row) => [row.content_id, row]));
    const expectedContentIds = new Set();
    for (const row of plannedRows) {
      const content = contentByPath.get(row.path_ref);
      if (!content) {
        fail('READBACK_DETAIL_CONTENT_PATH_MISSING', { collection, path_ref: row.path_ref });
        continue;
      }
      expectedContentIds.add(content.id);
      const desired = desiredDetail(row, content.id);
      const actual = actualByContent.get(content.id);
      if (!actual) fail('READBACK_DETAIL_MISSING', { collection, path_ref: row.path_ref, content_id: content.id });
      else if (!deepEqual(comparableActual(actual, desired), desired)) {
        fail('READBACK_DETAIL_DRIFT', {
          collection,
          path_ref: row.path_ref,
          expected: desired,
          actual: comparableActual(actual, desired),
        });
      }
    }
    for (const actual of actualRows) {
      if (!expectedContentIds.has(actual.content_id)) {
        fail('READBACK_UNMANAGED_DETAIL', { collection, id: actual.id, content_id: actual.content_id });
      }
    }
  };

  verifyDetails('project_details', groups.project_details, state.project_details);
  verifyDetails('service_details', groups.service_details, state.service_details);

  for (const collection of EXPECTED.unsupportedPopulatedCollections) {
    if ((state[collection] ?? []).length !== 0) {
      fail('READBACK_STRUCTURED_COLLECTION_NOT_EMPTY', { collection, count: state[collection].length });
    }
  }

  if (!deepEqual(comparableActual(state.site_settings ?? {}, groups.site_settings), groups.site_settings)) {
    fail('READBACK_SITE_SETTINGS_DRIFT', {
      expected: groups.site_settings,
      actual: comparableActual(state.site_settings ?? {}, groups.site_settings),
    });
  }

  failures.push(...validatePreWriteState(plan, state).filter((f) => !['UNMANAGED_REMOTE_CONTENT','UNMANAGED_REMOTE_CATEGORY','UNMANAGED_REMOTE_REDIRECT','UNMANAGED_REMOTE_PROJECT_DETAIL','UNMANAGED_REMOTE_SERVICE_DETAIL'].includes(f.code)));
  return failures;
}
