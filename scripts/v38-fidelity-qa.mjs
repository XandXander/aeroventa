import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173';
const failures = [];
const notes = [];
const routes = ['/', '/contact/', '/services/', '/about/', '/portfolio/', '/faq/', '/montazh-po-proektu/', '/obekt-bez-gotovogo-proekta/'];

const fail = (issue, extra = {}) => failures.push({ issue, ...extra });
const browser = await chromium.launch({ headless: true });

async function routeSweep(label, options) {
  const context = await browser.newContext(options);
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);

    const m = await page.evaluate(() => {
      const wordmark = document.querySelector('.brand-wordmark');
      const footerWordmark = document.querySelector('.footer-brand-wordmark');
      const allImages = [...document.images];
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        h1: document.querySelectorAll('h1').length,
        brokenImages: allImages.filter((img) => img.complete && img.naturalWidth === 0).length,
        wordmarkSrc: wordmark?.getAttribute('src') || '',
        wordmarkWidth: wordmark?.naturalWidth || 0,
        footerWordmarkSrc: footerWordmark?.getAttribute('src') || '',
        footerWordmarkWidth: footerWordmark?.naturalWidth || 0,
        openDialogs: [...document.querySelectorAll('dialog')].filter((el) => el.open).length,
        favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || '',
      };
    });

    if (response?.status() !== 200) fail('route-status', { label, route, status: response?.status() || 0 });
    if (m.overflow > 0) fail('horizontal-overflow', { label, route, overflow: m.overflow });
    if (m.h1 !== 1) fail('h1-count', { label, route, h1: m.h1 });
    if (m.brokenImages) fail('broken-images', { label, route, brokenImages: m.brokenImages });
    if (m.wordmarkSrc !== '/brand/aeroventa-wordmark.svg' || m.wordmarkWidth <= 0) fail('header-wordmark', { label, route, m });
    if (m.footerWordmarkSrc !== '/brand/aeroventa-wordmark.svg' || m.footerWordmarkWidth <= 0) fail('footer-wordmark', { label, route, m });
    if (m.openDialogs !== 0) fail('automatic-dialog-open', { label, route, openDialogs: m.openDialogs });
    if (m.favicon !== '/favicon.svg') fail('favicon-binding', { label, route, favicon: m.favicon });
    if (consoleErrors.length) fail('console-errors', { label, route, consoleErrors });
    if (pageErrors.length) fail('page-errors', { label, route, pageErrors });
    await page.close();
  }
  await context.close();
}

await routeSweep('desktop', { viewport: { width: 1536, height: 1024 } });
await routeSweep('mobile-emulation', {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/154 Mobile Safari/537.36',
});

const desktopContext = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
const desktop = await desktopContext.newPage();
await desktop.goto(base + '/', { waitUntil: 'networkidle' });
const heroDesktop = await desktop.evaluate(() => {
  const grid = document.querySelector('.home-hero__grid')?.getBoundingClientRect();
  const copy = document.querySelector('.home-hero__copy')?.getBoundingClientRect();
  const media = document.querySelector('.hero-engineering')?.getBoundingClientRect();
  const supply = document.querySelector('.hero-airflow-path--supply');
  const exhaust = document.querySelector('.hero-airflow-path--exhaust');
  const primary = document.querySelector('.home-actions .button--primary');
  const secondary = document.querySelector('.home-actions .button--ghost');
  const labelSupply = document.querySelector('.hero-engineering__label--supply');
  const labelExhaust = document.querySelector('.hero-engineering__label--exhaust');
  return {
    gridWidth: grid?.width || 0,
    copyWidth: copy?.width || 0,
    mediaWidth: media?.width || 0,
    copyRatio: grid ? copy.width / grid.width : 0,
    mediaRatio: grid ? media.width / grid.width : 0,
    supplyStroke: supply ? getComputedStyle(supply).stroke : '',
    exhaustStroke: exhaust ? getComputedStyle(exhaust).stroke : '',
    primaryText: primary?.textContent?.replace(/\s+/g, ' ').trim() || '',
    primaryHref: primary?.getAttribute('href') || '',
    secondaryText: secondary?.textContent?.replace(/\s+/g, ' ').trim() || '',
    secondaryHref: secondary?.getAttribute('href') || '',
    supplyLabel: labelSupply?.textContent?.replace(/\s+/g, ' ').trim() || '',
    exhaustLabel: labelExhaust?.textContent?.replace(/\s+/g, ' ').trim() || '',
    overlayVisible: Boolean(document.querySelector('.hero-engineering__overlay')),
    evidenceText: document.querySelector('.hero-engineering__evidence')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  };
});
if (heroDesktop.copyRatio < .34 || heroDesktop.copyRatio > .46) fail('desktop-hero-copy-ratio', heroDesktop);
if (heroDesktop.mediaRatio < .54 || heroDesktop.mediaRatio > .66) fail('desktop-hero-media-ratio', heroDesktop);
if (!heroDesktop.supplyStroke.includes('255') || !heroDesktop.supplyStroke.includes('77')) fail('supply-orange-missing', heroDesktop);
if (!heroDesktop.exhaustStroke.includes('20') || !heroDesktop.exhaustStroke.includes('140')) fail('exhaust-blue-missing', heroDesktop);
if (!heroDesktop.primaryText.startsWith('Получить ориентир стоимости') || heroDesktop.primaryHref !== '/obekt-bez-gotovogo-proekta/') fail('primary-cta-fidelity', heroDesktop);
if (!heroDesktop.secondaryText.includes('Есть проект') || heroDesktop.secondaryHref !== '/montazh-po-proektu/') fail('secondary-cta-fidelity', heroDesktop);
if (!heroDesktop.supplyLabel.includes('Приточная магистраль') || !heroDesktop.exhaustLabel.includes('Вытяжная магистраль')) fail('hero-labels', heroDesktop);
if (!heroDesktop.overlayVisible || !heroDesktop.evidenceText.includes('схема направления потока')) fail('overlay-disclosure', heroDesktop);
await desktop.screenshot({ path: 'V38_HOME_DESKTOP.png', fullPage: true });
await desktopContext.close();

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const mobile = await mobileContext.newPage();
await mobile.goto(base + '/', { waitUntil: 'networkidle' });
const heroMobile = await mobile.evaluate(() => {
  const copy = document.querySelector('.home-hero__copy')?.getBoundingClientRect();
  const media = document.querySelector('.hero-engineering')?.getBoundingClientRect();
  const supplyLabel = document.querySelector('.hero-engineering__label--supply')?.getBoundingClientRect();
  const exhaustLabel = document.querySelector('.hero-engineering__label--exhaust')?.getBoundingClientRect();
  return {
    copyBottom: copy?.bottom || 0,
    mediaTop: media?.top || 0,
    mediaHeight: media?.height || 0,
    supplyVisible: Boolean(supplyLabel && supplyLabel.width > 0 && supplyLabel.height > 0),
    exhaustVisible: Boolean(exhaustLabel && exhaustLabel.width > 0 && exhaustLabel.height > 0),
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
  };
});
if (heroMobile.mediaTop < heroMobile.copyBottom - 2) fail('mobile-hero-order', heroMobile);
if (heroMobile.mediaHeight < 340) fail('mobile-hero-height', heroMobile);
if (!heroMobile.supplyVisible || !heroMobile.exhaustVisible) fail('mobile-hero-label-visibility', heroMobile);
if (heroMobile.overflow > 0) fail('mobile-home-overflow', heroMobile);
await mobile.screenshot({ path: 'V38_HOME_MOBILE.png', fullPage: true });
await mobileContext.close();

const narrowContext = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
for (const route of ['/', '/contact/']) {
  const page = await narrowContext.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  if (overflow > 0) fail('narrow-320-overflow', { route, overflow });
  await page.close();
}
await narrowContext.close();

const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const reduced = await reducedContext.newPage();
await reduced.goto(base + '/', { waitUntil: 'networkidle' });
const reducedState = await reduced.evaluate(() => ({
  entryExists: Boolean(document.querySelector('[data-airflow-entry]')),
  supply: Boolean(document.querySelector('.airflow-header-trace__route--supply')),
  exhaust: Boolean(document.querySelector('.airflow-header-trace__route--exhaust')),
}));
if (reducedState.entryExists || !reducedState.supply || !reducedState.exhaust) fail('reduced-motion-trace', reducedState);
await reducedContext.close();

await browser.close();

const report = {
  generated_at: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS',
  affected_routes: routes,
  checks: {
    desktop_routes: routes.length,
    mobile_routes: routes.length,
    narrow_routes: 2,
    identity_binding: true,
    hero_fidelity: true,
    reduced_motion: true,
  },
  physical_true_mobile: 'NOT_ESTABLISHED_BY_CI_EMULATION',
  failures,
  heroDesktop,
  heroMobile,
  reducedState,
  notes,
};
await fs.writeFile('V38_FIDELITY_QA.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failures: failures.length, heroDesktop, heroMobile, physical_true_mobile: report.physical_true_mobile }, null, 2));
if (failures.length) process.exitCode = 1;
