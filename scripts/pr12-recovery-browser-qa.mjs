// Source-bound local Chromium inspection. No request leaves the local fixture.
// Contrast and interaction results never constitute artistic or production acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const root = path.resolve('apps/web/dist');
const output = path.resolve(process.env.RECOVERY_QA_OUTPUT || '../cache/baseline-qa');
const quick = process.env.RECOVERY_QA_QUICK === '1';
const phase = process.env.RECOVERY_QA_PHASE || 'all';
await fs.mkdir(output, { recursive:true });
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json','.pdf':'application/pdf'};
const server = http.createServer(async(req,res)=>{
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = path.resolve(root, rel);
    if(!file.startsWith(root + path.sep) && file !== root){res.writeHead(403).end();return;}
    if((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    res.end(bytes);
  } catch {res.writeHead(404, {'Content-Type':'text/plain'}).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true,
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),
 args:process.env.RECOVERY_QA_BROWSER_ARGS ? JSON.parse(process.env.RECOVERY_QA_BROWSER_ARGS) : ['--no-sandbox','--disable-dev-shm-usage']
});
const context = await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'});
await context.route('**/*', route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
const page = await context.newPage();
const report = {source_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_dirty:execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean),generated_at:new Date().toISOString(),phase,browser:browser.version(),pages:[],geometry:[],interactions:[],issues:[],checks:[],boundary:'LOCAL_FIXTURE_ONLY; ARTISTIC_AND_EXTERNAL_RELEASE_GATES_SEPARATE'};
page.setDefaultTimeout(12000);
page.setDefaultNavigationTimeout(20000);
page.on('pageerror',e=>report.issues.push({type:'JS_ERROR',url:page.url(),message:e.message}));
async function walk(dir){let files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(f));else if(entry.name==='index.html')files.push(f);}return files;}
let routes=(await walk(root)).map(f=>'/'+path.relative(root,path.dirname(f)).split(path.sep).join('/')+'/').map(s=>s.replace(/^\/\//,'/')).sort();
routes=routes.filter(r=>r!=='/obekty/novostroyki-i-zhilye-kompleksy/');
if(quick)routes=['/','/services/','/montazh-ventiliacii/','/montazh-po-proektu/','/obekt-bez-gotovogo-proekta/','/portfolio/','/about/','/contact/','/blog/','/blog/detail/ntff-polisan/','/blog/detail/restoran-v-zhk-leontevskiy-mys/','/obekty/proizvodstvo/','/obekty/sklady/'];
if(process.env.RECOVERY_QA_ROUTE)routes=routes.filter(route=>route===process.env.RECOVERY_QA_ROUTE);
const slug = route=>route==='/'?'home':route.replace(/^\/|\/$/g,'').replaceAll('/','__');
async function settle(){
  await page.evaluate(async()=>{
    await document.fonts.ready;
    for(let y=0;y<document.documentElement.scrollHeight;y+=Math.max(innerHeight-80,320)){
      window.scrollTo(0,y);await new Promise(r=>setTimeout(r,30));
    }
    await Promise.race([Promise.all([...document.images].filter(img=>img.checkVisibility({visibilityProperty:true})).map(img=>img.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,5000))]);
    window.scrollTo(0,0);
  });
}
try {

 if(phase==='owner'){
  const original=await fs.readFile(path.join(root,'evidence/residential/neva/IMG_7571.JPG'));
  const {createHash}=await import('node:crypto');
  report.checks.push({name:'D057_original_sha256',pass:createHash('sha256').update(original).digest('hex')==='f83228bf67af248c14a5170d442ec7fff290297d6c16b2c1860e8d0c1469779e'});
  report.first_views=[];
  const keyRoutes=['/','/services/','/montazh-ventiliacii/','/montazh-po-proektu/','/obekt-bez-gotovogo-proekta/','/portfolio/','/blog/','/about/','/contact/','/obekty/kvartiry-i-doma/','/portfolio/obekt/na-izluchine-nevy/','/news/'];
  for(const [width,height]of [[1440,900],[1364,646],[390,844],[375,667]])for(const route of keyRoutes){
   await page.setViewportSize({width,height});await page.goto(origin+route,{waitUntil:'networkidle'});
   await page.evaluate(async()=>{await document.fonts.ready;for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const result=await page.evaluate(()=>{
    const box=el=>el?{top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}:null;
    const hero=document.querySelector('.home-hero'),help=document.querySelector('.consultant-launcher'),hs=help&&getComputedStyle(help);
    const visible=el=>el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
    const images=[...document.querySelectorAll('main img')].filter(visible).map(el=>({src:el.getAttribute('src'),...box(el)}));
    return{header:box(document.querySelector('.site-header')),h1:box(document.querySelector('h1')),home:box(hero),scene:box(document.querySelector('.hero-engineering')),ribbon:box(document.querySelector('.object-ribbon')),feature:box(document.querySelector('.av-portfolio-feature')),nevaFirst:box(document.querySelector('[data-owner-first-view]')),journal:box(document.querySelector('.av-journal-opening')),contact:box(document.querySelector('.av-contact__direct')),headerAssistant:document.querySelectorAll('.site-header [data-consultant-open]').length,assistantCount:document.querySelectorAll('button.consultant-launcher').length,assistant:{...box(help),visible:!!help&&hs.visibility!=='hidden',position:hs?.position},images,overflow:document.documentElement.scrollWidth-innerWidth};
   });
   if(result.headerAssistant||result.assistantCount!==1||result.assistant.width>50||result.assistant.height>50||result.assistant.position!=='fixed')report.issues.push({type:'OWNER_SINGLE_COMPACT_ASSISTANT',route,width,height,result});
   if(result.overflow>1||!result.h1||result.h1.top<result.header.bottom-1)report.issues.push({type:'OWNER_INITIAL_HEADING',route,width,height,result});
   if(route==='/'&&width>760&&(Math.abs(result.home.bottom-height)>4||result.scene.bottom>height+4))report.issues.push({type:'OWNER_HOME_CLIPPED_OR_EMPTY_FOLD',route,width,height,result});
   if(route==='/'&&width<=760&&result.scene.bottom>height+4)report.issues.push({type:'OWNER_HOME_MOBILE_SCENE_CLIPPED',route,width,height,result});
   if(['/portfolio/','/blog/','/news/'].includes(route)&&!result.images.some(i=>i.top<height-120&&i.bottom>result.header.bottom+100))report.issues.push({type:'OWNER_INDEX_WITHOUT_VISIBLE_PHOTOGRAPHY',route,width,height,result});
   if(route==='/portfolio/'&&result.nevaFirst&&width<=760&&Math.abs(result.nevaFirst.bottom-height)>4)report.issues.push({type:'OWNER_NEVA_FIRST_COMPOSITION',route,width,height,result});
   const screenshot='FIRST_VIEW_'+slug(route)+'__'+width+'x'+height+'.jpg';await page.screenshot({path:path.join(output,screenshot),type:'jpeg',quality:82});report.first_views.push({route,width,height,screenshot,...result});
   if(route==='/portfolio/'&&width<=760){const collision=await page.evaluate(()=>{const a=document.querySelector('.av-portfolio-feature__secondary').getBoundingClientRect(),b=document.querySelector('.av-portfolio-feature__facts').getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;});if(collision)report.issues.push({type:'OWNER_NEVA_FACTS_OVERLAP_PHOTO',route,width,height});}
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/portfolio/',{waitUntil:'networkidle'});
  const links=await page.locator('.portfolio-grid>.portfolio-card').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),image:n.querySelector('img')?.getAttribute('src')})));
  report.checks.push({name:'Owner_Neva_plus_twelve_distinct_other_objects',pass:links.length===12&&new Set(links.map(x=>x.href)).size===12&&links.some(x=>x.href==='/portfolio/obekt/eurospar-sestroretsk/')&&!links.some(x=>x.href==='/portfolio/obekt/na-izluchine-nevy/')});
  report.checks.push({name:'D058_Leont_approved_cover_preserved',pass:links.some(x=>x.href==='/blog/detail/restoran-v-zhk-leontevskiy-mys/'&&x.image==='/evidence/leont/owner-cover-v43.webp')});
  for(const route of ['/portfolio/','/portfolio/obekt/na-izluchine-nevy/','/obekty/kvartiry-i-doma/']){await page.goto(origin+route,{waitUntil:'networkidle'});report.checks.push({name:'D057_public_cover_'+route,pass:await page.locator('main img[src="/evidence/residential/neva/IMG_7571.JPG"]').count()>=1&&await page.locator('main img[src*="owner-neva-facade-20261016"]').count()===0});}
 }
 if(phase==='surfaces'){
  report.pixel_contrast=[];
  const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  for(const width of [390,1440,1920])for(const route of routes){
   await page.setViewportSize({width,height:900});await page.goto(origin+route,{waitUntil:'networkidle'});await settle();
   await page.addScriptTag({content:axeSource});
   const selectors=await page.evaluate(async()=>{const a=await window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}});return a.incomplete.flatMap(v=>v.nodes).filter(n=>n.failureSummary?.includes('background color could not be determined')).map(n=>n.target[0]);});
   for(const selector of selectors){
    const el=page.locator(selector);await el.evaluate(e=>e.scrollIntoView({block:'center'}));
    const facts=await el.evaluate(e=>{
     const s=getComputedStyle(e),b=e.getBoundingClientRect(),rgb=s.color.match(/[\d.]+/g).map(Number);let opacity=1;
     for(let p=e;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);
     const walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),rects=[];
     for(let n=walk.nextNode();n;n=walk.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())rects.push({x:r.x-b.x,y:r.y-b.y,width:r.width,height:r.height});}
     const saved=e.getAttribute('style');e.style.setProperty('color','transparent','important');e.style.setProperty('text-shadow','none','important');
     return {text:e.textContent.trim().slice(0,100),color:rgb,opacity,font:parseFloat(s.fontSize),weight:Number(s.fontWeight),width:b.width,height:b.height,rects,saved};
    });
    const bytes=await el.screenshot({type:'png',animations:'disabled'});
    await el.evaluate((e,saved)=>saved===null?e.removeAttribute('style'):e.setAttribute('style',saved),facts.saved);
    const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let min=21,pair=null;const alpha=(facts.color[3]??1)*facts.opacity;
    for(const rect of facts.rects)for(let y=Math.max(0,Math.floor(rect.y));y<Math.min(info.height,Math.ceil(rect.y+rect.height));y++)for(let x=Math.max(0,Math.floor(rect.x));x<Math.min(info.width,Math.ceil(rect.x+rect.width));x++){
     const at=(y*info.width+x)*info.channels,bg=[data[at],data[at+1],data[at+2]],fg=facts.color.slice(0,3).map((c,i)=>alpha*c+(1-alpha)*bg[i]);const value=ratio(fg,bg);if(value<min){min=value;pair={foreground:fg,background:bg};}
    }
    const threshold=facts.font>=24||(facts.font>=18.66&&facts.weight>=700)?3:4.5;
    const result={route,width,selector,text:facts.text,color:facts.color,threshold,minimum_ratio:Number(min.toFixed(3)),pair,pass:min>=threshold};report.pixel_contrast.push(result);
    if(!result.pass)report.issues.push({type:'RASTER_BACKGROUND_CONTRAST',...result});
   }
   console.log('RASTER_CONTRAST',route,width,selectors.length);
  }
 }
 if(['all','render'].includes(phase)) {
  for(const [width,height] of [[1440,900],[390,844]]){
    await page.setViewportSize({width,height});
    for(const route of routes){
      await page.goto(origin+route,{waitUntil:'networkidle',timeout:20000});
      await settle();
      const facts = await page.evaluate(()=>({
        width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        h1:[...document.querySelectorAll('main h1')].map(x=>x.textContent.trim()),
        font:getComputedStyle(document.body).fontFamily,
        brokenImages:[...document.images].filter(x=>x.checkVisibility({visibilityProperty:true})&&(!x.complete||x.naturalWidth===0)).map(x=>x.getAttribute('src')),
        stretchedImages:[...document.images].filter(img=>img.checkVisibility({visibilityProperty:true})&&img.naturalWidth>1&&getComputedStyle(img).objectFit==='fill').filter(img=>{const b=img.getBoundingClientRect();return b.width>0&&b.height>0&&Math.abs(Math.log((b.width/b.height)/(img.naturalWidth/img.naturalHeight)))>.04;}).map(img=>({src:img.getAttribute('src'),natural:[img.naturalWidth,img.naturalHeight],rendered:[img.getBoundingClientRect().width,img.getBoundingClientRect().height]})),
        // Real computed pairs retained for review, including neutral and dark sections.
        surfaces:[...document.querySelectorAll('main section,main header')].map(e=>({selector:e.className,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),
        copy:document.querySelector('main')?.innerText,
        metadata:[...document.querySelectorAll('head meta[property^="og:"],head meta[name^="twitter:"],head meta[name="description"]')].map(x=>({name:x.getAttribute('property')||x.getAttribute('name'),content:x.content}))
      }));
      if(facts.scrollWidth>width+1)report.issues.push({type:'OVERFLOW',route,width,scrollWidth:facts.scrollWidth});
      if(facts.stretchedImages.length)report.issues.push({type:'STRETCHED_IMAGE',route,width,images:facts.stretchedImages});
      if(facts.brokenImages.length)report.issues.push({type:'BROKEN_IMAGE',route,width,images:facts.brokenImages});
      await page.addScriptTag({content:axeSource});
      const axe = await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast','button-name','link-name','label','aria-valid-attr-value']}}));
      const failures=axe.violations.map(v=>({rule:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html.slice(0,500)}))}));
      if(failures.length)report.issues.push({type:'ACCESSIBILITY',route,width,failures});
      const screenshot=slug(route)+'__'+width+'.jpg';
      await page.screenshot({path:path.join(output,screenshot),fullPage:true,type:'jpeg',quality:80});
      report.pages.push({route,width,height,screenshot,...facts,axe:failures,contrast_incomplete:axe.incomplete.filter(x=>x.id==='color-contrast').flatMap(x=>x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))) });
      // Hidden legacy originals and answers are a separate real expanded state.
      // Opening summaries also proves lazy source photos, rather than treating
      // a deliberately unrequested image in closed <details> as a broken file.
      if(width===1440){
       const summaries=await page.locator('main details > summary').all();let expanded=0;
       for(const summary of summaries)if(await summary.isVisible()&&!(await summary.evaluate(e=>e.parentElement.open))){await summary.click();expanded++;}
       if(expanded){
        await settle();
        const broken=await page.evaluate(()=>[...document.images].filter(x=>x.checkVisibility({visibilityProperty:true})&&(!x.complete||!x.naturalWidth)).map(x=>x.getAttribute('src')));
        if(broken.length)report.issues.push({type:'EXPANDED_BROKEN_IMAGE',route,images:broken});
        const expandedAxe=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast','button-name','link-name','label','aria-valid-attr-value']}}));
        if(expandedAxe.violations.length)report.issues.push({type:'EXPANDED_ACCESSIBILITY',route,failures:expandedAxe.violations.map(v=>({rule:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
        report.checks.push({name:'expanded_answers_and_originals',route,expanded,pass:!broken.length&&!expandedAxe.violations.length});
       }
      }
      console.log('RENDER',width,route,'issues',failures.reduce((n,x)=>n+x.nodes.length,0));
    }
  }
 }
 if(['all','geometry'].includes(phase)) {
  // Complete routes at every requested width; short desktop and landscape are
  // additional samples. Natural vertical scrolling is not a geometry failure.
  for(const [width,height] of [[320,700],[360,780],[390,844],[430,932],[768,1024],[834,1112],[1024,768],[1364,646],[1440,900],[1920,1080],[834,500],[1440,650]]) {
   await page.setViewportSize({width,height});
   for(const route of routes) {
    await page.goto(origin+route,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>document.fonts.ready);
    const facts=await page.evaluate(()=>({
     width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     h1Count:document.querySelectorAll('main h1').length,
     smallOrClippedActions:[...document.querySelectorAll('main .button,header button,header summary')].filter(e=>{
      const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&(b.width<24||b.height<24||e.scrollWidth>e.clientWidth+2);
     }).map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
     invalidGalleryFrames:[...document.querySelectorAll('main [data-case-photo],main [data-case-frame]')].filter(e=>{
      if(e.closest('details:not([open])'))return false;const b=e.getBoundingClientRect();return e.getClientRects().length>0&&(b.width<24||b.height<24);
     }).map(e=>({label:e.getAttribute('aria-label'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
     heading:[...document.querySelectorAll('main h1')].map(e=>({text:e.textContent.trim(),font:getComputedStyle(e).fontSize,hyphens:getComputedStyle(e).hyphens,rect:e.getBoundingClientRect().toJSON()})),
     homeFold:document.querySelector('.object-ribbon')?.getBoundingClientRect().bottom
     ,narrowMobileHeroes:innerWidth<=850?[...document.querySelectorAll('.object-detail__hero-grid>div:first-child')].filter(e=>e.getBoundingClientRect().width<innerWidth*.75).length:0
     ,emptyMobileCardTails:innerWidth<=760?[...document.querySelectorAll('.object-constraints__grid article')].filter(e=>e.getBoundingClientRect().bottom-e.lastElementChild.getBoundingClientRect().bottom>50).length:0
    }));
    report.geometry.push({route,width,height,...facts});
    if(facts.scrollWidth>width+1)report.issues.push({type:'OVERFLOW',route,width,height,scrollWidth:facts.scrollWidth});
    if(facts.invalidGalleryFrames.length)report.issues.push({type:'GALLERY_FRAME_GEOMETRY',route,width,height,frames:facts.invalidGalleryFrames});
    if(facts.h1Count!==1)report.issues.push({type:'H1_COUNT',route,width,count:facts.h1Count});
    if(facts.narrowMobileHeroes||facts.emptyMobileCardTails)report.issues.push({type:'MOBILE_COMPOSITION_REGRESSION',route,width,...facts});
    if(facts.smallOrClippedActions.length)report.issues.push({type:'ACTION_GEOMETRY',route,width,actions:facts.smallOrClippedActions});
    if(route==='/'&&[[320,700],[1364,646],[1920,1080],[834,500]].some(v=>v[0]===width&&v[1]===height)) {
      await settle();await page.screenshot({path:path.join(output,`home-fold-${width}x${height}.jpg`),type:'jpeg',quality:85});
    }
   }
   console.log('GEOMETRY',width,height,routes.length);
  }
 }
 const expect=(condition,message)=>{if(!condition)throw new Error(message);};
 async function scenario(name,route,width,height,steps) {
  if(process.env.RECOVERY_QA_SCENARIO&&!name.includes(process.env.RECOVERY_QA_SCENARIO))return;
  try {
   await page.setViewportSize({width,height});
   await page.goto(origin+route,{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   const details=await steps();report.interactions.push({name,route,width,height,pass:true,...details});
   console.log('INTERACTION PASS',name,width);
  } catch(error) {report.interactions.push({name,route,width,height,pass:false});report.issues.push({type:'INTERACTION',name,route,width,height,message:String(error)});console.log('INTERACTION FAIL',name,String(error));}
 }
 async function checkDialog(selector,label) {
  const dialog=page.locator(selector);expect(await dialog.evaluate(d=>d.open),'Dialog did not open');
  expect(await dialog.evaluate(d=>d.contains(document.activeElement)),'Focus outside dialog');
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async selector=>await window.axe.run(document.querySelector(selector),{runOnly:{type:'rule',values:['color-contrast','button-name','link-name','label','aria-valid-attr-value']}}),selector);
  expect(!result.violations.length,'Dialog accessibility: '+JSON.stringify(result.violations.map(v=>({rule:v.id,targets:v.nodes.map(n=>n.target)}))));
  for(let i=0;i<16;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(d=>d.contains(document.activeElement)),'Tab escaped dialog');}
  expect(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),'Horizontal dialog overflow');
  if(await dialog.locator('.owner-case__viewer-title strong').count()){
   const collision=await dialog.evaluate(d=>{const range=document.createRange();range.selectNodeContents(d.querySelector('.owner-case__viewer-title strong'));const buttons=[...d.querySelectorAll('.owner-case__viewer-title button')].map(b=>b.getBoundingClientRect());return [...range.getClientRects()].some(a=>buttons.some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));});
   expect(!collision,'Viewer title overlaps its controls');
  }

  await page.screenshot({path:path.join(output,label+'.jpg'),type:'jpeg',quality:85});
 }
 async function decodedImage(selector) {
  await page.waitForFunction(selector=>{const img=document.querySelector(selector);return img&&img.complete&&img.naturalWidth>0&&img.currentSrc===new URL(img.getAttribute('src'),location.href).href;},selector);
  await page.locator(selector).evaluate(async img=>{
   await img.decode();if(!img.naturalWidth)throw new Error('Image has no decoded pixels');
   const dialog=img.closest('dialog[open]');
   const stage=img.closest('.portfolio-archive-viewer__stage,.owner-case__viewer-stage,.object-photo-dialog__stage');
   if(dialog&&stage&&Number(dialog.dataset.zoom||1)<=1){
    const a=img.getBoundingClientRect(),b=stage.getBoundingClientRect();
    if(a.left<b.left-2||a.right>b.right+2||a.top<b.top-2||a.bottom>b.bottom+2)throw new Error('Fitted photograph is clipped by its stage: '+JSON.stringify({image:a.toJSON(),stage:b.toJSON()}));
   }
  });
 }
 async function swipeLeft(selector) {
  const box=await page.locator(selector).boundingBox();expect(!!box,'Touch surface missing');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const y=Math.min(box.y+box.height/2,600),x=box.x+box.width*.72;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-110,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
 }
 if(['all','interactions'].includes(phase)) {
  for(const width of [320,390,768,1440])for(const [trigger,selector,label] of [
   ['.consultant-launcher','#aeroventa-consultant-dialog','consultant'],
   ['[data-project-open]','#aeroventa-project-dialog','project'],
   ['.home-actions [data-contact-open]','[data-contact-dialog]','contact']
  ])await scenario('DIALOG_'+label,label==='project'?'/montazh-po-proektu/':'/',width,width>1000?650:780,async()=>{
   const opener=page.locator(trigger).first();await opener.click();await checkDialog(selector,`${label}-${width}`);
   await page.keyboard.press('Escape');expect(!(await page.locator(selector).evaluate(d=>d.open)),'Escape failed');
   expect(await opener.evaluate(e=>e===document.activeElement),'Focus not restored to opener');
   await opener.click();expect(await page.locator(selector).evaluate(d=>d.open),'Reopen failed');await page.locator(selector+' [data-dialog-close]').click();
   return {keyboard_tabs:16,reopened:true};
  });
  for(const width of [390,1440]) {
   await scenario('SPORT_ALL_12_FIRST_CLICK','/portfolio/',width,width>1000?650:844,async()=>{
    const opener=page.locator('[data-archive-open][data-gallery-title="Центр адаптивного спорта"]').first();await opener.click();
    const dialog=page.locator('#portfolio-archive-viewer');await checkDialog('#portfolio-archive-viewer','sport-'+width);
    const seen=[];
    for(let n=1;n<=12;n++){
     await decodedImage('#portfolio-archive-viewer [data-gallery-photo]');
     expect((await dialog.locator('[data-gallery-position]').innerText())===`Фото ${n} из 12`,'One click/counter mismatch');
     seen.push(await dialog.locator('[data-gallery-photo]').getAttribute('src'));
     await dialog.locator('[data-gallery-next]').click();
    }
    expect(new Set(seen).size===12,'Duplicate sports frames');
    await page.keyboard.press('ArrowLeft');expect((await dialog.locator('[data-gallery-position]').innerText())==='Фото 12 из 12','Keyboard previous failed');
    await decodedImage('#portfolio-archive-viewer [data-gallery-photo]');
    const fit=await dialog.locator('[data-gallery-photo]').boundingBox();
    await page.keyboard.press('+');expect(Number(await dialog.getAttribute('data-zoom'))>1,'Keyboard zoom failed');
    const zoomed=await dialog.locator('[data-gallery-photo]').boundingBox();expect(zoomed.width>fit.width*1.1,'Sports zoom did not enlarge decoded photo: '+JSON.stringify({fit,zoomed}));
    await page.keyboard.press('0');expect(await dialog.getAttribute('data-zoom')==='1','Fit failed');
    if(width===390){await swipeLeft('.portfolio-archive-viewer__stage');expect((await dialog.locator('[data-gallery-position]').innerText())==='Фото 1 из 12','Touch swipe failed');}
    await page.keyboard.press('Escape');expect(await opener.evaluate(e=>e===document.activeElement),'Sports focus restoration failed');
    return {decoded_unique_frames:seen,first_click:true,zoom:true};
   });
   await scenario('NEVA_ALL_6_AND_FACADE','/portfolio/obekt/na-izluchine-nevy/',width,width>1000?650:844,async()=>{
    expect(await page.locator('.owner-case__photos button').count()===6,'Neva requires six interior photos');
    expect(await page.locator('.owner-case__photos img[src*="owner-neva-facade"]').count()===0,'Facade duplicated in interior grid');
    const opener=page.locator('.owner-case__photos button').first();await opener.click();await checkDialog('#owner-case-viewer','neva-'+width);
    const seen=[];for(let n=0;n<6;n++){await decodedImage('#owner-case-viewer [data-case-large]');seen.push(await page.locator('#owner-case-viewer [data-case-large]').getAttribute('src'));await page.locator('#owner-case-viewer [data-case-next]').click();}
    expect(new Set(seen).size===6,'Duplicate Neva photos');
    await decodedImage('#owner-case-viewer [data-case-large]');
    const fit=await page.locator('#owner-case-viewer [data-case-large]').boundingBox();
    await page.keyboard.press('+');expect(Number(await page.locator('#owner-case-viewer').getAttribute('data-zoom'))>1,'Neva zoom unavailable');
    const zoomed=await page.locator('#owner-case-viewer [data-case-large]').boundingBox();expect(zoomed.width>fit.width*1.1,'Neva photo does not actually enlarge');
    await page.keyboard.press('0');expect(await page.locator('#owner-case-viewer').getAttribute('data-zoom')==='1','Neva fit failed');
    if(width===390){await swipeLeft('.owner-case__viewer-stage');expect((await page.locator('[data-case-count]').innerText())==='2 из 6','Neva touch swipe failed');}
    await page.keyboard.press('Escape');
    expect(await opener.evaluate(e=>e===document.activeElement),'Neva focus restoration failed');
    const cover=page.locator('[data-case-cover]');await cover.click();await decodedImage('[data-case-large]');expect((await page.locator('[data-case-large]').getAttribute('src')).includes('IMG_7571.JPG'),'Neva facade opens the wrong image');await page.locator('[data-case-next]').click();await decodedImage('[data-case-large]');expect(!(await page.locator('[data-case-large]').getAttribute('src')).includes('IMG_7571.JPG'),'Neva cover does not connect to interior photographs');await page.keyboard.press('Escape');expect(await cover.evaluate(e=>e===document.activeElement),'Neva cover focus restoration failed');return {decoded_unique_frames:seen,facade:true};
   });
   for(const name of ['apart-hotel','eurospar-vo','eurospar-sestroretsk','college-obvodny','novatech','akvilon-yanino','himprom'])await scenario('OWNER_OBJECT_GALLERY','/portfolio/obekt/'+name+'/',width,width>1000?650:844,async()=>{
    const opener=page.locator('[data-case-frame]').first();const total=await page.locator('[data-case-frame]').count();expect(total>1,'Object album incomplete');
    await opener.click();await checkDialog('#owner-case-viewer','owner-'+name+'-'+width);await decodedImage('[data-case-large]');const before=await page.locator('[data-case-large]').getAttribute('src');
    await page.locator('[data-case-next]').click();await decodedImage('[data-case-large]');expect(before!==await page.locator('[data-case-large]').getAttribute('src'),'Object album first click failed');
    const fit=await page.locator('[data-case-large]').boundingBox();await page.locator('[data-case-zoom]').click();const enlarged=await page.locator('[data-case-large]').boundingBox();expect(enlarged.width>fit.width*1.1,'Object zoom button failed');
    await page.locator('[data-case-zoom]').click();await page.keyboard.press('Escape');expect(await opener.evaluate(e=>e===document.activeElement),'Object album focus restoration failed');
    await page.locator('[data-case-cover]').click();await decodedImage('[data-case-large]');expect(await page.locator('[data-case-large]').getAttribute('src')===await page.locator('#owner-case-viewer').getAttribute('data-cover'),'Wrong object cover opened');await page.keyboard.press('Escape');return {total,first_click:true,cover:true,zoom_button:true};
   });
   for(const route of ['/blog/detail/kak-my-sdali-7-domov/','/blog/detail/restoran-v-zhk-leontevskiy-mys/','/blog/detail/ntff-polisan/','/blog/detail/montazh-ventilyatsii-v-karelii/'])await scenario('CASE_GALLERY',route,width,width>1000?650:844,async()=>{
    const opener=page.locator('[data-case-photo]').first();const total=await page.locator('[data-case-photo]').count();
    if(route.includes('leontevskiy'))expect(await page.locator('.case-gallery__archive [data-case-photo]').count()===26,'All 26 Leont source frames must be present in the visible gallery');
    await opener.click();await checkDialog('#case-photo-viewer',slug(route)+'-viewer-'+width);
    await decodedImage('#case-photo-viewer [data-photo-large]');const before=await page.locator('[data-photo-large]').getAttribute('src');
    await page.locator('[data-photo-next]').click();await decodedImage('#case-photo-viewer [data-photo-large]');
    expect(before!==await page.locator('[data-photo-large]').getAttribute('src'),'First next click did not change frame');
    await page.keyboard.press('ArrowLeft');expect(before===await page.locator('[data-photo-large]').getAttribute('src'),'ArrowLeft failed');
    await page.keyboard.press('Escape');expect(await opener.evaluate(e=>e===document.activeElement),'Case focus restoration failed');return {total,first_click:true};
   });
   await scenario('PONSSE_DOCUMENT_FIT_AND_ZOOM','/blog/detail/montazh-ventilyatsii-v-karelii/',width,width>1000?650:844,async()=>{
    const opener=page.locator('[data-ponsse-open]').first();await opener.click();await checkDialog('#ponsse-letter-dialog','ponsse-document-'+width);
    await decodedImage('#ponsse-letter-dialog img');const fit=await page.locator('#ponsse-letter-dialog img').boundingBox();
    expect(fit.height<=(width>1000?650:844)-60,'Portrait document does not fit initial screen');
    await page.keyboard.press('+');const zoomed=await page.locator('#ponsse-letter-dialog img').boundingBox();expect(zoomed.width>fit.width*1.1,'PONSSE document does not actually enlarge');await page.screenshot({path:path.join(output,'ponsse-document-zoom-'+width+'.jpg'),type:'jpeg',quality:85});
    await page.keyboard.press('0');await page.keyboard.press('Escape');expect(await opener.evaluate(e=>e===document.activeElement),'Letter focus restoration failed');return {fit};
   });
   for(const [album,total] of [[0,5],[1,7]])await scenario('WAREHOUSE_AUTHENTIC_ALBUM_'+album,'/obekty/sklady/',width,width>1000?650:844,async()=>{
    const opener=page.locator('[data-object-gallery]').nth(album);await opener.click();await checkDialog('#object-photo-dialog','warehouse-'+album+'-'+width);
    const seen=[];for(let n=1;n<=total;n++){await decodedImage('#object-photo-dialog img');expect(await page.locator('[data-object-photo-count]').innerText()===`Фото ${n} из ${total}`,'Warehouse first-click counter mismatch');seen.push(await page.locator('#object-photo-dialog img').getAttribute('src'));await page.locator('[data-object-photo-next]').click();}
    expect(new Set(seen).size===total,'Warehouse album repeats a source frame');const fit=await page.locator('#object-photo-dialog img').boundingBox();await page.keyboard.press('+');const enlarged=await page.locator('#object-photo-dialog img').boundingBox();expect(enlarged.width>fit.width*1.1,'Warehouse photo does not enlarge');
    await page.keyboard.press('0');await page.keyboard.press('Escape');expect(await opener.evaluate(e=>e===document.activeElement),'Warehouse focus restoration failed');return {decoded_unique_frames:seen};
   });
  }
  await scenario('MOBILE_MENU_CONTACT_FOCUS','/',390,780,async()=>{
   const toggle=page.locator('[data-mobile-menu] summary');await toggle.click();
   expect(await page.locator('[data-mobile-menu]').evaluate(e=>e.open),'Menu closed');
   expect(await page.locator('.site-header [data-consultant-open]').count()===0 && !(await page.locator('.consultant-launcher').isVisible()),'Header duplicate or launcher visible over menu');
   await page.keyboard.press('Escape');expect(await toggle.evaluate(e=>e===document.activeElement),'Menu Escape focus');
   expect(await page.locator('.consultant-launcher').count()===1,'Home contextual consultant not available after menu close');
   await toggle.click();await page.locator('[data-mobile-menu] [data-contact-open]').click();
   expect(await page.locator('[data-contact-dialog]').evaluate(e=>e.open),'Menu CTA failed');
   await page.keyboard.press('Escape');expect(await toggle.evaluate(e=>e===document.activeElement),'Focus restored into hidden menu');
   return {};
  });
  await scenario('CONSULTANT_QUESTION_AND_CONTEXT','/',390,844,async()=>{
   await page.locator('.consultant-launcher').click();await page.locator('#consultant-chat-question').fill('Есть проект вентиляции ресторана, нужен монтаж');
   await page.locator('#consultant-chat-question').press('Enter');
   expect(await page.locator('[data-consultant-chat-messages] a[href="/montazh-po-proektu/"]').count()===1,'Relevant route not returned');
   expect(!(await page.locator('html').evaluate(e=>e.hasAttribute('data-airflow-processing'))),'Synchronous guide must not simulate request pulse');
   await page.locator('[data-consultant-chat-handoff]').click();
   expect(await page.locator('[data-contact-dialog]').evaluate(e=>e.open),'Handoff not open');
   expect((await page.locator('[data-contact-dialog] [name="task"]').inputValue()).includes('Есть проект'),'Question context lost');
   expect((await page.locator('[data-contact-dialog] [name="consultant_summary"]').inputValue()).includes('/montazh-po-proektu/'),'Route context lost');return {mode:'LOCAL_PUBLIC_CONTENT_ROUTING_NOT_LLM'};
  });
  for(const type of ['lead','project'])await scenario('FORM_'+type.toUpperCase()+'_FAILURE_RETRY',type==='project'?'/montazh-po-proektu/':'/',390,780,async()=>{
   const project=type==='project';const dialog=project?'#aeroventa-project-dialog':'[data-contact-dialog]';
   await page.locator(project?'[data-project-open]':'.home-actions [data-contact-open]').first().click();
   const form=page.locator(dialog+' form');await form.locator('[name="name"]').fill('Тестовая заявка');await form.locator('[name="contact"]').fill('qa@example.com');await form.locator('[name="task"]').fill('Локальная проверка формы без отправки писем');await form.locator('[name="consent"]').check();
   if(project){
    const files=[1,2,3,4].map(n=>({name:`test-${n}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')}));
    await form.locator('input[type="file"]').setInputFiles(files);await form.locator('button[type="submit"]').click();
    expect((await form.locator('[data-project-status]').innerText()).includes('максимум три'),'File count limit not enforced');
    await form.locator('input[type="file"]').setInputFiles(files.slice(0,1));
   }
   let requests=0;
   const url=origin+'/api/'+type+'.php';let release;
   const pending=new Promise(resolve=>release=resolve);
   await context.route(url,async route=>{requests++;await pending;await route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});});
   await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.documentElement.hasAttribute('data-airflow-processing'));
   expect(await form.locator('button[type="submit"]').isDisabled(),'Submit must be disabled while pending');
   release();const status=form.locator(project?'[data-project-status]':'[data-form-status]');
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-airflow-processing'));
   expect((await status.innerText()).includes(project?'Не удалось подтвердить':'Не удалось'),'Failure message missing');
   expect((await form.locator('[name="name"]').inputValue())==='Тестовая заявка','Form lost input after failure');
   await context.unroute(url);await context.route(url,route=>{requests++;return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
   await form.locator('button[type="submit"]').click();
   await page.waitForFunction(({selector})=>!document.querySelector(selector).hasAttribute('aria-busy'),{selector:dialog+' button[type="submit"]'});
   expect(requests===2,'Unexpected duplicate requests');expect((await status.innerText()).includes(project?'Сервер принял':'Запрос принят'),'Acceptance response missing');
   expect(!(await form.locator('button[type="submit"]').isDisabled()),'Retry remains disabled');
   await page.screenshot({path:path.join(output,type+'-retry-390.jpg'),type:'jpeg',quality:85});
   await context.unroute(url);return {mock_requests:requests,external_delivery:'NOT_TESTED',pulse_while_pending:true};
  });
  await scenario('TEXT_ZOOM_200_PERCENT','/',390,844,async()=>{
   await page.addStyleTag({content:'html{font-size:200%}'});await settle();
   const zoom=await page.evaluate(()=>({width:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *,footer *')].map(e=>({selector:e.tagName.toLowerCase()+'.'+e.className,box:e.getBoundingClientRect()})).filter(x=>x.box.width>0&&(x.box.right>innerWidth+1||x.box.left< -1)).slice(0,20).map(x=>({selector:x.selector,left:x.box.left,right:x.box.right,width:x.box.width}))}));
   const width=zoom.width;if(width>391)console.log('TEXT_ZOOM_OVERFLOW_DETAIL',JSON.stringify(zoom));expect(width<=391,'Text zoom causes horizontal overflow: '+width);
   await page.screenshot({path:path.join(output,'home-text-zoom-200.jpg'),type:'jpeg',quality:85,fullPage:true});return {scrollWidth:width};
  });
  await scenario('ENTRY_FIRST_REPEAT_REDUCED','/',1440,900,async()=>{
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>sessionStorage.removeItem('aeroventa-entry-shown'));
   await page.reload({waitUntil:'domcontentloaded'});
   expect(await page.locator('[data-airflow-entry]').getAttribute('data-mode')==='full','First entry cue missing');
   expect(await page.locator('[data-airflow-entry]').evaluate(e=>getComputedStyle(e).pointerEvents)==='none','Entry cue intercepts actions');
   await page.locator('[data-airflow-entry]').waitFor({state:'detached',timeout:5000});
   await page.reload({waitUntil:'domcontentloaded'});expect(await page.locator('[data-airflow-entry]').getAttribute('data-mode')==='short','Repeat cue is not short');
   await page.locator('[data-airflow-entry]').waitFor({state:'detached',timeout:5000});
   await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'domcontentloaded'});
   expect(await page.locator('[data-airflow-entry]').count()===0,'Reduced motion cue not suppressed');return {blocking_loader:false};
  });
  for(const route of ['/services/','/about/'])await scenario('AUTHORED_FIRST_FOLD_BOUNDARY',route,390,844,async()=>{
   const boundary=page.locator('[data-first-fold-boundary]');
   expect(await boundary.count()===1,'Current opening needs one explicit scroll boundary');
   await boundary.evaluate(e=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().bottom+40,behavior:'instant'}));
   await page.waitForFunction(()=>document.documentElement.classList.contains('is-past-first-fold'));
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await page.waitForFunction(()=>!document.documentElement.classList.contains('is-past-first-fold'));
   return {scroll_boundary:true};
  });
  await scenario('FAQ_TOPIC_FOCUS_WITHOUT_HASH','/faq/',390,844,async()=>{
   await page.getByRole('navigation',{name:'Разделы вопросов'}).getByText('Приёмка',{exact:false}).click();
   const result=await page.evaluate(()=>{
    const heading=[...document.querySelectorAll('h2')].find(h=>h.textContent==='Приёмка');
    return {hash:location.hash,focused:document.activeElement===heading,
     top:heading.getBoundingClientRect().top,
     header:document.querySelector('body>header')?.getBoundingClientRect().bottom||70};
   });
   expect(!result.hash&&result.focused&&result.top>=result.header&&result.top<500,
    'Topic action must keep URL stable and focus the heading below the sticky header');
   return result;
  });
  await scenario('GALLERY_NETWORK_FAILURE_NEXT_CLICK','/portfolio/',390,844,async()=>{
   let release;const wait=new Promise(resolve=>release=resolve);
   const slowUrl=origin+'/evidence/owner-portfolio/sport-komendantskiy/curated-04.webp';
   await context.route(slowUrl,async route=>{await wait;await route.abort('failed');});
   await page.locator('[data-archive-open][data-gallery-title="Центр адаптивного спорта"]').first().click();
   for(let i=0;i<5;i++)await page.locator('[data-gallery-next]').click();
   release();await page.locator('[data-gallery-load-error]').waitFor({state:'visible'});
   await page.locator('[data-gallery-next]').click();await decodedImage('#portfolio-archive-viewer [data-gallery-photo]');
   expect((await page.locator('[data-gallery-position]').innerText())==='Фото 7 из 12','Failed image blocks first next click');
   expect(await page.locator('[data-gallery-load-error]').count()===0,'Stale error covers next image');
   await context.unroute(slowUrl);return {recovery:true};
  });
 }
  // These semantic checks fail on the original candidate for the actual P0 causes.
 if(['all','states'].includes(phase)){
  report.button_states=[];
  const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  for(const width of [390,1440])for(const route of ['/','/montazh-po-proektu/','/portfolio/','/obekty/sklady/']){
   await page.setViewportSize({width,height:900});await page.goto(origin+route,{waitUntil:'networkidle'});await settle();await page.addScriptTag({content:axeSource});
   const {root:dom}=await cdp.send('DOM.getDocument');
   for(const selector of ['[data-consultant-open]','.header-project','main .button--primary','main .button--ghost','main .button--light','main .engagement-index a']){
    const el=page.locator(selector).first();if(!await el.count()||!await el.isVisible())continue;
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:dom.nodeId,selector});if(!nodeId)continue;
    for(const [state,pseudos] of [['hover',['hover']],['focus',['focus','focus-visible']],['active',['hover','active']]]){
     await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:pseudos});
     const colors=await el.evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,border:s.borderColor,outline:s.outlineColor,outlineWidth:s.outlineWidth};});
     const a=await el.evaluate(async e=>await window.axe.run(e,{runOnly:{type:'rule',values:['color-contrast']}}));
     report.button_states.push({route,width,selector,state,...colors,violations:a.violations.length,incomplete:a.incomplete.length});
     if(a.violations.length)report.issues.push({type:'INTERACTIVE_STATE_CONTRAST',route,width,selector,state,failures:a.violations.map(v=>v.nodes.map(n=>n.failureSummary))});
    }
    await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    if(await el.evaluate(e=>e instanceof HTMLButtonElement)){
     await el.evaluate(e=>e.disabled=true);report.button_states.push({route,width,selector,state:'disabled',...await el.evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,opacity:s.opacity};}),wcag:'INACTIVE_CONTROL_EXEMPT'});await el.evaluate(e=>e.disabled=false);
    }
   }
  }
  await cdp.detach();console.log('INTERACTIVE_STATES',report.button_states.length);
 }
  await page.setViewportSize({width:1440,height:900});
  await page.goto(origin+'/',{waitUntil:'networkidle'});await settle();
  const copy=await page.locator('main').innerText();
  report.checks.push({name:'installation_scope',pass:!/монтаж вентиляции под ключ/i.test(copy)});
  const diagram=await page.locator('.solution-diagram').boundingBox();
  const diagramPosition=await page.locator('.solution-diagram').evaluate(el=>getComputedStyle(el).position);
  report.checks.push({name:'diagram_intrinsic_layout',pass:diagramPosition!=='absolute' && diagram.width>400});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('REPORT',output,'pages',report.pages.length,'issues',report.issues.length,'checks',report.checks);
  if(phase==='surfaces' && report.issues.length)console.error('RASTER_CONTRAST_DETAIL',JSON.stringify(report.issues,null,2));
  if(report.issues.length || report.checks.some(c=>!c.pass))process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
