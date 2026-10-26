// One build-only delivery for existing PR12. No deployment or external service calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';
const root=process.cwd(),dist=path.join(root,'apps/web/dist');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!==process.env.REVIEW_SHA||!/^[a-f0-9]{40}$/.test(sha))throw Error('Exact checkout/source binding failed');
const out=path.join(root,'PR12_FINAL_DELIVERY');await fs.mkdir(out,{recursive:true});
const readJSON=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const python="from pathlib import Path\nimport sys,json,hashlib,zipfile\ndist=Path(sys.argv[1]);out=Path(sys.argv[2]);sha=sys.argv[3]\nfiles=[]\nfor f in sorted(dist.rglob('*')):\n if not f.is_file():continue\n assert not f.is_symlink(),str(f)\n rel=f.relative_to(dist).as_posix()\n if any(p in {'.htaccess','.htpasswd','.git','node_modules'} or p.startswith('.env') for p in f.relative_to(dist).parts):continue\n if f.suffix.lower() in {'.md','.csv','.log','.zip','.dpapi','.ts','.astro','.yaml','.yml'}:continue\n assert not rel.startswith(('cache/','docs/','scripts/'))\n b=f.read_bytes()\n if f.suffix=='.html' and 'http-equiv=\"refresh\"' not in b.decode('utf8'):\n  if rel!='404.html':assert 'name=\"aeroventa:source\" content=\"'+sha+'\"' in b.decode('utf8'),rel\n  assert 'name=\"robots\" content=\"noindex' in b.decode('utf8'),rel\n files.append({'path':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})\nassert (dist/'robots.txt').read_text()=='User-agent: *\\nDisallow: /\\n'\nmarker=json.dumps({'source_sha':sha,'mode':'fixture-staging-only','release':'HOLD','installed_staging_sha':'NOT_ASSERTED'},indent=2).encode()\nfiles.append({'path':'aeroventa-build.json','bytes':len(marker),'sha256':hashlib.sha256(marker).hexdigest()})\nwith zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for item in files:\n  b=marker if item['path']=='aeroventa-build.json' else (dist/item['path']).read_bytes()\n  info=zipfile.ZipInfo(item['path'],date_time=(2026,10,24,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16\n  z.writestr(info,b)\nwith zipfile.ZipFile(out) as z:\n assert z.testzip() is None\n assert len(z.namelist())==len(files) and 'index.html' in z.namelist() and '404.html' in z.namelist()\n assert '.htaccess' not in z.namelist()\n for item in files:\n  b=z.read(item['path']);assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256'],item['path']\nprint(json.dumps({'files':files,'zip_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'zip_bytes':out.stat().st_size,'crc':'PASS','reextracted_payload_hashes':'PASS','preserve_existing_staging_auth':True}))\n";

if(process.env.PR12_REVIEW_SCOPE==='covers'){
 const qa=await readJSON('PR12_COVER_QA/report.json');
 if(qa.source_sha!==sha||qa.source_dirty.length||qa.issues.length||qa.checks.some(c=>!c.pass)||qa.link_media.length!==50||qa.orphans.length||qa.interactions.length!==4||qa.interactions.some(x=>!x.first_click||!x.focus_return))throw Error('Focused Owner cover/link/media regression failed');
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const base='871d74a760a052eecf77c34707406e50ed1a327e';
 const diffName='AEROVENTA_SOURCE_DIFF_871d74a7_'+sha.slice(0,8)+'.patch';
 const exactDiff=execFileSync('git',['diff','--binary',base,sha],{maxBuffer:16*1024*1024});
 await fs.writeFile(path.join(out,diffName),exactDiff);
 const zipName='AEROVENTA_PR12_STAGING_'+sha.slice(0,8)+'.zip';
 const sealed=JSON.parse(execFileSync('python3',['-c',python,dist,path.join(out,zipName),sha],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const proofFiles=[];
 const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 for(const width of[1440,390]){
  const list=qa.proof_frames.filter(f=>f.width===width),cellWidth=width===390?390:600,columns=width===390?3:2,cellHeight=520;
  const overlays=[];
  for(let i=0;i<list.length;i++){
   const frame=list[i],bytes=await fs.readFile(path.join('PR12_COVER_QA',frame.screenshot));
   const photo=await sharp(bytes).resize({width:cellWidth-24,height:cellHeight-70,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer(),info=await sharp(photo).metadata();
   const x=(i%columns)*cellWidth,y=Math.floor(i/columns)*cellHeight;
   overlays.push({input:photo,left:x+Math.floor((cellWidth-info.width)/2),top:y+54});
   const label=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+cellWidth+'" height="48"><text x="12" y="20" font-family="Arial,DejaVu Sans,sans-serif" font-size="16" fill="#193945">'+xml(frame.label)+'</text><text x="12" y="40" font-family="Arial,DejaVu Sans,sans-serif" font-size="12" fill="#536f7a">'+xml(frame.route)+' · '+width+'px</text></svg>');
   overlays.push({input:label,left:x,top:y});
  }
  const name='AEROVENTA_COVERS_'+(width===390?'MOBILE_':'DESKTOP_')+sha.slice(0,8)+'.jpg';
  const bytes=await sharp({create:{width:cellWidth*columns,height:cellHeight*Math.ceil(list.length/columns),channels:3,background:'#edf1ef'}}).composite(overlays).jpeg({quality:88,mozjpeg:true}).toBuffer();
  await fs.writeFile(path.join(out,name),bytes);proofFiles.push({name,bytes:bytes.length,sha256:digest(bytes),actual_frames:list.length,viewport_width:width});
 }
 const reportName='AEROVENTA_COVER_QA_'+sha.slice(0,8)+'.json';const reportBytes=Buffer.from(JSON.stringify(qa,null,2));await fs.writeFile(path.join(out,reportName),reportBytes);
 const manifest={source_sha:sha,source_tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),continuation_base:base,pr:'https://github.com/XandXander/aeroventa/pull/12',scope:'Owner object-cover, selection heading, nonduplication and relevant HTML links only',mode:'fixture-staging-only',verdict:'OWNER ARTISTIC ACCEPTANCE PENDING — PRODUCTION HOLD',remaining_requested_defects:'ZERO; truthful Himprom interior retained as the explicitly permitted no-exterior exception',zip_name:zipName,...sealed,source_diff:{name:diffName,bytes:exactDiff.length,sha256:digest(exactDiff)},qa:{routes:qa.link_media.length,affected_frames:qa.pages.length,proof_frames:qa.proof_frames.length,warehouse_gallery_interactions:qa.interactions.length,issues:qa.issues.length,orphans:qa.orphans,report:{name:reportName,bytes:reportBytes.length,sha256:digest(reportBytes)}},visual:proofFiles,cover_exceptions:qa.cover_exceptions,source_check:'PR12 exact source; Knowledge7b81b78a491000d65ed3c59a7b62fc3f2a1291a7; current direct Owner correction governs',knowledge_writeback:'NOT NEEDED — Owner acceptance pending.',boundaries:['No staging or production deployment; no hosting/auth/config changes','Fixture build; real backend delivery, public crawler/Telegram and installed staging SHA remain unproven','Original media and legacy routes retained; all payload hashes and ZIP CRC rechecked']};
 await fs.writeFile(path.join(out,'AEROVENTA_MANIFEST_'+sha.slice(0,8)+'.json'),JSON.stringify(manifest,null,2));
 console.log('AV_FINAL_DELIVERY '+JSON.stringify({source_sha:sha,zip_name:zipName,zip_sha256:sealed.zip_sha256,zip_bytes:sealed.zip_bytes,runtime_files:sealed.files.length,crc:sealed.crc,scope:'covers',routes:qa.link_media.length,issues:qa.issues.length,source_diff_sha256:digest(exactDiff)}));
 process.exit(0);
}
const qa=await readJSON('PR12_EXACT_QA/report.json'),surfaces=await readJSON('PR12_EXACT_SURFACES/report.json');
for(const r of[qa,surfaces])if(r.source_sha!==sha||r.issues.length||r.source_dirty.length||r.checks.some(c=>!c.pass))throw Error('Exact-source QA is not clear');
if((await readJSON('V43_OWNER_BROWSER_REVIEW/manifest.json')).fail.length)throw Error('Media/interaction regression failed');
const sitewide=await readJSON('PR12_SYSTEMIC_QA/sitewide.json');
if(sitewide.head!==sha||sitewide.issues.length)throw Error('Physical route/interaction regression failed');
const owner=await readJSON('PR12_OWNER_CONTRACT/report.json');
if(owner.source_sha!==sha||owner.issues.length||owner.source_dirty.length||owner.checks.some(c=>!c.pass))throw Error('Latest explicit Owner contract is not clear');
const coverage=await readJSON('docs/recovery/owner-coverage-candidate.json');
const digest=b=>createHash('sha256').update(b).digest('hex'),frames=[],beforeFrames=[];
for(const p of qa.pages){
 const b=await fs.readFile(path.join('PR12_EXACT_QA',p.screenshot)),m=await sharp(b).metadata();
 const h=await fs.readFile(path.join(dist,p.route.replace(/^\//,''),'index.html'),'utf8');
 if(!h.includes('name="aeroventa:source" content="'+sha+'"'))throw Error('Page marker mismatch '+p.route);
 frames.push({route:p.route,width:p.width,viewportHeight:p.height,imageWidth:m.width,imageHeight:m.height,source_sha:sha,title:p.h1[0],image:'data:image/jpeg;base64,'+b.toString('base64'),sha256:digest(b)});
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.pdf':'application/pdf','.json':'application/json'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
async function capture(directory,version,routes,target){
 const server=http.createServer(async(req,res)=>{
  try{
   let f=path.resolve(directory,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
   if(f!==directory&&!f.startsWith(directory+path.sep))throw Error('Invalid path');
   if((await fs.stat(f)).isDirectory())f=path.join(f,'index.html');
   res.writeHead(200,{'Content-Type':mime[path.extname(f).toLowerCase()]||'application/octet-stream'}).end(await fs.readFile(f));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const[width,height]of[[1440,900],[390,844]]){
   const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
   await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   const p=await c.newPage();
   try{for(const route of routes){
    let f=path.join(directory,route.replace(/^\//,''));if(route.endsWith('/'))f=path.join(f,'index.html');
    if(!await fs.access(f).then(()=>true).catch(()=>false))continue;
    const res=await p.goto(origin+route,{waitUntil:'load',timeout:30000});if(res.status()!==200)continue;
    if(route!=='/404.html'&&await p.locator('meta[name="aeroventa:source"],meta[name="aeroventa-source-sha"]').getAttribute('content')!==version)throw Error('Capture SHA mismatch '+route);
    await p.evaluate(async()=>{await document.fonts.ready;for(const i of document.images)i.loading='eager';await Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const b=await p.screenshot({fullPage:true,type:'jpeg',quality:82,timeout:30000}),m=await sharp(b).metadata();
    target.push({route,width,viewportHeight:height,imageWidth:m.width,imageHeight:m.height,source_sha:version,title:await p.locator('main h1,h1').first().innerText(),image:'data:image/jpeg;base64,'+b.toString('base64'),sha256:digest(b)});
   }}finally{await c.close();}
  }
 }finally{await new Promise(r=>server.close(r));}
}
await capture(dist,sha,['/404.html'],frames);
if(frames.length!==100||new Set(frames.map(f=>f.route+'|'+f.width)).size!==100)throw Error('Fifty complete desktop/mobile pairs required');
const compare=['/','/services/','/montazh-ventiliacii/','/montazh-po-proektu/','/obekt-bez-gotovogo-proekta/','/portfolio/','/about/','/blog/','/blog/istorii-proektov/','/blog/poleznye-stati/','/contact/','/faq/','/obekty/','/obekty/kvartiry-i-doma/','/blog/detail/restoran-v-zhk-leontevskiy-mys/','/blog/detail/kafe-rimskogo-korsakova-3/','/portfolio/obekt/akvilon-yanino/','/portfolio/obekt/na-izluchine-nevy/','/news/istoriya-kompanii/','/covid-pritochnaya-ventilacia/','/obekty/magaziny-i-sklady/','/obekty/ofisy-i-kommercheskie-pomeshcheniya/'];
try{
 for(const version of['e4f1e8b5053e866e7485ff46d0220c17c982b0a5']){
  const dir=path.join(process.env.RUNNER_TEMP,'art-before-'+version.slice(0,8));
  execFileSync('git',['worktree','add','--detach',dir,version],{stdio:'inherit'});
  await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
  execFileSync('npm',['run','build:web'],{cwd:dir,stdio:'inherit',env:{...process.env,AEROVENTA_RELEASE_MODE:'fixture',AEROVENTA_SOURCE_SHA:version,PUBLIC_SOCIAL_ORIGIN:'https://staging.aeroventa.ru'}});
  await capture(path.join(dir,'apps/web/dist'),version,compare,beforeFrames);
 }
}finally{await browser.close();}
const states=[];
for(const f of(await fs.readdir('PR12_EXACT_QA')).filter(f=>f.endsWith('.jpg')&&!qa.pages.some(p=>p.screenshot===f))){
 const b=await fs.readFile(path.join('PR12_EXACT_QA',f));states.push({name:f,image:'data:image/jpeg;base64,'+b.toString('base64'),sha256:digest(b)});
}
for(const f of(await fs.readdir('PR12_OWNER_CONTRACT')).filter(f=>f.endsWith('.jpg'))){const b=await fs.readFile(path.join('PR12_OWNER_CONTRACT',f));states.push({name:f,image:'data:image/jpeg;base64,'+b.toString('base64'),sha256:digest(b)});}
const diffName='AEROVENTA_SOURCE_DIFF_e4f1e8b5_'+sha.slice(0,8)+'.patch';
const exactDiff=execFileSync('git',['diff','--binary','e4f1e8b5053e866e7485ff46d0220c17c982b0a5',sha],{maxBuffer:16*1024*1024});
await fs.writeFile(path.join(out,diffName),exactDiff);
const zipName='AEROVENTA_PR12_STAGING_'+sha.slice(0,8)+'.zip';



const sealed=JSON.parse(execFileSync('python3',['-c',python,dist,path.join(out,zipName),sha],{encoding:'utf8',maxBuffer:8*1024*1024}));
const limitations=[
 'RELEASE HOLD: художественная приёмка Owner ещё не получена.',
 'Исходник инженерной сцены остаётся1036×338: дополнительные фотографические детали не восстановлены и не заявлены. Размытые растровые надписи исключены из рендера и воспроизведены проверенной HTML-типографикой. Более детальный native остаётся SOURCE HOLD.',
 'Telegram-превью, установленный staging SHA и HTTP-транспорт защищённого хостинга не подтверждаются локальной сборкой. Basic Auth не изменён.',
 'Directus preview заблокирован отсутствующим Actions secret DIRECTUS_STATIC_TOKEN. Реальные заявки/вложения, live AI, сведения оператора, права и полевые Core Web Vitals остаются внешними gates.',
 'Реальные WebKit и экранная клавиатура ОС не проверены. Chromium touch/zoom/reduced-motion и mock error/retry отмечены как локальные проверки.',
 'ZIP исключает .htaccess/.htpasswd и рабочие документы. Существующую защиту staging необходимо сохранить; production не разрешён.'
];
const compact={source_sha:sha,source_tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),pr:'https://github.com/XandXander/aeroventa/pull/12',continuation_base:'e4f1e8b5053e866e7485ff46d0220c17c982b0a5',preserved_checkpoint:'6afdba86fcafde9dab94e4e069be987196b2bcf9',mode:'fixture-staging-only',verdict:'RELEASE HOLD',zip_name:zipName,zip_sha256:sealed.zip_sha256,zip_bytes:sealed.zip_bytes,crc:sealed.crc,runtime_files:sealed.files.length,rendered_pages:frames.length/2,physical_viewports:new Set([...qa.geometry,...owner.first_views].map(v=>v.width+"x"+v.height)).size,qa:{render:qa.pages.length,geometry:qa.geometry.length,interactions:qa.interactions.length,states:qa.button_states.length,raster_pairs:surfaces.pixel_contrast.length,issues:0,owner_initial_views:owner.first_views.length,owner_contract:owner.checks},source_diff:{name:diffName,bytes:exactDiff.length,sha256:digest(exactDiff)},artistic:'OWNER ACCEPTANCE PENDING',baseline_method:'Comparison is the exact preceding e4f1e8b5 source rebuilt at matching1440×900 /390×844. Existing accepted technical/media behavior remains the regression baseline.',limitations};
function client(){
 const data=JSON.parse(document.querySelector('#payload').textContent),$=s=>document.querySelector(s);
 const route=$('#route'),size=$('#size'),version=$('#version'),panes=$('#panes');
 const routes=[...new Set(data.frames.map(f=>f.route))];
 for(const r of routes){const o=document.createElement('option');o.value=r;o.textContent=r;route.append(o);}route.value='/services/';
 function draw(){
  panes.replaceChildren();const current=data.frames.find(f=>f.route===route.value&&f.width===Number(size.value));
  const previous=data.beforeFrames.find(f=>f.route===route.value&&f.width===Number(size.value)&&f.source_sha.startsWith(version.value));
  const list=version.value==='none'?[['Кандидат',current]]:[['До · '+version.value,previous],['Кандидат',current]];
  panes.classList.toggle('single',list.length===1);
  for(const[label,item]of list){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption');
   caption.textContent=label+(item?' · '+item.source_sha.slice(0,8)+' · '+item.width+' px':' · сравнение этого маршрута не снято');figure.append(caption);
   if(item){const img=document.createElement('img');img.src=item.image;img.alt=label+' '+route.value;img.width=item.imageWidth;img.height=item.imageHeight;img.style.maxWidth=item.width===390?'390px':'100%';figure.append(img);}panes.append(figure);
  }
  $('#page-title').textContent=current?.title||route.value;$('#frame-meta').textContent=current?'Viewport '+current.width+'×'+current.viewportHeight+'; полный кадр '+current.imageWidth+'×'+current.imageHeight+'; SHA256 '+current.sha256:'';
 }
 for(const e of[route,size,version])e.addEventListener('change',draw);
 $('#prev').onclick=()=>{route.selectedIndex=Math.max(0,route.selectedIndex-1);draw();};$('#next').onclick=()=>{route.selectedIndex=Math.min(route.options.length-1,route.selectedIndex+1);draw();};
 $('#native').onclick=()=>panes.classList.toggle('native');
 const state=$('#state');for(const x of data.states){const o=document.createElement('option');o.textContent=x.name;o.value=x.name;state.append(o);}
 state.onchange=()=>{const x=data.states.find(s=>s.name===state.value);$('#state-image').src=x.image;$('#state-image').alt=x.name;};if(data.states.length)state.dispatchEvent(new Event('change'));
 const input=$('#query'),table=$('#coverage-body');
 function matrix(){
  table.replaceChildren();const q=input.value.toLowerCase(),rows=data.coverage.rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));$('#matched').textContent=rows.length+' записей. Приёмка Owner остаётся отдельным решением.';
  for(const r of rows){const tr=document.createElement('tr');for(const v of[r.id,r.route,r.section,r.correction,r.candidate_status]){const td=document.createElement('td');td.textContent=v||'';tr.append(td);}table.append(tr);}
 }
 input.oninput=matrix;matrix();draw();
}
const css='*{box-sizing:border-box}body{margin:0;background:#e8edef;color:#1c3541;font:16px/1.6 system-ui,sans-serif}header,section.info{max-width:1200px;margin:auto;padding:32px 24px}header p{max-width:82ch}h1{font-size:clamp(28px,4vw,48px);line-height:1.14;letter-spacing:-.03em;font-weight:600}.hold{color:#8b452c;font-weight:700}code{overflow-wrap:anywhere}a{color:#254c64}.controls{position:sticky;top:0;z-index:3;padding:12px 20px;background:#f8f9f6;border-block:1px solid #bdcccf;display:flex;gap:12px;align-items:end;flex-wrap:wrap}.controls label{display:grid;gap:4px;font-size:12px}select,button,input{font:inherit;min-height:42px;border:1px solid #849da8;background:white;color:#193b4a;padding:8px}#route{max-width:min(100%,550px)}button{cursor:pointer}#page-title,#frame-meta{padding:0 24px}#frame-meta{font-size:12px;overflow-wrap:anywhere}.panes{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px;align-items:start}.panes.single{grid-template-columns:1fr}.panes figure{margin:0;background:white;min-width:0;text-align:center}.panes figcaption{text-align:left;padding:12px 16px;border-bottom:1px solid #bdcccf;font-size:13px}.panes img{display:block;width:100%;height:auto;margin:auto}.panes.native{overflow:auto}.panes.native figure{width:max-content;min-width:100%}.panes.native img{max-width:none!important;width:auto}.panes.native:not(.single){grid-template-columns:1440px 1440px}.info{background:#f8f9f6;border-block:1px solid #bdcccf}details{padding-block:20px}summary{cursor:pointer;font-weight:600}table{border-collapse:collapse;font-size:13px;min-width:900px;width:100%}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #bdcccf;padding:12px}#coverage{overflow:auto}#state-image{max-width:100%;max-height:85vh;display:block;margin:24px auto}.small{font-size:13px}li{margin-bottom:10px}@media(max-width:800px){.panes{grid-template-columns:1fr}.controls{position:relative}header,section.info{padding:24px 18px}}';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const payload={...compact,frames,beforeFrames,states,coverage},json=JSON.stringify(payload).replaceAll('<','\\u003c');
const html='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AEROVENTA '+sha.slice(0,8)+' · визуальная проверка</title><style>'+css+'</style><header><p>AEROVENTA · PR #12 · 26.10.2026</p><h1>Интегрированный художественный кандидат</h1><p class="hold">RELEASE HOLD · Приёмка Owner открыта</p><p>Полностраничные кадры всех страниц и сравнение с предыдущим e4f1e8b5. Технические результаты не объявлены художественной приёмкой.</p><p>Переработаны Services, монтаж, обе стадии проекта, портфолио и кейсы, команда, статьи, контакты и объектные страницы. Исправлены нижние галереи, повторные текстовые стены, оптическая иерархия и мобильные последовательности. Утверждённые изображения, факты, исторические URL и функции сохранены.</p><p class="small">Source <code>'+sha+'</code><br>ZIP SHA256 <code>'+sealed.zip_sha256+'</code></p></header><section class="info"><details><summary>Техническая проверка и открытые gates</summary><p>Полный desktop/mobile render, контрольные viewport, реальные действия, expanded states, вычисленные цвета и raster-проверка фонов. Исторические тексты и медиа проверены отдельно.</p><ul>'+limitations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>'+esc(compact.baseline_method)+'</p><p>Архитектурные концепции отличаются от документальных фотографий. Akvilon gallery-12 сохранён как исходный asset, но не включён в документальную подборку до установления атрибуции.</p></details></section><nav class="controls" aria-label="Просмотр страниц"><label>Страница<select id="route"></select></label><label>Viewport<select id="size"><option value="1440">Desktop1440×900</option><option value="390">Mobile390×844</option></select></label><label>Сравнение<select id="version"><option value="e4f1e8b5">Предыдущий e4f1e8b5</option><option value="none">Только кандидат</option></select></label><button id="prev" type="button">←</button><button id="next" type="button">→</button><button id="native" type="button">Масштаб1:1 / по ширине</button></nav><h2 id="page-title"></h2><p id="frame-meta"></p><div id="panes" class="panes"></div><section class="info"><details><summary>Проверенные состояния</summary><label>Кадр <select id="state"></select></label><img id="state-image" alt=""></details><details><summary>Полнота накопленных требований</summary><p>153 первоначальных, отдельные AV001–036, O22-01–22, жюри, GPT6 и находки самостоятельного просмотра. Прежнее изменение исходников не означает приёмку.</p><label>Поиск ID или страницы <input id="query" type="search"></label><p id="matched"></p><div id="coverage"><table><thead><tr><th>ID</th><th>Маршрут</th><th>Секция</th><th>Действие / проверка</th><th>Статус</th></tr></thead><tbody id="coverage-body"></tbody></table></div></details></section><script id="payload" type="application/json">'+json+'</script><script>('+client.toString()+')();</script></html>';
const htmlName='AEROVENTA_VISUAL_QA_'+sha.slice(0,8)+'.html';await fs.writeFile(path.join(out,htmlName),html);
const manifest={...compact,visual:{name:htmlName,bytes:Buffer.byteLength(html),sha256:digest(html)},before_frames:beforeFrames.map(({image,...f})=>f),frames:frames.map(({image,...f})=>f),state_frames:states.map(({image,...f})=>f),files:sealed.files,knowledge_writeback:{mode:'PREPARED_NOT_APPLIED',canonical_sha:'7b81b78a491000d65ed3c59a7b62fc3f2a1291a7',target:'existing CURRENT_STATE/OPEN_WORK entry',change:'Record exact source/artifact hashes as RELEASE HOLD; retain Owner/native-source/external gates; no deployed SHA or Owner acceptance asserted.'}};
await fs.writeFile(path.join(out,'AEROVENTA_MANIFEST_'+sha.slice(0,8)+'.json'),JSON.stringify(manifest,null,2));
console.log('AV_FINAL_DELIVERY '+JSON.stringify({...compact,html_name:htmlName,html_sha256:digest(html)}));
for(const route of['/services/','/portfolio/obekt/na-izluchine-nevy/','/covid-pritochnaya-ventilacia/','/obekty/magaziny-i-sklady/']){
 for(const width of[1440,390]){
  const f=frames.find(f=>f.route===route&&f.width===width),b=await sharp(Buffer.from(f.image.split(',')[1],'base64')).resize({width:width===390?390:900,withoutEnlargement:true}).jpeg({quality:76}).toBuffer(),key=route.replaceAll('/','_')+'-'+width,b64=b.toString('base64'),n=Math.ceil(b64.length/12000);
  console.log('AV_FINAL_ART_START '+key+' '+n);for(let i=0;i<n;i++)console.log('AV_FINAL_ART_PART '+key+' '+i+' '+b64.slice(i*12000,(i+1)*12000));console.log('AV_FINAL_ART_END '+key);
 }
}
