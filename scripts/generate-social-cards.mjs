// Deterministic 1200×630 previews for public sharing.
// Source photos remain the approved originals; output is generated, not committed.
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root,'apps/web/public');
const outputRoot = path.join(publicRoot,'share');
const cards = [
 ['home','evidence/hero/owner-luxury-airflow-20261010.png','Инженерный комфорт'],
 ['services','evidence/hero/services-owner-editorial-1774.webp','Монтаж вентиляции'],
 ['ventilation','evidence/polisan/archive/20180601-133711.webp','Монтаж вентиляции'],
 ['portfolio','evidence/leont/owner-cover-v43.webp','Реальные объекты'],
 ['about','evidence/team/owner-team-group-20261015.webp','Команда AEROVENTA'],
 ['project','evidence/polisan/archive/20180601-133720.webp','Работа по проекту'],
 ['polisan','evidence/polisan/archive/20180601-133711.webp','НТФФ Полисан'],
 ['sevenpark','evidence/7park/object-exterior-day.jpg','7 PARK'],
 ['leont','evidence/leont/owner-cover-v43.webp','Леонтьевский Мыс'],
 ['ponsse','evidence/karelia/owner-cover-v43.webp','PONSSE'],
 ['zhukov','evidence/zhukov/owner-cover-v43.webp','Маршала Жукова'],
 ['cafe','evidence/cafe/owner-interior-v43.webp','Кафе на Римского-Корсакова'],
 ['neva','evidence/residential/owner-neva-facade-20261016.jpg','На излучине Невы']
];
const xmlEscape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
await mkdir(outputRoot,{recursive:true});
for (const [key,src,title] of cards){
 const filename=path.join(publicRoot,src);
 const m=await sharp(filename).metadata();
 if (!m.width||!m.height) throw new Error('Social source invalid: '+src);
 let canvas;
 if(m.width<850||m.height<500){
   const image=await sharp(filename).rotate().resize({width:950,height:460,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   const info=await sharp(image).metadata();
   const background=sharp({create:{width:1200,height:630,channels:3,background:'#e7edef'}});
   canvas=await background.composite([{input:image,left:Math.floor((1200-info.width)/2),top:Math.floor((570-info.height)/2)}]).png().toBuffer();
 } else {
   canvas=await sharp(filename).rotate().resize(1200,630,{fit:'cover',position:sharp.strategy.attention}).png().toBuffer();
 }
 const overlay=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
 <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081b28" stop-opacity="0"/><stop offset=".45" stop-color="#081b28" stop-opacity=".20"/><stop offset="1" stop-color="#081b28" stop-opacity=".88"/></linearGradient></defs>
 <rect width="1200" height="630" fill="url(#shade)"/>
 <text x="54" y="518" fill="#fff" font-family="Arial,DejaVu Sans,sans-serif" font-weight="600" font-size="22" letter-spacing="3">AEROVENTA</text>
 <text x="54" y="578" fill="#fff" font-family="Arial,DejaVu Sans,sans-serif" font-weight="600" font-size="40">${xmlEscape(title)}</text>
 </svg>`;
 const output=path.join(outputRoot,key+'.jpg');
 await sharp(canvas).composite([{input:Buffer.from(overlay)}]).jpeg({quality:86,mozjpeg:true}).toFile(output);
 const size=(await stat(output)).size;
 if(size<12000||size>1900000)throw new Error('Social card invalid size: '+key+' '+size);
 console.log('SHARE_CARD_READY '+key+' 1200x630 bytes='+size);
}
