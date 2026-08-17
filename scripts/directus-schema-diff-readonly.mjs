import fs from 'node:fs/promises';

const base = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_ADMIN_TOKEN;
const snapshotPath = process.argv[2];
if (!base) throw new Error('DIRECTUS_URL is required');
if (!token) throw new Error('DIRECTUS_ADMIN_TOKEN is required');
if (!snapshotPath) throw new Error('Usage: node scripts/directus-schema-diff-readonly.mjs <directus-native-snapshot.json>');

const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
const url = new URL('/schema/diff', base);
const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(snapshot),
});
if (!response.ok) throw new Error(`Directus schema diff failed: HTTP ${response.status}`);
const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
