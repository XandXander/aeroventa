import { EXPECTED, readJson, rootFromMeta, validatePlan, validateTargetSchema } from './directus-v12-lib.mjs';

const root = rootFromMeta(import.meta.url);
const [plan, target] = await Promise.all([
  readJson(root, 'migration/directus-import-plan.json'),
  readJson(root, 'directus/target-schema-v11.json'),
]);

const failures = [...validatePlan(plan), ...validateTargetSchema(target)];
const report = {
  format: 'aeroventa-directus-v12-static-validation-v1',
  verdict: failures.length ? 'FAIL' : 'PASS',
  source_fingerprint_sha256: plan?.source_fingerprint_sha256 ?? null,
  expected_v11_apply_hash: EXPECTED.v11ApplyHash,
  counts: {
    content: plan?.collections?.content?.length ?? 0,
    content_categories: plan?.collections?.content_categories?.length ?? 0,
    redirects: plan?.collections?.redirects?.length ?? 0,
    project_details: plan?.collections?.project_details?.length ?? 0,
    service_details: plan?.collections?.service_details?.length ?? 0,
    target_collections: target?.collections?.length ?? 0,
    target_fields: target?.fields?.length ?? 0,
    target_relations: target?.relations?.length ?? 0,
    target_system_fields: target?.systemFields?.length ?? 0,
  },
  write_policy: 'NO_WRITE_IN_STATIC_VALIDATION',
  detail_model: 'UUID id primary key + required unique content_id M2O',
  intentionally_unpopulated: EXPECTED.unsupportedPopulatedCollections,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
