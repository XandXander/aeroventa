import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const origin = process.env.LEGACY_ORIGIN || 'https://aeroventa.ru';
const out = path.join(root, 'migration/legacy-crawl');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));
const media = JSON.parse(await fs.readFile(path.join(root, 'migration/preserved-media.json'), 'utf8'));
await fs.mkdir(out, { recursive: true });

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const safeName = (value) => value === '/' ? '__home__' : value.replace(/^\//, '').replace(/\/$/, '').replaceAll('/', '__');

const fetchResponse = async (url) => fetch(url, {
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
  headers: {
    'User-Agent': 'AEROVENTA-Migration-Reader/1.1',
    'Accept': '*/*',
  },
});

const fetchAssetChecked = async (url, kind) => {
  const res = await fetchResponse(url);
  if (!res.ok) throw new Error(`${kind} fetch failed ${url}: HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (kind === 'image' && !type.startsWith('image/')) throw new Error(`Unexpected image content-type ${type} for ${url}`);
  if (kind === 'pdf' && !type.includes('pdf')) throw new Error(`Unexpected PDF content-type ${type} for ${url}`);
  return res;
};

const manifest = {
  origin,
  fetched_at: new Date().toISOString(),
  pages: [],
  assets: [],
  page_source_404: [],
};

for (const r of routes.filter((x) => Number(x.http_outcome) === 200 && !String(x.path).startsWith('/upload/'))) {
  const url = new URL(r.path, origin);
  const res = await fetchResponse(url);
  const type = res.headers.get('content-type') || '';

  if ([404, 410].includes(res.status)) {
    const record = {
      path: r.path,
      status: res.status,
      final_url: res.url,
      content_type: type,
      source_state: res.status === 404 ? 'SOURCE_404' : 'SOURCE_410',
    };
    manifest.pages.push(record);
    manifest.page_source_404.push(record);
    console.warn(`${record.source_state} ${r.path} (${res.status})`);
    continue;
  }

  if (!res.ok) throw new Error(`page fetch failed ${url}: HTTP ${res.status}`);
  if (!type.includes('text/html')) throw new Error(`Unexpected page content-type ${type} for ${url}`);

  const body = Buffer.from(await res.arrayBuffer());
  const filename = `${safeName(r.path)}.html`;
  await fs.writeFile(path.join(out, filename), body);
  manifest.pages.push({
    path: r.path,
    status: res.status,
    final_url: res.url,
    content_type: type,
    bytes: body.length,
    sha256: sha256(body),
    file: filename,
    source_state: 'FETCHED_HTML',
  });
}

const assetMap = new Map(media.map((item) => [item.path, { ...item, kind: 'image' }]));
for (const r of routes.filter((x) => Number(x.http_outcome) === 200 && String(x.path).startsWith('/upload/'))) {
  if (!assetMap.has(r.path)) {
    assetMap.set(r.path, {
      path: r.path,
      kind: r.path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'asset',
    });
  }
}

for (const item of assetMap.values()) {
  const url = new URL(item.path, origin);
  const kind = item.kind === 'asset' ? 'image' : item.kind;
  const res = await fetchAssetChecked(url, kind);
  const body = Buffer.from(await res.arrayBuffer());
  const target = path.join(root, 'apps/web/public', item.path.replace(/^\//, ''));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  manifest.assets.push({
    path: item.path,
    kind,
    status: res.status,
    final_url: res.url,
    content_type: res.headers.get('content-type'),
    bytes: body.length,
    sha256: sha256(body),
  });
}

await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `Fetched ${manifest.pages.filter((x) => x.source_state === 'FETCHED_HTML').length} HTML pages, `
  + `${manifest.page_source_404.length} legacy-missing pages, and ${manifest.assets.length} preserved assets.`
);
