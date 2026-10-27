// Controlled cold-load LAB evidence only. No field CWV or deployed-network claims.
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';
import {execFileSync}from'node:child_process';import{performance}from'node:perf_hooks';import{chromium}from'playwright';
const out=path.resolve(process.env.LOADING_QA_OUTPUT||'PR12_LOADING_QA');await fs.mkdir(out,{recursive:true});
const versions=[['candidate',path.resolve('apps/web/dist')]];
if(process.env.LOADING_QA_BASELINE)versions.unshift(['baseline',path.resolve(process.env.LOADING_QA_BASELINE)]);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={source_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'one cold sample per route/viewport/version; Chromium, CPU x4, RTT 80 ms, 4 Mbps; localhost fixture, not field CWV',samples:[],comparisons:[],issues:[]};
try{for(const[version,root]of versions){
 const server=http.createServer(async(req,res)=>{try{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root&&!p.startsWith(root+path.sep))throw Error('Invalid path');if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p).toLowerCase()]||'application/octet-stream','Content-Length':b.length});res.end(b);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const[width,height]of[[1440,900],[390,844]])for(const route of['/','/services/','/portfolio/','/portfolio/obekt/na-izluchine-nevy/','/blog/detail/kak-vytashchit-zastryavshuyu-koronku-iz-betona/','/contact/']){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:500000,uploadThroughput:250000});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{window.__avLab={lcp:0,cls:0,longTasks:0};for(const[type,key]of[['largest-contentful-paint','lcp'],['layout-shift','cls'],['longtask','longTasks']])try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(key==='lcp')window.__avLab.lcp=e.startTime;else if(key==='cls'&&!e.hadRecentInput)window.__avLab.cls+=e.value;else if(key==='longTasks')window.__avLab.longTasks+=e.duration;}}).observe({type,buffered:true});}catch{}});
  try{
   const response=await page.goto(origin+route,{waitUntil:'networkidle',timeout:45000});if(response.status()!==200)throw Error('HTTP '+response.status());
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const facts=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],p=performance.getEntriesByType('paint'),r=performance.getEntriesByType('resource');return{...window.__avLab,fcp:p.find(p=>p.name==='first-contentful-paint')?.startTime||0,dcl:n.domContentLoadedEventEnd,load:n.loadEventEnd,requests:r.length,encoded_bytes:r.reduce((n,r)=>n+r.encodedBodySize,0),source_sha:document.querySelector('meta[name="aeroventa:source"]')?.content,broken_first_view_images:[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&(!i.complete||!i.naturalWidth)}).map(i=>i.getAttribute('src'))};});
   if(facts.broken_first_view_images.length||facts.cls>.1)report.issues.push({version,route,width,reason:facts.cls>.1?'CLS_GT_0_1':'BROKEN_VISIBLE_IMAGE',facts});
   if(route==='/portfolio/'||route.includes('na-izluchine')){
    const sport=route==='/portfolio/',trigger=sport?'[data-archive-open][data-gallery-title="Центр адаптивного спорта"]':'.owner-case__photos button',img=sport?'#portfolio-archive-viewer [data-gallery-photo]':'#owner-case-viewer [data-case-large]',next=sport?'[data-gallery-next]':'[data-case-next]';
    let start=performance.now();await page.locator(trigger).first().click();await page.locator(img).evaluate(i=>i.decode());facts.gallery_open_decode_ms=performance.now()-start;
    start=performance.now();await page.locator(next).click();await page.locator(img).evaluate(i=>i.decode());facts.gallery_next_decode_ms=performance.now()-start;
   }
   report.samples.push({version,route,width,height,...facts});console.log('LOADING',version,width,route,JSON.stringify({lcp:Math.round(facts.lcp),cls:facts.cls,bytes:facts.encoded_bytes}));
  }catch(e){report.issues.push({version,route,width,error:String(e)})}finally{await context.close();}
 }}finally{await new Promise(r=>server.close(r));}
}
for(const sample of report.samples.filter(s=>s.version==='candidate')){const before=report.samples.find(s=>s.version==='baseline'&&s.route===sample.route&&s.width===sample.width);if(!before)continue;const ratio=before.lcp?sample.lcp/before.lcp:null;const comparison={route:sample.route,width:sample.width,before_lcp_ms:before.lcp,after_lcp_ms:sample.lcp,ratio,before_cls:before.cls,after_cls:sample.cls,encoded_byte_delta:sample.encoded_bytes-before.encoded_bytes};report.comparisons.push(comparison);if(ratio>1.4&&sample.lcp-before.lcp>500)report.issues.push({reason:'MATERIAL_LAB_LCP_REGRESSION',...comparison});}
}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log('LOADING_REPORT',report.samples.length,'samples',report.issues.length,'issues');if(report.issues.length)process.exitCode=1;
