import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_ADMIN_TOKEN;
if (!base) throw new Error('DIRECTUS_URL is required');
if (!token) throw new Error('DIRECTUS_ADMIN_TOKEN is required');

const url = new URL('/schema/snapshot', base);
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
if (!response.ok) throw new Error(`Directus schema snapshot failed: HTTP ${response.status}`);
const payload = await response.json();
if (!payload?.data) throw new Error('Directus schema snapshot payload.data missing');

const outDir = path.join(root, 'migration/private/directus');
await fs.mkdir(outDir, { recursive: true });
const out = path.join(outDir, 'schema-current.json');
await fs.writeFile(out, JSON.stringify(payload.data, null, 2));
console.log(`Read-only Directus schema snapshot saved to ${out}`);
