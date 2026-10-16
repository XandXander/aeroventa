import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outPath = path.join(root, 'directus/target-schema-v9.json');

const VERSION = 1;
const DIRECTUS = '12.1.1';
const VENDOR = 'postgres';

const collectionSpecs = {
  content: { singleton: false },
  content_blocks: { singleton: false },
  content_block_map: { singleton: false },
  content_categories: { singleton: false },
  content_category_map: { singleton: false },
  project_details: { singleton: false },
  service_details: { singleton: false },
  redirects: { singleton: false },
  site_settings: { singleton: true },
};

const fieldSpecs = {
  content: [
    ['id','uuid',{primary:true}], ['status','string',{required:true}], ['content_type','string',{required:true}], ['path','string',{required:true,unique:true}],
    ['legacy_paths','json',{}], ['slug','string',{}], ['title','string',{required:true}], ['h1','string',{required:true}], ['excerpt','text',{}],
    ['body_html','text',{}], ['body_html_safety_status','string',{required:true}], ['body_blocks','alias',{alias:'o2m'}],
    ['hero_file','uuid',{relation:'directus_files',special:'file'}], ['published_at','timestamp',{}], ['updated_at_public','timestamp',{}],
    ['owner_approved_at','timestamp',{}], ['business_role','string',{required:true}], ['primary_topic','string',{}], ['knowledge_allowed','boolean',{default:false}],
    ['lead_intent','string',{}], ['source_legacy_url','string',{}], ['migration_evidence','json',{}], ['seo_title','string',{}], ['seo_description','text',{}],
    ['canonical_override','string',{}], ['robots_index','boolean',{default:false}], ['robots_follow','boolean',{default:true}], ['og_title','string',{}],
    ['og_description','text',{}], ['og_image','uuid',{relation:'directus_files',special:'file'}], ['schema_type','string',{}], ['schema_json_extra','json',{}],
    ['sitemap_include','boolean',{default:false}], ['sitemap_priority','decimal',{}], ['ai_origin','boolean',{default:false}], ['research_snapshot_id','string',{}],
    ['fact_check_status','string',{}], ['duplicate_check_status','string',{}], ['cannibalization_check_status','string',{}], ['publication_job_id','string',{}],
    ['post_publish_validation_status','string',{}],
  ],
  content_blocks: [
    ['id','uuid',{primary:true}], ['block_type','string',{required:true}], ['data','json',{required:true}], ['source_html','text',{}], ['fact_checked','boolean',{default:false}],
  ],
  content_block_map: [
    ['id','integer',{primary:true,auto:true}], ['content_id','uuid',{required:true,relation:'content'}], ['block_id','uuid',{required:true,relation:'content_blocks'}], ['sort','integer',{required:true}],
  ],
  content_categories: [
    ['id','uuid',{primary:true}], ['status','string',{required:true}], ['name','string',{required:true}], ['slug','string',{required:true}], ['path','string',{required:true,unique:true}],
    ['category_type','string',{required:true}], ['description','text',{}], ['seo_title','string',{}], ['seo_description','text',{}], ['robots_index','boolean',{default:true}],
  ],
  content_category_map: [
    ['id','integer',{primary:true,auto:true}], ['content_id','uuid',{required:true,relation:'content'}], ['category_id','uuid',{required:true,relation:'content_categories'}],
  ],
  project_details: [
    ['content_id','uuid',{primary:true,relation:'content'}], ['object_type','string',{}], ['location','string',{}], ['client_display_name','string',{}], ['scope','text',{}],
    ['systems','json',{}], ['work_volume','text',{}], ['duration','string',{}], ['completion_date','date',{}], ['constraints','text',{}], ['result','text',{}],
    ['gallery','json',{}], ['testimonial','text',{}], ['commercial_visibility','string',{}],
  ],
  service_details: [
    ['content_id','uuid',{primary:true,relation:'content'}], ['service_family','string',{required:true}], ['service_area','string',{}], ['target_customer','text',{}],
    ['supported_object_types','json',{}], ['lead_form_variant','string',{}], ['pricing_visibility','string',{}], ['direct_execution','boolean',{required:true}], ['fulfillment_model','string',{required:true}],
  ],
  redirects: [
    ['id','uuid',{primary:true}], ['source_path','string',{required:true,unique:true}], ['target_path','string',{}], ['status_code','integer',{required:true}], ['reason','text',{required:true}],
    ['source_evidence','json',{}], ['active','boolean',{default:true}], ['validated_at','timestamp',{}],
  ],
  site_settings: [
    ['id','integer',{primary:true,auto:true}], ['company_display_name','string',{required:true}], ['primary_business','string',{required:true}], ['phone','string',{required:true}],
    ['email','string',{required:true}], ['service_region','string',{required:true}], ['default_seo_title','string',{}], ['default_seo_description','text',{}],
    ['default_og_image','uuid',{relation:'directus_files',special:'file'}], ['ai_consultant_enabled','boolean',{default:false}], ['emergency_disable_ai','boolean',{default:false}],
    ['privacy_path','string',{}], ['offer_path','string',{}], ['analytics_config','json',{}],
  ],
};

function collectionEntry(name, singleton) {
  return {
    collection: name,
    meta: {
      accountability: 'all', archive_app_filter: true, archive_field: null, archive_value: null,
      autosave_revision_interval: null, collapse: 'open', collection: name, color: null,
      display_template: null, group: null, hidden: false, icon: null, item_duplication_fields: null,
      note: 'AEROVENTA T2 target schema', preview_url: null, singleton, sort: null, sort_field: null,
      status: 'active', translations: null, unarchive_value: null, versioning: false,
    },
    schema: { name },
  };
}

function dbType(type) {
  if (type === 'string') return { data_type:'character varying', max_length:255, numeric_precision:null, numeric_scale:null };
  if (type === 'text') return { data_type:'text', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'uuid') return { data_type:'uuid', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'integer') return { data_type:'integer', max_length:null, numeric_precision:32, numeric_scale:0 };
  if (type === 'boolean') return { data_type:'boolean', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'json') return { data_type:'json', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'timestamp') return { data_type:'timestamp with time zone', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'date') return { data_type:'date', max_length:null, numeric_precision:null, numeric_scale:null };
  if (type === 'decimal') return { data_type:'numeric', max_length:null, numeric_precision:10, numeric_scale:2 };
  throw new Error(`Unsupported type ${type}`);
}

function interfaceFor(type, opts) {
  if (opts.special === 'file') return 'file-image';
  if (opts.relation) return 'select-dropdown-m2o';
  if (type === 'boolean') return 'boolean';
  if (type === 'json') return 'input-code';
  if (type === 'text') return 'input-multiline';
  if (type === 'timestamp') return 'datetime';
  if (type === 'date') return 'datetime';
  return 'input';
}

function fieldEntry(collection, [field, type, opts], sort) {
  if (type === 'alias') {
    return {
      collection, field, type:'alias',
      meta: { collection, conditions:null, display:null, display_options:null, field, group:null, hidden:false, interface:'list-o2m', note:null, options:null, readonly:false, required:false, searchable:true, sort, special:['o2m'], translations:null, validation:null, validation_message:null, width:'full' },
      schema: null,
    };
  }
  const relationTarget = opts.relation ?? null;
  const primary = Boolean(opts.primary);
  const auto = Boolean(opts.auto);
  const required = primary || Boolean(opts.required);
  const special = primary && type === 'uuid' ? ['uuid'] : relationTarget ? [opts.special === 'file' ? 'file' : 'm2o'] : null;
  const base = dbType(type);
  return {
    collection, field, type,
    meta: { collection, conditions:null, display:null, display_options:null, field, group:null, hidden:primary, interface:interfaceFor(type, opts), note:null, options:null, readonly:primary, required:Boolean(opts.required), searchable:true, sort, special, translations:null, validation:null, validation_message:null, width:'full' },
    schema: {
      name:field, table:collection, ...base,
      default_value: Object.hasOwn(opts,'default') ? opts.default : null,
      is_nullable: !required, is_unique: primary || Boolean(opts.unique), is_indexed:false,
      is_primary_key:primary, is_generated:false, generation_expression:null, has_auto_increment:auto,
      foreign_key_table:relationTarget, foreign_key_column:relationTarget ? 'id' : null,
    },
  };
}

function relationEntry(collection, field, target, oneField=null, sortField=null, onDelete='SET NULL') {
  return {
    collection, field, related_collection:target,
    meta: { junction_field:null, many_collection:collection, many_field:field, one_allowed_collections:null, one_collection:target, one_collection_field:null, one_deselect_action:onDelete === 'CASCADE' ? 'delete' : 'nullify', one_field:oneField, sort_field:sortField },
    schema: { table:collection, column:field, foreign_key_table:target, foreign_key_column:'id', constraint_name:`${collection}_${field}_foreign`, on_update:'NO ACTION', on_delete:onDelete },
  };
}

const collections = Object.entries(collectionSpecs).map(([name,s]) => collectionEntry(name,s.singleton));
const fields = Object.entries(fieldSpecs).flatMap(([collection,specs]) => specs.map((spec,i)=>fieldEntry(collection,spec,i+1)));
const relations = [
  relationEntry('content','hero_file','directus_files'),
  relationEntry('content','og_image','directus_files'),
  relationEntry('content_block_map','content_id','content','body_blocks','sort','CASCADE'),
  relationEntry('content_block_map','block_id','content_blocks',null,null,'CASCADE'),
  relationEntry('content_category_map','content_id','content',null,null,'CASCADE'),
  relationEntry('content_category_map','category_id','content_categories',null,null,'CASCADE'),
  relationEntry('project_details','content_id','content',null,null,'CASCADE'),
  relationEntry('service_details','content_id','content',null,null,'CASCADE'),
  relationEntry('site_settings','default_og_image','directus_files'),
];

const target = { version:VERSION, directus:DIRECTUS, vendor:VENDOR, collections, fields, relations };
await fs.writeFile(outPath, `${JSON.stringify(target,null,2)}\n`);
console.log(`Generated V9 Directus native target: ${collections.length} collections, ${fields.length} fields, ${relations.length} relations.`);
