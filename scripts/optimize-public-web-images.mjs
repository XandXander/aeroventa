// Post-Astro static image delivery layer. Original files remain byte-identical.
// Bounds CPU concurrency; no network access, dynamic imports or external writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../apps/web/dist');
const target=path.join(root,'media','responsive');
const WIDTHS=[480,960,1440,1920];
const QUALITY=84;
async function walk(dir){
 const entries=await fs.readdir(dir,{withFileTypes:true});
 const nested=await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]));
 return nested.flat();
}
const names=await walk(root);
const originals=names.filter(file=>/\.(?:png|jpe?g|webp|avif)$/i.test(file) && !file.includes('/media/responsive/'));
await fs.mkdir(target,{recursive:true});
const variants=new Map(), audit=[];
const tasks=[...originals];
async function worker(){
 while(tasks.length){
  const abs=tasks.shift(), rel=path.relative(root,abs).split(path.sep).join('/'), url='/'+rel;
  const buffer=await fs.readFile(abs), m=await sharp(buffer,{failOn:'error',limitInputPixels:100_000_000}).metadata();
  if(!m.width||!m.height){audit.push({asset:url,result:'UNSUPPORTED_DIMENSIONS'});continue;}
  const outputs=[];
  for(const w of WIDTHS.filter(v=>v<m.width)){
   const suffix=crypto.createHash('sha256').update(rel).digest('hex').slice(0,16)+'-'+w+'.webp';
   const out=path.join(target,suffix);
   const b=await sharp(buffer,{limitInputPixels:100_000_000}).rotate().resize({width:w,withoutEnlargement:true}).webp({quality:QUALITY,effort:4}).toBuffer();
   if(b.length<buffer.length*0.94){await fs.writeFile(out,b);outputs.push({width:w,url:'/media/responsive/'+suffix,bytes:b.length});}
  }
  if(outputs.length)variants.set(url,outputs);
  audit.push({asset:url,source_width:m.width,source_height:m.height,source_bytes:buffer.length,variants:outputs,result:outputs.length?'OPTIMIZED':'KEEP_ORIGINAL'});
 }
}
await Promise.all(Array.from({length:3},()=>worker()));
let updated=0,images=0;
for(const file of names.filter(x=>x.endsWith('.html'))){
 let html=await fs.readFile(file,'utf8');
 html=html.replace(/<img\b[^>]*>/gi,tag=>{
  images++;
  if(/\bsrcset=/.test(tag))return tag;
  const match=tag.match(/\bsrc=(["'])(\/[^"']+)\1/i);
  if(!match)return tag;
  const src=match[2].split('?')[0],choices=variants.get(src);
  if(!choices?.length)return tag;
  const sets=[...choices.map(v=>v.url+' '+v.width+'w')].join(', ');
  const hero=/\b(?:fetchpriority=["']high["']|class=["'][^"']*(?:hero|cover)[^"']*["'])/i.test(tag);
  const sizes=hero?'100vw':'(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 40vw';
  updated++;
  return tag.slice(0,-1)+' srcset="'+sets+'" sizes="'+sizes+'">';
 });
 await fs.writeFile(file,html);
}
audit.sort((a,b)=>a.asset.localeCompare(b.asset));
const report={source_count:originals.length,html_images:images,images_with_new_srcset:updated,optimized_source_count:variants.size,source_total_bytes:audit.reduce((n,v)=>n+(v.source_bytes||0),0),variants_total_bytes:audit.reduce((n,v)=>n+(v.variants||[]).reduce((s,x)=>s+x.bytes,0),0),items:audit};
await fs.writeFile(path.join(root,'WEB_IMAGE_DELIVERY_AUDIT.json'),JSON.stringify(report,null,2));
console.log('WEB_IMAGE_DELIVERY',JSON.stringify({...report,items:undefined}));
