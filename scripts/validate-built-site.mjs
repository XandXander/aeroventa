import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'apps/web/dist');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));
const media = JSON.parse(await fs.readFile(path.join(root, 'migration/preserved-media.json'), 'utf8'));

const failures = [];
const warnings = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const exists = async (p) => fs.access(p).then(() => true).catch(() => false);
const htmlFileFor = (routePath) => routePath === '/'
  ? path.join(dist, 'index.html')
  : path.join(dist, routePath.replace(/^\//, '').replace(/\/$/, ''), 'index.html');

check(await exists(dist), 'Astro dist directory is missing');
check(await exists(path.join(dist, '.htaccess')), 'Built .htaccess is missing');
check(await exists(path.join(dist, '404', 'index.html')), 'Branded 404 page is missing');
check(await exists(path.join(dist, 'sitemap.xml')), 'sitemap.xml is missing');
check(await exists(path.join(dist, 'robots.txt')), 'robots.txt is missing');

const html200 = routes.filter((r) => Number(r.http_outcome) === 200 && !String(r.path).startsWith('/upload/'));
for (const r of html200) {
  const file = htmlFileFor(r.path);
  check(await exists(file), `Retained HTTP-200 route missing built HTML: ${r.path}`);
  if (await exists(file)) {
    const html = await fs.readFile(file, 'utf8');
    const expectedCanonical = new URL(r.path, 'https://aeroventa.ru').toString();
    check(html.includes(`rel="canonical" href="${expectedCanonical}"`) || html.includes(`href="${expectedCanonical}" rel="canonical"`), `Canonical missing/wrong for ${r.path}`);
    check(/<h1(?:\s|>)/i.test(html), `H1 missing for ${r.path}`);
    if (process.env.AEROVENTA_RELEASE_MODE === 'production') {
      check(!html.includes('Implementation fixture'), `Fixture marker present in production build: ${r.path}`);
      check(!/<meta\s+name="robots"\s+content="noindex/i.test(html), `Production retained route is noindex: ${r.path}`);
    }
  }
}

for (const r of routes.filter((x) => [301, 410].includes(Number(x.http_outcome)))) {
  const file = htmlFileFor(r.path);
  check(!(await exists(file)), `Redirect/410 path unexpectedly generated as HTML: ${r.path}`);
}

for (const item of media) {
  check(await exists(path.join(dist, item.path.replace(/^\//, ''))), `Preserved legacy media missing in build: ${item.path}`);
}
const pdfPath = '/upload/medialibrary/fa1/fa1b840c9474c6030bf2ccb0c725c3e4.pdf';
check(await exists(path.join(dist, pdfPath.replace(/^\//, ''))), `Indexed REHVA PDF missing in build: ${pdfPath}`);

if (await exists(path.join(dist, 'sitemap.xml'))) {
  const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  for (const r of routes.filter((x) => [301, 404, 410].includes(Number(x.http_outcome)))) {
    const url = new URL(r.path, 'https://aeroventa.ru').toString();
    check(!sitemap.includes(`<loc>${url}</loc>`), `Non-200 route leaked into sitemap: ${r.path}`);
  }
}

if (await exists(path.join(dist, '.htaccess'))) {
  const ht = await fs.readFile(path.join(dist, '.htaccess'), 'utf8');
  check((ht.match(/^RedirectMatch 301 /gm) || []).length === 13, 'Built .htaccess must contain 13 exact 301 rules');
  check((ht.match(/^RedirectMatch gone /gm) || []).length === 54, 'Built .htaccess must contain 54 exact 410 rules');
  check(/RewriteRule \^404\\\.php\$ - \[R=404,L\]/.test(ht), 'Built .htaccess must force legacy /404.php to HTTP 404');
}

const result = {
  generated_at: new Date().toISOString(),
  release_mode: process.env.AEROVENTA_RELEASE_MODE || 'fixture',
  retained_html_routes: html200.length,
  preserved_media: media.length,
  failures,
  warnings,
  verdict: failures.length ? 'FAIL' : 'PASS',
};

await fs.writeFile(path.join(root, 'BUILD_VALIDATION_T2.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
