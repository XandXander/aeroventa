#!/usr/bin/env node
/** Exact selected owner-approved Directus leaf fields -> immutable Astro override. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readAcceptedBlueprint } from './pr12-cms-blueprint-decode.mjs';
const selected=(process.env.AEROVENTA_INCREMENTAL_PATHS||'').split(',').map(x=>x.trim()).filter(Boolean);
const base=path.resolve('release_out/approved-astro');
const approved=process.argv.includes('--review')?false:true;
const accepted=JSON.parse((await readAcceptedBlueprint()).toString('utf8'));
const baselines=new Map(accepted.pages.map(p=>[p.path,new Map(p.blocks.flatMap(b=>b.data.fields).map(f=>[f.key,f]))]));
const safePath=p=>/^\/(?:[a-z0-9-]+\/)*$/.test(p);
async function run(){
 if(process.argv.includes('--self-test')){
  if(safePath('/../../')||!safePath('/almaznoe-burenie/'))throw Error('Unsafe URL validator');
  console.log('CMS_DOM_LOCK_SELF_TEST_PASS');return;
 }
 if(!selected.length||selected.length>15||new Set(selected).size!==selected.length||selected.some(x=>!safePath(x)))throw Error('Invalid exact paths');
 const token=process.env.DIRECTUS_STATIC_TOKEN;
 if(!token)throw Error('Missing Directus read token');
 let registry={files:{}};
 try{registry=JSON.parse(await fs.readFile(path.join(base,'media-registry.json'),'utf8'));}catch{}
 const pages=[];
 for(const address of selected){
  const u=new URL('https://cms.aeroventa.ru/items/content');
  u.searchParams.set('filter[path][_eq]',address);
  u.searchParams.set('fields','path,status,owner_approved_at,body_blocks.sort,body_blocks.block_id.id,body_blocks.block_id.block_type,body_blocks.block_id.data,body_blocks.block_id.fact_checked');
  u.searchParams.set('limit','2');
  const res=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!res.ok)throw Error('CMS block lookup failed HTTP '+res.status+' '+address);
  const items=(await res.json()).data;
  if(!Array.isArray(items)||items.length!==1)throw Error('Ambiguous CMS route '+address);
  const item=items[0];
  if(approved && (item.status!=='published'||!item.owner_approved_at))throw Error('Unapproved CMS route '+address);
  if(!approved && item.status!=='draft')throw Error('Review requires draft '+address);
  const reference=baselines.get(address);const blocks=[];
  for(const m of item.body_blocks||[]){
   const b=m.block_id;
   if(!b||b.block_type!=='dom_fields')continue;
   if(approved && b.fact_checked!==true)throw Error('Unverified edited fields '+address);
   if(!reference)throw Error('No accepted baseline for '+address);
   const data=b.data;
   if(data?.page!==address||data.version!==1||!Array.isArray(data.fields)||data.fields.length<1||data.fields.length>20)throw Error('Invalid CMS DOM block '+address);
   const fields=[];
   for(const field of data.fields){
    const source=reference.get(field.key);
    if(!source || source.node!==field.node||source.kind!==field.kind||source.attribute!==field.attribute||source.baseline!==field.baseline || field.source_sha256!==source.source_sha256)throw Error('CMS baseline drift for '+address);
    const next={...field};
    if(next.kind==='media' && /^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(next.value)){
     const locked=registry.files[next.value.toLowerCase()];if(!locked)throw Error('CMS media not SHA-locked');next.value=locked.path;
    }
    if(!['string'].includes(typeof next.value))throw Error('Invalid CMS field value');
    fields.push(next);
   }
   blocks.push({block_type:'dom_fields',sort:m.sort||0,data:{...data,fields}});
  }
  pages.push({path:address,blocks});
 }
 const result={format:'AEROVENTA_CMS_DOM_OVERRIDE_V1',source_sha:process.env.GITHUB_SHA||'',pages};
 await fs.mkdir(base,{recursive:true});await fs.writeFile(path.join(base,'cms-dom-overrides.json'),JSON.stringify(result,null,2)+'\n');
 console.log('CMS_DOM_LOCK_PASS routes='+pages.length+' blocks='+pages.reduce((sum,x)=>sum+x.blocks.length,0));
}
run().catch(e=>{console.error('CMS_DOM_LOCK_BLOCKED: '+e.message);process.exitCode=1});
