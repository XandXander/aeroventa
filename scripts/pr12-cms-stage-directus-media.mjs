#!/usr/bin/env node
/**
 * Read-only Directus media resolver for exact CMS release selection.
 * Reuses directus_files; no new collections; stores immutable SHA-addressed
 * media in Astro public build, and locks its content across preview/release.
 * This script never writes to Directus, Beget or production.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_IMAGE=18*1024*1024;
const output=path.resolve('release_out/approved-astro/media-registry.json');
const assetRoot=path.resolve('apps/web/public/cms-media');
const selected=(process.env.AEROVENTA_INCREMENTAL_PATHS||'').split(',').map(p=>p.trim()).filter(Boolean);
const validRoute=p=>/^\/(?:[a-z0-9-]+\/)*$/.test(p)&&p.length<=220;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=b=>createHash('sha256').update(b).digest('hex');
const mediaKeys=new Set(['image','file','cover','photo','og_image','hero_file','thumbnail','gallery','photos','images']);
const types=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);

const assertSelected=()=>{
 if(selected.length<1||selected.length>15||new Set(selected).size!==selected.length||selected.some(p=>!validRoute(p)))throw Error('Invalid exact paths');
};
const isValidImage=(bytes,mime)=>{
 if(bytes.length<100||bytes.length>MAX_IMAGE)return false;
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/webp')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(mime==='image/avif')return bytes.toString('ascii',4,8)==='ftyp'&&['avif','avis'].includes(bytes.toString('ascii',8,12));
 return false;
};
function collect(node,set,key='',depth=0){
 if(depth>12)throw Error('CMS media structure too deep');
 if(typeof node==='string'){
  if(mediaKeys.has(key)&&uuid.test(node))set.add(node.toLowerCase());
  return;
 }
 if(Array.isArray(node)){if(node.length>250)throw Error('CMS media array too large');for(const v of node)collect(v,set,key,depth+1);return}
 if(node&&typeof node==='object'){
  if(node.kind==='media' && typeof node.value==='string' && uuid.test(node.value))set.add(node.value.toLowerCase());
  for(const [k,v] of Object.entries(node)){if(k==='id'||k==='content_id')continue;collect(v,set,k,depth+1)}}
}
async function cms(endpoint,token,json=true){
 const u=new URL(endpoint,'https://cms.aeroventa.ru');
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{Accept:json?'application/json':'image/*',Authorization:'Bearer '+token}});
 if(!r.ok)throw Error('Directus media fetch '+r.status+' '+u.pathname);
 return json?r.json():Buffer.from(await r.arrayBuffer());
}
async function resolveRegistry(write){
 assertSelected();
 const token=process.env.DIRECTUS_STATIC_TOKEN;
 if(!token)throw Error('Missing read-only Directus token');
 const ids=new Set();
 for(const route of selected){
  const u=new URL('https://cms.aeroventa.ru/items/content');
  u.searchParams.set('filter[path][_eq]',route);
  u.searchParams.set('fields','id,path,content_type,hero_file,og_image,body_blocks.block_id.data');
  u.searchParams.set('limit','2');
  const r=await cms(u.toString(),token);
  if(!Array.isArray(r.data)||r.data.length!==1)throw Error('Missing or duplicate content for media '+route);
  const item=r.data[0];
  if(item.path!==route)throw Error('CMS media path drift');
  collect({hero_file:item.hero_file,og_image:item.og_image,body_blocks:item.body_blocks},ids);
  // The published Build Reader is not authorized for project detail rows
  // when preparing an ordinary article. Never broaden its permissions just
  // to get a preview: query details ONLY for actual project content.
  if(item.content_type==='project'){
    const p=new URL('https://cms.aeroventa.ru/items/project_details');
    p.searchParams.set('filter[content_id][_eq]',item.id);
    p.searchParams.set('fields','gallery');
    p.searchParams.set('limit','2');
    const pr=await cms(p.toString(),token);
    if(!Array.isArray(pr.data)||pr.data.length>1)throw Error('Ambiguous project details '+route);
    if(pr.data.length)collect({gallery:pr.data[0].gallery},ids);
  }
 }
 if(ids.size>100)throw Error('Too many images in bounded release');
 const files={};
 for(const id of [...ids].sort()){
  const meta=(await cms('https://cms.aeroventa.ru/files/'+id+'?fields=id,type,filesize',token)).data;
  if(meta?.id!==id||!types.has(meta.type)||Number(meta.filesize)>MAX_IMAGE)throw Error('Unsupported Directus file '+id);
  const body=await cms('https://cms.aeroventa.ru/assets/'+id,token,false);
  if(!isValidImage(body,meta.type)||Number(meta.filesize)!==body.length)throw Error('Directus media type/size mismatch '+id);
  const digest=sha(body);
  const rel='cms-media/'+digest+'.'+types.get(meta.type);
  files[id]={path:'/'+rel,sha256:digest,bytes:body.length,type:meta.type};
  if(write){await mkdir(assetRoot,{recursive:true});await writeFile(path.join(assetRoot,path.basename(rel)),body)}
 }
 return {format:'AEROVENTA_CMS_MEDIA_REGISTRY_V1',source_sha:process.env.GITHUB_SHA||'',paths:selected,files};
}
async function main(){
 const op=process.argv[2];
 if(op==='--self-test'){
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(100)]);
  if(!isValidImage(png,'image/png')||isValidImage(png,'image/svg+xml')||
     validRoute('/../etc/')||!validRoute('/blog/detail/example/'))throw Error('Media self-test failed');
  console.log('AEROVENTA_CMS_MEDIA_SELF_TEST_PASS');
  return;
 }
 if(!['capture','verify'].includes(op))throw Error('Usage: capture|verify|--self-test');
 const actual=await resolveRegistry(op==='capture');
 if(op==='capture'){await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(actual,null,2)+'\n')}
 else{
  const saved=JSON.parse(await readFile(output,'utf8'));
  if(JSON.stringify(saved)!==JSON.stringify(actual))throw Error('CMS_MEDIA_CHANGED_AFTER_PREVIEW');
 }
 console.log('AEROVENTA_CMS_MEDIA_'+op.toUpperCase()+'_PASS files='+Object.keys(actual.files).length);
}
main().catch(e=>{console.error('AEROVENTA_CMS_MEDIA_BLOCKED: '+e.message);process.exitCode=1});
