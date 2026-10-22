import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('V43_OWNER_BROWSER_REVIEW');
const baseUrl = 'http://127.0.0.1:4178';
const views = [
  ['mobile_320', 320, 720],
  ['mobile_360', 360, 780],
  ['mobile_390', 390, 844],
  ['mobile_430', 430, 932],
  ['tablet_768', 768, 1024],
  ['tablet_834', 834, 1100],
  ['tablet_1024', 1024, 768],
  ['laptop_1280', 1280, 800],
  ['desktop_1440', 1440, 900],
  ['desktop_1920', 1920, 1080],
];
const routes = [
  ['home', '/'],
  ['ventilation', '/montazh-ventiliacii/'],
  ['services', '/services/'],
  ['newbuilds', '/obekty/novostroyki/'],
  ['private_objects','/obekty/kvartiry-i-doma/'],
  ['commercial_objects','/obekty/ofisy-i-kommerciya/'],
  ['warehouse_objects','/obekty/sklady/'],
  ['production_objects','/obekty/proizvodstvo/'],
  ['restaurants', '/obekty/restorany-i-kafe/'],
  ['portfolio', '/portfolio/'],
  ['seven_park', '/blog/detail/kak-my-sdali-7-domov/'],
  ['articles', '/blog/'],
  ['about', '/about/'],
  ['contact', '/contact/'],
  ['karelia_ponsse', '/blog/detail/montazh-ventilyatsii-v-karelii/'],
  ['polisan', '/blog/detail/ntff-polisan/'],
  ['leont', '/blog/detail/restoran-v-zhk-leontevskiy-mys/'],
  ['zhukov', '/blog/detail/kvartira-na-zhukova/'],
  ['cafe', '/blog/detail/kafe-rimskogo-korsakova-3/'],
  ['objects', '/obekty/'],
  ['project_ready', '/montazh-po-proektu/'],
  ['project_not_ready', '/obekt-bez-gotovogo-proekta/'],
  ['articles_index', '/blog/poleznye-stati/'],
  ['case_stories', '/blog/istorii-proektov/'],
  ['faq', '/faq/'],
  ['drill_crown', '/blog/detail/kak-vytashchit-zastryavshuyu-koronku-iz-betona/'],
  ['drill_screed', '/blog/detail/almaznoe-burenie-v-styazhke-pod-stoyaki-otopleniya/'],
  ['drill_cost', '/blog/detail/stoimost-almaznogo-bureniya-kak-rasschitat-tsenu/'],
  ['drill_horizontal', '/blog/detail/gorizontalnoe-almaznoe-burenie/'],
  ['drill_hub', '/almaznoe-burenie/'],
  ['drill_history', '/blog/detail/novoe-almaznoe-burenie/'],
  ['reviews_archive', '/blog/obzory-i-intervyu/'],
  ['covid', '/covid-pritochnaya-ventilacia/'],
  ['news_archive', '/news/'],
  ['company_history', '/news/istoriya-kompanii/'],
  ['corporate_archive', '/news/korporativnaya-zhizn/'],
  ['events_archive', '/news/znachimye-sobytiya/'],
  ['privacy', '/privacy/'],
  ['vacancies', '/vakansii/'],
  ['notfound_preview', '/404.html'],
];
await fs.mkdir(root, { recursive: true });
const report = { build_mode: 'fixture', local_http_only: true, routes: routes.length, viewports: views.map(x => x[0]), pages: [], fail: [], owner_media: [] };
for (const [name, file, expected] of [
  ['services_owner_640','apps/web/public/evidence/hero/services-owner-editorial-640.webp','f86045ef038c95c93ed8c7968c19a149cc1b822b0495fa94a9b40da43c0a3e6f'],
  ['services_owner_1100','apps/web/public/evidence/hero/services-owner-editorial-1100.webp','e9e9e51c2a5b390f94d45880082a8fc63a34165c3e575677c809889d998d4aa5'],
  ['services_owner_1774','apps/web/public/evidence/hero/services-owner-editorial-1774.webp','b4c95b0a5a17a011f8adf6dc7f635d7c68c8222281cf0377e9637fb1552f25ca'],
  ['home_approved_original','apps/web/public/evidence/hero/owner-luxury-airflow-20261010.png','56704487b748269038168c1cb64f74b4415054e61a2e73b3e9a6f2eb002f83ee'],
  ['ponsse_letter','apps/web/public/evidence/karelia/ponsse-letter-20220405.png','67287d0c52b42391a9e4e8ff105b779093b64b3cf5e2ddb3897218f69848f886'],
  ['ponsse_portrait','apps/web/public/evidence/karelia/p-teittinen-original.jpg','73376f20193c18e4d99ba148df98ae21ec69988f5e372db72edc295a3b964d95'],
]) {
  let actual = null;
  try { actual = createHash('sha256').update(await fs.readFile(path.resolve(file))).digest('hex'); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const status = actual === null ? 'PENDING_UPLOAD' : actual === expected ? 'EXACT' : 'HASH_MISMATCH';
  report.owner_media.push({name,file,status,expected_sha256:expected,actual_sha256:actual});
  if (status === 'HASH_MISMATCH') report.fail.push({ reason: 'Owner media corruption', name, actual, expected });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const [id, route] of routes) {
    for (const [view, width, height] of views) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const entry = { route, view, width, height, status: null, overflow_px: null, broken_images: null, page_errors: [] };
      try {
        const res = await page.goto(baseUrl + route, { waitUntil: 'load', timeout: 25000 });
        entry.status = res?.status() ?? 0;
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(img => {
            img.loading = 'eager';
            return img.decode().catch(() => {});
          }));
        });
        entry.overflow_px = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
        if (entry.overflow_px > 1) entry.overflow_debug = await page.evaluate(() => ({
          viewport: innerWidth,
          html: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
          body: { scroll: document.body.scrollWidth, client: document.body.clientWidth },
          candidates: [...document.querySelectorAll('body *')].map(el => {
            const style = getComputedStyle(el), rect = el.getBoundingClientRect();
            return { tag:el.tagName.toLowerCase(), cls:typeof el.className === 'string' ? el.className.slice(0,90):'',
             scroll:el.scrollWidth,client:el.clientWidth,left:Math.round(rect.left),right:Math.round(rect.right),
             after:getComputedStyle(el,'::after').content.slice(0,80),before:getComputedStyle(el,'::before').content.slice(0,80)};
          }).filter(x => x.scroll > x.client + 3 && x.client > 0).sort((a,b) => (b.scroll-b.client)-(a.scroll-a.client)).slice(0,24),
        }));
        if (entry.overflow_px > 1) entry.offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return style.display !== 'none' && box.width > 0 && (box.right > innerWidth + 2 || box.left < -2);
        }).slice(0, 16).map(el => {
          const b = el.getBoundingClientRect();
          return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 85), left: Math.round(b.left), right: Math.round(b.right), text: (el.textContent || '').trim().slice(0, 55) };
        }));
        entry.broken_images = await page.evaluate(() => [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.getAttribute('src')));
        entry.page_errors = pageErrors;
        if (id === 'home') {
          const expectedHero = '/evidence/hero/owner-luxury-airflow-20261010.png';
          const actualHero = await page.locator('.hero-engineering__photo').getAttribute('src');
          if (actualHero !== expectedHero) report.fail.push({route,view,reason:'Latest Owner calm HERO source mismatch',expectedHero,actualHero});
          const optical = await page.evaluate(() => {
            const image = document.querySelector('.home-hero--owner-airflow .hero-engineering__photo');
            const photo = document.querySelector('.home-hero--owner-airflow .hero-engineering');
            const copy = document.querySelector('.home-hero--owner-airflow .home-hero__copy');
            const strip = document.querySelector('.home-hero--owner-airflow .object-ribbon');
            const inline = document.querySelector('.home-consultant-inline');
            const fixed = document.querySelector('.consultant-launcher');
            const rect = el => el?.getBoundingClientRect();
            const p = rect(photo),c=rect(copy),r=rect(strip);
            return {
              natural_width:image?.naturalWidth??0,photo_fit:image?getComputedStyle(image).objectFit:null,
              copy_background:copy?getComputedStyle(copy).backgroundColor:null,
              photo_left:p?.left??0,photo_right:p?.right??0,photo_top:p?.top??0,photo_bottom:p?.bottom??0,
              copy_left:c?.left??0,copy_top:c?.top??0,copy_right:c?.right??0,copy_bottom:c?.bottom??0,
              strip_top:r?.top??0,inline_visible:inline?getComputedStyle(inline).display!=='none':false,
              floating_visible:fixed?getComputedStyle(fixed).display!=='none' && getComputedStyle(fixed).visibility!=='hidden' && parseFloat(getComputedStyle(fixed).opacity)>.01:false,
              diagram_count:document.querySelectorAll('.home-solution .solution-diagram,.home-solution .solution-mobile-pair').length,
              desktop_diagram_visible:!!document.querySelector('.home-solution .solution-diagram') && getComputedStyle(document.querySelector('.home-solution .solution-diagram')).display !== 'none',
              mobile_pair_visible:!!document.querySelector('.home-solution .solution-mobile-pair') && getComputedStyle(document.querySelector('.home-solution .solution-mobile-pair')).display !== 'none',
              process_stages:document.querySelectorAll('.home-solution .process-strip > div').length,
            };
          });
          const isMobile = width <= 760;
          // P0 2026-10-16 full-bleed HOME: copy overlays source photo on desktop;
          // mobile preserves independent reading order before the contained image.
          const mobileReadingOrder = optical.photo_top >= optical.copy_bottom - 3 &&
            ['cover','contain'].includes(optical.photo_fit) && optical.strip_top >= optical.photo_bottom - 3;
          const desktopBleed = optical.photo_fit === 'cover' &&
            optical.photo_left <= 3 && optical.photo_right >= width - 3 &&
            optical.copy_left >= -1 && optical.copy_right <= width + 3 &&
            optical.photo_bottom > optical.copy_top + 100 &&
            optical.copy_background === 'rgba(0, 0, 0, 0)';
          const ownerScenePass = optical.natural_width >= 1200 &&
            optical.diagram_count === 2 && optical.process_stages === 4 &&
            (isMobile ? (!optical.desktop_diagram_visible && optical.mobile_pair_visible) :
                        (optical.desktop_diagram_visible && !optical.mobile_pair_visible)) &&
            (isMobile ? mobileReadingOrder : desktopBleed) &&
            (!isMobile || (!optical.inline_visible && optical.floating_visible));
          if (!ownerScenePass) report.fail.push({route,view,reason:'Approved Owner airflow HERO scene/adaptation contract',optical});
          const recognition = page.locator('.home-ponsse');
          const orderCorrect = await page.evaluate(() => {
            const section = document.querySelector('.home-ponsse');
            const prior = section?.previousElementSibling;
            const after = section?.nextElementSibling;
            const afterLetter = after?.matches('dialog#home-ponsse-letter-dialog') ? after.nextElementSibling : after;
            return prior?.id === 'objects' &&
              !!prior?.previousElementSibling?.classList.contains('case-feature') &&
              !!after?.matches('dialog#home-ponsse-letter-dialog') &&
              !!afterLetter?.classList.contains('decision-preview');
          });
          if (!orderCorrect || await recognition.count() !== 1 ||
              await recognition.locator('img[src="/evidence/karelia/ponsse-letter-20220405.png"]').count() !== 1 ||
              await recognition.locator('a[href="/blog/detail/montazh-ventilyatsii-v-karelii/"]').count() !== 1) {
            report.fail.push({route,view,reason:'PONSSE historical proof placement and direct case path',orderCorrect});
          }
          // New Owner requirement: low-key international industrial context, not a trophy claim.
          if (view === 'desktop_1440' || view === 'mobile_390') {
            const txt = await recognition.innerText();
            const h2 = await recognition.locator('h2').innerText();
            if (!txt.includes('вентиляционные работы') ||
                !txt.includes('Питкяранте') || !txt.includes('5 апреля 2022 года') ||
                h2 !== 'Письмо PONSSE' ||
                /международное признание|европейское качество|мировой уровень|финская компания/i.test(txt)) {
              report.fail.push({route,view,reason:'Owner PONSSE factual calm editorial copy',h2,txt:txt.slice(0,360)});
            }
          }
          const opened = await page.locator('dialog[open]').count();
          if (opened) report.fail.push({route,view,reason:'Surprise modal on initial page load',opened});
        }
        if (id === 'about') {
          if (view === 'desktop_1440' || view === 'mobile_390') {
            const group = page.locator('.about-hero__team--group img');
            const panov = page.locator('.about-team__photo--lead img');
            const expectedGroup = '/evidence/team/owner-team-group-20261015.webp';
            const expectedPanov = '/evidence/team/owner-evgeniy-panov-20261015.webp';
            // Compare displayed WebP subjects against the two PNG originals supplied
            // by Owner on 14 October. 8x8 grayscale fingerprints tolerate WebP coding
            // but detect the wrong group/person. No raw PNG reaches webroot.
            // Group source SHA256 c6659ec091b93c37f3f6eb9a48284fd429e68032d82288839e63677aaf8eae83
            // Panov source SHA256 64f0eaab5fa18abd878bb0e175f55827c6e73ba79ab72dea0579bcd635652207
            const expectedFps = ['ffffff0100000021','e0c1cfedc1c18100'];
            // Perceptual grayscale hashes alone falsely PASSED the orange jacket.
            // The build also checks SHA256 of these exact Owner media assets.
            const originalAssetDigests = ['0a507849d6d8b54688779af5fab086e228272908310ff1c408b93c6afdaebb3a',
              '6227996e36b7c4b0a9cfb889f447b9dba6569a5d6a4154e628cf323aefec2f09'];
            const actualAssetDigests = await Promise.all([expectedGroup,expectedPanov].map(async asset => {
              const bytes = await page.evaluate(async src=>{
                const response=await fetch(src,{cache:'no-store'});
                if(!response.ok)throw new Error('Missing Owner asset: '+src);
                const buf=await response.arrayBuffer();
                const hash=await crypto.subtle.digest('SHA-256',buf);
                return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
              },asset);
              return bytes;
            }));
            const diffBits = (s,t) => {
              let count=0;
              for(let k=0;k<16;k++){
                const v=parseInt(s[k],16)^parseInt(t[k],16);
                count+=((v>>0)&1)+((v>>1)&1)+((v>>2)&1)+((v>>3)&1);
              }
              return count;
            };
            const media = await Promise.all([group,panov].map(async (loc,index) => {
              const count=await loc.count();
              if (!count) return {count,src:null,loaded:false,fingerprint:null,distance:64};
              const img=loc.first();
              const src=await img.getAttribute('src');
              const rendered=await img.evaluate(async el=>{
                el.loading='eager'; // load offscreen portrait explicitly for deterministic evidence
                try { await el.decode(); } catch { /* reported via naturalWidth */ }
                if (!el.complete || !el.naturalWidth) return null;
                const c=document.createElement('canvas');c.width=8;c.height=8;
                const ctx=c.getContext('2d',{willReadFrequently:true});
                if(!ctx)return null;
                ctx.drawImage(el,0,0,8,8);
                const px=ctx.getImageData(0,0,8,8).data;
                const l=[];for(let i=0;i<64;i++){const j=i*4;l.push(.2126*px[j]+.7152*px[j+1]+.0722*px[j+2]);}
                const average=l.reduce((a,b)=>a+b,0)/64;
                let out='';for(const v of l)out+=v>=average?'1':'0';
                return {hash:BigInt('0b'+out).toString(16).padStart(16,'0'),width:el.naturalWidth,height:el.naturalHeight};
              });
              return {count,src,loaded:!!rendered,fingerprint:rendered?.hash||null,
                dimensions:rendered?[rendered.width,rendered.height]:null,
                distance:rendered?diffBits(rendered.hash,expectedFps[index]):64};
            }));
            if(media[0].count!==1 || media[0].src!==expectedGroup || !media[0].loaded ||
               media[1].count!==1 || media[1].src!==expectedPanov || !media[1].loaded ||
               media.some(x=>x.distance>12) || actualAssetDigests.some((digest,i)=>digest!==originalAssetDigests[i]) ||
               await page.locator('.about-hero__team img[src*="img_4170"]').count()) {
              report.fail.push({route,view,reason:'Owner original group and Panov perceptual source match',media});
            }
          }
          const optical = await page.evaluate(() => {
            const h = document.querySelector('.about-hero h1')?.getBoundingClientRect();
            const i = document.querySelector('.about-hero__team img');
            const p = i?.getBoundingClientRect();
            const l = document.querySelector('.consultant-launcher')?.getBoundingClientRect();
            const overlaps = !!p && !!l && Math.max(p.left,l.left)<Math.min(p.right,l.right) &&
              Math.max(p.top,l.top)<Math.min(p.bottom,l.bottom);
            return {headingTop:h?.top,photoTop:p?.top,photoWidth:i?.naturalWidth,photoHeight:p?.height,photoBottom:p?.bottom,launcherOverlap:overlaps,launcherVisible:!!l && getComputedStyle(document.querySelector('.consultant-launcher')).display!=='none' && getComputedStyle(document.querySelector('.consultant-launcher')).visibility!=='hidden' && parseFloat(getComputedStyle(document.querySelector('.consultant-launcher')).opacity)>.01,inlineConsultant:!!document.querySelector('.about-hero a[data-consultant-open][data-source="about_inline"]')};
          });
          if (!optical.photoWidth || optical.headingTop == null || optical.headingTop >= height*.55 ||
              (width<=760 && (optical.photoHeight < 250 || optical.photoHeight > height*.85 || optical.photoTop >= height*.7 || !optical.launcherVisible || !optical.inlineConsultant))) {
            report.fail.push({route,view,reason:'About first-fold heading and documentary team photo must be visible without consultant obscuring the image',optical});
          }
        }
        if (id === 'portfolio') {
          const cards = page.locator('.portfolio-card');
          const count = await cards.count();
          const photos = await cards.locator('img').count();
          const ponsse = await page.locator('.portfolio-card:has-text("PONSSE")').count();
          const requiredCovers = {
            'Ресторан в ЖК': '/evidence/leont/owner-cover-v43.webp',
            'Маршала Жукова': '/evidence/zhukov/owner-cover-v43.webp',
            'PONSSE': '/evidence/karelia/owner-cover-v43.webp',
            'Римского-Корсакова': '/evidence/cafe/owner-cover-v43.webp',
          };
          for (const [name, src] of Object.entries(requiredCovers)) {
            const count = await page.locator(`.portfolio-card:has-text("${name}") img[src="${src}"]`).count();
            if (count !== 1) report.fail.push({route,view,reason:'Owner authentic cover mismatch',name,src,count});
          }
          // Latest Owner P0: Polisan is an editorial feature with the actual facade,
          // not a duplicate roof-image card; 7 PARK is kept on HOME and its own case.
          const polisanFeature=page.locator('.portfolio-feature img[src="/evidence/polisan/owner-cover-v43.webp"]');
          if(await polisanFeature.count()!==1)
            report.fail.push({route,view,reason:'Owner Polisan chosen facade must be visible as portfolio editorial feature'});
          const historical = page.locator('a.portfolio-card[href^="/blog/detail/"]');
          const archives = page.locator('button.portfolio-card[data-archive-open][aria-controls="portfolio-archive-viewer"]');
          const historicUrls = await historical.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
          const sourceValid = await archives.evaluateAll(nodes=>{
            // The original three photos stay source-locked; the 68 SHA-verified
            // gallery photographs are now committed at their canonical paths.
            const expected = new Map([
              ['apart-hotel',13], ['eurospar-vo',9],
              ['eurospar-sestroretsk',11], ['college-obvodny',15],
              ['novatech',10], ['akvilon-yanino',19], ['himprom',11],
            ]);
            let nevaCount=0;
            const allValid=nodes.every(n=>{
              const cover = n.querySelector('img')?.getAttribute('src') || '';
              const urls = JSON.parse(n.getAttribute('data-gallery-images')||'[]');
              if(cover==='/evidence/residential/owner-neva-facade-20261016.jpg'){
                nevaCount++;
                const nevaPrefix='/evidence/residential/neva/';
                return urls.length===4 && urls[0]===cover &&
                  new Set(urls).size===4 &&
                  urls.slice(1).every((u,i)=>u===nevaPrefix+'curated-'+String(i+1).padStart(2,'0')+'.webp');
              }
              const slug = cover.match(/^\/evidence\/owner-portfolio\/([a-z0-9-]+)\//)?.[1];
              if (!expected.has(slug)) return false;
              const prefix = '/evidence/owner-portfolio/' + slug + '/';
              const valid = urls.length === expected.get(slug) &&
                urls[0] === prefix + 'cover.webp' &&
                new Set(urls).size === urls.length &&
                urls.every(u=>u.startsWith(prefix) &&
                  /^(?:cover|0[2-9]|[1-9][0-9]|gallery-[0-9]{2,3})\.webp$/.test(u.slice(prefix.length)));
              expected.delete(slug);
              return valid;
            });
            return nodes.length===8 && nevaCount===1 && allValid && expected.size===0;
          });
          if (count !== 12 || photos !== 12 || ponsse !== 1 ||
              await historical.count() !== 4 || await archives.count() !== 8 ||
              !sourceValid || !historicUrls.every(h=>h?.startsWith('/blog/detail/')) ||
              await page.locator('.portfolio-feature a[href="/blog/detail/ntff-polisan/"]').count() !== 1 ||
              await page.locator('.portfolio-feature a[href="/blog/detail/kak-my-sdali-7-domov/"]').count() !== 0) {
            report.fail.push({route,view,reason:'Owner diversified archive portfolio + Polisan editorial feature, 7 PARK not featured',count,photos,ponsse,historic:historicUrls,archiveCount:await archives.count(),sourceValid});
          }
        }
        if (['drill_crown', 'drill_screed', 'drill_cost', 'drill_horizontal'].includes(id)) {
          // Exact original photograph locations remain in the source article DOM.
          const reading = page.locator('.p0-story__body');
          const restoredText = await reading.innerText();
          const inlineCount = await reading.locator('img[src^="/upload/medialibrary/"]').count();
          const required = {drill_crown:10,drill_screed:21,drill_cost:4,drill_horizontal:29}[id];
          const detached = await page.locator('.p0-source-photo-gallery, .p0-historic-reading').count();
          const imagesValid = await reading.evaluate(node =>
            [...node.querySelectorAll('img')].every(img =>
              img.getAttribute('src')?.startsWith('/upload/medialibrary/') &&
              img.closest('p,li,div') && img.complete && img.naturalWidth > 0));
          if (restoredText.trim().length < 350 || inlineCount !== required ||
              detached !== 0 || !imagesValid) {
            report.fail.push({route,view,reason:'Exact inline historical photo-instruction',
              chars:restoredText.length,inlineCount,required,detached,imagesValid});
          }
        }
        if (id === 'services') {
          // 14 Oct Owner explicitly rejected the old two-photo services HERO.
          const photographicProof = page.locator('.services-hero__backdrop--single img');
          const expected = ['/evidence/hero/project-not-ready-owner-concept-1672.webp'];
          const actual = await photographicProof.evaluateAll(nodes=>nodes.map(n=>new URL(n.src).pathname));
          const wrong = await page.locator('.services-hero img[src="/evidence/hero/engineering-ductwork.jpg"],.services-hero img[src="/evidence/cafe/owner-cover-v43.webp"]').count();
          const servicesOptical = await page.evaluate(() => {
            const pics=[...document.querySelectorAll('.services-hero__backdrop--single img')];
            const intro=document.querySelector('.services-hero__intro');
            const picture = pics[0]?.getBoundingClientRect();
            const text = intro?.getBoundingClientRect();
            const inline=document.querySelector('.services-consultant-inline');
            const floating=document.querySelector('.consultant-launcher');
            return {
              natural_widths:pics.map(n=>n.naturalWidth),
              object_fits:pics.map(n=>getComputedStyle(n).objectFit),
              photo_top:picture?.top??0,
              photo_bottom:picture?.bottom??0,
              intro_top:text?.top??0,
              intro_bottom:text?.bottom??0,
              inline_visible:inline?getComputedStyle(inline).display!=='none':false,
              floating_visible:floating?getComputedStyle(floating).display!=='none' && getComputedStyle(floating).visibility!=='hidden' && parseFloat(getComputedStyle(floating).opacity)>.01:false
            };
          });
          const mobile=width<=760;
          if (JSON.stringify(actual)!==JSON.stringify(expected) || wrong ||
              servicesOptical.natural_widths.length!==1 ||
              servicesOptical.natural_widths.some(n=>n<400) ||
              servicesOptical.object_fits.some(n=>n!=='contain') ||
              (mobile && (servicesOptical.photo_bottom>servicesOptical.intro_top+3 ||
                  servicesOptical.inline_visible)) ||
              servicesOptical.floating_visible) {
            report.fail.push({route,view,reason:'Owner Services single authentic image, no obstructive launcher in first fold',wrong,actual,servicesOptical});
          }
          // Even after suppressing the colliding initial launcher, the
          // consultant must remain reachable on scroll by keyboard and pointer.
          await page.evaluate(()=>{
            const strip=document.querySelector('.services-hero__routes');
            if(!strip)throw new Error('Missing Services category strip');
            window.scrollTo({top:window.scrollY+strip.getBoundingClientRect().bottom+40,behavior:'instant'});
          });
          await page.waitForFunction(()=>document.documentElement.classList.contains('is-past-first-fold'),null,{timeout:4500});
          const postFoldLauncher=await page.locator('.consultant-launcher').evaluate(el=>{
            const s=getComputedStyle(el),r=el.getBoundingClientRect();
            return s.visibility!=='hidden'&&s.display!=='none'&&s.pointerEvents!=='none'&&r.width>0&&r.height>0;
          });
          if(!postFoldLauncher)report.fail.push({route,view,reason:'Services consultant must reappear after first fold'});
          await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
          await page.waitForFunction(()=>!document.documentElement.classList.contains('is-past-first-fold'),null,{timeout:4500});
        }
        if (id === 'ventilation') {
          const architectural = await page.locator('.service-premium__visual img[src="/evidence/hero/hiend-engineering-visual-owner-v43.webp"]').count();
          const wrong = await page.locator('.service-premium__visual img[src="/evidence/hero/engineering-ductwork.jpg"]').count();
          if (architectural !== 1 || wrong) report.fail.push({ route, view, reason: 'Owner montage hero assignment', architectural, wrong });
        }
        if (['seven_park','karelia_ponsse','polisan','leont','zhukov','cafe'].includes(id)) {
          // Polisan follows the 2026-10-17 Owner rule: 12 selected unique images in the visible story.
          // Its other source files remain in git, not as duplicate public thumbnails.
          const expectedGallery = {leont:26,cafe:10,zhukov:5};
          if (Object.hasOwn(expectedGallery,id)) {
            const archiveImages = await page.locator('.case-gallery__archive .case-gallery__item img').count();
            if (archiveImages !== expectedGallery[id]) report.fail.push({route,view,reason:'Original case archive not fully represented',archiveImages,expected:expectedGallery[id]});
          }
          const media = await page.locator('.case-gallery__item img, .case-gallery__curated-item img, .case-gallery__seven-item img, .case-gallery__ponsse-item img').count();
          const story = await page.locator('.case-story__grid > div').count();
          if (media < 2 || story !== 3) report.fail.push({ route, view, reason: 'object evidence/story missing', media, story });
          if (id === 'seven_park') {
            const selected=await page.locator('.case-gallery__seven-item img').evaluateAll(
              nodes=>nodes.map(img=>({src:new URL(img.getAttribute('src'),location.href).pathname,
                naturalWidth:img.naturalWidth,visible:img.getBoundingClientRect().width>0&&getComputedStyle(img).visibility!=='hidden'})));
            const originals=(await fs.readdir('apps/web/public/evidence/7park/archive')).filter(name=>name.endsWith('.webp'));
            const columns=await page.locator('.case-gallery__seven-park').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
            const expectedColumns=width<=460?1:width<=800?2:width<=1120?3:4;
            if(selected.length!==12||new Set(selected.map(x=>x.src)).size!==12||
              selected.some(x=>x.naturalWidth<300||!x.visible)||originals.length!==17||
              selected.some(x=>!originals.includes(x.src.split('/').at(-1)))||
              columns!==expectedColumns||await page.locator('.case-gallery__archive[data-case-archive]').count()>0){
              report.fail.push({route,view,reason:'7 PARK gallery must show 12 genuine unique photos, complete responsive rows, retain 17 source assets',
                selected:selected.length,unique:new Set(selected.map(x=>x.src)).size,originals:originals.length,columns,expectedColumns});
            }
          }
          if (id === 'polisan') {
            const selected = await page.locator('.case-gallery__curated-item img').evaluateAll(
              nodes => nodes.map(img => new URL(img.getAttribute('src'), location.href).pathname)
            );
            const cover = await page.locator('.case-detail-hero__photo-open img').getAttribute('src');
            const rows = await page.locator('.case-gallery__curated-row').evaluateAll(
              nodes => nodes.map(row => row.querySelectorAll('img').length)
            );
            const publicPaths = [cover, ...selected];
            const archiveAssets = (await fs.readdir('apps/web/public/evidence/polisan/archive')).filter(name => name.endsWith('.webp'));
            const originalCount = archiveAssets.length;
            if (selected.length !== 12 || publicPaths.length !== 13 ||
                new Set(publicPaths).size !== 13 || rows.join(',') !== '4,4,4' ||
                originalCount !== 15 ||
                !publicPaths.every(source => source?.startsWith('/evidence/polisan/'))) {
              report.fail.push({route,view,reason:'Polisan Owner 12-photo art direction and 15 preserved source assets',
                selected: selected.length, unique: new Set(publicPaths).size, rows, originalCount});
            }
          }
          const hiddenArchive = await page.locator('details.case-gallery-archive, .case-gallery-archive details').count();
          if (hiddenArchive) report.fail.push({route,view,reason:'Case photos must not be gated behind a disclosure',hiddenArchive});
        }
        if (id === 'karelia_ponsse') {
          const content = await page.locator('.ponsse-recognition').innerText();
          if (!content.includes('05.04.2022') || !content.includes('Petteri Teittinen')) report.fail.push({ route, view, reason: 'PONSSE letter editorial content absent' });
          const selected=await page.locator('.case-gallery__ponsse-item img').evaluateAll(nodes=>nodes.map(img=>img.getAttribute('src')));
          const preserved=(await fs.readdir('apps/web/public/evidence/karelia/archive')).filter(name=>name.endsWith('.webp')).length;
          const columns=await page.locator('.case-gallery__ponsse-curated').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
          const expectedColumns=width<=470?1:width<=850?2:3;
          if(selected.length!==12||new Set(selected).size!==12||preserved!==20||
            await page.locator('.case-gallery__archive[data-case-archive]').count()>0||columns!==expectedColumns)
            report.fail.push({route,view,reason:'PONSSE 12 curated photos visible, 20 original/archived files preserved, complete grid rows',selected:selected.length,preserved,columns,expectedColumns});
          const expectedLetter = report.owner_media.find(x=>x.name==='ponsse_letter')?.status === 'EXACT';
          const expectedPortrait = report.owner_media.find(x=>x.name==='ponsse_portrait')?.status === 'EXACT' && process.env.PUBLIC_PONSSE_PORTRAIT_PUBLICATION_APPROVED === 'true';
          const actualLetter = await page.locator('[data-ponsse-open] img').count();
          const actualPortrait = await page.locator('.ponsse-recognition__portrait img').count();
          if (actualLetter !== Number(expectedLetter) || actualPortrait !== Number(expectedPortrait)) {
            report.fail.push({route,view,reason:'PONSSE original image binding',actualLetter,actualPortrait,expectedLetter,expectedPortrait});
          }
        }
        if (['home','services','objects'].includes(id) && ['desktop_1440','mobile_390'].includes(view)) {
          const misleadingAnchors = await page.locator('a[href^="/obekty/#"]').count();
          if (misleadingAnchors) report.fail.push({route,view,reason:'Owner prohibits object-category fragment detours',misleadingAnchors});
          const directLinks = await page.locator('a[href^="/obekty/"]').evaluateAll(els => [...new Set(els.map(el=>el.getAttribute('href')).filter(Boolean))]);
          for (const href of directLinks) {
            if (href.includes('#')) report.fail.push({route,view,reason:'Fragment navigation in object category',href});
            const response = await page.request.get(baseUrl + href);
            if (response.status() !== 200) report.fail.push({route,view,reason:'Direct category destination not 200',href,status:response.status()});
          }
        }
        if (['home','services','objects','portfolio'].includes(id) && ['desktop_1440','laptop_1280'].includes(view)) {
          const firstFold = await page.evaluate((routeId) => {
            const root = routeId==='home'?document.querySelector('.home-hero'):
              routeId==='services'?document.querySelector('.services-hero__routes'):
              routeId==='objects'?document.querySelector('.objects-hero'):
              document.querySelector('.portfolio-hero');
            const rect=root?.getBoundingClientRect();
            return rect?{bottom:Math.round(rect.bottom),viewport:innerHeight}:null;
          },id);
          entry.first_fold = firstFold;
          if (firstFold && firstFold.bottom < firstFold.viewport-24) {
            report.fail.push({route,view,reason:'Owner first fold leaks next section',...firstFold});
          }
        }
        if (entry.status !== 200 || entry.overflow_px > 1 || entry.broken_images.length || pageErrors.length) {
          report.fail.push(entry);
        }
        await page.screenshot({ path: path.join(root, id + '__' + view + '.png'), fullPage: true, animations: 'disabled' });
        if (['seven_park','karelia_ponsse','polisan','leont','zhukov','cafe'].includes(id) && (view === 'desktop_1440' || view === 'mobile_390')) {
          const firstPhoto = page.locator('[data-case-photo]').first();
          const firstSrc = await firstPhoto.getAttribute('data-photo-src');
          await firstPhoto.click();
          const viewer = page.locator('#case-photo-viewer');
          await viewer.waitFor({state:'visible'});
          const shown = await viewer.locator('[data-photo-large]').getAttribute('src');
          if (shown !== firstSrc) report.fail.push({route,view,reason:'Case viewer selected image mismatch',firstSrc,shown});
          await viewer.locator('[data-photo-next]').click();
          const secondSrc = await viewer.locator('[data-photo-large]').getAttribute('src');
          const clean = await viewer.locator('button').count() === 3 &&
            await viewer.locator('.case-photo-dialog__figure figcaption').innerText() === 'Фотографии работ' &&
            (await viewer.locator('.case-photo-dialog__top>span').innerText()).trim().length > 0;
          if (!secondSrc || secondSrc === shown || !clean) report.fail.push({route,view,reason:'Case viewer navigation / minimal photo UI',shown,secondSrc,clean});
          await page.keyboard.press('Escape');
          await viewer.waitFor({state:'hidden'});
          const returned = await firstPhoto.evaluate(el => el === document.activeElement);
          if (!returned) report.fail.push({route,view,reason:'Case viewer focus not restored'});
        }
        if (id === 'karelia_ponsse' && report.owner_media.find(x=>x.name==='ponsse_letter')?.status === 'EXACT') {
          await page.locator('[data-ponsse-open]').click();
          const letterModal = page.locator('#ponsse-letter-dialog');
          await letterModal.waitFor({state:'visible'});
          if ((await letterModal.locator('img').getAttribute('src')) !== '/evidence/karelia/ponsse-letter-20220405.png') {
            report.fail.push({route,view,reason:'Wrong PONSSE fullsize original'});
          }
          const letterFit = await letterModal.evaluate(dialog => {
            const image = dialog.querySelector('.ponsse-letter-dialog__sheet img');
            const body = dialog.querySelector('.ponsse-letter-dialog__sheet');
            const ir = image.getBoundingClientRect(), br=body.getBoundingClientRect();
            return ir.width > 0 && ir.height > 0 && ir.height <= br.height + 1 && ir.width <= br.width + 1;
          });
          if (!letterFit) report.fail.push({route,view,reason:'PONSSE full original must initially fit without clipping'});
          if (view === 'desktop_1440' || view === 'mobile_390') {
            await page.screenshot({path:path.join(root,'ponsse_letter_open__'+view+'.png'),animations:'disabled'});
          }
          await letterModal.locator('.ponsse-letter-dialog__close').click();
          await letterModal.waitFor({state:'hidden'});
        }
        if (id === 'home' && (view === 'desktop_1440' || view === 'mobile_390')) {
          await page.locator('[data-home-ponsse-open]').first().click();
          const letter = page.locator('#home-ponsse-letter-dialog');
          await letter.waitFor({state:'visible'});
          const fit = await letter.evaluate(node => {
            const img = node.querySelector('.ponsse-letter-dialog__sheet img');
            const box = node.querySelector('.ponsse-letter-dialog__sheet');
            const a = img.getBoundingClientRect(), b = box.getBoundingClientRect();
            return a.width > 0 && a.height > 0 && a.width <= b.width + 1 && a.height <= b.height + 1;
          });
          if (!fit) report.fail.push({route,view,reason:'Home PONSSE letter must fit entirely in its dialog'});
          await letter.locator('.ponsse-letter-dialog__close').click();
          await letter.waitFor({state:'hidden'});
        }
        if (id === 'home' && view === 'mobile_390') {
          await page.locator('.mobile-menu summary').click();
          await page.screenshot({ path: path.join(root, 'mobile_390_navigation.png'), animations: 'disabled' });
          await page.locator('.mobile-menu summary').click();
        }
        if (id === 'home' && (view === 'desktop_1440' || view === 'mobile_390')) {
          // On desktop the persistent launcher is intentionally hidden
          // until the full category ribbon has left the first fold.
          if(view === 'desktop_1440') {
            await page.locator('.decision-preview').scrollIntoViewIfNeeded();
            await page.waitForFunction(()=>document.documentElement.classList.contains('is-past-first-fold'),null,{timeout:4000});
          }
          await page.locator('.consultant-launcher').click();
          await page.locator('[data-consultant-dialog]').waitFor({ state: 'visible' });
          await page.screenshot({ path: path.join(root, 'consultant_open__' + view + '.png'), animations: 'disabled' });
          await page.locator('[data-consultant-dialog] [data-dialog-close]').click();
          await page.locator('[data-consultant-dialog]').waitFor({state:'hidden'});
        }
        if (id === 'home' && view === 'desktop_1440') {
          await page.locator('.header-project').click();
          const contactDialog = page.locator('[data-contact-dialog]');
          await contactDialog.waitFor({state:'visible'});
          await page.screenshot({ path:path.join(root,'contact_open__desktop_1440.png'),animations:'disabled' });
          const formCount = await contactDialog.locator('form[data-contact-form]').count();
          const sheetWidth = await contactDialog.evaluate(x=>x.getBoundingClientRect().width);
          if (sheetWidth > 640 || formCount !== 1) report.fail.push({route,view,reason:'Bounded contact form sheet',sheetWidth,formCount});
          await contactDialog.locator('[data-dialog-close]').click();
          await contactDialog.waitFor({state:'hidden'});
          const returnFocus = await page.locator('.header-project').evaluate(x => x === document.activeElement);
          if (!returnFocus) report.fail.push({route,view,reason:'Contact sheet does not restore focus to trigger'});
        }
        if (id === 'home' && view === 'desktop_1440') {
          const nav = await page.locator('.nav--desktop').innerText();
          if (nav.includes('Консультант') || !nav.includes('Статьи') || !nav.includes('Наши работы') || nav.includes('Объекты')) report.fail.push({ route, view, reason: 'navigation contract', nav });
          const title = await page.locator('.header-project').innerText();
          if (!title.includes('Обсудить задачу')) report.fail.push({ route, view, reason: 'CTA contract', title });
        }
      } catch (error) {
        entry.exception = String(error);
        report.fail.push(entry);
      } finally {
        report.pages.push(entry);
        await context.close();
      }
    }
  }
  // Owner's real motion gate: observe first-visit assembly, actual completion,
  // repeat-navigation suppression and reduced-motion static readiness.
  // No network calls, artificial delay, or simulated operational activity.
  {
    const normal = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    const page = await normal.newPage();
    try {
      await page.goto(baseUrl+'/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('[data-airflow-entry]')?.classList.contains('is-running'),null,{timeout:1900});
      const first = await page.evaluate(()=>{
        const entry=document.querySelector('[data-airflow-entry]');
        const duct=entry?.querySelector('.airflow-entry-trace__duct');
        const pulse=entry?.querySelector('.airflow-entry-trace__pulse');
        const supply=document.querySelector('.airflow-header-trace__route--supply')?.getBoundingClientRect();
        const exhaust=document.querySelector('.airflow-header-trace__route--exhaust')?.getBoundingClientRect();
        return {
          running:!!entry?.classList.contains('is-running'),
          mode:entry?.dataset.mode,
          assembly:duct?getComputedStyle(duct).animationName:null,
          pulse:pulse?getComputedStyle(pulse).animationName:null,
          nonBlocking:!!entry&&getComputedStyle(entry).pointerEvents==='none',
          distinctlySeparated:!!supply&&!!exhaust&&supply.right<exhaust.left-1,
          shown:sessionStorage.getItem('aeroventa-entry-shown')
        };
      });
      await page.waitForFunction(()=>!document.querySelector('[data-airflow-entry]'),null,{timeout:3000});
      const finished=await page.evaluate(()=>({
        entryRemoved:!document.querySelector('[data-airflow-entry]'),
        fakeProcessing:document.documentElement.hasAttribute('data-airflow-processing')
      }));
      await page.goto(baseUrl+'/services/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('[data-airflow-entry]')?.classList.contains('is-running'),null,{timeout:1900});
      const revisited=await page.evaluate(()=>({
        entryMode:document.querySelector('[data-airflow-entry]')?.dataset.mode,
        running:document.querySelector('[data-airflow-entry]')?.classList.contains('is-running'),
        saved:sessionStorage.getItem('aeroventa-entry-shown')==='1'
      }));
      const reducedCtx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
      try {
        const reducedPage=await reducedCtx.newPage();
        await reducedPage.goto(baseUrl+'/',{waitUntil:'domcontentloaded'});
        const reduced=await reducedPage.evaluate(()=>({
          reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
          entryAbsent:!document.querySelector('[data-airflow-entry]'),
          sectionsReady:(document.querySelectorAll('.airflow-trace-section').length>0)&&[...document.querySelectorAll('.airflow-trace-section')].every(n=>n.classList.contains('is-airflow-active'))
        }));
        report.motion_evidence={first,finished,revisited,reduced};
        if(!first.running||first.assembly!=='airflow-route-assemble'||
           first.pulse!=='airflow-route-pulse'||!first.nonBlocking||
           !first.distinctlySeparated||first.shown!=='1'||first.mode!=='full'||
           !finished.entryRemoved||finished.fakeProcessing||
           !revisited.running||revisited.entryMode!=='short'||!revisited.saved||
           !reduced.reduced||!reduced.entryAbsent||!reduced.sectionsReady)
          report.fail.push({reason:'Actual first visit/revisit/reduced motion lifecycle',first,finished,revisited,reduced});
      }finally{await reducedCtx.close()}
    }catch(e){report.fail.push({reason:'Motion browser lifecycle exception',error:String(e)})}
    finally{await normal.close()}
  }
  // Contact UI: mock POST, never reach an inbox. Verify a pending-only PULSE,
  // accessible error path and no fabricated delivery confirmation.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'load'});
      // Let the real first-visit signature animation finish before evaluating the idle state.
      await page.locator('[data-airflow-entry]').waitFor({state:'detached',timeout:2500}).catch(()=>{});
      const atRest=await page.evaluate(()=>({pending:document.documentElement.hasAttribute('data-airflow-processing'),trace:!!document.querySelector('.airflow-header-trace'),entry:!!document.querySelector('[data-airflow-entry]')}));
      if(atRest.pending||!atRest.trace||atRest.entry) report.fail.push({reason:'No fake load animation at rest',atRest});
      await page.locator('.header-project').click();
      const form=page.locator('[data-contact-dialog] form[data-contact-form]');
      await form.locator('input[name="name"]').fill('Owner QA fixture');
      await form.locator('input[name="contact"]').fill('qa@example.org');
      await form.locator('textarea[name="task"]').fill('Тест исключительно в изолированной сборке');
      await form.locator('input[name="consent"]').check();
      await form.locator('input[name="started_at"]').evaluate(x=>x.value=String(Date.now()-3000));
      let called=0;let resolveRequest;
      const release=new Promise(r=>resolveRequest=r);
      await page.route('**/api/lead.php',async route=>{
        called++;
        await release;
        await route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"mock_only"}'});
      });
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-airflow-processing'),{timeout:4500});
      const during=await page.evaluate(()=>({
        pending:document.documentElement.hasAttribute('data-airflow-processing'),
        pulse:getComputedStyle(document.querySelector('.airflow-header-trace__route--supply i')).animationName,
        realFetch:document.querySelector('[data-contact-form][data-submitting="true"]')!==null
      }));
      resolveRequest();
      await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-airflow-processing'));
      const status=await form.locator('[data-form-status]').innerText();
      if(called!==1||!during.pending||!during.realFetch||during.pulse==='none'||!status.includes('Не удалось передать'))
        report.fail.push({reason:'Mocked lead response/pulse/fallback',called,during,status});
    }catch(error){report.fail.push({reason:'Lead and true Pulse interaction test failed',error:String(error)})}
    finally{await context.close()}
  }
  // Artistic regression that the original 400 captures missed:
  // assert the actually rendered photographic and 3-route editorial geometry.
  for(const [width,height] of [[1440,900],[1280,768],[1024,768],[390,844],[320,640]]){
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/services/',{waitUntil:'load'});
      const m=await page.evaluate(()=>{
        const box=s=>document.querySelector(s)?.getBoundingClientRect();
        const hero=box('header.services-hero--owner-editorial');
        const photo=box('header.services-hero--owner-editorial>figure.services-hero__backdrop--single');
        const copy=box('.services-hero__intro');
        const routes=[...document.querySelectorAll('.services-hero__routes-inner>a')].map(a=>a.getBoundingClientRect());
        const text=[...document.querySelectorAll('.services-hero__routes-inner>a')].map(a=>a.innerText);
        const inline=document.querySelector('.services-consultant-inline');
        return {hero:hero&&{x:hero.x,y:hero.y,w:hero.width,h:hero.height},photo:photo&&{x:photo.x,y:photo.y,w:photo.width,h:photo.height},
          copy:copy&&{x:copy.x,y:copy.y,w:copy.width,h:copy.height,bottom:copy.bottom},
          routes:routes.map(x=>({x:x.x,y:x.y,w:x.width,h:x.height})),
          text,inline:!!inline&&getComputedStyle(inline).display!=='none',
          overflow:document.documentElement.scrollWidth-innerWidth};
      });
      const desktop=width>=761;
      // The owner-approved concept must be shown whole. Mobile intentionally leads with
      // the full image, followed by buyer copy and three horizontal routes.
      const baseValid=!!m.hero&&!!m.photo&&!!m.copy&&m.routes.length===3&&m.overflow<=1;
      const desktopValid=desktop&&m.photo.w>width*.3&&m.photo.h>220&&
        m.photo.x>m.copy.x+m.copy.w*.7&&
        m.routes.every((r,i)=>r.w>width*.19&&r.h>=70&&(i===0||r.x>m.routes[i-1].x+60))&&!m.inline;
      const mobileValid=!desktop&&m.photo.w>=width-2&&m.photo.h>width*.50&&
        m.photo.y<m.copy.y&&m.photo.y+m.photo.h<=m.copy.y+25&&
        m.routes.every((r,i)=>r.w>=width*.28&&r.h>=70&&(i===0||r.x>m.routes[i-1].x+25))&&
        m.routes[0].y>=m.copy.bottom-3&&!m.inline;
      // At 390px, the complete three-route register must fit in a normal 844px fold.
      // At 320px/640px natural scrolling is preferable to hiding/clipping buyer copy.
      const foldValid=desktop||width!==390||m.routes.at(-1).y+m.routes.at(-1).h<=height+3;
      if(!(baseValid&&(desktop?desktopValid:mobileValid)&&foldValid))
        report.fail.push({reason:'Services original concept, uncropped image and complete three-link register',width,height,m});
    }catch(e){report.fail.push({reason:'Services editorial geometry exception',width,height,error:String(e)})}
    finally{await context.close()}
  }
  // Owner 2026-10-20: permanent assistant CTA is discoverable but must not cover
  // the category ribbon or the HOME primary action. Measure actual intersections.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'load'});
      const measured=await page.evaluate(()=>{
        const button=document.querySelector('.consultant-launcher');
        const ribbon=document.querySelector('.home-hero--owner-airflow .object-ribbon');
        const primary=document.querySelector('.home-hero--owner-airflow .home-actions .button--primary');
        const show=button&&getComputedStyle(button).display!=='none'&&getComputedStyle(button).visibility!=='hidden';
        const collide=(a,b)=>{
          if(!a||!b)return true;
          const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
          return x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top;
        };
        return {show,overlapsCategories:collide(button,ribbon),overlapsMainCTA:collide(button,primary)};
      });
      if(!measured.show||measured.overlapsCategories||measured.overlapsMainCTA)
        report.fail.push({reason:'Visible consultant must not obstruct first-fold controls',measured});
    }catch(e){report.fail.push({reason:'Consultant first-fold geometry QA failed',error:String(e)})}
    finally{await context.close()}
  }
  // ART RED TEAM DELTA: compiled DOM checks for the six confirmed source defects.
  // This is a focused addition to the established 400-capture suite, not a new audit.
  for (const [route, width] of [
    ['/services/',320],['/services/',390],['/services/',768],
    ['/services/',1440],['/services/',1920],
    ['/about/',390],['/about/',1440],
    ['/portfolio/',390],['/portfolio/',1440],
    ['/blog/detail/ntff-polisan/',390],
    ['/blog/detail/ntff-polisan/',1440],
    ['/blog/detail/kafe-rimskogo-korsakova-3/',390],
    ['/blog/detail/kafe-rimskogo-korsakova-3/',1440]
  ]) {
    const context=await browser.newContext({viewport:{width,height:850}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+route,{waitUntil:'load'});
      const dom=await page.evaluate(()=>{
        const headings=[...document.querySelectorAll('.section-index')].map(n=>n.textContent.trim());
        return {
          articles:document.querySelectorAll('main article.hub-page').length,
          orphan:/(?:^|\n)\s*\)\)\}\s*(?:\n|$)/m.test(document.querySelector('main')?.innerText||''),
          hubSplit:document.querySelectorAll('main .hub-split,main .hub-objects,main .hub-limits').length,
          serviceRoutes:document.querySelectorAll('main .services-hero__routes-inner>a').length,
          labels:headings,
          image:document.querySelector('meta[property="og:image"]')?.getAttribute('content')||'',
          articleTitle:document.querySelector('#case-gallery-title')?.textContent?.trim()||'',
          archiveThumbs:document.querySelectorAll('.case-gallery__archive .case-gallery__thumbs button[data-case-photo]').length,
          archiveCaptions:document.querySelectorAll('.case-gallery__archive .case-gallery__thumbs figcaption').length,
          archiveToggle:document.querySelectorAll('.case-gallery__archive [data-case-gallery-expand]').length,
          selectedArchiveThumbs:document.querySelectorAll('.case-gallery__selected--leont>.case-gallery__item').length,
           visibleArchiveThumbs:[...document.querySelectorAll('.case-gallery__archive .case-gallery__thumbs button[data-case-photo]')].filter(el=>{
             const style=getComputedStyle(el.closest('figure')||el);
             const box=el.getBoundingClientRect();
             return style.display!=='none' && style.visibility!=='hidden' && box.width>0 && box.height>0;
          }).length,
          numberedCaseSubsteps:[...document.querySelectorAll('.case-story__grid>div>span')].some(el=>/^0[1-9]\s*\//.test(el.textContent.trim()))
        };
      });
      if(route==='/services/'){
        const previewImage=await page.request.get(baseUrl+'/share/services.jpg');
        const previewBytes=previewImage.ok()?await previewImage.body():Buffer.alloc(0);
        const validPreview=previewImage.ok()&&
          /^image\/jpeg\b/i.test(previewImage.headers()['content-type']||'')&&
          previewBytes.length>12000&&previewBytes[0]===0xff&&previewBytes[1]===0xd8;
        if(dom.articles!==1||dom.orphan||dom.hubSplit!==0||dom.serviceRoutes!==3||
           !dom.image.endsWith('/share/services.jpg')||!validPreview)
          report.fail.push({reason:'ART-DELTA-01/06 compiled services article and real 1200x630 social preview',route,width,dom,validPreview});
      }
      if(route==='/about/'&&!dom.labels.some(x=>x.startsWith('03 / Опыт на объектах')))
        report.fail.push({reason:'ART-DELTA-02 about numbering',width,labels:dom.labels});
      if(route==='/portfolio/'&&(!dom.labels.some(x=>x.startsWith('03 / Спортивный объект')) || !dom.labels.some(x=>x.startsWith('04 / Ваш объект'))))
        report.fail.push({reason:'ART-DELTA-02 portfolio numbering',width,labels:dom.labels});
      // The 2026-10-17 Polisan Owner decision supersedes earlier archive-thumb UI checks.
      // Its curated 12 unique frames + retained 15 archive files are explicitly checked above.
      if(route.includes('/blog/detail/')&&route!=='/blog/detail/ntff-polisan/'&&
        (dom.archiveThumbs<1 || dom.archiveToggle!==0 || dom.numberedCaseSubsteps ||
         (route.includes('/restoran-v-zhk-leontevskiy-mys/') ? (dom.archiveThumbs!==26 || dom.archiveCaptions!==26 || dom.selectedArchiveThumbs!==12 || dom.visibleArchiveThumbs!==12) : (dom.archiveThumbs!==dom.visibleArchiveThumbs || dom.archiveCaptions!==0))))
        report.fail.push({reason:'ART-DELTA-02/03 all photographs physically visible; restaurant 2+12+12 annotated original frames',route,width,dom});
      if(route.includes('/kafe-rimskogo-korsakova-3/')&&!dom.articleTitle.includes('Кафе на Римского-Корсакова, 3'))
        report.fail.push({reason:'ART-DELTA-04 actual cafe editorial title',route,width,dom});
      if(route==='/portfolio/'){
        const tags=await page.locator('.portfolio-card__top b').allTextContents();
        if(tags.includes('География')||!tags.includes('Сервисно-образовательный центр'))
          report.fail.push({reason:'ART-DELTA-05 portfolio object type',width,tags});
      }
    }catch(e){report.fail.push({reason:'ART-DELTA compiled browser exception',route,width,error:String(e)})}
    finally{await context.close()}
  }
  // ARCHIVE CASE INTERACTION: real in-page gallery, zoom, next and restored focus.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/portfolio/',{waitUntil:'load'});
      const opener=page.locator('button.portfolio-card[data-archive-open]').first();
      await opener.click();
      const viewer=page.locator('#portfolio-archive-viewer');
      await viewer.waitFor({state:'visible'});
      const img=viewer.locator('[data-gallery-photo]');
      const original=await img.getAttribute('src');
      const photoOk=await img.evaluate(async el=>{try{await el.decode();return el.naturalWidth>0;}catch{return false}});
      await viewer.locator('[data-gallery-next]').click();
      const second=await img.getAttribute('src');
      const minimal = await viewer.locator('button').count() === 3 &&
        (await viewer.locator('[data-gallery-position]').innerText()).trim() === 'Фото 2 из 13' &&
        (await viewer.locator('[data-gallery-title]').innerText()).trim().length > 0;
      await page.keyboard.press('Escape');
      await viewer.waitFor({state:'hidden'});
      const restored=await opener.evaluate(el=>el===document.activeElement);
      // The Owner facade + three source-hashed interior photographs form one real gallery.
      const neva=page.locator('button.portfolio-card--archive:has-text("На излучине Невы")');
      await neva.click();
      await viewer.waitFor({state:'visible'});
      const nevaImage=await img.getAttribute('src');
      const nevaNav=await viewer.locator('[data-gallery-nav]').isVisible();
      const nevaFirstCount=(await viewer.locator('[data-gallery-position]').innerText()).trim();
      await page.keyboard.press('ArrowRight');
      const nevaAfterArrow=await img.getAttribute('src');
      const nevaPhotoOk=await img.evaluate(async el=>{try{await el.decode();return el.naturalWidth>0;}catch{return false}});
      const nevaSecondCount=(await viewer.locator('[data-gallery-position]').innerText()).trim();
      await viewer.locator('[data-gallery-prev]').click();
      const nevaBack=await img.getAttribute('src');
      await page.keyboard.press('Escape');
      await viewer.waitFor({state:'hidden'});
      const nevaFocus=await neva.evaluate(el=>el===document.activeElement);
      if(!photoOk||!original||!second||original===second||!minimal||!restored||
         nevaImage!=='/evidence/residential/owner-neva-facade-20261016.jpg'||!nevaNav||
         nevaAfterArrow!=='/evidence/residential/neva/curated-01.webp'||!nevaPhotoOk||
         nevaFirstCount!=='Фото 1 из 4'||nevaSecondCount!=='Фото 2 из 4'||
         nevaBack!==nevaImage||!nevaFocus){
        report.fail.push({reason:'Owner portfolio minimalist gallery interaction',photoOk,original,second,minimal,restored,nevaNav,nevaFirstCount,nevaSecondCount,nevaFocus});
      }
    }catch(error){report.fail.push({reason:'Owner portfolio gallery interaction exception',error:String(error)})}
    finally{await context.close()}
  }
  // OWNER-sensitive geometry regression. Adds diverse viewport heights, browser
  // text scaling, first-fold finishing, real document interactions and motion.
  for (const [route, width, height] of [
    ['/',1440,600], ['/',1440,768], ['/',1440,900],
    ['/services/',1440,600], ['/services/',1440,768], ['/services/',1440,900],
    ['/services/',1024,600], ['/services/',1024,768],
    ['/portfolio/',1440,768], ['/blog/',1440,768],
    ['/services/',390,680]
  ]) {
    const context = await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
    const page = await context.newPage();
    try {
      await page.goto(baseUrl+route,{waitUntil:'load',timeout:25000});
      await page.evaluate(()=>document.fonts.ready);
      for (const zoom of [1,1.25]) {
        const result = await page.evaluate((z) => {
          document.body.style.zoom=String(z);
          const home=document.querySelector('.home-hero');
          const service=document.querySelector('header.services-hero--owner-editorial');
          const routes=document.querySelector('.services-hero__routes');
          const fold=(home||routes||service)?.getBoundingClientRect().bottom;
          const firstArticle=document.querySelector('.practice-featured__card, .practice-article-index__item');
          const mark=document.querySelector('.airflow-header-trace__route');
          const markStyle=mark ? getComputedStyle(mark) : null;
          return {
            horizontal:Math.max(0,document.documentElement.scrollWidth-innerWidth),
            firstFoldBottom:fold??null,
            firstArticleTop:firstArticle?.getBoundingClientRect().top??null,
            traceVisible:!!mark&&markStyle.display!=='none'&&mark.getBoundingClientRect().height>=1,
            pageHeight:innerHeight
          };
        },zoom);
        if (result.horizontal>1 ||
            (width>=1024&&zoom===1&&['/','/services/'].includes(route)&&result.firstFoldBottom!==null&&result.firstFoldBottom<height-5) ||
            (route==='/blog/'&&zoom===1&&(result.firstArticleTop===null||result.firstArticleTop>height-160)) ||
            (zoom===1&&!result.traceVisible)) {
          if (result.horizontal>1) result.offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>{const b=el.getBoundingClientRect();return{tag:el.tagName.toLowerCase(),cls:typeof el.className==='string'?el.className.slice(0,90):'',left:Math.round(b.left),right:Math.round(b.right),scroll:el.scrollWidth,client:el.clientWidth}}).filter(x=>x.right>innerWidth+1||x.left < -1).slice(0,15));
          report.fail.push({reason:'Owner height/zoom/real TRACE gate',route,width,height,zoom,result});
        }
      }
      if(route==='/services/'&&width===390){
        const placement=await page.evaluate(()=>{
          const a=document.querySelector('.services-hero__intro')?.getBoundingClientRect();
          const b=document.querySelector('.services-hero__backdrop--single')?.getBoundingClientRect();
          return {introTop:a?.top,photoBottom:b?.bottom};
        });
        if(!placement.introTop||!placement.photoBottom||placement.photoBottom>placement.introTop+2){
          report.fail.push({reason:'Services original artwork must precede copy on mobile without overlap',placement});
        }
      }
      if(route==='/portfolio/'&&width===1440){
        const grid=await page.locator('.portfolio-card').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));
        if(grid.length!==12||new Set(grid.slice(0,4)).size!==1||new Set(grid.slice(4,8)).size!==1||new Set(grid.slice(8,12)).size!==1||grid[4]<=grid[0]||grid[8]<=grid[4])
          report.fail.push({reason:'Portfolio 12 verified cards, 4+4+4 editorial rows',grid});
      }
    } catch(e){report.fail.push({reason:'Owner additional QA exception',route,width,height,error:String(e)})}
    finally{await context.close()}
  }
  // Owner separate sport feature with source-corroborated exterior;
  // no unsupported project scope, never a 13th grid card.
  for(const [width,height] of [[1440,900],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/portfolio/',{waitUntil:'load'});
      const sport=page.locator('section.portfolio-sport');
      const sportCount=await sport.count();
      const gridCount=await page.locator('.portfolio-grid>.portfolio-card').count();
      await sport.scrollIntoViewIfNeeded();
      await sport.locator('img').evaluateAll(async nodes=>{
        await Promise.all(nodes.map(async img=>{
          img.loading='eager';
          try { await img.decode(); } catch { /* failure reported below */ }
        }));
      });
      const media=await sport.locator('img').evaluateAll(nodes=>nodes.map(n=>({
        natural:n.complete&&n.naturalWidth>0,
        src:n.getAttribute('src')
      })));
      if(sportCount!==1||gridCount!==12||media.length!==2||media.some(x=>!x.natural) ||
         !media.some(x=>x.src?.endsWith('/sport-komendantskiy/owner-selected-aerial.webp')) ||
         !media.some(x=>x.src?.endsWith('/sport-komendantskiy/gallery-01.webp')) ||
        await page.getByRole('heading',{name:'Центр адаптивного спорта'}).count()!==1) {
        report.fail.push({reason:'Separate owner sports feature: 12+1 and source identity gate',width,sportCount,gridCount,media});
      }
      const open=sport.locator('.portfolio-sport__photo--large button[data-archive-open]');
      const diffuserOpen=sport.locator('.portfolio-sport__photo--detail button[data-archive-open]');
      if(await open.count()!==1 || await diffuserOpen.count()!==1)
        throw new Error('Both leading sport photos must be actionable');
      await open.click();
      const modal=page.locator('#portfolio-archive-viewer');
      await modal.waitFor({state:'visible',timeout:2500});
      const first=await modal.locator('[data-gallery-photo]').getAttribute('src');
      const minimalControls=await modal.locator('button').count()===3;
      await modal.locator('[data-gallery-next]').click();
      const second=await modal.locator('[data-gallery-photo]').getAttribute('src');
      await page.keyboard.press('Escape');
      const restored=await open.evaluate(el=>document.activeElement===el);
      await diffuserOpen.click();
      await modal.waitFor({state:'visible'});
      // Diffuser lead must start at its own frame, not restart at the aerial.
      const sameGallery=await modal.locator('[data-gallery-photo]').getAttribute('src')===second &&
        await modal.locator('[data-gallery-next]').isVisible();
      await page.keyboard.press('Escape');
      const diffuserFocus=await diffuserOpen.evaluate(el=>document.activeElement===el);
      if(!minimalControls||first===second||!restored||!sameGallery||!diffuserFocus||await modal.isVisible())
        report.fail.push({reason:'Sport: both chosen images open one navigable gallery with focus restoration',width,minimalControls,first,second,restored,sameGallery,diffuserFocus});
    }catch(e){report.fail.push({reason:'Sports UI regression error',width,error:String(e)})}
    finally{await context.close()}
  }
  // Owner 2026-10-20: show an assistant but not over the first ABOUT CTA or H1.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/about/',{waitUntil:'load'});
      const state=await page.evaluate(()=>{
        const button=document.querySelector('.consultant-launcher');
        const title=document.querySelector('.about-hero h1');
        const primary=document.querySelector('.about-hero .home-actions .button');
        const overlap=(x,y)=>{
          if(!x||!y)return false;
          const a=x.getBoundingClientRect(),b=y.getBoundingClientRect();
          return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        };
        return {visible:!!button&&getComputedStyle(button).visibility!=='hidden'&&getComputedStyle(button).display!=='none',titleOverlap:overlap(button,title),ctaOverlap:overlap(button,primary)};
      });
      if(!state.visible||state.titleOverlap||state.ctaOverlap)
        report.fail.push({reason:'About first-fold assistant/title collision',state});
    }catch(e){report.fail.push({reason:'About assistant visibility QA failed',error:String(e)})}
    finally{await ctx.close()}
  }
  // Same-page PONSSE document must zoom, fit, Escape and restore focus.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'load'});
      const opener=page.locator('[data-home-ponsse-open]').first();
      await opener.click();
      const dialog=page.locator('#home-ponsse-letter-dialog');
      await dialog.waitFor({state:'visible'});
      const validOriginal=(await dialog.locator('img').getAttribute('src'))==='/evidence/karelia/ponsse-letter-20220405.png';
      const minimal=await dialog.locator('button').count()===1 &&
        (await dialog.locator('.ponsse-letter-dialog__actions strong').innerText()).includes('PONSSE');
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
      const restored=await opener.evaluate(x=>x===document.activeElement);
      if(!validOriginal||!minimal||!restored||await page.locator('a[target="_blank"][href*="ponsse-letter"]').count()){
        report.fail.push({reason:'Owner PONSSE minimal document original / Escape / focus',validOriginal,minimal,restored});
      }
    }catch(e){report.fail.push({reason:'PONSSE document full interaction exception',error:String(e)})}
    finally{await context.close()}
  }


  // P0 motion gate: actual intermediate frames, never CSS-presence alone.
  // All captures use the compiled local fixture; no external requests or mail.
  for(const [width,height] of [[1440,900],[390,844]]) {
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
    const page=await ctx.newPage();
    try {
      await page.goto(baseUrl+'/',{waitUntil:'domcontentloaded'});
      const animated=page.locator('[data-airflow-entry]');
      await page.waitForFunction(()=>document.querySelector('[data-airflow-entry]')?.classList.contains('is-running'),null,{timeout:1800});
      await page.screenshot({path:path.join(root,'motion_first_start__'+width+'.png'),animations:'allow'});
      await page.waitForTimeout(380);
      const building=await page.evaluate(()=>{
        const line=document.querySelector('.airflow-entry-trace__duct--supply');
        return {mode:document.querySelector('[data-airflow-entry]')?.dataset.mode,offset:line&&parseFloat(getComputedStyle(line).strokeDashoffset),name:line&&getComputedStyle(line).animationName};
      });
      await page.screenshot({path:path.join(root,'motion_first_assembly__'+width+'.png'),animations:'allow'});
      await page.waitForTimeout(650);
      const pulse=await page.evaluate(()=>{
        const line=document.querySelector('.airflow-entry-trace__pulse--exhaust');
        return {offset:line&&parseFloat(getComputedStyle(line).strokeDashoffset),name:line&&getComputedStyle(line).animationName};
      });
      await page.screenshot({path:path.join(root,'motion_first_pulse__'+width+'.png'),animations:'allow'});
      if(building.mode!=='full'||building.name==='none'||pulse.name==='none'||!Number.isFinite(building.offset)||!Number.isFinite(pulse.offset))
        report.fail.push({reason:'Brand loader must visibly assemble route, then pulse',width,building,pulse});
      await animated.waitFor({state:'detached',timeout:4000});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('[data-airflow-entry]')?.classList.contains('is-running'),null,{timeout:1700});
      const repeatMode=await page.locator('[data-airflow-entry]').getAttribute('data-mode');
      await page.screenshot({path:path.join(root,'motion_repeat__'+width+'.png'),animations:'allow'});
      if(repeatMode!=='short')report.fail.push({reason:'Repeat visit must have shortened signature',width,repeatMode});
      await page.locator('[data-airflow-entry]').waitFor({state:'detached',timeout:2600});
    }catch(error){report.fail.push({reason:'Loader frame-sequence browser regression',width,error:String(error)})}
    finally{await ctx.close()}
  }
  {
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'domcontentloaded'});
      const staticState=await page.evaluate(()=>({
        entry:!!document.querySelector('[data-airflow-entry]'),
        supply:!!document.querySelector('.airflow-header-trace__route--supply'),
        exhaust:!!document.querySelector('.airflow-header-trace__route--exhaust'),
        processing:document.documentElement.hasAttribute('data-airflow-processing')
      }));
      await page.screenshot({path:path.join(root,'motion_reduced_static__390.png'),animations:'disabled'});
      if(staticState.entry||!staticState.supply||!staticState.exhaust||staticState.processing)
        report.fail.push({reason:'Reduced motion must display a complete static signature',staticState});
    }catch(error){report.fail.push({reason:'Reduced motion trace regression',error:String(error)})}
    finally{await ctx.close()}
  }
  // Deep case lightbox should retain scroll while navigating, then restore focus.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/blog/detail/montazh-ventilyatsii-v-karelii/',{waitUntil:'load'});
      const chosen=page.locator('.case-gallery__ponsse-curated [data-case-photo]').nth(7);
      await chosen.scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>scrollY);
      await chosen.click();
      await page.locator('#case-photo-viewer').waitFor({state:'visible'});
      const whileOpen=await page.evaluate(()=>scrollY);
      await page.locator('[data-photo-next]').click();
      await page.keyboard.press('Escape');
      await page.locator('#case-photo-viewer').waitFor({state:'hidden'});
      const after=await page.evaluate(()=>scrollY);
      const returned=await chosen.evaluate(el=>el===document.activeElement);
      if(Math.abs(before-whileOpen)>16||Math.abs(before-after)>16||after<100||!returned)
        report.fail.push({reason:'PONSSE deep lightbox scroll/focus restoration',before,whileOpen,after,returned});
    }catch(error){report.fail.push({reason:'PONSSE lightbox interaction',error:String(error)})}
    finally{await ctx.close()}
  }
  // Owner 2026-10-21 mobile directive: no fixed contact dock.
  // Test native navigation/launcher and the contextual project CTA with real clicks.
  for(const [width,height] of [[320,720],[390,844],[834,1100]]){
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/montazh-po-proektu/',{waitUntil:'load'});
      if(await page.locator('.mobile-contact-dock').count())report.fail.push({reason:'Removed mobile dock still rendered',width});
      const menu=page.locator('.mobile-menu');
      await menu.locator('summary').click();
      const expanded=await menu.evaluate(el=>el.open);
      const hiddenLauncher=await page.locator('.consultant-launcher').evaluate(el=>getComputedStyle(el).visibility==='hidden');
      await page.keyboard.press('Escape');
      const closed=!(await menu.evaluate(el=>el.open));
      if(!expanded||!hiddenLauncher||!closed)report.fail.push({reason:'Mobile navigation state/focus lifecycle',width,expanded,hiddenLauncher,closed});
      await page.locator('.engagement--project [data-project-open]').first().click();
      const open=await page.locator('[data-project-dialog]').isVisible();
      const route=await page.evaluate(()=>location.pathname);
      if(!open||route!=='/montazh-po-proektu/')report.fail.push({reason:'Contextual mobile project sheet',width,open,route});
      if(width===390)await page.screenshot({path:path.join(root,'mobile_project_dialog__390.png'),animations:'disabled'});
    }catch(error){report.fail.push({reason:'Mobile navigation / project interaction',width,error:String(error)})}
    finally{await ctx.close()}
  }
  // Owner Neva original: open the actual 531x376 source in a native dialog, return focus.
  for(const [width,height] of [[390,844],[1440,900]]){
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/obekty/kvartiry-i-doma/',{waitUntil:'load'});
      const opener=page.locator('[data-object-photo-open]');
      await opener.click();
      const dialog=page.locator('#object-photo-dialog');
      const open=await dialog.evaluate(el=>el.open);
      const src=await dialog.locator('img').getAttribute('src');
      await page.keyboard.press('Escape');
      const closed=!(await dialog.evaluate(el=>el.open));
      const focused=await opener.evaluate(el=>document.activeElement===el);
      if(!open||!closed||!focused||src!=='/evidence/residential/owner-neva-facade-20261016.jpg')
        report.fail.push({reason:'Neva native-size lightbox/focus',width,open,closed,focused,src});
    }catch(error){report.fail.push({reason:'Neva lightbox interaction exception',width,error:String(error)})}
    finally{await ctx.close()}
  }

  // Project-file request: mocked pending -> real HTTP error; Pulse clears. No actual transmission.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    const page=await ctx.newPage();
    try{
      await page.goto(baseUrl+'/montazh-po-proektu/',{waitUntil:'load'});
      await page.locator('.engagement--project [data-project-open]').first().click();
      const form=page.locator('[data-project-form]');
      await form.locator('input[name="name"]').fill('Offline Test');
      await form.locator('input[name="contact"]').fill('offline@example.org');
      await form.locator('textarea[name="task"]').fill('Local-only test, never send');
      await form.locator('input[name="consent"]').check();
      await form.locator('input[name="started_at"]').evaluate(el=>el.value=String(Date.now()-3500));
      await form.locator('input[type="file"]').setInputFiles({name:'offline.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nOffline testing only\n%%EOF')});
      let seen=0, release;
      const pending=new Promise(resolve=>release=resolve);
      await page.route('**/api/project.php',async route=>{
        seen++; await pending; await route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"offline_mock"}'});
      });
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-airflow-processing'),null,{timeout:4000});
      const moving=await page.evaluate(()=>({
        active:document.documentElement.hasAttribute('data-airflow-processing'),
        animation:getComputedStyle(document.querySelector('.airflow-header-trace__route--supply i')).animationName
      }));
      await page.screenshot({path:path.join(root,'project_operation_pending__1440.png'),animations:'allow'});
      release();
      await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-airflow-processing'),null,{timeout:4500});
      const status=await form.locator('[data-project-status]').innerText();
      if(seen!==1||!moving.active||moving.animation==='none'||!status.includes('не были приняты'))
        report.fail.push({reason:'True document POST Pulse and honest error outcome',seen,moving,status});
    }catch(error){report.fail.push({reason:'True project POST Pulse test exception',error:String(error)})}
    finally{await ctx.close()}
  }

  // Read-only evidence delivery: JPG is an exact captured screenshot re-encoding, not a fabricated mockup.
  const selectedDelivery = [
    'home__desktop_1440','home__mobile_390',
    'services__desktop_1440','services__mobile_390',
    'about__desktop_1440','about__mobile_390',
    'portfolio__desktop_1440','portfolio__mobile_390',
    'polisan__desktop_1440','leont__desktop_1440','leont__mobile_390','drill_crown__desktop_1440',
    'ponsse_letter_open__mobile_390','consultant_open__mobile_390',
    // Exact captured frames from the real Chrome motion lifecycle, not illustrations.
    'motion_first_start__1440','motion_first_assembly__1440','motion_first_pulse__1440',
    'motion_repeat__1440','motion_first_start__390','motion_first_assembly__390',
    'motion_first_pulse__390','motion_repeat__390','motion_reduced_static__390',
    'mobile_project_dialog__390','project_operation_pending__1440'
  ];
  // Print diagnostic failures before packaging; a missing capture must not erase the evidence.
  await fs.writeFile(path.join(root, 'manifest.partial.json'), JSON.stringify(report, null, 2));
  if (report.fail.length) console.error('AV_OWNER_QA_DIAGNOSTICS', JSON.stringify(report.fail.slice(0, 40), null, 2));
  const deliveryDir = path.join(root,'selected_preview');
  await fs.mkdir(deliveryDir,{recursive:true});
  const previewContext = await browser.newContext();
  const previewPage = await previewContext.newPage();
  try {
    for(const name of selectedDelivery) {
      let png;
      try { png = await fs.readFile(path.join(root,name+'.png')); }
      catch (error) {
        report.fail.push({reason:'Required original browser capture missing; never fabricate it',name,error:String(error)});
        console.error('AV_OWNER_MISSING_CAPTURE',name,String(error));
        continue;
      }
      const jpegBase64 = await previewPage.evaluate(async data => {
        const original = new Image();
        original.src = 'data:image/png;base64,'+data;
        await original.decode();
        const width = Math.min(960,original.naturalWidth);
        const height = Math.round(original.naturalHeight * width / original.naturalWidth);
        if (height>32000) throw new Error('Captured page too tall for JPEG preview');
        const canvas = document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        canvas.getContext('2d').drawImage(original,0,0,width,height);
        return canvas.toDataURL('image/jpeg',.47).split(',')[1];
      },png.toString('base64'));
      await fs.writeFile(path.join(deliveryDir,name+'.jpg'),Buffer.from(jpegBase64,'base64'));
    }
  } finally { await previewContext.close(); }
} finally {
  await browser.close();
}
report.status = report.fail.length ? 'FAIL' : (report.owner_media.every(x => x.status === 'EXACT') && !report.open_media_debt?.length) ? 'PASS' : 'PASS_MEDIA_PENDING';
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(report, null, 2));
console.log('V43 compiled browser render:', report.status, report.pages.length, 'captures;', report.fail.length, 'failures');
if (report.fail.length) {
  console.error(JSON.stringify(report.fail.slice(0, 12), null, 2));
  process.exitCode = 1;
}
