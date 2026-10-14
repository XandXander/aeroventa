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
  ['newbuilds', '/obekty/novostroyki-i-zhilye-kompleksy/'],
  ['private_objects','/obekty/kvartiry-i-doma/'],
  ['commercial_objects','/obekty/ofisy-i-kommercheskie-pomeshcheniya/'],
  ['warehouse_objects','/obekty/magaziny-i-sklady/'],
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
              photo_left:p?.left??0,photo_right:p?.right??0,photo_top:p?.top??0,photo_bottom:p?.bottom??0,
              copy_left:c?.left??0,copy_top:c?.top??0,copy_right:c?.right??0,copy_bottom:c?.bottom??0,
              strip_top:r?.top??0,inline_visible:inline?getComputedStyle(inline).display!=='none':false,
              floating_visible:fixed?getComputedStyle(fixed).display!=='none':false,
              diagram_count:document.querySelectorAll('.home-solution .solution-diagram,.home-solution .solution-mobile-pair').length,
              desktop_diagram_visible:!!document.querySelector('.home-solution .solution-diagram') && getComputedStyle(document.querySelector('.home-solution .solution-diagram')).display !== 'none',
              mobile_pair_visible:!!document.querySelector('.home-solution .solution-mobile-pair') && getComputedStyle(document.querySelector('.home-solution .solution-mobile-pair')).display !== 'none',
              process_stages:document.querySelectorAll('.home-solution .process-strip > div').length,
            };
          });
          const isMobile = width <= 760;
          const isTablet = width > 760 && width <= 1100;
          const photoBeforeCopy = optical.photo_bottom <= optical.copy_top + 3;
          const desktopColumns = optical.copy_right <= optical.photo_left + 3 && optical.photo_right >= width*.8;
          const ownerScenePass = optical.natural_width > 0 &&
            optical.diagram_count === 2 && optical.process_stages === 4 &&
            (isMobile ? (!optical.desktop_diagram_visible && optical.mobile_pair_visible) :
                        (optical.desktop_diagram_visible && !optical.mobile_pair_visible)) &&
            (isMobile || isTablet ?
              (optical.photo_fit === 'contain' && photoBeforeCopy) :
              (optical.photo_fit === 'cover' && desktopColumns)) &&
            (!isMobile || (optical.inline_visible && !optical.floating_visible &&
             optical.strip_top >= optical.copy_bottom - 2));
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
            if (!txt.includes('международная промышленная компания') ||
                !txt.includes('профессионализм') || !txt.includes('рабочую этику') ||
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
            const expectedGroup = '/evidence/team/owner-team-group-20261013.webp';
            const expectedPanov = '/evidence/team/owner-evgeniy-panov-20261013.webp';
            // Compare displayed WebP subjects against the two PNG originals supplied
            // by Owner on 14 October. 8x8 grayscale fingerprints tolerate WebP coding
            // but detect the wrong group/person. No raw PNG reaches webroot.
            // Group source SHA256 c6659ec091b93c37f3f6eb9a48284fd429e68032d82288839e63677aaf8eae83
            // Panov source SHA256 64f0eaab5fa18abd878bb0e175f55827c6e73ba79ab72dea0579bcd635652207
            const expectedFps = ['ffffff0100000021','e0c1cfedc1c18100'];
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
               media.some(x=>x.distance>12) ||
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
            return {headingTop:h?.top,photoTop:p?.top,photoWidth:i?.naturalWidth,photoHeight:p?.height,photoBottom:p?.bottom,launcherOverlap:overlaps,launcherVisible:!!l && getComputedStyle(document.querySelector('.consultant-launcher')).display!=='none',inlineConsultant:!!document.querySelector('.about-hero a[data-consultant-open][data-source="about_inline"]')};
          });
          if (!optical.photoWidth || optical.headingTop == null || optical.headingTop >= height*.55 ||
              (width<=760 && (optical.photoHeight < 250 || optical.photoHeight > height*.85 || optical.photoTop >= height*.7 || optical.launcherOverlap || optical.launcherVisible || !optical.inlineConsultant))) {
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
            'НТФФ': '/evidence/polisan/owner-cover-v43.webp',
            'Маршала Жукова': '/evidence/zhukov/owner-cover-v43.webp',
            'PONSSE': '/evidence/karelia/owner-cover-v43.webp',
            'Римского-Корсакова': '/evidence/cafe/owner-cover-v43.webp',
          };
          for (const [name, src] of Object.entries(requiredCovers)) {
            const count = await page.locator(`.portfolio-card:has-text("${name}") img[src="${src}"]`).count();
            if (count !== 1) report.fail.push({route,view,reason:'Owner authentic cover mismatch',name,src,count});
          }
          if (count !== 5 || photos !== 5 || ponsse !== 1 || await page.locator('.portfolio-feature a[href="/blog/detail/kak-my-sdali-7-domov/"]').count() !== 1) {
            report.fail.push({route,view,reason:'Five distinct case cards plus featured 7 PARK',count,photos,ponsse});
          }
          for (const card of await cards.all()) {
            const href = await card.getAttribute('href');
            if (!href?.startsWith('/blog/detail/')) report.fail.push({route,view,reason:'Case must link directly to historic case URL',href});
          }
        }
        if (['drill_crown', 'drill_screed', 'drill_cost', 'drill_horizontal'].includes(id)) {
          const reading = page.locator('.p0-historic-reading__body');
          const restoredText = await reading.innerText();
          if (restoredText.trim().length < 350 || await reading.locator('p').count() < 1) {
            report.fail.push({route,view,reason:'Historical technical content not presented as readable main page text',chars:restoredText.length});
          }
          const figures = await page.locator('.p0-historic-reading figure, .p0-article figure').count();
          report.open_media_debt ||= [];
          if (figures === 0 && view === 'desktop_1440') {
            report.open_media_debt.push({route,reason:'Original illustrated instruction still lacks historical media; source restore required before release'});
          }
        }
        if (id === 'services') {
          // 14 Oct Owner explicitly rejected the old two-photo services HERO.
          const photographicProof = page.locator('.services-hero__backdrop--single img');
          const expected = ['/evidence/cafe/owner-cover-v43.webp'];
          const actual = await photographicProof.evaluateAll(nodes=>nodes.map(n=>new URL(n.src).pathname));
          const wrong = await page.locator('.services-hero img[src="/evidence/hero/engineering-ductwork.jpg"], .services-hero img[src="/evidence/hero/services-owner-editorial-1774.webp"]').count();
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
              intro_bottom:text?.bottom??0,
              inline_visible:inline?getComputedStyle(inline).display!=='none':false,
              floating_visible:floating?getComputedStyle(floating).display!=='none':false
            };
          });
          const mobile=width<=760;
          if (JSON.stringify(actual)!==JSON.stringify(expected) || wrong ||
              servicesOptical.natural_widths.length!==1 ||
              servicesOptical.natural_widths.some(n=>n<400) ||
              servicesOptical.object_fits.some(n=>n!=='cover') ||
              (mobile && (servicesOptical.photo_top<servicesOptical.intro_bottom-3 ||
                  !servicesOptical.inline_visible || servicesOptical.floating_visible))) {
            report.fail.push({route,view,reason:'Owner Services single authentic image and mobile placement',wrong,actual,servicesOptical});
          }
        }
        if (id === 'ventilation') {
          const architectural = await page.locator('.service-premium__visual img[src="/evidence/hero/hiend-engineering-visual-owner-v43.webp"]').count();
          const wrong = await page.locator('.service-premium__visual img[src="/evidence/hero/engineering-ductwork.jpg"]').count();
          if (architectural !== 1 || wrong) report.fail.push({ route, view, reason: 'Owner montage hero assignment', architectural, wrong });
        }
        if (['seven_park','karelia_ponsse','polisan','leont','zhukov','cafe'].includes(id)) {
          const expectedGallery = {seven_park:17,karelia_ponsse:18,leont:26,polisan:15,cafe:10,zhukov:5};
          if (Object.hasOwn(expectedGallery,id)) {
            const archiveImages = await page.locator('.case-gallery__archive .case-gallery__item img').count();
            if (archiveImages !== expectedGallery[id]) report.fail.push({route,view,reason:'Original case archive not fully represented',archiveImages,expected:expectedGallery[id]});
          }
          const media = await page.locator('.case-gallery__item img').count();
          const story = await page.locator('.case-story__grid > div').count();
          if (media < 2 || story !== 3) report.fail.push({ route, view, reason: 'object evidence/story missing', media, story });
          const hiddenArchive = await page.locator('details.case-gallery-archive, .case-gallery-archive details').count();
          if (hiddenArchive) report.fail.push({route,view,reason:'Case photos must not be gated behind a disclosure',hiddenArchive});
        }
        if (id === 'karelia_ponsse') {
          const content = await page.locator('.ponsse-recognition').innerText();
          if (!content.includes('05.04.2022') || !content.includes('Petteri Teittinen')) report.fail.push({ route, view, reason: 'PONSSE letter editorial content absent' });
          const galleryCount = await page.locator('.case-gallery__archive .case-gallery__item img').count();
          if (galleryCount !== 18) report.fail.push({route,view,reason:'Complete PONSSE historical image inventory not present',galleryCount});
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
          const secondCount = await viewer.locator('[data-photo-count]').innerText();
          if (!secondCount.startsWith('2 / ')) report.fail.push({route,view,reason:'Case viewer next navigation failed',secondCount});
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
          await page.locator(view === 'mobile_390' ? '.home-consultant-inline' : '.consultant-launcher').click();
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
  // Contact UI: mock POST, never reach an inbox. Verify a pending-only PULSE,
  // accessible error path and no fabricated delivery confirmation.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'load'});
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
      const valid=!!m.hero&&!!m.photo&&!!m.copy&&m.routes.length===3&&m.overflow<=1&&
       (desktop
        ?m.photo.w>width*.3&&m.photo.h>350&&m.photo.x>m.copy.x+m.copy.w*.7&&
         m.routes.every((r,i)=>r.w>width*.19&&r.h>=72&&(i===0||r.x>m.routes[i-1].x+60))&&!m.inline
        :m.photo.w>=width-2&&m.photo.y>=m.copy.bottom-1&&m.photo.h>140&&
         m.routes.every((r,i)=>r.w>width*.76&&r.h>=50&&(i===0||r.y>m.routes[i-1].y+32)));
      if(!valid)report.fail.push({reason:'Services actual optical grid and legible three routes',width,height,m});
    }catch(e){report.fail.push({reason:'Services editorial geometry exception',width,height,error:String(e)})}
    finally{await context.close()}
  }
  // The persistent consultant must not overlap the six home categories.
  {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage();
    try{
      await page.goto(baseUrl+'/',{waitUntil:'load'});
      const before=await page.locator('.consultant-launcher').evaluate(el=>{
        const css=getComputedStyle(el);return {visibility:css.visibility,opacity:Number(css.opacity)};
      });
      await page.locator('.home-hero--owner-airflow .object-ribbon').scrollIntoViewIfNeeded();
      const under=await page.locator('.consultant-launcher').evaluate(el=>getComputedStyle(el).visibility);
      await page.locator('.decision-preview').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.documentElement.classList.contains('is-past-first-fold'),null,{timeout:4000});
      const after=await page.locator('.consultant-launcher').evaluate(el=>getComputedStyle(el).visibility);
      if(before.visibility!=='hidden'||under!=='hidden'||after!=='visible')
        report.fail.push({reason:'Consultant launcher must not overlap first-fold categories',before,under,after});
    }catch(e){report.fail.push({reason:'Consultant first-fold overlap QA failed',error:String(e)})}
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
          const firstArticle=document.querySelector('.practice-article-index__item');
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
            (route==='/blog/'&&zoom===1&&(result.firstArticleTop===null||result.firstArticleTop>height)) ||
            (zoom===1&&!result.traceVisible)) {
          report.fail.push({reason:'Owner height/zoom/real TRACE gate',route,width,height,zoom,result});
        }
      }
      if(route==='/services/'&&width===390){
        const placement=await page.evaluate(()=>{
          const a=document.querySelector('.services-hero__intro')?.getBoundingClientRect();
          const b=document.querySelector('.services-hero__backdrop--single')?.getBoundingClientRect();
          return {introBottom:a?.bottom,photoTop:b?.top};
        });
        if(!placement.introBottom||!placement.photoTop||placement.photoTop<placement.introBottom-2){
          report.fail.push({reason:'Services mobile reading order',placement});
        }
      }
      if(route==='/portfolio/'&&width===1440){
        const grid=await page.locator('.portfolio-card').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));
        if(grid.length!==5||new Set(grid.slice(0,2)).size!==1||new Set(grid.slice(2)).size!==1||grid[2]<=grid[0])
          report.fail.push({reason:'Portfolio intentional 2+3 editorial rows',grid});
      }
    } catch(e){report.fail.push({reason:'Owner additional QA exception',route,width,height,error:String(e)})}
    finally{await context.close()}
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
      const initial=await dialog.locator('img').evaluate(x=>x.getBoundingClientRect().width);
      await dialog.locator('[data-document-zoom-in]').click();
      const expanded=await dialog.locator('img').evaluate(x=>x.getBoundingClientRect().width);
      await dialog.locator('[data-document-fit]').click();
      const fitted=await dialog.locator('img').evaluate(x=>x.getBoundingClientRect().width);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
      const restored=await opener.evaluate(x=>x===document.activeElement);
      if(expanded<=initial+2||Math.abs(fitted-initial)>2||!restored||await page.locator('a[target="_blank"][href*="ponsse-letter"]').count()){
        report.fail.push({reason:'Owner PONSSE document zoom/fit/Escape/focus',initial,expanded,fitted,restored});
      }
    }catch(e){report.fail.push({reason:'PONSSE document full interaction exception',error:String(e)})}
    finally{await context.close()}
  }
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
