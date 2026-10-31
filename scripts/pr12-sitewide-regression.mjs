// PR12: one bounded exact-commit browser regression, every generated page at ten viewports.
// Does not publish, send forms, run paid calls, or touch production.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const root=path.resolve('apps/web/dist');
const origin='http://127.0.0.1:4178';
const vp=[[320,700],[390,844],[430,932],[768,1024],[834,1112],[1024,768],[1364,646],[1440,900],[1600,900],[1920,1080]];
async function collect(dir){
 const results=[];
 for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const name=path.join(dir,item.name);
  if(item.isDirectory())results.push(...await collect(name));
  else if(item.name==='index.html')results.push(name);
 }
 return results;
}
const fileList=await collect(root), routes=fileList.map(x=>'/'+path.relative(root,path.dirname(x)).replaceAll(path.sep,'/')+'/').map(s=>s.replace(/^\/\//,'/')).sort();
if(routes.length!==50)throw Error('Expected 50 functional routes plus 404 HTML, got '+routes.length);
// This historical URL is a legitimate instant meta-refresh alias in static previews.
// Evaluate its actual SEO/redirect contract once; never race page.evaluate()
// against the browser navigation it intentionally triggers.
const legacyAlias='/obekty/novostroyki-i-zhilye-kompleksy/';
const aliasMarkup=await fs.readFile(path.join(root,legacyAlias.slice(1),'index.html'),'utf8');
if(!/http-equiv="refresh"\s+content="0;url=\/obekty\/novostroyki\/"/i.test(aliasMarkup)
 ||!/name="robots"\s+content="noindex,follow"/i.test(aliasMarkup)
 ||!/rel="canonical"\s+href="https:\/\/aeroventa\.ru\/obekty\/novostroyki\/"/i.test(aliasMarkup))
 throw Error('Legacy novostroyki alias redirect/noindex/canonical mismatch');
const inspectRoutes=routes.filter(route=>route!==legacyAlias);
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
const issues=[],captures=[],interactions=[],stats=[];
const output=path.resolve('PR12_SYSTEMIC_QA');
await fs.mkdir(output,{recursive:true});
const context=await browser.newContext({viewport:{width:1364,height:646},reducedMotion:'reduce',serviceWorkers:'block'});
const page=await context.newPage();
page.on('pageerror',err=>issues.push({route:page.url(),type:'JS_ERROR',detail:err.message.slice(0,240)}));
for(const [width,height] of vp){
 await page.setViewportSize({width,height});
 for(const route of inspectRoutes){
  const url=origin+route;
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:10000});
   if(!response||response.status()!==200){issues.push({route,width,height,type:'HTTP',status:response?.status()});continue;}
   const state=await page.evaluate(()=>{
    const h=document.querySelector('h1');
    const rect=h?.getBoundingClientRect();
    const visible=(el)=>{const b=el.getBoundingClientRect(),style=getComputedStyle(el);return b.width>0&&b.height>0&&style.visibility!=='hidden'&&style.display!=='none'};
    const buttons=[...document.querySelectorAll('main .button,main button[data-contact-open],main button[data-project-open]')].filter(visible);
    const viewportWidth=window.innerWidth;
    return {
     h1:!!h,top:Math.round(rect?.top??0),bottom:Math.round(rect?.bottom??0),
     textLength:(h?.textContent||'').trim().length,
     pageWidth:Math.round(document.documentElement.scrollWidth),
     viewportWidth,actionCount:buttons.length,
     clippedAction:buttons.some(x=>{const b=x.getBoundingClientRect();return b.width<36||b.height<32}),
     images:document.images.length
    };
   });
   stats.push({route,width,height,...state});
   // A positioned photo must not create an invisible second track on mobile.
   if(width<=1050){
    // Heading max-width is an optical reading measure. The former implicit track
    // constrained the text column, so measure that column independently of H1.
    const layout=await page.locator('.object-detail__hero-grid').evaluateAll(nodes=>nodes.map(el=>({display:getComputedStyle(el).display,flow:getComputedStyle(el).flexDirection,containerWidth:el.getBoundingClientRect().width,copyWidth:el.firstElementChild?.getBoundingClientRect().width||0,titleWidth:el.querySelector('h1')?.getBoundingClientRect().width||0})));
    for(const grid of layout)if(grid.display!=='flex'||grid.flow!=='column'||grid.copyWidth<grid.containerWidth*.95)issues.push({route,width,height,type:'OBJECT_HERO_IMPLICIT_TRACK',...grid});
   }
   if(!state.h1)issues.push({route,width,height,type:'NO_H1'});
   if(state.pageWidth>width+4)issues.push({route,width,height,type:'HORIZONTAL_OVERFLOW',delta:state.pageWidth-width});
   if(state.top< -6||state.bottom>height+12)issues.push({route,width,height,type:'H1_OUTSIDE_FIRST_FOLD',top:state.top,bottom:state.bottom});
   if(state.clippedAction)issues.push({route,width,height,type:'ACTION_GEOMETRY_TOO_SMALL'});
   // Selected real render evidence, NOT automatic artistic signoff.
   if([390,1364].includes(width)&&['/','/portfolio/','/montazh-ventiliacii/','/obekty/novostroyki/','/obekty/kvartiry-i-doma/','/contact/','/blog/','/portfolio/obekt/na-izluchine-nevy/'].includes(route)){
    const filename=route.replaceAll('/','_').replaceAll('-','_').slice(0,62)+(width===390?'__mobile':'__desktop')+'.jpg';
    await page.screenshot({path:path.join(output,filename),type:'jpeg',quality:70,fullPage:false});
    captures.push(filename);
   }
  }catch(e){issues.push({route,width,height,type:'NAVIGATION_EXCEPTION',detail:String(e).slice(0,250)})}
 }
}
async function scenario(label,url,steps){
 try{
  await page.setViewportSize({width:1364,height:646});
  await page.goto(origin+url,{waitUntil:'networkidle',timeout:16000});
  const outcome=await steps();
  interactions.push({label,result:'PASS',...outcome});
 }catch(e){issues.push({route:url,type:'INTERACTION',label,detail:String(e).slice(0,420)});interactions.push({label,result:'FAIL'})}
}
const eq=(a,b,label)=>{if(a!==b)throw Error(label+': expected '+b+' got '+a)};
await scenario('SPORT_LIGHTBOX_ONE_CLICK','/portfolio/',async()=>{
 await page.locator('[data-archive-open][data-gallery-title="Центр адаптивного спорта"]').first().click();
 const dlg=page.locator('#portfolio-archive-viewer');eq(await dlg.evaluate(d=>d.open),true,'open');
 const before=await dlg.locator('[data-gallery-photo]').getAttribute('src');
 await dlg.locator('[data-gallery-next]').click();
 const after=await dlg.locator('[data-gallery-photo]').getAttribute('src');
 if(before===after)throw Error('Next click did not advance');
 if(!/Фото 2 из 12/.test(await dlg.locator('[data-gallery-position]').innerText()))throw Error('Incorrect counter after first click');
 await page.keyboard.press('Escape');eq(await dlg.evaluate(d=>d.open),false,'Escape close');
 return {before,after};
});
await scenario('NEVA_SIX_IMAGES_GRID_AND_LIGHTBOX','/portfolio/obekt/na-izluchine-nevy/',async()=>{
 eq(await page.locator('.owner-case__photos button').count(),6,'gallery count');
 eq(await page.locator('.owner-case__photos img[src*="owner-neva-facade"]').count(),0,'no duplicate facade');
 const cols=await page.locator('.owner-case__photos button').evaluateAll(nodes=>new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().left))).size);
 eq(cols,3,'desktop 3 columns');
 await page.locator('.owner-case__photos button').first().click();
 const dlg=page.locator('#owner-case-viewer');eq(await dlg.evaluate(d=>d.open),true,'open');
 const before=await dlg.locator('[data-case-large]').getAttribute('src');
 await dlg.locator('[data-case-next]').click();
 const after=await dlg.locator('[data-case-large]').getAttribute('src');
 if(before===after)throw Error('Next click did not advance');
 await page.keyboard.press('Escape');eq(await dlg.evaluate(d=>d.open),false,'close');
 await page.setViewportSize({width:768,height:1024});
 const colsTablet=await page.locator('.owner-case__photos button').evaluateAll(nodes=>new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().left))).size);
 if(![2,3].includes(colsTablet))throw Error('Six source photographs need two or three balanced physical columns on tablet');return {cols,colsTablet,frames:6,before,after};
});
for(const route of ['/portfolio/obekt/apart-hotel/','/portfolio/obekt/akvilon-yanino/','/portfolio/obekt/himprom/']){
 await scenario('PROJECT_LIGHTBOX_'+route,route,async()=>{
  await page.locator('.owner-case__photos button').first().click();
  const dlg=page.locator('#owner-case-viewer');const before=await dlg.locator('[data-case-large]').getAttribute('src');
  await dlg.locator('[data-case-next]').click();const after=await dlg.locator('[data-case-large]').getAttribute('src');
  if(before===after)throw Error('Next click no change');await dlg.locator('[data-case-close]').click();
  eq(await dlg.evaluate(d=>d.open),false,'close');return {before,after};
 });
}
for(const route of ['/blog/detail/kak-my-sdali-7-domov/','/blog/detail/restoran-v-zhk-leontevskiy-mys/','/blog/detail/montazh-ventilyatsii-v-karelii/']){
 await scenario('CASE_VIEWER_'+route,route,async()=>{
  await page.locator('[data-case-photo]').first().click();
  const dlg=page.locator('#case-photo-viewer');eq(await dlg.evaluate(d=>d.open),true,'case viewer open');
  const before=await dlg.locator('[data-photo-large]').getAttribute('src');
  await dlg.locator('[data-photo-next]').click();const after=await dlg.locator('[data-photo-large]').getAttribute('src');
  if(before===after)throw Error('Next click no change');await page.keyboard.press('Escape');
  eq(await dlg.evaluate(d=>d.open),false,'case escape');return {before,after};
 });
}
await scenario('PONSSE_DOCUMENT','/blog/detail/montazh-ventilyatsii-v-karelii/',async()=>{
 await page.locator('[data-ponsse-open]').first().click();
 const dlg=page.locator('#ponsse-letter-dialog');eq(await dlg.evaluate(d=>d.open),true,'PONSSE open');
 await page.keyboard.press('Escape');eq(await dlg.evaluate(d=>d.open),false,'PONSSE close');return {};
});
await scenario('DIRECT_CATEGORY_NAVIGATION','/',async()=>{
 const labels=['/obekty/proizvodstvo/','/obekty/restorany-i-kafe/','/obekty/novostroyki/','/obekty/kvartiry-i-doma/','/obekty/magaziny-i-sklady/','/obekty/ofisy-i-kommerciya/'];
 for(const href of labels){
  const a=page.locator('a[href="'+href+'"]').first();
  if(await a.count()===0)throw Error('Category missing on HOME '+href);
 }return {routes:labels.length};
});
await browser.close();
const result={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),generated_at:new Date().toISOString(),routes:routes.length,legacy_alias_verified:legacyAlias,inspected_routes:inspectRoutes.length,viewports:vp.length,route_viewport_samples:stats.length,captures,interactions,issues,verdict:issues.length?'FAIL':'PASS_GEOMETRY_AND_INTERACTION_ONLY',artistic_acceptance:'NOT_PROVEN'};
await fs.writeFile(path.join(output,'sitewide.json'),JSON.stringify(result,null,2));
console.log('PR12_SITEWIDE_REGRESSION',JSON.stringify({...result,captures:captures.length,issues:issues.slice(0,35)},null,2).slice(0,9000));
if(issues.length)process.exitCode=1;
