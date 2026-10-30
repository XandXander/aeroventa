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
 url.searchParams.set('fields','id,path,title,h1,content_type,status,owner_approved_at,robots_index,sitemap_include,knowledge_allowed,excerpt,body_html,body_html_safety_status,seo_title,seo_description,hero_file,body_blocks.block_id.id,body_blocks.block_id.block_type,body_blocks.block_id.fact_checked');
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
   if (original) {
     // Release may update copy/SEO; never silently substitute a different
     // site template or change existing scripts/photos/navigation by mistake.
     const signature = text => (text.match(/<[/]?[a-z][a-z0-9-]*(?=[\s/>])/gi)||[]).join('|').toLowerCase();
     const resources = text => [...text.matchAll(/<(?:img|script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]).join('|');
     const managed=Boolean(item.hero_file) || (Array.isArray(item.body_blocks) && item.body_blocks.length>0);
     if (managed && item.body_blocks.some(b=>b.block_id?.fact_checked!==true))
       throw Error('Managed CMS block has not been fact-checked: '+p);
     const essential=text=>[...text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]).join('|');
     if (essential(original.toString('utf8')) !== essential(html))
       throw Error('Scripts/styles changed unexpectedly: '+p);
     if (!managed && signature(original.toString('utf8')) !== signature(html))
       throw Error('Accepted live DOM structure differs from Astro candidate: '+p);
     const oldImages=[...original.toString('utf8').matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
     const newImages=[...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
     for (const ref of newImages) {
       if (!oldImages.includes(ref) && !/^\/cms-media\/[a-f0-9]{64}\.(?:png|jpe?g|webp|avif)$/.test(ref))
         throw Error('Changed image not in immutable CMS media namespace: '+p);
     }
     if (!managed && resources(original.toString('utf8')) !== resources(html))
       throw Error('Resource drift outside managed CMS blocks: '+p);
   }
   if(original?.equals(proposed))throw Error('No difference from currently accepted public page: '+p);
   // A new article cannot be silently orphaned. The same approved change
   // batch must include /blog/ with a visible HTML link to the new URL.
   if(!existed && !requiredPaths.includes('/blog/'))
     throw Error('New article requires approved /blog/ update in the same release: '+p);
   const target=path.resolve(root,rel);
   if(!target.startsWith(root+path.sep))throw Error('Unsafe path');
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,proposed);
   const rollback=path.resolve(root,'__rollback__',rel);
   await mkdir(path.dirname(rollback),{recursive:true});
   await writeFile(rollback,original||Buffer.alloc(0));
   const before=original||Buffer.alloc(0);
   files.push({path:rel,cms_id:item.id,cms_approved_at:item.owner_approved_at,is_new:!existed,
     sha256_before:digest(before),sha256_after:digest(proposed),
     bytes_before:before.length,bytes_after:proposed.length});
 }
 // New articles must appear in both the selected linked blog page and
 // the accepted production sitemap; never overwrite with incremental sitemap.
 const newlyCreated=files.filter(f=>f.is_new===true);
 if(newlyCreated.length){
   const blog=await readFile(path.resolve(root,'blog/index.html'),'utf8');
   for(const row of newlyCreated){
     const route='/'+row.path.slice(0,-'index.html'.length);
     if(!blog.includes('href="'+route+'"') && !blog.includes("href='"+route+"'"))
       throw Error('Updated /blog/ must link to new article: '+route);
   }
   const sitemapRequest=await fetch(new URL('/sitemap.xml',SITE),{
     redirect:'error',headers:{Accept:'application/xml'},
     signal:AbortSignal.timeout(25000)});
   if(sitemapRequest.status!==200)throw Error('Current sitemap is not HTTP 200');
   const sitemapBefore=Buffer.from(await sitemapRequest.arrayBuffer());
   if(sitemapBefore.length<30||sitemapBefore.length>2000000)throw Error('Unsafe sitemap length');
   const originalXml=sitemapBefore.toString('utf8');
   if(!originalXml.includes('<urlset')||
      !originalXml.includes('www.sitemaps.org/schemas/sitemap/0.9')||
      !originalXml.trimEnd().endsWith('</urlset>'))
       throw Error('Public sitemap XML is not a recognized sitemap urlset');
   let addition='';
   for(const row of newlyCreated){
     const route='/'+row.path.slice(0,-'index.html'.length);
     const url=new URL(route,SITE).toString();
     if(originalXml.includes('<loc>'+url+'</loc>'))
       throw Error('New article already indexed in sitemap: '+url);
     addition+='<url><loc>'+url+'</loc></url>\n';
   }
   const closing=originalXml.lastIndexOf('</urlset>');
   const updatedXml=originalXml.slice(0,closing)+addition+originalXml.slice(closing);
   const after=Buffer.from(updatedXml,'utf8');
   await writeFile(path.resolve(root,'sitemap.xml'),after);
   await mkdir(path.resolve(root,'__rollback__'),{recursive:true});
   await writeFile(path.resolve(root,'__rollback__/sitemap.xml'),sitemapBefore);
   files.push({path:'sitemap.xml',is_sitemap:true,
     sha256_before:digest(sitemapBefore),sha256_after:digest(after),
     bytes_before:sitemapBefore.length,bytes_after:after.length});
 }
 const mediaSource=JSON.parse(await readFile(path.resolve(root,'media-registry.json'),'utf8'));
 if(mediaSource.format!=='AEROVENTA_CMS_MEDIA_REGISTRY_V1'||mediaSource.source_sha!==process.env.GITHUB_SHA)
   throw Error('Untrusted media manifest');
 const media=[];
 const emittedHtml=(await Promise.all(files.map(f=>readFile(path.resolve(root,f.path),'utf8')))).join('\n');
 for(const file of Object.values(mediaSource.files||{})){
   if(!emittedHtml.includes(file.path))continue;
   const rel=file.path.replace(/^\//,'');
   if(!/^cms-media\/[a-f0-9]{64}\.(?:png|jpe?g|webp|avif)$/.test(rel))throw Error('Unsafe media pathname');
   const bytes=await readFile(path.resolve(dist,rel));
   if(digest(bytes)!==file.sha256||bytes.length!==file.bytes||!rel.includes(file.sha256))
     throw Error('Media file drift at '+rel);
   const target=path.resolve(root,rel);
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
   if(!media.some(m=>m.path===rel))media.push({path:rel,sha256_after:file.sha256,bytes_after:file.bytes});
   // Astro's responsive optimizer adds image-set URLs. Deliver exactly the
   // derivatives of the new SHA-addressed source, never orphan srcset URLs.
   const delivery=JSON.parse(await readFile(path.resolve('reports/WEB_IMAGE_DELIVERY_AUDIT.json'),'utf8'));
   const image=delivery.items.find(entry=>entry.asset===file.path);
   for(const variant of image?.variants||[]){
     if(!emittedHtml.includes(variant.url))continue;
     const derived=variant.url.replace(/^\//,'');
     if(!/^media\/responsive\/[a-f0-9]{16}-[0-9]{3,4}\.webp$/.test(derived))throw Error('Unsafe responsive media path');
     const payload=await readFile(path.resolve(dist,derived));
     if(payload.length<100||payload.length>18*1024*1024)throw Error('Oversized responsive media');
     const target2=path.resolve(root,derived);
     await mkdir(path.dirname(target2),{recursive:true});await writeFile(target2,payload);
     if(!media.some(m=>m.path===derived))media.push({path:derived,sha256_after:digest(payload),bytes_after:payload.length});
   }
 }
 const referenced=[...new Set([...emittedHtml.matchAll(/\/cms-media\/[a-f0-9]{64}\.(?:png|jpe?g|webp|avif)/g)].map(m=>m[0].slice(1)))];
 if(referenced.some(p=>!media.some(m=>m.path===p)))throw Error('Missing CMS media dependency');
 const manifest={format:'aeroventa-astro-selective-approved-release-v1',mode:'REVIEW_ONLY_NO_DEPLOY',source_sha:process.env.GITHUB_SHA||null,approved_paths:requiredPaths,files,media};
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
