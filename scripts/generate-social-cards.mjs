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
 ['services','evidence/hero/project-not-ready-owner-concept-1672.webp','Монтаж вентиляции'],
 ['ventilation','evidence/hero/hiend-engineering-visual-owner-v43.webp','Монтаж вентиляции'],
 ['portfolio','evidence/residential/neva/IMG_7571.JPG','Реальные объекты'],
 ['about','evidence/team/owner-team-group-20261015.webp','Команда AEROVENTA'],
 ['project','evidence/polisan/archive/20180601-133720.webp','Работа по проекту'],
 ['polisan','evidence/polisan/owner-cover-v43.webp','НТФФ «Полисан»'],
 ['sevenpark','evidence/7park/object-exterior-day.jpg','7 PARK'],
 ['leont','evidence/leont/owner-cover-v43.webp','Леонтьевский Мыс'],
 ['ponsse','evidence/karelia/owner-cover-v43.webp','PONSSE'],
 ['zhukov','evidence/zhukov/owner-cover-v43.webp','Маршала Жукова'],
 ['cafe','evidence/cafe/owner-interior-v43.webp','Кафе на Римского-Корсакова'],
 ['akvilon','evidence/owner-portfolio/akvilon-yanino/cover.webp','ЖК «Аквилон» · Янино'],
 ['neva','evidence/residential/neva/IMG_7571.JPG','На излучине Невы'],
 ['discovery','evidence/owner-portfolio/apart-hotel/cover.webp','До готового проекта'],
 ['articles','evidence/polisan/owner-cover-v43.webp','Монтаж вентиляции · практика и объекты'],
 ['apart','evidence/owner-portfolio/apart-hotel/cover.webp','Апарт-отель на Бумажном'],
 ['eurospar-vo','evidence/owner-portfolio/eurospar-vo/cover.webp','EUROSPAR · Васильевский остров'],
 ['eurospar-sestroretsk','evidence/owner-portfolio/eurospar-sestroretsk/03.webp','EUROSPAR · Сестрорецк'],
 ['college','evidence/owner-portfolio/college-obvodny/gallery-09.webp','Колледж туризма'],
 ['novatech','evidence/owner-portfolio/novatech/03.webp','Новатех'],
 ['himprom','evidence/owner-portfolio/himprom/03.webp','Химпром'],
 ['warehouses','evidence/warehouses/avers-razbegaevo/03.webp','Вентиляция складов'],
 ['drill-core','upload/medialibrary/548/5488fb415056eee52ac63ff9d4850c63.jpg','Застрявшая алмазная коронка'],
 ['drill-screed','upload/medialibrary/0a2/0a2f0d1be2900e0a1fe74bcd9604e3f8.jpg','Бурение в стяжке'],
 ['drill-cost','upload/medialibrary/fb3/fb3d693282a8085971dd4e2fe87bf28e.jpg','Стоимость алмазного бурения'],
 ['drill-wall','upload/medialibrary/e1c/e1cd51110183f9c6b2e704b70664eba1.jpg','Проходка под вентиляцию']
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
