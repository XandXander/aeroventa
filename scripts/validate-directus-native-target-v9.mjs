import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here,'..');
const target = JSON.parse(await fs.readFile(path.join(root,'directus/target-schema-v9.json'),'utf8'));
const expectedCollections = ['content','content_blocks','content_block_map','content_categories','content_category_map','project_details','service_details','redirects','site_settings'];
const failures=[];
const fail=(code,detail)=>failures.push({code,detail});
if (target.version !== 1 || target.directus !== '12.1.1' || target.vendor !== 'postgres') fail('TARGET_IDENTITY_INVALID',{version:target.version,directus:target.directus,vendor:target.vendor});
const names=target.collections.map(x=>x.collection);
if (JSON.stringify(names)!==JSON.stringify(expectedCollections)) fail('COLLECTION_SET_INVALID',names);
if (new Set(names).size!==names.length) fail('DUPLICATE_COLLECTION',names);
const fieldKeys=target.fields.map(x=>`${x.collection}.${x.field}`);
if (new Set(fieldKeys).size!==fieldKeys.length) fail('DUPLICATE_FIELD',fieldKeys);
for (const c of expectedCollections) if (!fieldKeys.some(k=>k.startsWith(`${c}.`))) fail('COLLECTION_WITHOUT_FIELDS',c);
for (const f of target.fields) {
  if (f.type==='alias') { if (f.schema!==null) fail('ALIAS_SCHEMA_NOT_NULL',`${f.collection}.${f.field}`); continue; }
  if (!f.schema || f.schema.table!==f.collection || f.schema.name!==f.field) fail('FIELD_SCHEMA_IDENTITY_INVALID',`${f.collection}.${f.field}`);
  if (f.schema.is_primary_key && f.schema.is_nullable) fail('PRIMARY_KEY_NULLABLE',`${f.collection}.${f.field}`);
}
for (const r of target.relations) {
  const key=`${r.collection}.${r.field}`;
  if (!fieldKeys.includes(key)) fail('RELATION_FIELD_MISSING',key);
  if (r.schema.table!==r.collection || r.schema.column!==r.field || r.schema.foreign_key_table!==r.related_collection) fail('RELATION_SCHEMA_INVALID',key);
}
const destructiveNames = ['articles'];
for (const name of destructiveNames) if (names.includes(name)) fail('NON_TARGET_COLLECTION_PRESENT',name);
const report={format:'aeroventa-directus-native-target-v9-validation',verdict:failures.length?'FAIL':'PASS',counts:{collections:target.collections.length,fields:target.fields.length,relations:target.relations.length},failures};
console.log(JSON.stringify(report,null,2));
if (failures.length) process.exitCode=1;
