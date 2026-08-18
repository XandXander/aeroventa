import {
  EXPECTED,
  compareRemoteSchema,
  desiredDetail,
  fetchAll,
  fetchRemoteState,
  fetchSchemaSnapshot,
  operationSummary,
  readJson,
  requireDirectusEnv,
  rootFromMeta,
  updateSingleton,
  upsertByNaturalKey,
  upsertDetailByContentId,
  validatePlan,
  validatePreWriteState,
  validateTargetSchema,
  verifyExactReadback,
  writePrivateJson,
} from './directus-v12-lib.mjs';

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--dry-run') ? 'dry-run' : null;
if (!mode) throw new Error('Use exactly one mode: --dry-run or --apply');
if (process.argv.includes('--apply') && process.argv.includes('--dry-run')) throw new Error('Choose only one mode');

const root = rootFromMeta(import.meta.url);
const [plan, target] = await Promise.all([
  readJson(root, 'migration/directus-import-plan.json'),
  readJson(root, 'directus/target-schema-v11.json'),
]);
const staticFailures = [...validatePlan(plan), ...validateTargetSchema(target)];
if (staticFailures.length) throw new Error(`V12 static gate failed: ${JSON.stringify(staticFailures)}`);

const env = requireDirectusEnv();
const remoteSchema = await fetchSchemaSnapshot(env);
const schemaFailures = compareRemoteSchema(remoteSchema, target);
if (schemaFailures.length) {
  await writePrivateJson(root, 'v12-preimport-schema-fail.json', { mode, failures: schemaFailures });
  throw new Error(`Fresh Directus schema readback failed: ${JSON.stringify(schemaFailures)}`);
}

const initialState = await fetchRemoteState(env);
const dataFailures = validatePreWriteState(plan, initialState);
if (dataFailures.length) {
  await writePrivateJson(root, 'v12-preimport-data-fail.json', { mode, failures: dataFailures });
  throw new Error(`Fresh Directus data readback failed: ${JSON.stringify(dataFailures)}`);
}

const summary = operationSummary(plan, initialState);
const preflightReport = {
  format: 'aeroventa-directus-v12-preimport-v1',
  verdict: mode === 'dry-run' ? 'DRY_RUN_PASS_NO_WRITE' : 'PREWRITE_PASS',
  mode,
  source_fingerprint_sha256: plan.source_fingerprint_sha256,
  expected_v11_apply_hash: EXPECTED.v11ApplyHash,
  schema_counts: {
    collections: remoteSchema.collections?.length ?? 0,
    fields: remoteSchema.fields?.length ?? 0,
    relations: remoteSchema.relations?.length ?? 0,
    systemFields: remoteSchema.systemFields?.length ?? 0,
  },
  current_counts: Object.fromEntries(
    Object.entries(initialState).map(([key, value]) => [key, Array.isArray(value) ? value.length : value ? 1 : 0]),
  ),
  operations: summary,
  safety: {
    draft_only: true,
    robots_index: false,
    sitemap_include: false,
    owner_approved_at: null,
    knowledge_allowed: false,
    unsupported_structured_collections_written: false,
  },
};
await writePrivateJson(root, 'v12-preimport-report.json', preflightReport);
console.log(JSON.stringify(preflightReport, null, 2));

if (mode === 'dry-run') process.exit(0);

if (process.env.AEROVENTA_DIRECTUS_WRITE_APPROVED !== EXPECTED.writeApprovalSentinel) {
  throw new Error(
    `WRITE BLOCKED: set AEROVENTA_DIRECTUS_WRITE_APPROVED=${EXPECTED.writeApprovalSentinel} only after fresh explicit Owner approval`,
  );
}

const journal = {
  format: 'aeroventa-directus-v12-write-journal-v1',
  source_fingerprint_sha256: plan.source_fingerprint_sha256,
  started_at: new Date().toISOString(),
  status: 'IN_PROGRESS',
  operations: [],
};
const persistJournal = async () => writePrivateJson(root, 'v12-write-journal.json', journal);
await persistJournal();

const record = async (phase, key, result) => {
  journal.operations.push({
    sequence: journal.operations.length + 1,
    phase,
    key,
    action: result.action,
    id: result.id,
    before: result.before,
    after: result.after,
    recorded_at: new Date().toISOString(),
  });
  await persistJournal();
};

try {
  let categories = initialState.content_categories;
  for (const desired of plan.collections.content_categories) {
    const result = await upsertByNaturalKey(env, 'content_categories', 'path', desired, categories);
    await record('content_categories', desired.path, result);
    if (result.action !== 'noop') categories = await fetchAll(env, 'content_categories');
  }

  let content = initialState.content;
  for (const desired of plan.collections.content) {
    const result = await upsertByNaturalKey(env, 'content', 'path', desired, content);
    await record('content', desired.path, result);
    if (result.action !== 'noop') content = await fetchAll(env, 'content');
  }

  content = await fetchAll(env, 'content');
  const contentByPath = new Map(content.map((row) => [row.path, row]));
  if (contentByPath.size !== plan.collections.content.length) {
    throw new Error(`Content readback count before detail binding is ${contentByPath.size}, expected ${plan.collections.content.length}`);
  }

  let projects = initialState.project_details;
  for (const row of plan.collections.project_details) {
    const contentRow = contentByPath.get(row.path_ref);
    if (!contentRow?.id) throw new Error(`Cannot resolve project path_ref to content.id: ${row.path_ref}`);
    const desired = desiredDetail(row, contentRow.id);
    const result = await upsertDetailByContentId(env, 'project_details', desired, projects);
    await record('project_details', row.path_ref, result);
    if (result.action !== 'noop') projects = await fetchAll(env, 'project_details');
  }

  let services = initialState.service_details;
  for (const row of plan.collections.service_details) {
    const contentRow = contentByPath.get(row.path_ref);
    if (!contentRow?.id) throw new Error(`Cannot resolve service path_ref to content.id: ${row.path_ref}`);
    const desired = desiredDetail(row, contentRow.id);
    const result = await upsertDetailByContentId(env, 'service_details', desired, services);
    await record('service_details', row.path_ref, result);
    if (result.action !== 'noop') services = await fetchAll(env, 'service_details');
  }

  let redirects = initialState.redirects;
  for (const desired of plan.collections.redirects) {
    const result = await upsertByNaturalKey(env, 'redirects', 'source_path', desired, redirects);
    await record('redirects', desired.source_path, result);
    if (result.action !== 'noop') redirects = await fetchAll(env, 'redirects');
  }

  const settingsResult = await updateSingleton(env, 'site_settings', plan.collections.site_settings, initialState.site_settings);
  await record('site_settings', 'singleton', settingsResult);

  const finalState = await fetchRemoteState(env);
  const readbackFailures = verifyExactReadback(plan, finalState);
  if (readbackFailures.length) {
    throw new Error(`Post-import exact readback failed: ${JSON.stringify(readbackFailures)}`);
  }

  journal.status = 'APPLY_PASS';
  journal.completed_at = new Date().toISOString();
  await persistJournal();
  const passReport = {
    format: 'aeroventa-directus-v12-apply-result-v1',
    verdict: 'APPLY_V12_DRAFT_DATA_PASS',
    operation_count: journal.operations.length,
    action_counts: journal.operations.reduce((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {}),
    exact_counts: {
      content: finalState.content.length,
      content_categories: finalState.content_categories.length,
      redirects: finalState.redirects.length,
      project_details: finalState.project_details.length,
      service_details: finalState.service_details.length,
      content_blocks: finalState.content_blocks.length,
      content_block_map: finalState.content_block_map.length,
      content_category_map: finalState.content_category_map.length,
      site_settings: finalState.site_settings ? 1 : 0,
    },
  };
  await writePrivateJson(root, 'v12-apply-result.json', passReport);
  console.log(JSON.stringify(passReport, null, 2));
} catch (error) {
  journal.status = 'PARTIAL_FAILURE_REQUIRES_FRESH_READBACK';
  journal.failed_at = new Date().toISOString();
  journal.error = { message: error.message, status: error.status ?? null, payload: error.payload ?? null };
  await persistJournal();
  await writePrivateJson(root, 'v12-partial-failure.json', {
    verdict: 'PARTIAL_FAILURE_NO_BLIND_RETRY',
    completed_operations: journal.operations.length,
    next_action: 'Run V12 dry-run again. The importer reconciles by unique natural keys and will classify existing rows before any further write.',
    error: journal.error,
  });
  throw error;
}
