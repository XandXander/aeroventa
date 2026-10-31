#!/usr/bin/env node
/**
 * AEROVENTA: exact approved Directus snapshot, bound to one preview artifact.
 * All release operations fail closed if the approved record changes.
 * Does not mutate Directus, Beget, or the public website.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('release_out/approved-astro');
const sha = data => createHash('sha256').update(data).digest('hex');
const fieldNames = [
 'id','path','slug','title','h1','content_type','business_role','status',
 'robots_index','robots_follow','sitemap_include','knowledge_allowed','ai_origin',
 'seo_title','seo_description','canonical_override','og_title','og_description',
 'og_image','schema_type','schema_json_extra','published_at','updated_at_public',
 'excerpt','body_html','body_html_safety_status','hero_file','lead_intent','owner_approved_at',
 'body_blocks.sort','body_blocks.block_id.id','body_blocks.block_id.block_type',
 'body_blocks.block_id.data','body_blocks.block_id.fact_checked'
];
const paths = (process.env.AEROVENTA_INCREMENTAL_PATHS||'').split(',').map(s=>s.trim()).filter(Boolean);
const validPath = p => /^\/(?:[a-z0-9-]+\/)*$/.test(p) && p.length<=220;
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
const canonical = value => JSON.stringify(stable(value));
async function current(){
 const token=process.env.DIRECTUS_STATIC_TOKEN;
 if(!token)throw Error('Missing read-only Directus token');
 if(paths.length<1||paths.length>15||new Set(paths).size!==paths.length||paths.some(p=>!validPath(p)))throw Error('Invalid exact release paths');
 const records=[];
 for(const p of paths){
  const u=new URL('https://cms.aeroventa.ru/items/content');
  u.searchParams.set('fields',fieldNames.join(','));
  u.searchParams.set('filter[path][_eq]',p);
  u.searchParams.set('limit','2');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',Authorization:'Bearer '+token}});
  if(!r.ok)throw Error('Approved record lookup HTTP '+r.status+' for '+p);
  const items=(await r.json()).data;
  if(!Array.isArray(items)||items.length!==1)throw Error('Missing or duplicate CMS record '+p);
  const item=items[0];
  if(item.status!=='published'||!item.owner_approved_at||item.robots_index!==true||item.sitemap_include!==true)throw Error('Owner approval revoked '+p);
  records.push({path:p,id:item.id,approved_at:item.owner_approved_at,digest:sha(canonical(item))});
 }
 const media=JSON.parse(await readFile(path.join(root,'media-registry.json'),'utf8'));
 if(media.format!=='AEROVENTA_CMS_MEDIA_REGISTRY_V1'||media.source_sha!==process.env.GITHUB_SHA)
   throw Error('Media registry missing or source drift');
 return {format:'AEROVENTA_APPROVED_CMS_SNAPSHOT_V1',source_sha:process.env.GITHUB_SHA||'',media_sha256:sha(canonical(media)),records};
}
async function main(){
 const op=process.argv[2];
 if(op==='--self-test'){
   if(canonical({b:2,a:{d:4,c:3}})!==canonical({a:{c:3,d:4},b:2})||validPath('/../etc/')||!validPath('/blog/detail/example/'))throw Error('Snapshot self-test failed');
   console.log('AEROVENTA_SNAPSHOT_SELF_TEST_PASS');
   return;
 }
 if(!['capture','verify'].includes(op))throw Error('Usage: capture|verify|--self-test');
 const currentLock=await current();
 const lockFile=path.join(root,'cms-approved-lock.json');
 if(op==='capture'){
  if(!/^[a-f0-9]{40}$/.test(currentLock.source_sha))throw Error('Missing GitHub source SHA');
  await mkdir(root,{recursive:true});
  await writeFile(lockFile,canonical(currentLock)+'\n');
  console.log('AEROVENTA_CMS_SNAPSHOT_CAPTURED rows='+paths.length);
 }else{
  const locked=JSON.parse(await readFile(lockFile,'utf8'));
  if(canonical(locked)!==canonical(currentLock))throw Error('APPROVED_CMS_REVISION_CHANGED: refuse release or rebuild; repeat owner preview');
  console.log('AEROVENTA_CMS_APPROVED_REVISION_VERIFIED rows='+paths.length);
 }
}
main().catch(e=>{console.error('AEROVENTA_SNAPSHOT_BLOCKED: '+e.message);process.exitCode=1});
