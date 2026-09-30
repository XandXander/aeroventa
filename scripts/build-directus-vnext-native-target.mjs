import fs from 'node:fs/promises';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node scripts/build-directus-vnext-native-target.mjs <current-snapshot.json> <target-snapshot.json>');

const raw = JSON.parse(await fs.readFile(inputPath,'utf8'));
const source = raw?.data ?? raw;
if (source?.directus !== '12.1.1' || source?.vendor !== 'postgres') {
  throw new Error(`Unexpected Directus identity: ${source?.directus ?? 'unknown'} / ${source?.vendor ?? 'unknown'}`);
}
if (!Array.isArray(source.collections) || !Array.isArray(source.fields) || !Array.isArray(source.relations)) {
  throw new Error('Snapshot shape invalid');
}

const clone = JSON.parse(JSON.stringify(source));
const collectionNames = new Set(clone.collections.map(x=>x.collection));
const fieldKeys = new Set(clone.fields.map(x=>`${x.collection}.${x.field}`));

const expectedBaseCollections = ['content','content_block_map','content_blocks','content_categories','content_category_map','project_details','redirects','service_details','site_settings'];
for (const name of expectedBaseCollections) if (!collectionNames.has(name)) throw new Error(`Base collection missing: ${name}`);

const vnextContent = [
  ['page_purpose','string'],['primary_user_intent','string'],['primary_search_intent','string'],
  ['public_facts','json'],['evidence_refs','json'],['limitations','json'],
  ['agent_summary','text'],['last_fact_verified_at','timestamp'],
];
for (const [field] of vnextContent) if (fieldKeys.has(`content.${field}`)) throw new Error(`VNext field already exists: content.${field}`);
for (const name of ['requests','publication_jobs']) if (collectionNames.has(name)) throw new Error(`VNext collection already exists: ${name}`);

const metaCollection = (collection,note) => ({
  accountability:'all',archive_app_filter:true,archive_field:null,archive_value:null,
  autosave_revision_interval:null,collapse:'open',collection,color:null,display_template:null,
  group:null,hidden:false,icon:null,item_duplication_fields:null,note,preview_url:null,
  singleton:false,sort:null,sort_field:null,status:'active',translations:null,
  unarchive_value:null,versioning:false
});
const schemaBase=(name,table,data_type,{nullable=true,unique=false,primary=false,max=null,precision=null,scale=null,foreignTable=null,foreignColumn=null,auto=false,defaultValue=null}={})=>({
  name,table,data_type,default_value:defaultValue,max_length:max,numeric_precision:precision,numeric_scale:scale,
  is_nullable:nullable,is_unique:unique,is_indexed:false,is_primary_key:primary,is_generated:false,
  generation_expression:null,has_auto_increment:auto,foreign_key_table:foreignTable,foreign_key_column:foreignColumn
});
const fieldMeta=(collection,field,{special=null,interface:interfaceName='input',readonly=false,hidden=false,required=false,sort=1}={})=>({
  collection,conditions:null,display:null,display_options:null,field,group:null,hidden,interface:interfaceName,
  note:null,options:null,readonly,required,searchable:true,sort,special,translations:null,
  validation:null,validation_message:null,width:'full'
});
const typeSchema=(collection,field,type,opts={})=>{
  if(type==='uuid') return schemaBase(field,collection,'uuid',{...opts});
  if(type==='string') return schemaBase(field,collection,'character varying',{max:255,...opts});
  if(type==='text') return schemaBase(field,collection,'text',{...opts});
  if(type==='json') return schemaBase(field,collection,'json',{...opts});
  if(type==='timestamp') return schemaBase(field,collection,'timestamp with time zone',{...opts});
  throw new Error(`Unsupported field type ${type}`);
};
const interfaceFor=(type,relation=false)=> relation?'select-dropdown-m2o': type==='json'?'input-code':type==='text'?'input-multiline':type==='timestamp'?'datetime':'input';
const specialFor=(type,relation=false,primary=false)=> relation?['m2o']:primary?['uuid']:type==='json'?['cast-json']:null;

let sort=42;
for(const [field,type] of vnextContent){
  clone.fields.push({
    collection:'content',field,type,
    meta:fieldMeta('content',field,{interface:interfaceFor(type),special:specialFor(type),required:false,sort:sort++}),
    schema:typeSchema('content',field,type,{nullable:true})
  });
}

const requestsFields = [
  ['id','uuid',false,true],['created_at','timestamp',false],['updated_at','timestamp',true],
  ['status','string',false],['source_channel','string',false],['source_page','string',true],
  ['source_campaign','json',true],['intent','string',true],['object_type','string',true],
  ['geography','string',true],['project_status','string',true],['task_summary','text',true],
  ['qualification_data','json',true],['preferred_contact_channel','string',true],
  ['contact_name','string',true],['contact_value','string',true],['attachment_refs','json',true],
  ['agent_context_summary','text',true],['owner_status','string',true],
];
const publicationFields = [
  ['id','uuid',false,true],['created_at','timestamp',false],['updated_at','timestamp',true],
  ['status','string',false],['trigger_source','string',true],['requested_topic','text',true],
  ['content_action','string',false],['target_content_id','uuid',true,false,'content'],
  ['target_path','string',true],['research_snapshot_id','string',true],['evidence_refs','json',true],
  ['unknowns_or_debt','json',true],['draft_content_id','uuid',true,false,'content'],
  ['duplicate_check_status','string',true],['cannibalization_check_status','string',true],
  ['fact_check_status','string',true],['media_check_status','string',true],['preview_status','string',true],
  ['owner_decision','string',true],['owner_decided_at','timestamp',true],['build_validation_status','string',true],
  ['post_publish_validation_status','string',true],['measurement_notes','text',true],
];

function addCollection(name, fields, note){
  clone.collections.push({collection:name,meta:metaCollection(name,note),schema:{name}});
  let n=1;
  for(const [field,type,nullable=true,primary=false,foreignTable=null] of fields){
    const relation=Boolean(foreignTable);
    clone.fields.push({
      collection:name,field,type,
      meta:fieldMeta(name,field,{
        interface:interfaceFor(type,relation),
        special:specialFor(type,relation,primary),
        readonly:primary,hidden:primary,required:!nullable && !primary,sort:n++
      }),
      schema:typeSchema(name,field,type,{
        nullable:primary?false:nullable,
        unique:primary,
        primary,
        foreignTable,
        foreignColumn:foreignTable?'id':null
      })
    });
  }
}
addCollection('requests',requestsFields,'AEROVENTA VNext request intake');
addCollection('publication_jobs',publicationFields,'AEROVENTA VNext publishing workflow');

for(const field of ['target_content_id','draft_content_id']){
  clone.relations.push({
    collection:'publication_jobs',field,related_collection:'content',
    meta:{
      junction_field:null,many_collection:'publication_jobs',many_field:field,
      one_allowed_collections:null,one_collection:'content',one_collection_field:null,
      one_deselect_action:'nullify',one_field:null,sort_field:null
    },
    schema:{
      table:'publication_jobs',column:field,foreign_key_table:'content',foreign_key_column:'id',
      constraint_name:`publication_jobs_${field}_foreign`,on_update:'NO ACTION',on_delete:'SET NULL'
    }
  });
}

const report={
  format:'aeroventa-directus-vnext-native-target-build-v1',
  source:inputPath,
  target:outputPath,
  directus:clone.directus,
  vendor:clone.vendor,
  counts:{collections:clone.collections.length,fields:clone.fields.length,relations:clone.relations.length,systemFields:clone.systemFields?.length??0},
  expected:{collections:11,fields:160,relations:11,systemFields:12},
  destructive_operations:0
};
if(JSON.stringify(report.counts)!==JSON.stringify(report.expected)) throw new Error(`Unexpected target counts: ${JSON.stringify(report)}`);

await fs.mkdir(path.dirname(outputPath),{recursive:true});
await fs.writeFile(outputPath,JSON.stringify(clone,null,2)+'\n');
console.log(JSON.stringify({...report,verdict:'PASS'},null,2));
