import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here,'..');
const target = JSON.parse(await fs.readFile(path.join(root,'directus/target-schema-v11.json'),'utf8'));

const expectedCollections = [
  'content','content_blocks','content_block_map','content_categories',
  'content_category_map','project_details','service_details','redirects','site_settings'
];

const expectedSystemFields = [
  {"collection":"directus_activity","field":"timestamp","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_clients","field":"date_created","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_codes","field":"expires_at","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_codes","field":"used_at","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_consents","field":"client","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_tokens","field":"code_hash","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_tokens","field":"expires_at","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_tokens","field":"previous_session","schema":{"is_indexed":true}},
  {"collection":"directus_oauth_tokens","field":"session","schema":{"is_indexed":true}},
  {"collection":"directus_revisions","field":"activity","schema":{"is_indexed":true}},
  {"collection":"directus_revisions","field":"parent","schema":{"is_indexed":true}},
  {"collection":"directus_sessions","field":"oauth_client","schema":{"is_indexed":true}}
];

const failures = [];
const fail = (code, detail) => failures.push({code, detail});

if (target.version !== 1 || target.directus !== '12.1.1' || target.vendor !== 'postgres') {
  fail('TARGET_IDENTITY_INVALID',{version:target.version,directus:target.directus,vendor:target.vendor});
}

const names = (target.collections ?? []).map(x => x.collection);
if (JSON.stringify(names) !== JSON.stringify(expectedCollections)) fail('COLLECTION_SET_INVALID', names);
if (new Set(names).size !== names.length) fail('DUPLICATE_COLLECTION', names);

const fields = target.fields ?? [];
const fieldKeys = fields.map(x => `${x.collection}.${x.field}`);
if (new Set(fieldKeys).size !== fieldKeys.length) fail('DUPLICATE_FIELD', fieldKeys);

for (const c of expectedCollections) {
  const physical = fields.filter(f => f.collection === c && f.schema !== null);
  const pks = physical.filter(f => f.schema?.is_primary_key === true);
  if (pks.length !== 1) fail('PRIMARY_KEY_COUNT_INVALID',{collection:c, primaryKeys:pks.map(f=>f.field)});
}

for (const f of fields) {
  if (f.type === 'alias') {
    if (f.schema !== null) fail('ALIAS_SCHEMA_NOT_NULL',`${f.collection}.${f.field}`);
    continue;
  }
  if (!f.schema || f.schema.table !== f.collection || f.schema.name !== f.field) {
    fail('FIELD_SCHEMA_IDENTITY_INVALID',`${f.collection}.${f.field}`);
  }
  if (f.schema?.is_primary_key && f.schema?.is_nullable) {
    fail('PRIMARY_KEY_NULLABLE',`${f.collection}.${f.field}`);
  }
  if (f.schema?.is_primary_key && f.schema?.foreign_key_table) {
    fail('RELATIONAL_PRIMARY_KEY_FORBIDDEN',`${f.collection}.${f.field}`);
  }
}

for (const r of target.relations ?? []) {
  const key = `${r.collection}.${r.field}`;
  const field = fields.find(f => f.collection === r.collection && f.field === r.field);
  if (!field) fail('RELATION_FIELD_MISSING',key);
  if (field?.schema?.is_primary_key) fail('RELATION_USES_PRIMARY_KEY',key);
  if (r.schema.table !== r.collection || r.schema.column !== r.field || r.schema.foreign_key_table !== r.related_collection) {
    fail('RELATION_SCHEMA_INVALID',key);
  }
}

function assertO2O(collection) {
  const id = fields.find(f => f.collection === collection && f.field === 'id');
  const contentId = fields.find(f => f.collection === collection && f.field === 'content_id');
  if (!id || id.type !== 'uuid' || id.schema?.is_primary_key !== true || id.schema?.foreign_key_table !== null) {
    fail('DETAIL_ID_PRIMARY_KEY_INVALID',{collection,id});
  }
  if (!contentId || contentId.type !== 'uuid' || contentId.schema?.is_primary_key !== false ||
      contentId.schema?.is_nullable !== false || contentId.schema?.is_unique !== true ||
      contentId.schema?.foreign_key_table !== 'content' || contentId.schema?.foreign_key_column !== 'id') {
    fail('DETAIL_CONTENT_O2O_INVALID',{collection,contentId});
  }
}

assertO2O('project_details');
assertO2O('service_details');

if (JSON.stringify(target.systemFields ?? []) !== JSON.stringify(expectedSystemFields)) {
  fail('SYSTEM_FIELDS_BASELINE_DRIFT',{expected:expectedSystemFields,actual:target.systemFields ?? null});
}
for (const sf of target.systemFields ?? []) {
  if (!String(sf.collection).startsWith('directus_')) fail('NON_SYSTEM_ENTRY_IN_SYSTEM_FIELDS',sf);
  if (sf?.schema?.is_indexed !== true) fail('SYSTEM_INDEX_NOT_PRESERVED',sf);
}

if (names.includes('articles')) fail('NON_TARGET_COLLECTION_PRESENT','articles');

const report = {
  format:'aeroventa-directus-native-target-v11-validation',
  verdict: failures.length ? 'FAIL' : 'PASS',
  counts:{
    collections:target.collections?.length ?? 0,
    fields:target.fields?.length ?? 0,
    systemFields:target.systemFields?.length ?? 0,
    relations:target.relations?.length ?? 0
  },
  detail_model:'UUID id primary key + required unique content_id M2O (Directus O2O)',
  system_fields_policy:'PRESERVE_OBSERVED_PRODUCTION_INDEXES_EXACTLY',
  failures
};

console.log(JSON.stringify(report,null,2));
if (failures.length) process.exitCode = 1;
