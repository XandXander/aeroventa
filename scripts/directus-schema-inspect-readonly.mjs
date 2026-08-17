import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const snapshotPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(root, 'migration/private/directus/schema-current.json');
const contractPath = path.join(root, 'directus/desired-schema-contract.json');

const [snapshotRaw, contract] = await Promise.all([
  fs.readFile(snapshotPath, 'utf8').then(JSON.parse),
  fs.readFile(contractPath, 'utf8').then(JSON.parse),
]);
const snapshot = snapshotRaw?.data ?? snapshotRaw;

if (!Array.isArray(snapshot?.collections) || !Array.isArray(snapshot?.fields) || !Array.isArray(snapshot?.relations)) {
  throw new Error('Directus native schema snapshot must contain collections, fields and relations arrays');
}

const collectionName = (entry) => entry?.collection ?? entry?.schema?.name ?? null;
const fieldKey = (entry) => `${entry?.collection ?? ''}.${entry?.field ?? ''}`;
const snapshotCollections = new Map(
  snapshot.collections.map((entry) => [collectionName(entry), entry]).filter(([name]) => Boolean(name)),
);
const snapshotFields = new Map(snapshot.fields.map((entry) => [fieldKey(entry), entry]));

const missingCollections = [];
const missingFields = [];
const typeMismatches = [];
const extraFields = [];

for (const collection of contract.collections ?? []) {
  if (!snapshotCollections.has(collection.name)) missingCollections.push(collection.name);
  const expectedFields = new Set();
  for (const [field, expectedType] of collection.fields ?? []) {
    expectedFields.add(field);
    const key = `${collection.name}.${field}`;
    const actual = snapshotFields.get(key);
    if (!actual) {
      missingFields.push(key);
      continue;
    }
    if (actual.type !== expectedType) {
      typeMismatches.push({ key, expected: expectedType, actual: actual.type ?? null });
    }
  }
  for (const actual of snapshot.fields.filter((entry) => entry.collection === collection.name)) {
    if (!expectedFields.has(actual.field)) extraFields.push(`${collection.name}.${actual.field}`);
  }
}

const report = {
  format: 'aeroventa-directus-schema-inspection-v8',
  source_snapshot: snapshotPath,
  snapshot_version: snapshot?.version ?? null,
  snapshot_database: snapshot?.vendor ?? snapshot?.database ?? null,
  verdict:
    missingCollections.length === 0 && missingFields.length === 0 && typeMismatches.length === 0
      ? 'CONTRACT_PRESENT'
      : 'DELTA_REQUIRED',
  missing_collections: missingCollections,
  missing_fields: missingFields,
  type_mismatches: typeMismatches,
  extra_fields_in_target_collections: extraFields,
  notes: [
    'Read-only inspection only. This script does not call Directus and does not mutate schema.',
    'Extra fields are reported for review but do not by themselves fail the application-level contract.',
    'Use a Directus-native target snapshot and /schema/diff or schema apply --dry-run before any separately approved apply.',
  ],
};

const outDir = path.join(root, 'migration/private/directus');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'schema-contract-inspection-v8.json');
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
