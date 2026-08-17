import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));
const origin = 'https://aeroventa.ru';

const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactPathPattern = (value) => value !== '/' && value.endsWith('/')
  ? `${regexEscape(value.slice(0, -1))}/?`
  : regexEscape(value);
const lines = [
  '# AEROVENTA — GENERATED T2 MIGRATION ROUTING',
  '# DO NOT EDIT MANUALLY. Generated from migration/route-contract.json',
  '# Production deployment requires a separate Owner approval.',
  '',
  'Options -Indexes',
  'DirectoryIndex index.html',
  'ErrorDocument 404 /404/',
  '',
  '# Exact 301 redirects',
];

const redirects = routes.filter((r) => Number(r.http_outcome) === 301);
for (const r of redirects) {
  const source = exactPathPattern(r.path);
  const destination = new URL(r.target, origin).toString();
  lines.push(`RedirectMatch 301 ^${source}$ ${destination}`);
}

lines.push('', '# Exact 410 Gone routes');
const gone = routes.filter((r) => Number(r.http_outcome) === 410);
for (const r of gone) {
  lines.push(`RedirectMatch gone ^${exactPathPattern(r.path)}$`);
}

lines.push('', '# Legacy Bitrix 404 endpoint: do not migrate as PHP; force branded 404.');
lines.push('RewriteEngine On');
lines.push('RewriteRule ^404\\.php$ - [R=404,L]');
lines.push('');

const output = lines.join('\n');
await fs.writeFile(path.join(root, 'migration/hosting-rules.generated.conf'), output, 'utf8');
await fs.writeFile(path.join(root, 'apps/web/public/.htaccess'), output, 'utf8');
console.log(`Generated ${redirects.length} redirects and ${gone.length} 410 rules.`);
