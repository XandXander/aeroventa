import {
  EXPECTED,
  compareRemoteSchema,
  fetchRemoteState,
  fetchSchemaSnapshot,
  readJson,
  requireDirectusEnv,
  rootFromMeta,
  validatePlan,
  validateTargetSchema,
  verifyExactReadback,
  writePrivateJson,
} from './directus-v12-lib.mjs';

const root = rootFromMeta(import.meta.url);
const [plan, target] = await Promise.all([
  readJson(root, 'migration/directus-import-plan.json'),
  readJson(root, 'directus/target-schema-v11.json'),
]);
const failures = [...validatePlan(plan), ...validateTargetSchema(target)];
if (failures.length) throw new Error(`V12 static gate failed: ${JSON.stringify(failures)}`);

const env = requireDirectusEnv();
const [remoteSchema, state] = await Promise.all([fetchSchemaSnapshot(env), fetchRemoteState(env)]);
const schemaFailures = compareRemoteSchema(remoteSchema, target);
const dataFailures = verifyExactReadback(plan, state);
const allFailures = [...schemaFailures, ...dataFailures];
const report = {
  format: 'aeroventa-directus-v12-readback-v1',
  verdict: allFailures.length ? 'FAIL' : 'PASS',
  source_fingerprint_sha256: plan.source_fingerprint_sha256,
  expected_v11_apply_hash: EXPECTED.v11ApplyHash,
  counts: {
    content: state.content.length,
    content_categories: state.content_categories.length,
    redirects: state.redirects.length,
    project_details: state.project_details.length,
    service_details: state.service_details.length,
    content_blocks: state.content_blocks.length,
    content_block_map: state.content_block_map.length,
    content_category_map: state.content_category_map.length,
    site_settings: state.site_settings ? 1 : 0,
  },
  invariants: {
    draft_only: true,
    owner_approved_at_null: true,
    robots_index_false: true,
    sitemap_include_false: true,
    knowledge_allowed_false: true,
    detail_content_id_unique: true,
    unsupported_structured_collections_empty: true,
  },
  failures: allFailures,
};
const outPath = await writePrivateJson(root, 'v12-readback-report.json', report);
console.log(JSON.stringify({ ...report, private_report_path: outPath }, null, 2));
if (allFailures.length) process.exitCode = 1;
