import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [v11,contract,plan]=await Promise.all([
  fs.readFile(path.join(root,'directus/target-schema-v11.json'),'utf8').then(JSON.parse),
  fs.readFile(path.join(root,'directus/desired-schema-vnext-contract.json'),'utf8').then(JSON.parse),
  fs.readFile(path.join(root,'migration/directus-vnext-plan.json'),'utf8').then(JSON.parse),
]);
const failures=[];
const currentCollections=new Set(v11.collections.map(x=>x.collection));
const currentFields=new Set(v11.fields.map(x=>`${x.collection}.${x.field}`));

if(plan.format!=='aeroventa-directus-vnext-additive-plan-v1') failures.push({code:'PLAN_FORMAT'});
if(plan.mode!=='ADDITIVE_ONLY') failures.push({code:'PLAN_MODE'});
if((plan.destructive_operations??[]).length!==0) failures.push({code:'DESTRUCTIVE_OPERATIONS_PRESENT'});
if(plan.generated_at!==null) failures.push({code:'NON_DETERMINISTIC_TIMESTAMP'});

for(const op of plan.operations??[]){
  if(!['ADD_FIELD','ADD_COLLECTION','ADD_RELATION'].includes(op.action)) failures.push({code:'NON_ADDITIVE_ACTION',op});
  if(op.action==='ADD_FIELD' && currentFields.has(`${op.collection}.${op.field}`)) failures.push({code:'FIELD_COLLISION',op});
  if(op.action==='ADD_COLLECTION' && currentCollections.has(op.collection)) failures.push({code:'COLLECTION_COLLISION',op});
}

const expectedContentFields=contract.content_additions.map(x=>x.field).sort();
const plannedContentFields=(plan.operations??[]).filter(x=>x.action==='ADD_FIELD'&&x.collection==='content').map(x=>x.field).sort();
if(JSON.stringify(expectedContentFields)!==JSON.stringify(plannedContentFields)) failures.push({code:'CONTENT_ADDITION_SET_DRIFT'});

const expectedCollections=contract.collection_additions.map(x=>x.name).sort();
const plannedCollections=(plan.operations??[]).filter(x=>x.action==='ADD_COLLECTION').map(x=>x.collection).sort();
if(JSON.stringify(expectedCollections)!==JSON.stringify(plannedCollections)) failures.push({code:'COLLECTION_ADDITION_SET_DRIFT'});

const expectedRelations=contract.relation_additions.length;
const plannedRelations=(plan.operations??[]).filter(x=>x.action==='ADD_RELATION').length;
if(expectedRelations!==plannedRelations) failures.push({code:'RELATION_COUNT_DRIFT',expectedRelations,plannedRelations});

for(const field of contract.content_additions){
  if(field.nullable!==true) failures.push({code:'CONTENT_FIELD_NOT_NULLABLE',field:field.field});
}
if(!plan.runtime_gate?.admin_snapshot_required || !plan.runtime_gate?.native_diff_required || !plan.runtime_gate?.dry_run_required || !plan.runtime_gate?.owner_apply_approval_required){
  failures.push({code:'RUNTIME_GATE_INCOMPLETE'});
}

const report={
  format:'aeroventa-directus-vnext-static-validation-v1',
  verdict:failures.length?'FAIL':'PASS',
  failures,
  summary:plan.summary,
  invariants:{
    v11_collections_preserved:v11.collections.length,
    v11_fields_preserved:v11.fields.length,
    destructive_operations:(plan.destructive_operations??[]).length,
    runtime_apply_authorized:false
  }
};
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exit(1);
