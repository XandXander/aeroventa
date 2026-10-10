import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const read = async (relative) => fs.readFile(path.join(root, relative), 'utf8');

const files = {
  layout: await read('apps/web/src/layouts/BaseLayout.astro'),
  contactForm: await read('apps/web/src/components/ContactForm.astro'),
  telemetry: await read('apps/web/src/components/Telemetry.astro'),
  premium: await read('apps/web/src/components/PremiumExperience.astro'),
  header: await read('apps/web/src/components/Header.astro'),
  footer: await read('apps/web/src/components/Footer.astro'),
  lead: await read('apps/web/src/components/LeadCTA.astro'),
  contactPage: await read('apps/web/src/components/pages/ContactPage.astro'),
  ready: await read('apps/web/src/components/pages/ProjectReadyPage.astro'),
  notReady: await read('apps/web/src/components/pages/ProjectNotReadyPage.astro'),
  home: await read('apps/web/src/pages/index.astro'),
  airflow: await read('apps/web/src/components/AirflowTracePulse.astro'),
  css: await read('apps/web/src/styles/experience.css'),
  globalCss: await read('apps/web/src/styles/global.css'),
  favicon: await read('apps/web/public/favicon.svg'),
  brandWordmark: await read('apps/web/public/brand/aeroventa-wordmark.svg'),
  brandMark: await read('apps/web/public/brand/aeroventa-mark.svg'),
};

const failures = [];
const checks = [];
const check = (condition, message) => {
  checks.push({ check: message, pass: Boolean(condition) });
  if (!condition) failures.push(message);
};

for (const [name, marker] of [
  ['Telemetry', '<Telemetry />'],
  ['PremiumExperience', '<PremiumExperience pagePath={content.path} />'],
  ['experience.css', "import experienceCssUrl from '@/styles/experience.css?url';"],
]) {
  check(files.layout.includes(marker), `BaseLayout wires ${name}`);
}

check(files.layout.includes('PUBLIC_YANDEX_WEBMASTER_VERIFICATION'), 'Yandex Webmaster verification seam exists');
check(files.layout.includes('PUBLIC_GOOGLE_SITE_VERIFICATION'), 'Google Search Console verification seam exists');

for (const name of ['name', 'contact', 'task', 'company']) {
  check(new RegExp(`name=["']${name}["']`).test(files.contactForm), `Contact form visible field exists: ${name}`);
}
for (const required of ['name', 'contact', 'task']) {
  check(new RegExp(`name=["']${required}["'][^>]*required|required[^>]*name=["']${required}["']`).test(files.contactForm), `Contact form required field: ${required}`);
}
check(!/name=["']company["'][^>]*required|required[^>]*name=["']company["']/.test(files.contactForm), 'Company remains optional');
check(/name=["']consent["'][^>]*required|required[^>]*name=["']consent["']/.test(files.contactForm), 'Contact consent is required');

for (const hidden of [
  'source_page',
  'object_service',
  'project_status',
  'case_context',
  'consultant_summary',
  'campaign_context',
  'lead_intent',
]) {
  check(new RegExp(`type=["']hidden["'][^>]*name=["']${hidden}["']|name=["']${hidden}["'][^>]*type=["']hidden["']`).test(files.contactForm), `Contact context hidden field exists: ${hidden}`);
}

const requiredEvents = [
  'consultant_open',
  'consultant_useful_answer',
  'consultant_relevant_link',
  'consultant_qualification',
  'consultant_handoff',
  'contact_form_open',
  'contact_form_submit',
  'contact_form_success',
  'contact_form_error',
  'phone_click',
  'email_click',
  'project_route',
  'case_view',
  'primary_cta',
  'lead_success',
];
for (const event of requiredEvents) {
  check(files.telemetry.includes(`'${event}'`), `Telemetry event allowlisted: ${event}`);
}

const safeKeysMatch = files.telemetry.match(/const safeKeys = new Set\(\[([\s\S]*?)\]\);/);
check(Boolean(safeKeysMatch), 'Telemetry safe payload allowlist is explicit');
if (safeKeysMatch) {
  for (const forbidden of ['name', 'contact', 'task', 'company', 'consultant_summary', 'raw_chat', 'project_file']) {
    check(!new RegExp(`['"]${forbidden}['"]`).test(safeKeysMatch[1]), `Telemetry safe payload excludes sensitive key: ${forbidden}`);
  }
}
check(files.telemetry.includes('webvisor: false'), 'Yandex Metrica Webvisor is disabled');
check(files.telemetry.includes("localStorage.setItem(consentKey, 'allow')"), 'Analytics loads behind explicit allow consent');
check(!files.telemetry.includes('contact_form_payload'), 'No raw form payload analytics event exists');

check(files.premium.includes('data-consultant-open'), 'Consultant opens only through explicit triggers');
check(files.premium.includes('data-contact-open'), 'Contact drawer opens only through explicit triggers');
check(!/setTimeout\([^)]*openDialog|DOMContentLoaded[^\n]*openDialog/i.test(files.premium), 'No automatic consultant/contact dialog open');
check(files.premium.includes("ready: {") && files.premium.includes("href: '/montazh-po-proektu/'"), 'Consultant ready-project route is deterministic');
check(files.premium.includes("not_ready: {") && files.premium.includes("href: '/obekt-bez-gotovogo-proekta/'"), 'Consultant no-project route is deterministic');
check(files.premium.includes('Не является сметой, проектом или гарантией соответствия нормам.'), 'Consultant boundary is explicit');
check(files.premium.includes('if (!endpoint)'), 'Lead form has safe no-endpoint fallback');
check(files.premium.includes('mailto:'), 'Lead fallback keeps direct human contact');

check(!files.header.includes('data-consultant-open') && files.premium.includes('data-source="persistent_launcher"'), 'Consultant entry is standalone, outside navigation');
check(!files.footer.includes('data-consultant-open') && files.footer.includes('data-contact-open'), 'Footer retains contact form without consultant menu');
check(files.lead.includes('data-contact-open'), 'Lead CTA opens modern contact form');
check(files.contactPage.includes('<ContactForm'), 'Contact page includes semantic form');
check(files.home.includes('data-consultant-open') && files.home.includes('data-contact-open'), 'Homepage close offers consultant and direct contact');
check(files.ready.includes('data-contact-open') && files.ready.includes('data-project-status="ready"'), 'Ready-project route preserves contextual contact');
check(files.notReady.includes('data-contact-open') && files.notReady.includes('data-consultant-open'), 'No-project route exposes form and consultant');

check(files.airflow.includes('airflow-header-trace__route--supply'), 'AIRFLOW TRACE supply route preserved');
check(files.airflow.includes('airflow-header-trace__route--exhaust'), 'AIRFLOW TRACE exhaust route preserved');
check(files.airflow.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'AIRFLOW TRACE reduced-motion behavior preserved');
check(files.airflow.includes('mobile-contact-dock'), 'Persistent mobile contact dock preserved');

const ownerShortlistHash = '07B137BF2405D6A863194C254EED12EFBB6557033281DE2427FF279773B3A427';
check(files.brandWordmark.includes(ownerShortlistHash), 'Owner shortlist provenance retained in AEROVENTA 01 candidate wordmark asset');
check(files.brandMark.includes(ownerShortlistHash), 'Owner shortlist provenance retained in AEROVENTA 01 candidate compact-mark asset');
check(files.favicon.includes(ownerShortlistHash), 'Owner shortlist provenance retained in AEROVENTA 01 candidate favicon asset');
check(files.brandWordmark.includes('data:image/png;base64,'), 'Candidate wordmark asset still embeds the extracted Owner reference crop');
check(files.brandMark.includes('data:image/png;base64,'), 'Candidate compact-mark asset still embeds the extracted Owner reference crop');
check(files.header.includes('/brand/aeroventa-mark.svg') && files.header.includes('brand-mark-locked') && files.header.includes('brand-wordmark-tail">EROVENTA') && files.header.includes('brand-domain">.RU'), 'Header uses locked AEROVENTA 01 A-symbol integrated into the wordmark');
check(files.footer.includes('/brand/aeroventa-mark.svg') && files.footer.includes('brand-mark-locked--footer') && files.footer.includes('brand-wordmark-tail">EROVENTA'), 'Footer uses locked AEROVENTA 01 A-symbol integrated into the wordmark');
check(!files.header.includes('/brand/aeroventa-wordmark.svg') && !files.footer.includes('/brand/aeroventa-wordmark.svg'), 'Corrupt shortlist-heading crop is not exposed as the visible wordmark');
check(files.header.includes('Обсудить задачу <span aria-hidden="true">→</span>') && files.header.includes('data-contact-open'), 'Header universal CTA links to contact');
check(files.home.includes('Получить ориентир стоимости') && files.home.includes('Есть проект — запросить смету'), 'Homepage CTA hierarchy matches canonical visual baseline');
check(files.home.includes('AEROVENTA — инженерные системы вентиляции в СПб и Ленобласти'), 'Home SEO title distinct from primary installation service title');
check(files.layout.includes('editorialOgFallback') && files.layout.includes('content.og_image || editorialOgFallback[content.path]'), 'Social sharing uses case-context media if Directus has not supplied an image');
check(!files.home.includes('<svg class="hero-engineering__overlay"') && files.home.includes('solution-mobile-legend'), 'Displaced hero arrows absent; supply/exhaust still explained');
check(files.home.includes('/evidence/hero/engineering-scene-accepted-v43.webp') && files.home.includes('Комплексный подход к вентиляции'), 'Owner-approved architectural engineering illustration preserved');
check(!files.home.includes('object-ribbon__number') && (files.home.match(/\['(?:Квартиры|Коттеджи|Рестораны|Магазины|Производства|Новостройки)/g) ?? []).length === 6, 'Object navigation has six named destinations without catalogue counters');
check(files.home.includes('owner-luxury-airflow-20261010.png') && files.home.includes("'/evidence/hero/ductwork-editorial-v43.webp'") && files.home.includes('hasOwnerHeroMedia'), 'Owner architectural HERO bound to exact asset with safe legacy fallback until binary is installed');
check(files.home.includes('Приток · воздух в помещение') && files.home.includes('Вытяжка · удаление воздуха'), 'Supply/exhaust remain independent in accepted diagram');
check(!files.home.includes('РЕАЛЬНЫЙ МОНТАЖ · 7 PARK · ПАВЛОВСК') && files.home.includes('Реальный монтаж AEROVENTA на объекте 7 PARK'), 'Rejected visual caption gone, accessible attribution preserved');
const heroFigure = files.home.match(/<figure class="hero-engineering">([\s\S]*?)<\/figure>/)?.[1] ?? '';
const caseSection = files.home.match(/<section class="case-feature"[\s\S]*?<\/section>/)?.[0] ?? '';
const caseImageCount = (caseSection.match(/<img\s/gu) ?? []).length;
check(caseImageCount === 2, '7 PARK dossier uses exactly two evidence images');
check(caseSection.includes('18.11.2020 — 10.12.2020') && caseSection.includes('7 домов') && caseSection.includes('Павловск, Санкт-Петербург'), '7 PARK dossier preserves verified fact boundary');
check(caseSection.includes('/evidence/7park/object-exterior-day.jpg') && caseSection.includes('/evidence/7park/duct-route.jpg'), '7 PARK dossier pairs object/building evidence with attributable real installation work');
check(!caseSection.includes('196') && !caseSection.includes('Вистбалт'), '7 PARK dossier does not leak disputed or unproved claims');
check(!heroFigure.includes('hero-engineering__terminal'), 'Hero has no unproven physical terminal mapping labels');
check(!/Ø\s*\d+/u.test(heroFigure), 'Hero has no unproven diameter callouts');
check(!/(диффузор|переход|врезка|отвод)/iu.test(heroFigure), 'Hero has no unproven local HVAC component callouts');
check(files.globalCss.includes('V40 — final HI-END evidence-first refinement'), 'V40 HI-END evidence-first refinement layer is present');
check(files.globalCss.includes('V41 — final bounded optical correction pass'), 'V41 bounded optical correction layer is present');
check(files.globalCss.includes('.airflow-entry-trace__steps { display:none; }'), 'Mobile AIRFLOW ENTRY labels are suppressed without removing route animation');

check(files.contactForm.includes('href="/privacy/"'), 'Consent includes privacy policy link');
check(files.contactForm.includes('name="started_at"') && files.contactForm.includes('name="website"'), 'Form bot trap and start-time fields exist');
check(files.premium.includes("result?.ok !== true") && files.premium.includes("form.dataset.submitting === 'true'"), 'Form accepts only server success and prevents duplicate submit');
check(files.globalCss.includes('.lead-honeypot') && files.globalCss.includes('overflow-wrap:anywhere'), 'Narrow mobile and bot mitigations exist');
check(files.css.includes('@media (max-width:760px)'), 'Premium experience has mobile adaptation');
check(files.css.includes('@media (prefers-reduced-motion: reduce)'), 'Premium experience respects reduced motion');
check(files.css.includes(':focus-visible'), 'Premium experience includes visible focus treatment');
check(!/exit-intent|timer-popup|auto-open|setInterval\(/i.test(files.premium + files.telemetry), 'No intrusive popup trigger pattern');

const result = {
  generated_at: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS',
  checks: checks.length,
  failures,
};

await fs.writeFile(path.join(root, 'PRODUCT_EXPERIENCE_VALIDATION.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
