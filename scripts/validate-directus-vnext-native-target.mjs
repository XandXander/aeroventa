import fs from 'node:fs/promises';

const [sourcePath,targetPath]=process.argv.slice(2);
if(!sourcePath||!targetPath) throw new Error('Usage: node scripts/validate-directus-vnext-native-target.mjs <source.json> <target.json>');
const unwrap=x=>x?.data??x;
const [source,target]=await Promise.all([
  fs.readFile(sourcePath,'utf8').then(JSON.parse).then(unwrap),
  fs.readFile(targetPath,'utf8').then(JSON.parse).then(unwrap)
]);
const failures=[];
const sourceCols=new Map(source.collections.map(x=>[x.collection,x]));
const targetCols=new Map(target.collections.map(x=>[x.collection,x]));
const sourceFields=new Map(source.fields.map(x=>[`${x.collection}.${x.field}`,x]));
const targetFields=new Map(target.fields.map(x=>[`${x.collection}.${x.field}`,x]));
const sourceRels=new Map(source.relations.map(x=>[`${x.collection}.${x.field}`,x]));
const targetRels=new Map(target.relations.map(x=>[`${x.collection}.${x.field}`,x]));

const stable=(value)=>{
  const normalize=(input)=>{
    if(Array.isArray(input)) return input.map(normalize);
    if(input && typeof input==='object') return Object.fromEntries(Object.keys(input).sort().map(k=>[k,normalize(input[k])]));
    return input;
  };
  return JSON.stringify(normalize(value));
};
for(const [k,v] of sourceCols) if(stable(v)!==stable(targetCols.get(k))) failures.push({code:'BASE_COLLECTION_CHANGED',key:k});
for(const [k,v] of sourceFields) if(stable(v)!==stable(targetFields.get(k))) failures.push({code:'BASE_FIELD_CHANGED',key:k});
for(const [k,v] of sourceRels) if(stable(v)!==stable(targetRels.get(k))) failures.push({code:'BASE_RELATION_CHANGED',key:k});
if(JSON.stringify(source.systemFields)!==JSON.stringify(target.systemFields)) failures.push({code:'SYSTEM_FIELDS_CHANGED'});
if(target.collections.length!==11) failures.push({code:'TARGET_COLLECTION_COUNT',actual:target.collections.length});
if(target.fields.length!==160) failures.push({code:'TARGET_FIELD_COUNT',actual:target.fields.length});
if(target.relations.length!==11) failures.push({code:'TARGET_RELATION_COUNT',actual:target.relations.length});
for(const k of ['requests','publication_jobs']) if(!targetCols.has(k)) failures.push({code:'MISSING_NEW_COLLECTION',key:k});
for(const k of ['page_purpose','primary_user_intent','primary_search_intent','public_facts','evidence_refs','limitations','agent_summary','last_fact_verified_at']){
  const f=targetFields.get(`content.${k}`);
  if(!f) failures.push({code:'MISSING_CONTENT_FIELD',key:k});
  else if(f.schema?.is_nullable!==true) failures.push({code:'CONTENT_FIELD_NOT_NULLABLE',key:k});
}
const report={
  format:'aeroventa-directus-vnext-native-target-validation-v1',
  verdict:failures.length?'FAIL':'PASS',
  failures,
  source_counts:{collections:source.collections.length,fields:source.fields.length,relations:source.relations.length,systemFields:source.systemFields?.length??0},
  target_counts:{collections:target.collections.length,fields:target.fields.length,relations:target.relations.length,systemFields:target.systemFields?.length??0},
  destructive_operations:0,
  runtime_apply_authorized:false
};
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exit(1);
