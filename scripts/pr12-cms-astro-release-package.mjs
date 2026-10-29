#!/usr/bin/env node
/**
 * AEROVENTA integrated Astro CMS release candidate. READ-ONLY.
 * Only explicit, owner-approved paths may be packaged. The accepted Beget
 * website is authoritative; files from a different source build never replace
 * unrelated live pages. This is NOT a deployment routine.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://aeroventa.ru';
const CMS = 'https://cms.aeroventa.ru';
const dist = path.resolve('apps/web/dist');
const root = path.resolve('release_out/approved-astro');
const digest = data => createHash('sha256').update(data).digest('hex');
const requiredPaths = (process.env.AEROVENTA_INCREMENTAL_PATHS || '').split(',').map(x => x.trim()).filter(Boolean);
const pathOk = p => /^\/(?:[a-z0-9-]+\/)*$/.test(p) && p.length < 220;
const allDifferent = a => new Set(a).size === a.length;
const headers = { Accept: 'application/json', Authorization: 'Bearer ' + (process.env.DIRECTUS_STATIC_TOKEN || '') };

async function get(url, options={}) {
  const r=await fetch(url, {redirect:'error',signal:AbortSignal.timeout(25000),...options});
  if (!r.ok) throw Error('HTTP '+r.status+' '+new URL(url).pathname);
  return r;
}
async function cmsItem(p) {
 const url=new URL('/items/content',CMS);
 url.searchParams.set('fields','id,path,title,h1,content_type,status,owner_approved_at,robots_index,sitemap_include,knowledge_allowed,excerpt,body_html,body_html_safety_status,seo_title,seo_description');
 url.searchParams.set('filter[path][_eq]',p);
 url.searchParams.set('limit','2');
 const data=(await (await get(url,{headers})).json()).data;
 if(!Array.isArray(data)||data.length!==1)throw Error('CMS route missing or ambiguous: '+p);
 const item=data[0];
 if(item.status!=='published'||!item.owner_approved_at||item.robots_index!==true||item.sitemap_include===false)throw Error('Route not eligible for indexed public release: '+p);
 if(!item.h1?.trim()||!item.seo_title?.trim())throw Error('Required approved content fields absent: '+p);
 return item;
}
function validateHtml(html,p,item) {
 if(!/<html\b/i.test(html)||!/<\/html>/i.test(html)||!/<main\b/i.test(html))throw Error('Incomplete Astro output: '+p);
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1];
 if(!title||!title.trim())throw Error('Missing SEO title: '+p);
 const robots=(html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)||[])[0]||'';
 if(!robots||/\bnoindex\b/i.test(robots))throw Error('Released document is not indexable: '+p);
 if(/Implementation fixture|AEROVENTA DRAFT PREVIEW|data-aeroventa-preview/i.test(html))throw Error('Draft/fake content in released page: '+p);
 if(/<script\b[^>]*\bsrc=["']https?:\/\/cms\.aeroventa\.ru/i.test(html))throw Error('Live site must not depend on Directus runtime: '+p);
 if(item.content_type==='article'||item.content_type==='news'){
   if(!html.includes('<article') && !html.includes('article-page'))throw Error('Approved article lacks article template: '+p);
 }
}
async function generate() {
 if(!process.env.DIRECTUS_STATIC_TOKEN)throw Error('Missing read-only CMS token');
 if(requiredPaths.length===0 || requiredPaths.length>15 || !allDifferent(requiredPaths)||requiredPaths.some(p=>!pathOk(p)))throw Error('Explicit 1–15 normalized release paths required');
 const files=[]; await mkdir(root,{recursive:true});
 for(const p of requiredPaths){
   const item=await cmsItem(p);
   const rel=p==='/'?'index.html':p.slice(1)+'index.html';
   const proposed=await readFile(path.resolve(dist,rel));
   const html=proposed.toString('utf8');
   validateHtml(html,p,item);
   const liveUrl=new URL(p,SITE);
   const current=await fetch(liveUrl,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'text/html'}});
   if(current.status!==200 && current.status!==404)throw Error('Cannot safely compare public route '+p+': HTTP '+current.status);
   if(current.status===404 && !/^\/blog\/detail\/[a-z0-9-]+\/$/.test(p))throw Error('Only new article routes may be published: '+p);
   const existed=current.status===200;
   if(existed && !String(current.headers.get('content-type')||'').includes('text/html'))throw Error('Public baseline not HTML: '+p);
   if(!existed && (!['article','news'].includes(item.content_type) || !item.body_html || item.body_html_safety_status!=='reviewed_safe'))throw Error('New article needs reviewed, nonempty body before first release: '+p);
   const original=existed?Buffer.from(await current.arrayBuffer()):null;
   if(original?.equals(proposed))throw Error('No difference from currently accepted public page: '+p);
   // New article also needs a verified internal link and sitemap update before
   // production. The job refuses to package unlinked new pages as "complete".
   if(!existed)throw Error('New article lacks separately verified navigation+sitemap contract: '+p);
   const target=path.resolve(root,rel);
   if(!target.startsWith(root+path.sep))throw Error('Unsafe path');
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,proposed);
   const rollback=path.resolve(root,'__rollback__',rel);
   await mkdir(path.dirname(rollback),{recursive:true});await writeFile(rollback,original);
   files.push({path:rel,cms_id:item.id,cms_approved_at:item.owner_approved_at,sha256_before:digest(original),sha256_after:digest(proposed),bytes_before:original.length,bytes_after:proposed.length});
 }
 const manifest={format:'aeroventa-astro-selective-approved-release-v1',mode:'REVIEW_ONLY_NO_DEPLOY',source_sha:process.env.GITHUB_SHA||null,approved_paths:requiredPaths,files};
 await writeFile(path.resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('ASTRO_SELECTIVE_CANDIDATE_PASS files='+files.length+' paths='+requiredPaths.join(','));
}
if(process.argv.includes('--self-test')){
 if(!pathOk('/blog/detail/ntff-polisan/')||pathOk('/../etc/')||allDifferent(['a','a']))throw Error('Path gate failed');
 const str='<html><head><title>Test</title><meta name="robots" content="index,follow"></head><body><main><article class="article-page">abc</article></main></body></html>';
 validateHtml(str,'/blog/detail/example/',{content_type:'article'});
 try{validateHtml(str.replace('index,follow','noindex'),'/blog/detail/example/',{content_type:'article'});throw Error('Fail-closed gate missing');}catch(e){if(e.message==='Fail-closed gate missing')throw e}
 console.log('ASTRO_SELECTIVE_SELF_TEST_PASS');
} else {
 generate().catch(e=>{console.error('ASTRO_SELECTIVE_BLOCKED: '+e.message);process.exitCode=1;});
}
