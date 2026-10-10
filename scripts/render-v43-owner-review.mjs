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
            const grid = document.querySelector('.home-solution .solution-grid');
            const diagram = document.querySelector('.home-solution .solution-diagram');
            const copy = document.querySelector('.home-solution .section-copy');
            const g = grid?.getBoundingClientRect(), d = diagram?.getBoundingClientRect(), c = copy?.getBoundingClientRect();
            return {
              grid_top:g?.top,grid_bottom:g?.bottom,
              diagram_top:d?.top,diagram_bottom:d?.bottom,diagram_left:d?.left,diagram_right:d?.right,
              copy_right:c?.right,
              overlay_display:diagram && getComputedStyle(diagram,'::before').display,
              diagram_object_fit:diagram && getComputedStyle(diagram.querySelector('img')).objectFit,
              label_count:diagram?.querySelectorAll('.solution-overlay-label').length,
              label_visible:diagram && getComputedStyle(diagram.querySelector('.solution-overlay-labels')).display !== 'none',
            };
          });
          const mobilePanels = await page.locator('.solution-mobile-pair__panel').count();
          const mobilePairVisible = await page.locator('.solution-mobile-pair').isVisible();
          const desktopIntegrated = width <= 1100 || (
            optical.diagram_left >= optical.copy_right - 26 &&
            Math.abs(optical.diagram_top - optical.grid_top) <= 2 &&
            Math.abs(optical.diagram_bottom - optical.grid_bottom) <= 2 &&
            optical.diagram_right >= width - 2 &&
            optical.diagram_object_fit === 'cover' &&
            optical.overlay_display !== 'none' &&
            optical.label_count === 2 && optical.label_visible
          );
          if ((width > 760 && !desktopIntegrated) ||
              (width <= 760 && (mobilePanels !== 2 || !mobilePairVisible))) {
            report.fail.push({ route, view, reason: 'Owner full-height HVAC scene + safe labels', optical, mobilePanels, mobilePairVisible });
          }
          const recognition = page.locator('.home-ponsse');
          const orderCorrect = await page.evaluate(() => {
            const section = document.querySelector('.home-ponsse');
            const prior = section?.previousElementSibling;
            const after = section?.nextElementSibling;
            return prior?.id === 'objects' && !!prior?.previousElementSibling?.classList.contains('case-feature') && !!after?.classList.contains('decision-preview');
          });
          if (!orderCorrect || await recognition.count() !== 1 ||
              await recognition.locator('img[src="/evidence/karelia/ponsse-letter-20220405.png"]').count() !== 1 ||
              await recognition.locator('a[href="/blog/detail/montazh-ventilyatsii-v-karelii/"]').count() !== 1) {
            report.fail.push({route,view,reason:'PONSSE historical proof placement and direct case path',orderCorrect});
          }
          const opened = await page.locator('dialog[open]').count();
          if (opened) report.fail.push({route,view,reason:'Surprise modal on initial page load',opened});
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
          if (count !== 6 || photos !== 6 || ponsse !== 1) {
            report.fail.push({route,view,reason:'Six photo-backed direct named cases',count,photos,ponsse});
          }
          for (const card of await cards.all()) {
            const href = await card.getAttribute('href');
            if (!href?.startsWith('/blog/detail/')) report.fail.push({route,view,reason:'Case must link directly to historic case URL',href});
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
          const galleryCount = await page.locator('.case-gallery-archive img').count();
          if (galleryCount !== 18) report.fail.push({route,view,reason:'Complete PONSSE historical image inventory not present',galleryCount});
          const expectedLetter = report.owner_media[1].status === 'EXACT';
          const expectedPortrait = report.owner_media[2].status === 'EXACT' && process.env.PUBLIC_PONSSE_PORTRAIT_PUBLICATION_APPROVED === 'true';
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
        if (id === 'home' && view === 'mobile_390') {
          await page.locator('.mobile-menu summary').click();
          await page.screenshot({ path: path.join(root, 'mobile_390_navigation.png'), animations: 'disabled' });
        }
        if (id === 'home' && (view === 'desktop_1440' || view === 'mobile_390')) {
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
