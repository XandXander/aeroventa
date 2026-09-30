import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const snapshotPath=process.argv[2]?path.resolve(process.cwd(),process.argv[2]):path.join(root,'migration/private/directus/schema-current.json');
const [raw,contract]=await Promise.all([
  fs.readFile(snapshotPath,'utf8').then(JSON.parse),
  fs.readFile(path.join(root,'directus/desired-schema-vnext-contract.json'),'utf8').then(JSON.parse),
]);
const snapshot=raw?.data??raw;
if(!Array.isArray(snapshot?.collections)||!Array.isArray(snapshot?.fields)||!Array.isArray(snapshot?.relations)){
  throw new Error('Directus native snapshot must contain collections, fields and relations arrays');
}
const collections=new Set(snapshot.collections.map(x=>x.collection??x?.schema?.name).filter(Boolean));
const fields=new Map(snapshot.fields.map(x=>[`${x.collection}.${x.field}`,x]));
const missing=[]; const present=[]; const conflicts=[];

for(const f of contract.content_additions){
  const key=`content.${f.field}`; const actual=fields.get(key);
  if(!actual) missing.push({kind:'field',key,expected_type:f.type});
  else if(actual.type!==f.type) conflicts.push({kind:'field',key,expected_type:f.type,actual_type:actual.type??null});
  else present.push({kind:'field',key,type:actual.type});
}
for(const c of contract.collection_additions){
  if(!collections.has(c.name)){
    missing.push({kind:'collection',key:c.name});
    continue;
  }
  present.push({kind:'collection',key:c.name});
  for(const f of c.fields){
    const key=`${c.name}.${f.field}`; const actual=fields.get(key);
    if(!actual) missing.push({kind:'field',key,expected_type:f.type});
    else if(actual.type!==f.type) conflicts.push({kind:'field',key,expected_type:f.type,actual_type:actual.type??null});
    else present.push({kind:'field',key,type:actual.type});
  }
}

const verdict=conflicts.length?'CONFLICT_REQUIRES_MANUAL_REVIEW':missing.length?'ADDITIVE_DELTA_REQUIRED':'VNEXT_ALREADY_PRESENT';
const report={
  format:'aeroventa-directus-vnext-readonly-inspection-v1',
  source_snapshot:snapshotPath,
  verdict,
  missing,
  present,
  conflicts,
  mutation_performed:false,
  next_step:conflicts.length
    ? 'Do not apply. Reconcile conflicts first.'
    : missing.length
      ? 'Create a Directus-native target snapshot on a compatible dev/staging instance, then run /schema/diff or schema apply --dry-run.'
      : 'No VNext schema additions are required.'
};
const outDir=path.join(root,'migration/private/directus');
await fs.mkdir(outDir,{recursive:true});
await fs.writeFile(path.join(outDir,'vnext-readonly-inspection.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(conflicts.length) process.exit(2);
