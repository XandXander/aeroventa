import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('V43_OWNER_BROWSER_REVIEW');
const baseUrl = 'http://127.0.0.1:4178';
const views = [
  ['desktop_1440', 1440, 900],
  ['tablet_834', 834, 1100],
  ['mobile_390', 390, 844],
  ['mobile_320', 320, 720],
];
const routes = [
  ['home', '/'],
  ['ventilation', '/montazh-ventiliacii/'],
  ['services', '/services/'],
  ['newbuilds', '/obekty/novostroyki-i-zhilye-kompleksy/'],
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
];
await fs.mkdir(root, { recursive: true });
const report = { build_mode: 'fixture', local_http_only: true, routes: routes.length, viewports: views.map(x => x[0]), pages: [], fail: [], owner_media: [] };
for (const [name, file, expected] of [
  ['home_original','apps/web/public/evidence/hero/owner-luxury-airflow-20261010.png','56704487b748269038168c1cb64f74b4415054e61a2e73b3e9a6f2eb002f83ee'],
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
          const ownerImage = report.owner_media[0].status === 'EXACT';
          const actualHero = await page.locator('.hero-engineering__photo').getAttribute('src');
          const expectedHero = ownerImage ? '/evidence/hero/owner-luxury-airflow-20261010.png' : '/evidence/hero/ductwork-editorial-v43.webp';
          if (actualHero !== expectedHero) report.fail.push({route,view,reason:'Owner hero source does not match media gate',expectedHero,actualHero});
          const optical = await page.evaluate(() => {
            const diagram = document.querySelector('.home-solution .solution-diagram');
            const copy = document.querySelector('.home-solution .section-copy');
            const legend = document.querySelector('.home-solution .solution-mobile-legend');
            return {
              diagram_top: diagram?.getBoundingClientRect().top,
              copy_bottom: copy?.getBoundingClientRect().bottom,
              overlay_display: diagram && getComputedStyle(diagram, '::before').display,
              legend_display: legend && getComputedStyle(legend).display,
            };
          });
          const mobilePanels = await page.locator('.solution-mobile-pair__panel').count();
          const mobilePairVisible = await page.locator('.solution-mobile-pair').isVisible();
          if ((width > 760 && (optical.overlay_display !== 'none' || optical.diagram_top < optical.copy_bottom - 3)) ||
              (width <= 760 && (mobilePanels !== 2 || !mobilePairVisible))) {
            report.fail.push({ route, view, reason: 'supply/exhaust labels optical legibility', optical, mobilePanels, mobilePairVisible });
          }
        }
        if (id === 'services') {
          const ducts = await page.locator('.services-editorial__image img[src="/evidence/hero/engineering-ductwork.jpg"]').count();
          const wrong = await page.locator('.services-editorial__image img[src="/evidence/hero/hiend-engineering-visual-owner-v43.webp"]').count();
          if (ducts !== 1 || wrong) report.fail.push({ route, view, reason: 'Owner services photo assignment', ducts, wrong });
        }
        if (id === 'ventilation') {
          const architectural = await page.locator('.service-premium__visual img[src="/evidence/hero/hiend-engineering-visual-owner-v43.webp"]').count();
          const wrong = await page.locator('.service-premium__visual img[src="/evidence/hero/engineering-ductwork.jpg"]').count();
          if (architectural !== 1 || wrong) report.fail.push({ route, view, reason: 'Owner montage hero assignment', architectural, wrong });
        }
        if (['seven_park','karelia_ponsse','polisan','leont','zhukov','cafe'].includes(id)) {
          const media = await page.locator('.case-gallery__item img').count();
          const story = await page.locator('.case-story__grid > div').count();
          if (media < 2 || story !== 3) report.fail.push({ route, view, reason: 'object evidence/story missing', media, story });
        }
        if (id === 'karelia_ponsse') {
          const content = await page.locator('.ponsse-recognition').innerText();
          if (!content.includes('05.04.2022') || !content.includes('Petteri Teittinen')) report.fail.push({ route, view, reason: 'PONSSE letter editorial content absent' });
          const expectedLetter = report.owner_media[1].status === 'EXACT';
          const expectedPortrait = report.owner_media[2].status === 'EXACT';
          const actualLetter = await page.locator('[data-ponsse-open] img').count();
          const actualPortrait = await page.locator('.ponsse-recognition__portrait img').count();
          if (actualLetter !== Number(expectedLetter) || actualPortrait !== Number(expectedPortrait)) {
            report.fail.push({route,view,reason:'PONSSE original image binding',actualLetter,actualPortrait,expectedLetter,expectedPortrait});
          }
        }
        if (entry.status !== 200 || entry.overflow_px > 1 || entry.broken_images.length || pageErrors.length) {
          report.fail.push(entry);
        }
        await page.screenshot({ path: path.join(root, id + '__' + view + '.png'), fullPage: true, animations: 'disabled' });
        if (id === 'karelia_ponsse' && report.owner_media[1].status === 'EXACT') {
          await page.locator('[data-ponsse-open]').click();
          const letterModal = page.locator('#ponsse-letter-dialog');
          await letterModal.waitFor({state:'visible'});
          if ((await letterModal.locator('img').getAttribute('src')) !== '/evidence/karelia/ponsse-letter-20220405.png') {
            report.fail.push({route,view,reason:'Wrong PONSSE fullsize original'});
          }
          if (view === 'desktop_1440' || view === 'mobile_390') {
            await page.screenshot({path:path.join(root,'ponsse_letter_open__'+view+'.png'),animations:'disabled'});
          }
          await letterModal.locator('.ponsse-letter-dialog__close').click();
          await letterModal.waitFor({state:'hidden'});
        }
        if (id === 'home' && view === 'mobile_390') {
          await page.locator('.mobile-menu summary').click();
          await page.screenshot({ path: path.join(root, 'mobile_390_navigation.png'), animations: 'disabled' });
        }
        if (id === 'home' && (view === 'desktop_1440' || view === 'mobile_390')) {
          await page.locator('.consultant-launcher').click();
          await page.locator('[data-consultant-dialog]').waitFor({ state: 'visible' });
          await page.screenshot({ path: path.join(root, 'consultant_open__' + view + '.png'), animations: 'disabled' });
        }
        if (id === 'home' && view === 'desktop_1440') {
          const nav = await page.locator('.nav--desktop').innerText();
          if (nav.includes('Консультант') || !nav.includes('Статьи')) report.fail.push({ route, view, reason: 'navigation contract', nav });
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
} finally {
  await browser.close();
}
report.status = report.fail.length ? 'FAIL' : report.owner_media.every(x => x.status === 'EXACT') ? 'PASS' : 'PASS_MEDIA_PENDING';
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(report, null, 2));
console.log('V43 compiled browser render:', report.status, report.pages.length, 'captures;', report.fail.length, 'failures');
if (report.fail.length) {
  console.error(JSON.stringify(report.fail.slice(0, 12), null, 2));
  process.exitCode = 1;
}
