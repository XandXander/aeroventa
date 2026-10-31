#!/usr/bin/env node
/** Read-only 49-route post-import integrity check. Never logs or uploads editorial values. */
import {readFile} from 'node:fs/promises';
import {readAcceptedBlueprint} from './pr12-cms-blueprint-decode.mjs';
const ok=(condition,message)=>{if(!condition)throw Error(message)};
const pathOk=s=>typeof s==='string'&&/^\/(?:[a-z0-9-]+\/)*$/.test(s);
async function readCms(token){
 const rows=[];
 for(let offset=0;offset<=300;offset+=100){
  const url=new URL('https://cms.aeroventa.ru/items/content');
  url.searchParams.set('limit','100');
  url.searchParams.set('offset',String(offset));
  url.searchParams.set('fields','id,path,status,owner_approved_at,robots_index,sitemap_include,body_blocks.block_id.id,body_blocks.block_id.block_type,body_blocks.block_id.data');
  const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',Authorization:'Bearer '+token}});
  ok(res.ok,'Directus readback HTTP '+res.status);
  const data=(await res.json()).data;
  ok(Array.isArray(data),'Invalid Directus payload');
  rows.push(...data);
  if(data.length<100)return rows;
 }
 throw Error('Directus pagination exceeded bounded limit');
}
function verify(plan,retained,rows){
 ok(plan.format==='AEROVENTA_OWNER_ACCEPTED_CMS_BASELINE_V1'&&plan.pages?.length===49&&plan.summary.fields===2342,'Pinned baseline mismatch');
 ok(retained.length===29&&new Set(retained).size===29,'Retained-route manifest mismatch');
 const byPath=new Map();
 for(const row of rows){
  ok(pathOk(row.path),'Unsafe Directus path');
  ok(!byPath.has(row.path),'Duplicate Directus path '+row.path);
  byPath.set(row.path,row);
 }
 let blocks=0,fields=0,extraBlocks=0;
 for(const page of plan.pages){
  const r=byPath.get(page.path);
  ok(r,'Missing imported page '+page.path);
  ok(r.status==='draft'&&r.owner_approved_at==null&&r.robots_index===false&&r.sitemap_include===false,'Draft protection mismatch '+page.path);
  ok(Array.isArray(r.body_blocks),'No block relations '+page.path);
  const found=new Map();
  for(const relation of r.body_blocks){
   const b=relation?.block_id;
   ok(typeof b?.id==='string','Broken content_block_map '+page.path);
   if(b.block_type!=='dom_fields'){extraBlocks++;continue}
   const d=b.data, keys=d?.fields?.map(f=>f.key);
   ok(d?.page===page.path&&d?.version===1&&Array.isArray(keys)&&keys.length>0,'Bad imported section '+page.path);
   ok(!found.has(keys[0]),'Duplicate imported section '+page.path);
   found.set(keys[0],keys);
  }
  for(const section of page.blocks){
   const expected=section.data?.fields?.map(f=>f.key);
   ok(Array.isArray(expected)&&expected.length>0,'Bad baseline block '+page.path);
   ok(JSON.stringify(found.get(expected[0]))===JSON.stringify(expected),'Missing or incompatible imported section '+page.path);
   blocks++;fields+=expected.length;
  }
 }
 ok(fields===2342,'Imported fields !=2342: '+fields);
 ok(retained.every(path=>byPath.has(path)),'Historical retained path missing');
 return {status:'PASS',canonical_pages:49,historical_retained:29,linked_dom_blocks:blocks,linked_dom_fields:fields,additional_editorial_blocks:extraBlocks,other_cms_records:rows.length-49,owner_approvals:0,manual_edit_parity:'REQUIRES_SEPARATE_BACKUP_COMPARISON'};
}
async function main(){
 if(process.argv.includes('--self-test')){ok(pathOk('/blog/detail/check/')&&!pathOk('/../secret/'),'Path guard failed');console.log('CMS_IMPORT_READBACK_SELFTEST_PASS');return}
 const token=process.env.DIRECTUS_STATIC_TOKEN;
 ok(token,'Directus read-only token unavailable');
 const plan=JSON.parse((await readAcceptedBlueprint()).toString('utf8'));
 const retained=JSON.parse(await readFile('apps/web/src/data/expected-retained-paths.json','utf8'));
 const result=verify(plan,retained,await readCms(token));
 console.log('CMS_IMPORT_READBACK '+JSON.stringify(result));
}
main().catch(e=>{console.error('CMS_IMPORT_READBACK_BLOCKED '+e.message);process.exitCode=1});
