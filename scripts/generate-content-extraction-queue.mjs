import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));

const rolePriority = {
  PRIMARY_COMMERCIAL: 0,
  PRIMARY_BRAND_HOME: 1,
  CORE_SERVICE_HUB: 2,
  CORE_VENTILATION_CASE: 3,
  CORE_VENTILATION_CASE_HUB: 4,
  CORE_TRUST_CASE_HUB: 5,
  VENTILATION_AUTHORITY: 6,
  CORE_TRUST: 7,
  VENTILATION_CONTENT_HUB: 8,
  CONTENT_HUB: 9,
  LEGACY_ACQUISITION: 10,
};

const queue = routes
  .filter((r) => Number(r.http_outcome) === 200 && !String(r.path).startsWith('/upload/'))
  .map((r) => ({
    priority_band: rolePriority[r.strategic_role] ?? 20,
    path: r.path,
    source_url: new URL(r.path, 'https://aeroventa.ru').toString(),
    strategic_role: r.strategic_role,
    source_title: r.title,
    required_action: r.strategic_role === 'LEGACY_ACQUISITION'
      ? 'extract_preserve_information_then_rewrite_current_operating_claims_truthfully'
      : 'extract_and_migrate_then_improve_for_target_role',
    owner_review_required_before_publish: true,
  }))
  .sort((a, b) => a.priority_band - b.priority_band || a.path.localeCompare(b.path, 'ru'));

// Primary service is an explicit override regardless of alphabetical ordering.
queue.sort((a, b) => {
  if (a.path === '/montazh-ventiliacii/') return -1;
  if (b.path === '/montazh-ventiliacii/') return 1;
  return a.priority_band - b.priority_band || a.path.localeCompare(b.path, 'ru');
});
queue.forEach((item, index) => { item.sequence = index + 1; });
await fs.writeFile(path.join(root, 'migration/content-extraction-queue.json'), JSON.stringify(queue, null, 2));
console.log(`Prepared public-safe extraction queue for ${queue.length} retained HTML routes.`);
