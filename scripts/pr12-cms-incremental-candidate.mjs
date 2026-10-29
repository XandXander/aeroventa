#!/usr/bin/env node
/**
 * Incremental candidate for the accepted *live* AEROVENTA website.
 * Never writes to Beget or Directus. Only patches explicit, owner-approved,
 * text-only metadata from the current public HTML, preserving the rest byte-for-byte.
 * Changes in photos, rich body, complex H1 or new routes require the Astro source
 * publishing pipeline; this script fails closed rather than inventing parity.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CMS = 'https://cms.aeroventa.ru';
const LIVE = 'https://aeroventa.ru';
const MAX = { seo_title: 240, seo_description: 480, og_title: 240, og_description: 480 };
const sha = s => createHash('sha256').update(s).digest('hex');
const htmlEscape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const once = (html, re, replacement, label) => {
  const matches = [...html.matchAll(new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g'))];
  if (matches.length !== 1) throw Error(label+' requires exactly one existing HTML target; actual='+matches.length);
  return html.replace(re, replacement);
};
const isPath = p => typeof p==='string' && /^\/(?:[a-z0-9-]+\/)*$/.test(p) && !p.includes('//') && p.length <= 220;
const safeText = (name, val) => {
  if(typeof val!=='string' || val.trim().length<1 || val.length>MAX[name] || /[\u0000-\u001f]/.test(val)) throw Error('Invalid '+name);
  return htmlEscape(val.trim());
};
function replaceMeta(html, attr, value) {
  const re = new RegExp('<meta\\b(?=[^>]*\\b(?:name|property)=["\\\']'+attr+'["\\\'])[^>]*>', 'gi');
  const matches=[...html.matchAll(re)];
  if(matches.length!==1) throw Error(attr+' metadata count='+matches.length+' (expected one)');
  const tag=matches[0][0];
  if(!/\bcontent\s*=\s*["'][^"']*["']/i.test(tag)) throw Error(attr+' missing quoted content');
  const updated=tag.replace(/\bcontent\s*=\s*(?:"[^"]*"|'[^']*')/i,'content="'+value+'"');
  return html.slice(0,matches[0].index)+updated+html.slice(matches[0].index+tag.length);
}
export function transform(original, fields) {
  if(typeof original!=='string'||!original.includes('<html')||!original.includes('</html>')) throw Error('Not a complete HTML document');
  if(/<meta[^>]+(?:noindex|nofollow)/i.test(original)) throw Error('Public source unexpectedly noindexed');
  let next=original;
  const operations=[];
  for(const name of Object.keys(MAX)){
    const raw=fields[name];
    if(raw === undefined || raw === null || raw === '') continue;
    const value=safeText(name, raw);
    if(name==='seo_title') next=once(next,/<title\b[^>]*>[^<]*<\/title>/i,'<title>'+value+'</title>',name);
    else if(name==='seo_description') next=replaceMeta(next,'description',value);
    else if(name==='og_title') next=replaceMeta(next,'og:title',value);
    else if(name==='og_description') next=replaceMeta(next,'og:description',value);
    operations.push(name);
  }
  return {html:next, operations};
}
async function jsonGet(url, token) {
 const r=await fetch(url,{headers:{Accept:'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('CMS HTTP '+r.status);
 return await r.json();
}
async function approvedRows(token) {
 const out=[];
 for(let offset=0;offset<=10000;offset+=100){
  const url=new URL('/items/content',CMS);
  url.searchParams.set('fields','id,path,status,owner_approved_at,seo_title,seo_description,og_title,og_description');
  url.searchParams.set('limit','100');url.searchParams.set('offset',String(offset));
  const data=(await jsonGet(url,token)).data;
  if(!Array.isArray(data))throw Error('Malformed CMS response');
  out.push(...data);
  if(data.length<100)return out;
 }
 throw Error('CMS pagination limit');
}
async function main(){
 const token=process.env.DIRECTUS_STATIC_TOKEN;
 if(!token)throw Error('Missing read-only DIRECTUS_STATIC_TOKEN; refusing fixture fallback');
 const approved=(await approvedRows(token)).filter(r=>r.status==='published'&&r.owner_approved_at);
 const requested=(process.env.AEROVENTA_INCREMENTAL_PATHS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(requested.length===0)throw Error('AEROVENTA_INCREMENTAL_PATHS must explicitly specify paths');
 if(new Set(requested).size!==requested.length||requested.some(p=>!isPath(p)))throw Error('Invalid/duplicate release paths');
 const rows=new Map(approved.map(r=>[r.path,r]));
 if(requested.some(p=>!rows.has(p)))throw Error('One or more paths are not owner-approved in CMS; no output');
 const outRoot=path.resolve('release_out/incremental');
 await mkdir(outRoot,{recursive:true});
 const manifest={schema:'AEROVENTA_INCREMENTAL_CANDIDATE_V1',mode:'read-only-candidate',source:LIVE,generated_at:new Date().toISOString(),files:[]};
 for(const p of requested){
  const url=LIVE+p.slice(1);
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'text/html'}});
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))throw Error('Live baseline unavailable for '+p+': '+response.status);
  const original=await response.text();
  if(original.length>2e6)throw Error('Large HTML blocked');
  const {html,operations}=transform(original,rows.get(p));
  if(!operations.length)throw Error('No supported approved fields for '+p);
  if(html===original)throw Error('Approved values produce no differences on '+p);
  const rel=p==='/'?'index.html':p.slice(1)+'index.html';
  const dest=path.resolve(outRoot,rel);
  if(!dest.startsWith(outRoot+path.sep))throw Error('Unsafe output path');
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,html,'utf8');
  const back=path.resolve(outRoot,'__rollback__',rel);
  await mkdir(path.dirname(back),{recursive:true});
  await writeFile(back,original,'utf8');
  manifest.files.push({path:rel,fields:operations,baseline_sha256:sha(original),candidate_sha256:sha(html),bytes_before:Buffer.byteLength(original),bytes_after:Buffer.byteLength(html)});
 }
 await writeFile(path.resolve(outRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('INCREMENTAL_CANDIDATE_PASS changed='+manifest.files.length);
}
if(process.argv.includes('--self-test')){
 const src='<html><head><title>Old</title><meta name="description" content="Old desc"><meta property="og:title" content="Old"><meta property="og:description" content="Old"></head><body><h1><span>Untouched</span></h1></body></html>';
 const result=transform(src,{seo_title:'New & True',seo_description:'New description',og_title:'OG Title',og_description:'OG Description'});
 if(!result.html.includes('<title>New &amp; True</title>')||!result.html.includes('<h1><span>Untouched</span></h1>')||result.operations.length!==4)throw Error('Self-test failed');
 try{transform(src.replace('<meta name="description" content="Old desc">',''),{seo_description:'Oops'});throw Error('Expected fail-closed')}catch(e){if(e.message==='Expected fail-closed')throw e}
 console.log('INCREMENTAL_SELF_TEST_PASS');
}else{main().catch(e=>{console.error('INCREMENTAL_BLOCKED: '+e.message);process.exitCode=1});}
