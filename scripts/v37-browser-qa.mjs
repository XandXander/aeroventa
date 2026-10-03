import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173';
const dist = path.resolve('apps/web/dist');
const reportPath = path.resolve('V37_BROWSER_QA.json');

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name === 'index.html') {
      let route = full.slice(dist.length).split(path.sep).join('/').replace(/\/index\.html$/, '/');
      out.push(route || '/');
    }
  }
  return out;
}

const routes = [...new Set(await walk(dist))].sort();
const results = [];
const failures = [];
const notes = [];

const browser = await chromium.launch({ headless: true });

async function scanRouteSet(label, contextOptions) {
  const context = await browser.newContext(contextOptions);
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 120));
      window.scrollTo(0, 0);
      await document.fonts.ready;
    });

    const metrics = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
      const brokenImages = [...document.images].filter((img) => img.complete && img.naturalWidth === 0).length;
      const hiddenMain = !document.querySelector('#main-content');
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        h1: document.querySelectorAll('h1').length,
        headingJump: headings.some((level, index) => index > 0 && level > headings[index - 1] + 1),
        brokenImages,
        hiddenMain,
        title: document.title,
      };
    });

    const row = {
      label,
      route,
      status: response?.status() || 0,
      ...metrics,
      consoleErrors,
      pageErrors,
    };
    results.push(row);

    if (
      row.status !== 200 ||
      row.overflow > 0 ||
      row.h1 !== 1 ||
      row.headingJump ||
      row.brokenImages ||
      row.hiddenMain ||
      consoleErrors.length ||
      pageErrors.length
    ) {
      failures.push(row);
    }
    await page.close();
  }
  await context.close();
}

await scanRouteSet('desktop', { viewport: { width: 1440, height: 1000 } });
await scanRouteSet('mobile-emulation', {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/154 Mobile Safari/537.36',
});

const narrowContext = await browser.newContext({
  viewport: { width: 320, height: 700 },
  isMobile: true,
  hasTouch: true,
});
const narrowRoutes = ['/', '/about/', '/services/', '/contact/', '/portfolio/', '/faq/', '/montazh-po-proektu/', '/obekt-bez-gotovogo-proekta/'];
const narrow = [];
for (const route of narrowRoutes) {
  const page = await narrowContext.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  narrow.push({ route, overflow });
  if (overflow > 0) failures.push({ label: 'narrow-320', route, overflow });
  await page.close();
}
await narrowContext.close();

const tabletContext = await browser.newContext({ viewport: { width: 834, height: 1112 }, hasTouch: true });
const tabletRoutes = ['/', '/services/', '/contact/', '/portfolio/', '/montazh-po-proektu/', '/obekt-bez-gotovogo-proekta/'];
const tablet = [];
for (const route of tabletRoutes) {
  const page = await tabletContext.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => ({
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    h1: document.querySelectorAll('h1').length,
  }));
  tablet.push({ route, ...state });
  if (state.overflow > 0 || state.h1 !== 1) failures.push({ label: 'tablet', route, ...state });
  await page.close();
}
await tabletContext.close();

const uxContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const ux = await uxContext.newPage();
await ux.goto(base + '/', { waitUntil: 'networkidle' });

await ux.keyboard.press('Tab');
const skip = await ux.evaluate(() => ({
  className: document.activeElement?.className || '',
  href: document.activeElement?.getAttribute?.('href') || '',
}));
if (!String(skip.className).includes('skip-link') || skip.href !== '#main-content') failures.push({ label: 'keyboard', issue: 'skip-link-first-focus', skip });
await ux.keyboard.press('Enter');
await ux.waitForTimeout(50);
const skipTarget = await ux.evaluate(() => ({
  id: document.activeElement?.id || '',
  tag: document.activeElement?.tagName || '',
}));
if (skipTarget.id !== 'main-content') failures.push({ label: 'keyboard', issue: 'skip-link-target', skipTarget });

await ux.click('[data-consultant-open]');
if (!(await ux.locator('[data-consultant-dialog]').evaluate((el) => el.open))) failures.push({ label: 'consultant', issue: 'dialog-not-open' });
await ux.selectOption('#consultant-object', 'restaurant');
await ux.selectOption('#consultant-region', 'spb');
await ux.selectOption('#consultant-stage', 'fitout');
await ux.check('input[name="project_status"][value="not_ready"]');
await ux.fill('#consultant-task', 'Нужно понять исходные данные перед монтажом вентиляции.');
await ux.click('[data-consultant-form] button[type="submit"]');
if (await ux.locator('[data-consultant-result]').getAttribute('hidden') !== null) failures.push({ label: 'consultant', issue: 'result-hidden' });
const consultantState = await ux.evaluate(() => ({
  title: document.querySelector('[data-consultant-next]')?.textContent?.trim() || '',
  route: document.querySelector('[data-consultant-route]')?.getAttribute('href') || '',
  caseHref: document.querySelector('[data-consultant-link]')?.getAttribute('href') || '',
  missingCount: document.querySelectorAll('[data-consultant-missing] li').length,
}));
if (consultantState.route !== '/obekt-bez-gotovogo-proekta/' || consultantState.missingCount < 2) {
  failures.push({ label: 'consultant', issue: 'deterministic-routing', consultantState });
}

await ux.click('[data-consultant-handoff]');
const handoff = await ux.evaluate(() => {
  const dialog = document.querySelector('[data-contact-dialog]');
  const form = dialog?.querySelector('[data-contact-form]');
  return {
    open: Boolean(dialog?.open),
    projectStatus: form?.elements?.project_status?.value || '',
    summary: form?.elements?.consultant_summary?.value || '',
    task: form?.elements?.task?.value || '',
  };
});
if (!handoff.open || handoff.projectStatus !== 'not_ready' || !handoff.summary || !handoff.task) {
  failures.push({ label: 'consultant', issue: 'handoff-context', handoff });
}

const handoffForm = ux.locator('[data-contact-dialog] [data-contact-form]');
await handoffForm.locator('input[name="name"]').fill('QA User');
await handoffForm.locator('input[name="contact"]').fill('qa@example.test');
await handoffForm.locator('textarea[name="task"]').fill('QA request');
await handoffForm.locator('input[name="consent"]').check();
await handoffForm.evaluate((form) => { form.dataset.leadEndpoint = 'http://127.0.0.1:4173/__qa_lead'; });

let submittedBody = null;
await ux.route('http://127.0.0.1:4173/__qa_lead', async (route) => {
  submittedBody = route.request().postDataJSON();
  await route.fulfill({ status: 204, body: '' });
});
await handoffForm.locator('button[type="submit"]').click();
await ux.waitForFunction(() => document.querySelector('[data-contact-dialog] [data-form-status]')?.textContent?.includes('Запрос передан'));
const formSuccess = await handoffForm.locator('[data-form-status]').textContent();
if (!formSuccess?.includes('Запрос передан') || !submittedBody?.source_page || submittedBody.project_status !== 'not_ready') {
  failures.push({ label: 'contact-form', issue: 'success-or-context', formSuccess, submittedBody });
}

await ux.unroute('http://127.0.0.1:4173/__qa_lead');
await handoffForm.locator('input[name="name"]').fill('QA User');
await handoffForm.locator('input[name="contact"]').fill('qa@example.test');
await handoffForm.locator('textarea[name="task"]').fill('QA error state');
await handoffForm.locator('input[name="consent"]').check();
await handoffForm.evaluate((form) => { form.dataset.leadEndpoint = 'http://127.0.0.1:4173/__qa_error'; });
await ux.route('http://127.0.0.1:4173/__qa_error', (route) => route.fulfill({ status: 500, body: 'fail' }));
await handoffForm.locator('button[type="submit"]').click();
await ux.waitForFunction(() => document.querySelector('[data-contact-dialog] [data-form-status]')?.textContent?.includes('Не удалось передать'));
const formError = await handoffForm.locator('[data-form-status]').textContent();
if (!formError?.includes('Не удалось передать')) failures.push({ label: 'contact-form', issue: 'error-state', formError });
await ux.unroute('http://127.0.0.1:4173/__qa_error');

const semantics = await ux.evaluate(() => {
  const form = document.querySelector('[data-contact-dialog] [data-contact-form]');
  return {
    names: [...form.querySelectorAll('input:not([type="hidden"]),textarea')].map((el) => el.name),
    required: [...form.querySelectorAll('[required]')].map((el) => el.name),
    hidden: [...form.querySelectorAll('input[type="hidden"]')].map((el) => el.name),
    automaticDialogs: [...document.querySelectorAll('dialog')].filter((el) => el.open).length,
  };
});
if (!['name','contact','task','company'].every((name) => semantics.names.includes(name))) failures.push({ label: 'contact-form', issue: 'visible-fields', semantics });
if (!['name','contact','task','consent'].every((name) => semantics.required.includes(name))) failures.push({ label: 'contact-form', issue: 'required-fields', semantics });

await uxContext.close();

const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const reduced = await reducedContext.newPage();
await reduced.goto(base + '/', { waitUntil: 'networkidle' });
const reducedState = await reduced.evaluate(() => ({
  entryExists: Boolean(document.querySelector('[data-airflow-entry]')),
  sections: document.querySelectorAll('.airflow-trace-section').length,
  activeSections: document.querySelectorAll('.airflow-trace-section.is-airflow-active').length,
  supplyRoute: Boolean(document.querySelector('.airflow-header-trace__route--supply')),
  exhaustRoute: Boolean(document.querySelector('.airflow-header-trace__route--exhaust')),
}));
if (reducedState.entryExists || reducedState.sections !== reducedState.activeSections || !reducedState.supplyRoute || !reducedState.exhaustRoute) {
  failures.push({ label: 'reduced-motion', issue: 'airflow-static-state', reducedState });
}
await reducedContext.close();

const mobileFocusContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mobileFocus = await mobileFocusContext.newPage();
await mobileFocus.goto(base + '/', { waitUntil: 'networkidle' });
await mobileFocus.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.55));
await mobileFocus.waitForTimeout(150);
const dockState = await mobileFocus.evaluate(() => {
  const dock = document.querySelector('[data-mobile-contact-dock]');
  if (!dock) return { exists: false, visible: false, obstruction: [] };
  const style = getComputedStyle(dock);
  const rect = dock.getBoundingClientRect();
  const visible = style.display !== 'none' && rect.height > 0;
  const obstruction = [];
  const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,summary')].filter((el) => !el.closest('[data-mobile-contact-dock]'));
  for (const el of focusables) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom > rect.top && r.top < rect.bottom && r.right > rect.left && r.left < rect.right) {
      obstruction.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 60));
    }
  }
  return { exists: true, visible, obstruction: obstruction.slice(0, 20) };
});
if (!dockState.exists || !dockState.visible) failures.push({ label: 'mobile-dock', issue: 'not-visible', dockState });
notes.push({ mobileDockGeometricOverlapSnapshot: dockState });
await mobileFocusContext.close();

const perfContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const perf = await perfContext.newPage();
await perf.goto(base + '/', { waitUntil: 'load' });
const perfLab = await perf.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  const scriptTransfer = resources.filter((r) => r.initiatorType === 'script').reduce((sum, r) => sum + (r.transferSize || 0), 0);
  const cssTransfer = resources.filter((r) => r.initiatorType === 'css' || (r.name || '').endsWith('.css')).reduce((sum, r) => sum + (r.transferSize || 0), 0);
  return {
    note: 'local CI lab only; not field CWV',
    domContentLoadedMs: nav?.domContentLoadedEventEnd || null,
    loadMs: nav?.loadEventEnd || null,
    scriptTransfer,
    cssTransfer,
    resourceCount: resources.length,
  };
});
await perfContext.close();

await browser.close();

const report = {
  generated_at: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS',
  route_count: routes.length,
  route_checks: results.length,
  viewports: ['1440x1000 desktop', '390x844 mobile emulation', '320x700 narrow', '834x1112 tablet'],
  physical_true_mobile: 'NOT_ESTABLISHED_BY_CI_EMULATION',
  failures,
  narrow,
  tablet,
  consultantState,
  formSuccess,
  formError,
  skip,
  skipTarget,
  reducedState,
  perfLab,
  notes,
};

await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  verdict: report.verdict,
  route_count: report.route_count,
  route_checks: report.route_checks,
  failures: failures.length,
  reducedState,
  perfLab,
  physical_true_mobile: report.physical_true_mobile,
}, null, 2));

if (failures.length) process.exitCode = 1;
