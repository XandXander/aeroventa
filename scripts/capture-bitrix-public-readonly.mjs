#!/usr/bin/env node
// Source-only GET of the 29 public Bitrix HTML routes and the indexed PDF.
// This never modifies Bitrix or publishes recovered text. Two concurrent
// connections, 15s timeout; exact bytes + route-by-route parity evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const out='AEROVENTA_BITRIX_READONLY_RECOVERY';
const origin='https://aeroventa.ru';
const tlsBypass=process.env.AEROVENTA_BITRIX_PUBLIC_TLS_BYPASS==='PUBLIC_READONLY_EXPIRED_CERT';
const runCommand=promisify(execFile);
/** Strictly public, exact-origin HTTPS GET. Never transmit cookies/credentials.
 *  Expired-certificate curl fallback is explicitly flagged as UNVERIFIED_TLS
 *  forensic input, never trusted for automatic publishing. */
async function getPublic(url,kind='html',index=-1){
  if(!tlsBypass) return fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'AEROVENTA-ReadOnly-Content-Restoration/1.0','Accept':'text/html,application/pdf;q=0.9'}});
  const target=new URL(url);
  if(target.origin!==origin)throw new Error('EXTERNAL_SOURCE_DENIED');
  const fn=path.join(out,'raw','_transfer_'+(index<0?'probe':index)+'.tmp');
  const size=kind==='pdf'?10000000:kind==='image'?6500000:3000000;
  const args=['--silent','--show-error','--insecure','--proto','=https','--proto-redir','=https','--max-redirs','0','--connect-timeout','6','--max-time','16','--max-filesize',String(size),'--request','GET',
    '--header','Accept: text/html,application/pdf,image/*;q=0.8','--header','User-Agent: AEROVENTA-Public-Source-Evidence/1.0',
    '--output',fn,'--write-out','%{http_code}\\n%{content_type}\\n%{url_effective}',target.href];
  let stdout;
  try{({stdout}=await runCommand('curl',args,{timeout:20000,maxBuffer:2048}));}
  catch(error){await fs.rm(fn,{force:true}).catch(()=>{});throw new Error('PUBLIC_GET_'+String(error.message||error).slice(0,180))}
  const fields=stdout.trim().split('\n');
  const code=Number(fields[0]);
  const mime=fields[1]||'';
  const final=fields[2]||'';
  const bytes=await fs.readFile(fn);
  await fs.rm(fn,{force:true});
  if(!Number.isInteger(code)||final!==target.href)throw new Error('HTTP_ORIGIN_REDIRECT_DENIED');
  return {ok:code>=200&&code<300,status:code,url:final,headers:{get(name){return name.toLowerCase()==='content-type'?mime:null;}},arrayBuffer:async()=>bytes};
}
const routes=JSON.parse(await fs.readFile('migration/route-contract.json','utf8'));
const sourceIndex=JSON.parse(await fs.readFile('migration/legacy-page-source-index.json','utf8'));
const indexedPdf=JSON.parse(await fs.readFile('migration/indexed-pdf.json','utf8'));
const sourceMap=new Map(sourceIndex.map(x=>[x.path,x]));
const htmlRoutes=routes.filter(x=>Number(x.http_outcome)===200&&!x.path.startsWith('/upload/')).map(x=>x.path);
if(htmlRoutes.length!==29)throw Error('Unexpected retained HTML contract count '+htmlRoutes.length);
const urls=[...htmlRoutes.map(path=>({path,kind:'html'})),{path:indexedPdf.path,kind:'pdf'}];
await fs.mkdir(path.join(out,'raw'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const plain=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
const strip=s=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const tags=(s,k)=>Array.from(plain(s).matchAll(new RegExp('<'+k+'\\b[^>]*>([\\s\\S]*?)<\\/'+k+'>','gi')),m=>strip(m[1])).filter(Boolean);
const assets=s=>{
  const matches=[...s.matchAll(/(?:src|href)\s*=\s*"([^"]+\.(?:jpe?g|png|webp|gif|svg|pdf)(?:\?[^"]*)?)"/gi)];
  return [...new Set(matches.map(m=>{try{const u=new URL(m[1],origin);return u.origin===origin?u.pathname:null}catch{return null}}).filter(Boolean))];
};
const grab=async(item,i)=>{
  const {path:pagePath,kind}=item;
  const url=new URL(pagePath,origin);
  if(url.origin!==origin)throw Error('external URL forbidden');
  const rec={path:pagePath,kind,status:null,error:null,byte_count:0,sha256:null,old_manifest_sha256:sourceMap.get(pagePath)?.sha256||null,old_manifest_identical:null,raw_file:null,headings:[],media_paths:[],missing_original_headings:[],media_not_relinked:[]};
  try{
    const response=await getPublic(url,kind,i);
    rec.status=response.status;
    if(new URL(response.url).origin!==origin)throw Error('external redirect denied');
    if(!response.ok)throw Error('HTTP '+response.status);
    const mime=(response.headers.get('content-type')||'').toLowerCase();
    if(kind==='html'&&!mime.includes('text/html'))throw Error('unexpected mime '+mime);
    if(kind==='pdf'&&!mime.includes('pdf'))throw Error('unexpected mime '+mime);
    const body=Buffer.from(await response.arrayBuffer());
    if(body.length>(kind==='pdf'?10000000:3000000))throw Error('source exceeds size bound');
    const filename='raw/'+String(i).padStart(2,'0')+(kind==='pdf'?'.pdf':'.html');
    await fs.writeFile(path.join(out,filename),body);
    rec.raw_file=filename;rec.byte_count=body.length;rec.sha256=sha(body);
    if(rec.old_manifest_sha256)rec.old_manifest_identical=(rec.old_manifest_sha256===rec.sha256);
    if(kind==='html'){
      const old=body.toString('utf8');
      rec.title=tags(old,'title')[0]||null;
      rec.headings=[...tags(old,'h1'),...tags(old,'h2'),...tags(old,'h3')];
      rec.media_paths=assets(old);
      try{
        const dest='apps/web/dist'+(pagePath==='/'?'/index.html':pagePath+'index.html');
        const latest=await fs.readFile(dest,'utf8');
        const currentHeadings=new Set([...tags(latest,'h1'),...tags(latest,'h2'),...tags(latest,'h3')]);
        rec.missing_original_headings=rec.headings.filter(h=>!currentHeadings.has(h));
        rec.media_not_relinked=rec.media_paths.filter(m=>!latest.includes(m));
      }catch{rec.new_site_not_built=true}
    }
  }catch(e){rec.error=String(e.message||e).slice(0,300)}
  return rec;
};
// Bounded early host reachability probe. A GitHub runner may have no egress
// to Beget: stop after one failed GET instead of retrying all 30 routes.
try{
 const probe=await getPublic(origin+'/', 'html', -1);
 if(!probe.ok || new URL(probe.url).origin!==origin)throw Error('origin not safely reachable');
 await probe.arrayBuffer();
}catch(error){
 const record={status:'BLOCKED_ORIGIN_UNREACHABLE_FROM_GITHUB_RUNNER',expected:urls.length,retrieved:0,
  source:'https://aeroventa.ru',reason:String(error.message||error),routes:urls.map(x=>x.path),
  publication_status:'NOT_AUTHORIZED_FROM_FORENSIC_CAPTURE',tls_validation:tlsBypass?'UNVERIFIED_EXPIRED_CERT':'VERIFIED'};
 await fs.writeFile(path.join(out,'source_parity.json'),JSON.stringify(record,null,2));
 console.error('BITRIX_SOURCE_BLOCKED',record.status,record.reason);
 process.exit(2);
}
const results=Array(urls.length);let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<urls.length){const i=cursor++;results[i]=await grab(urls[i],i)}}));
// Preserve referenced /upload/ images alongside original article source, with
// bounded evidence capture. Never claim total media parity if the cap is hit.
const MAX_UPLOAD_MEDIA=120;
const MEDIA_WORKERS=4;
const sourceMedia=[...new Set(results.flatMap(x=>x.media_paths||[]))]
 .filter(p=>p.startsWith('/upload/') && !p.includes('..') && /\.(?:jpe?g|png|webp|gif|svg)$/i.test(p))
 .sort();
const mediaCandidates=sourceMedia.slice(0,MAX_UPLOAD_MEDIA);
const mediaResults=Array(mediaCandidates.length);
let mediaCursor=0;
await Promise.all(Array.from({length:MEDIA_WORKERS},async()=>{
 for(;;){
  const i=mediaCursor++;if(i>=mediaCandidates.length)break;
  const p=mediaCandidates[i],ext=path.posix.extname(p).toLowerCase();
  const outcome={path:p,status:null,bytes:0,sha256:null,raw_file:null,error:null};
  try{
   const response=await getPublic(new URL(p,origin),'image',1000+i);
   outcome.status=response.status;
   if(!response.ok)throw Error('HTTP_'+response.status);
   const body=Buffer.from(await response.arrayBuffer());
   if(body.length>6500000 || body.length<32)throw Error('invalid_media_size');
   const mime=(response.headers.get('content-type')||'').toLowerCase();
   if(!mime.includes('image')&&!mime.includes('octet-stream'))throw Error('not_image_'+mime);
   const save='raw/media_'+String(i).padStart(3,'0')+ext;
   await fs.writeFile(path.join(out,save),body);
   outcome.raw_file=save;outcome.bytes=body.length;outcome.sha256=sha(body);
  }catch(err){outcome.error=String(err.message||err).slice(0,240)}
  mediaResults[i]=outcome;
 }
}));
const manifest={
  scope:'READ_ONLY public Bitrix source 2026-10-15, not sealed August backup',
  captured_at:new Date().toISOString(),expected:urls.length,
  retrieved:results.filter(x=>x.raw_file).length,
  tls_validation:tlsBypass?'UNVERIFIED_EXPIRED_CERT':'VERIFIED',
  transport:'PUBLIC_READONLY_NO_CREDENTIALS',
  failed:results.filter(x=>x.error).map(x=>({path:x.path,status:x.status,error:x.error})),
  unchanged_since_august:results.filter(x=>x.old_manifest_identical===true).length,
  old_headings_missing_in_candidate:results.reduce((n,x)=>n+x.missing_original_headings.length,0),
  media_not_relinked:results.reduce((n,x)=>n+x.media_not_relinked.length,0),
  legacy_media_total_discovered:sourceMedia.length,
  legacy_media_cap:MAX_UPLOAD_MEDIA,
  legacy_media_captured:mediaResults.filter(x=>x.raw_file).length,
  legacy_media_uncaptured:sourceMedia.length-mediaResults.filter(x=>x.raw_file).length,
  media_results:mediaResults,
  publication_status:'NOT_AUTHORIZED_FROM_FORENSIC_CAPTURE',
  results
};
await fs.writeFile(path.join(out,'source_parity.json'),JSON.stringify(manifest,null,2));
console.log('BITRIX_READONLY',JSON.stringify({retrieved:manifest.retrieved,expected:manifest.expected,failures:manifest.failed,missing_headings:manifest.old_headings_missing_in_candidate,unlinked_media:manifest.media_not_relinked,media_captured:manifest.legacy_media_captured,media_expected:manifest.legacy_media_total_discovered,tls_validation:manifest.tls_validation}));

if(manifest.retrieved!==manifest.expected||manifest.legacy_media_uncaptured){console.error('BITRIX_SOURCE_INCOMPLETE',manifest.retrieved,manifest.expected);process.exitCode=2;}
