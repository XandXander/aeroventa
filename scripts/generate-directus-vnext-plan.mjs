import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [v11,contract]=await Promise.all([
  fs.readFile(path.join(root,'directus/target-schema-v11.json'),'utf8').then(JSON.parse),
  fs.readFile(path.join(root,'directus/desired-schema-vnext-contract.json'),'utf8').then(JSON.parse),
]);

if(contract.format!=='aeroventa-directus-vnext-contract-v1') throw new Error('VNEXT contract format invalid');
if(contract.mode!=='ADDITIVE_ONLY') throw new Error('VNEXT contract must be ADDITIVE_ONLY');

const currentCollections=new Set(v11.collections.map(x=>x.collection));
const currentFields=new Set(v11.fields.map(x=>`${x.collection}.${x.field}`));
const failures=[];

for(const item of contract.content_additions){
  if(currentFields.has(`content.${item.field}`)) failures.push({code:'CONTENT_FIELD_ALREADY_EXISTS',field:item.field});
  if(item.nullable!==true) failures.push({code:'CONTENT_ADDITION_MUST_BE_NULLABLE',field:item.field});
}
for(const collection of contract.collection_additions){
  if(currentCollections.has(collection.name)) failures.push({code:'COLLECTION_ALREADY_EXISTS',collection:collection.name});
  const names=collection.fields.map(f=>f.field);
  if(new Set(names).size!==names.length) failures.push({code:'DUPLICATE_FIELD',collection:collection.name});
  const pk=collection.fields.filter(f=>f.primary===true);
  if(pk.length!==1 || pk[0].field!==collection.primary_key || pk[0].type!=='uuid'){
    failures.push({code:'PRIMARY_KEY_INVALID',collection:collection.name});
  }
}
for(const rel of contract.relation_additions){
  if(!contract.collection_additions.some(c=>c.name===rel.collection)) failures.push({code:'RELATION_COLLECTION_NOT_NEW',relation:rel});
  const col=contract.collection_additions.find(c=>c.name===rel.collection);
  const field=col?.fields.find(f=>f.field===rel.field);
  if(!field || field.type!=='uuid') failures.push({code:'RELATION_FIELD_INVALID',relation:rel});
  if(!currentCollections.has(rel.related_collection) && !contract.collection_additions.some(c=>c.name===rel.related_collection)){
    failures.push({code:'RELATION_TARGET_UNKNOWN',relation:rel});
  }
}
if(failures.length) throw new Error(JSON.stringify({verdict:'FAIL',failures},null,2));

const operations=[
  ...contract.content_additions.map(x=>({action:'ADD_FIELD',collection:'content',field:x.field,type:x.type,nullable:x.nullable})),
  ...contract.collection_additions.map(x=>({action:'ADD_COLLECTION',collection:x.name,primary_key:x.primary_key,fields:x.fields})),
  ...contract.relation_additions.map(x=>({action:'ADD_RELATION',...x})),
];

const plan={
  format:'aeroventa-directus-vnext-additive-plan-v1',
  generated_at:null,
  base_schema:'target-schema-v11',
  mode:'ADDITIVE_ONLY',
  operations,
  destructive_operations:[],
  summary:{
    add_content_fields:contract.content_additions.length,
    add_collections:contract.collection_additions.length,
    add_relations:contract.relation_additions.length
  },
  runtime_gate:{
    admin_snapshot_required:true,
    native_diff_required:true,
    dry_run_required:true,
    owner_apply_approval_required:true
  }
};

const out=path.join(root,'migration/directus-vnext-plan.json');
await fs.writeFile(out,JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({verdict:'PASS_ADDITIVE_PLAN',out,...plan.summary,runtime_gate:plan.runtime_gate},null,2));
