import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const readJson = async (relativePath) =>
  JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));

const [contract, plan, routes, fixtures, coreContentV7] = await Promise.all([
  readJson('directus/desired-schema-contract.json'),
  readJson('migration/directus-import-plan.json'),
  readJson('migration/route-contract.json'),
  readJson('apps/web/src/data/content-fixtures.json'),
  readJson('apps/web/src/data/core-content-v7.json'),
]);

const failures = [];
const warnings = [];
const fail = (code, detail) => failures.push({ code, detail });
const warn = (code, detail) => warnings.push({ code, detail });

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

const unsafeHtmlPatterns = [
  /<script\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /<iframe\b/i,
  /data\s*:\s*text\/html/i,
];

if (contract?.format !== 'aeroventa-directus-desired-schema-contract-v1') {
  fail('CONTRACT_FORMAT_INVALID', contract?.format ?? null);
}
if (plan?.format !== 'aeroventa-directus-import-plan-v1') {
  fail('PLAN_FORMAT_INVALID', plan?.format ?? null);
}
if (plan?.safety !== 'DRAFT_ONLY_NO_PUBLISH') {
  fail('PLAN_SAFETY_INVALID', plan?.safety ?? null);
}
if (plan?.generated_at !== null) {
  fail('PLAN_NOT_DETERMINISTIC', 'generated_at must be null in generated V8 plan');
}
if (!/^[a-f0-9]{64}$/.test(plan?.source_fingerprint_sha256 ?? '')) {
  fail('PLAN_SOURCE_FINGERPRINT_INVALID', plan?.source_fingerprint_sha256 ?? null);
}

const requiredCollections = [
  'content',
  'content_blocks',
  'content_block_map',
  'content_categories',
  'content_category_map',
  'project_details',
  'service_details',
  'redirects',
  'site_settings',
];
const contractCollections = new Set((contract?.collections ?? []).map((item) => item.name));
for (const name of requiredCollections) {
  if (!contractCollections.has(name)) fail('CONTRACT_COLLECTION_MISSING', name);
}

const content = plan?.collections?.content ?? [];
const redirects = plan?.collections?.redirects ?? [];
const services = plan?.collections?.service_details ?? [];
const siteSettings = plan?.collections?.site_settings ?? null;

if (content.length !== fixtures.length) {
  fail('CONTENT_COUNT_MISMATCH', { expected: fixtures.length, actual: content.length });
}

for (const duplicate of duplicateValues(content.map((item) => item.path))) {
  fail('DUPLICATE_CONTENT_PATH', duplicate);
}
for (const duplicate of duplicateValues(redirects.map((item) => item.source_path))) {
  fail('DUPLICATE_REDIRECT_SOURCE', duplicate);
}

for (const item of content) {
  if (item.status !== 'draft') fail('NON_DRAFT_CONTENT', item.path);
  if (item.owner_approved_at !== null) fail('OWNER_APPROVAL_PRESET', item.path);
  if (item.robots_index !== false) fail('ROBOTS_INDEX_ENABLED', item.path);
  if (item.sitemap_include !== false) fail('SITEMAP_ENABLED', item.path);
  if (item.knowledge_allowed !== false) fail('KNOWLEDGE_ALLOWED_PRESET', item.path);
  if (!['pending_review', 'not_applicable'].includes(item.body_html_safety_status)) {
    fail('BODY_HTML_SAFETY_STATUS_INVALID', { path: item.path, value: item.body_html_safety_status });
  }
  if (typeof item.body_html === 'string') {
    for (const pattern of unsafeHtmlPatterns) {
      if (pattern.test(item.body_html)) {
        fail('UNSAFE_BODY_HTML', { path: item.path, pattern: String(pattern) });
      }
    }
  }
}

const contentByPath = new Map(content.map((item) => [item.path, item]));
for (const [overridePath, override] of Object.entries(coreContentV7)) {
  const item = contentByPath.get(overridePath);
  if (!item) {
    fail('V7_OVERRIDE_MISSING_FROM_PLAN', overridePath);
    continue;
  }
  for (const field of ['title', 'h1', 'seo_title', 'seo_description', 'excerpt', 'body_html', 'lead_intent']) {
    if (Object.hasOwn(override, field) && item[field] !== override[field]) {
      fail('V7_OVERRIDE_DRIFT', { path: overridePath, field });
    }
  }
  if (item?.migration_evidence?.core_content_v7_override !== true) {
    fail('V7_OVERRIDE_EVIDENCE_MISSING', overridePath);
  }
}

const routeRedirectRows = routes.filter((row) => [301, 410].includes(Number(row.http_outcome)));
if (redirects.length !== routeRedirectRows.length) {
  fail('REDIRECT_COUNT_MISMATCH', { expected: routeRedirectRows.length, actual: redirects.length });
}

const retainedPaths = new Set(
  routes.filter((row) => Number(row.http_outcome) === 200).map((row) => row.path),
);
const contentPaths = new Set(content.map((item) => item.path));
for (const redirect of redirects) {
  if (contentPaths.has(redirect.source_path)) {
    fail('REDIRECT_CONTENT_COLLISION', redirect.source_path);
  }
  if (redirect.status_code === 301 && !retainedPaths.has(redirect.target_path)) {
    fail('REDIRECT_TARGET_NOT_RETAINED_200', {
      source: redirect.source_path,
      target: redirect.target_path,
    });
  }
  if (redirect.status_code === 410 && redirect.target_path !== null) {
    fail('GONE_ROUTE_HAS_TARGET', redirect.source_path);
  }
}

const montage = services.find((item) => item.path_ref === '/montazh-ventiliacii/');
if (!montage || montage.direct_execution !== true || montage.fulfillment_model !== 'mixed') {
  fail('MONTAGE_SERVICE_CONTRACT_INVALID', montage ?? null);
}
const drilling = services.find((item) => item.path_ref === '/almaznoe-burenie/');
if (!drilling || drilling.direct_execution !== false || drilling.fulfillment_model !== 'partner') {
  fail('DRILLING_PARTNER_CONTRACT_INVALID', drilling ?? null);
}
if (siteSettings?.primary_business !== 'Монтаж вентиляции') {
  fail('PRIMARY_BUSINESS_INVALID', siteSettings?.primary_business ?? null);
}
if (siteSettings?.ai_consultant_enabled !== false || siteSettings?.emergency_disable_ai !== true) {
  fail('AI_DEFAULT_SAFETY_INVALID', siteSettings ?? null);
}

try {
  await fs.access(path.join(root, 'migration/private/directus/schema-current.json'));
} catch {
  warn(
    'REMOTE_DIRECTUS_SNAPSHOT_PENDING',
    'Expected in CI/local preflight. Capture the shared Directus schema read-only before any schema mutation decision.',
  );
}

const report = {
  format: 'aeroventa-directus-readiness-v8',
  verdict: failures.length === 0 ? 'PASS_REMOTE_SNAPSHOT_PENDING' : 'FAIL',
  counts: {
    desired_collections: contract?.collections?.length ?? 0,
    content_rows: content.length,
    redirect_rows: redirects.length,
    project_detail_rows: plan?.collections?.project_details?.length ?? 0,
    service_detail_rows: services.length,
    core_content_v7_overrides: Object.keys(coreContentV7).length,
  },
  source_fingerprint_sha256: plan?.source_fingerprint_sha256 ?? null,
  failures,
  warnings,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
