#!/usr/bin/env node
// Source-only GET of the 29 public Bitrix HTML routes and the indexed PDF.
// This never modifies Bitrix or publishes recovered text. Two concurrent
// connections, 15s timeout; exact bytes + route-by-route parity evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out='AEROVENTA_BITRIX_READONLY_RECOVERY';
const origin='https://aeroventa.ru';
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
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'AEROVENTA-ReadOnly-Content-Restoration/1.0','Accept':'text/html,application/pdf;q=0.9'}});
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
const results=Array(urls.length);let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<urls.length){const i=cursor++;results[i]=await grab(urls[i],i)}}));
const manifest={
  scope:'READ_ONLY public Bitrix source 2026-10-15, not sealed August backup',
  captured_at:new Date().toISOString(),expected:urls.length,
  retrieved:results.filter(x=>x.raw_file).length,
  failed:results.filter(x=>x.error).map(x=>({path:x.path,status:x.status,error:x.error})),
  unchanged_since_august:results.filter(x=>x.old_manifest_identical===true).length,
  old_headings_missing_in_candidate:results.reduce((n,x)=>n+x.missing_original_headings.length,0),
  media_not_relinked:results.reduce((n,x)=>n+x.media_not_relinked.length,0),
  publication_status:'NOT_AUTHORIZED_FROM_FORENSIC_CAPTURE',
  results
};
await fs.writeFile(path.join(out,'source_parity.json'),JSON.stringify(manifest,null,2));
console.log('BITRIX_READONLY',JSON.stringify({retrieved:manifest.retrieved,expected:manifest.expected,failures:manifest.failed,missing_headings:manifest.old_headings_missing_in_candidate,unlinked_media:manifest.media_not_relinked}));
