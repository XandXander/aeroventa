import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));
let privateEvidence = null;
try { privateEvidence = JSON.parse(await fs.readFile(path.join(root, 'migration/private/canonical-routes.evidence.json'), 'utf8')); } catch {}
const media = JSON.parse(await fs.readFile(path.join(root, 'migration/preserved-media.json'), 'utf8'));
const fixtures = JSON.parse(await fs.readFile(path.join(root, 'apps/web/src/data/content-fixtures.json'), 'utf8'));
const schema = JSON.parse(await fs.readFile(path.join(root, 'directus/desired-schema-contract.json'), 'utf8'));
const importPlan = JSON.parse(await fs.readFile(path.join(root, 'migration/directus-import-plan.json'), 'utf8'));
const extractionQueue = JSON.parse(await fs.readFile(path.join(root, 'migration/content-extraction-queue.json'), 'utf8'));
const rules = await fs.readFile(path.join(root, 'migration/hosting-rules.generated.conf'), 'utf8');

const failures = [];
const warnings = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(routes.length === 98, `Expected 98 canonical routes, got ${routes.length}`);
check(new Set(routes.map((r) => r.path)).size === 98, 'Canonical route paths are not unique');

const counts = Object.fromEntries([200, 301, 410, 404].map((code) => [code, routes.filter((r) => Number(r.http_outcome) === code).length]));
check(counts[200] === 30, `Expected 30 HTTP 200 outcomes, got ${counts[200]}`);
check(counts[301] === 13, `Expected 13 HTTP 301 outcomes, got ${counts[301]}`);
check(counts[410] === 54, `Expected 54 HTTP 410 outcomes, got ${counts[410]}`);
check(counts[404] === 1, `Expected 1 HTTP 404 outcome, got ${counts[404]}`);

const keep = new Set(routes.filter((r) => Number(r.http_outcome) === 200).map((r) => r.path));
for (const r of routes.filter((r) => Number(r.http_outcome) === 301)) {
  check(keep.has(r.target), `301 target is not retained 200: ${r.path} -> ${r.target}`);
}
if (privateEvidence) {
  for (const r of privateEvidence.filter((r) => Number(r.http_outcome) === 410)) {
    check(Number(r.current_backlinks || 0) === 0, `410 route has current backlinks: ${r.path}`);
    check(!r.yandex_indexed, `410 route is Yandex indexed: ${r.path}`);
    check(Number(r.yandex_impressions_6m || 0) === 0, `410 route has current Yandex impressions: ${r.path}`);
    check(Number(r.gsc_impressions_16m || 0) === 0, `410 route has GSC impressions: ${r.path}`);
  }
} else {
  warnings.push('PRIVATE_EVIDENCE_NOT_PRESENT: structural checks only; T2 evidence audit remains external source-of-truth');
}

check(media.length === 8, `Expected 8 preserved media paths, got ${media.length}`);
check(new Set(media.map((m) => m.path)).size === 8, 'Preserved media paths are not unique');
const criticalImage = '/upload/medialibrary/1e0/1e03a5c54309ab78f133df9068a70b33.jpg';
const critical = media.find((m) => m.path === criticalImage);
check(Boolean(critical), 'Critical COVID article image missing from media manifest');
check(critical?.known_related_page === '/covid-pritochnaya-ventilacia/', 'Critical image related-page contract is wrong');

check(fixtures.length === 29, `Expected 29 HTML fixture pages, got ${fixtures.length}`);
check(fixtures.every((x) => x.status === 'fixture_stub' && x.robots_index === false && x.body_html_safety_status === 'fixture'), 'Fixture content must remain fixture_stub + noindex + fixture safety status');
check(fixtures.some((x) => x.path === '/montazh-ventiliacii/' && x.business_role === 'PRIMARY_COMMERCIAL'), 'Primary ventilation route contract missing');
check(fixtures.some((x) => x.path === '/almaznoe-burenie/' && x.business_role === 'LEGACY_ACQUISITION' && x.lead_intent === 'DRILLING_PARTNER'), 'Legacy drilling role/lead contract missing');

const requiredCollections = ['content','content_blocks','content_block_map','content_categories','content_category_map','project_details','service_details','redirects','site_settings'];
const collectionNames = new Set(schema.collections.map((c) => c.name));
for (const c of requiredCollections) check(collectionNames.has(c), `Directus desired schema missing collection ${c}`);
check(importPlan.safety === 'DRAFT_ONLY_NO_PUBLISH', 'Directus import plan must be draft-only');
check(importPlan.collections.content.length === 29, 'Directus content import plan must contain 29 retained HTML routes');
check(importPlan.collections.redirects.length === 67, 'Directus redirect plan must contain 13 redirects + 54 gone routes');
check(importPlan.collections.content.every((x) => x.status === 'draft' && x.robots_index === false && x.owner_approved_at === null && x.body_html_safety_status === 'not_applicable'), 'Directus planned content must remain draft + noindex + unapproved + HTML-safe bridge state');
const drillingService = importPlan.collections.service_details.find((x) => x.path_ref === '/almaznoe-burenie/');
check(drillingService?.direct_execution === false && drillingService?.fulfillment_model === 'partner', 'Diamond drilling service contract must be partner fulfillment, not direct execution');
check(extractionQueue.length === 29, 'Content extraction queue must contain 29 retained HTML routes');
check(extractionQueue[0]?.path === '/montazh-ventiliacii/', 'Primary commercial ventilation page must be first in extraction queue');

check((rules.match(/^RedirectMatch 301 /gm) || []).length === 13, 'Generated .htaccess redirect count mismatch');
check((rules.match(/^RedirectMatch gone /gm) || []).length === 54, 'Generated .htaccess 410 count mismatch');

async function validateSourceAsset(relativePath, kind) {
  const local = path.join(root, 'apps/web/public', relativePath.replace(/^\//, ''));
  let body;
  try { body = await fs.readFile(local); } catch {
    warnings.push(`${kind === 'pdf' ? 'PENDING_INDEXED_PDF_BYTES' : 'PENDING_MEDIA_BYTES'} ${relativePath}`);
    return;
  }

  check(body.length >= 32, `Preserved ${kind} source is implausibly small: ${relativePath}`);
  const hex = body.subarray(0, 12).toString('hex');
  if (kind === 'image') {
    const jpg = hex.startsWith('ffd8ff');
    const png = hex.startsWith('89504e470d0a1a0a');
    const webp = body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
    check(jpg || png || webp, `Preserved image source has invalid signature: ${relativePath}`);
  }
  if (kind === 'pdf') {
    check(body.subarray(0, 5).toString('ascii') === '%PDF-', `Preserved PDF source has invalid signature: ${relativePath}`);
  }
}

for (const item of media) await validateSourceAsset(item.path, 'image');
const pdfPath = '/upload/medialibrary/fa1/fa1b840c9474c6030bf2ccb0c725c3e4.pdf';
await validateSourceAsset(pdfPath, 'pdf');

// lightweight secret scan over implementation text/json/config files
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (['node_modules','dist','.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(md|json|mjs|ts|astro|txt|example)$/.test(e.name) || e.name === '.htaccess' || e.name === '.gitignore' || e.name === '.nvmrc') out.push(p);
  }
  return out;
}
for (const file of await walk(root)) {
  if (file.endsWith('validate-implementation.mjs')) continue;
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  if (/X-N8N-API-KEY:\s*(?!<REDACTED>)[A-Za-z0-9_-]{20,}/i.test(text)) failures.push(`Possible n8n secret in ${file}`);
  if (/DIRECTUS_STATIC_TOKEN=(?!<REDACTED>|$)[A-Za-z0-9._-]{20,}/i.test(text)) failures.push(`Possible Directus token in ${file}`);
}

const status = {
  generated_at: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS_WITH_PENDING_SOURCE_BYTES',
  counts,
  canonical_routes: routes.length,
  html_fixture_pages: fixtures.length,
  preserved_media_paths: media.length,
  failures,
  warnings,
};
await fs.writeFile(path.join(root, 'IMPLEMENTATION_STATUS_T2.json'), JSON.stringify(status, null, 2));
console.log(JSON.stringify(status, null, 2));
if (failures.length) process.exitCode = 1;
