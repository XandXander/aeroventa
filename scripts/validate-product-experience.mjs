import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
  about: await read('apps/web/src/components/pages/AboutPage.astro'),
  restaurants: await read('apps/web/src/pages/obekty/restorany-i-kafe.astro'),
  services: await read('apps/web/src/components/pages/ServicesHubPage.astro'),
  airflow: await read('apps/web/src/components/AirflowTracePulse.astro'),
  css: await read('apps/web/src/styles/experience.css'),
  globalCss: await read('apps/web/src/styles/global.css'),
  favicon: await read('apps/web/public/favicon.svg'),
  brandWordmark: await read('apps/web/public/brand/aeroventa-wordmark.svg'),
  brandMark: await read('apps/web/public/brand/aeroventa-mark.svg'),
};

// Owner wording is a hard gate on publicly rendered Astro templates.
const siteSources = [
  'apps/web/src/components/pages',
  'apps/web/src/pages',
  'apps/web/src/components/PremiumExperience.astro',
];
const publicCopyViolations = [];
for (const dir of siteSources) {
  const absolute = path.join(root, dir);
  const items = (await fs.stat(absolute)).isDirectory()
    ? (await fs.readdir(absolute)).filter(n => n.endsWith('.astro')).map(n => path.join(absolute,n))
    : [absolute];
  for(const file of items) {
    const source = await fs.readFile(file,'utf8');
    if (/ограничен[а-яё]*/i.test(source)) publicCopyViolations.push(path.relative(root,file));
  }
}
const failures = [];
const checks = [];
const check = (condition, message) => {
  checks.push({ check: message, pass: Boolean(condition) });
  if (!condition) failures.push(message);
};

check(publicCopyViolations.length === 0, 'Disallowed public-facing wording removed: '+publicCopyViolations.join(', '));
for (const [name, marker] of [
  ['Telemetry', '<Telemetry />'],
  ['PremiumExperience', '<PremiumExperience pagePath={content.path} />'],
  ['experience.css', "import experienceCssUrl from '@/styles/experience.css?url';"],
]) {
  check(files.layout.includes(marker), `BaseLayout wires ${name}`);
}

check(files.header.includes('<a href="/portfolio/">Наши работы</a>'), 'Five-item desktop/mobile primary nav exposes completed work');
check(!files.header.includes('<a href="/obekty/">Объекты</a>'), 'Object-type hub no longer masks completed-work navigation');
check(files.home.indexOf('class="case-feature"') < files.home.indexOf('id="objects"') &&
      files.home.indexOf('id="objects"') < files.home.indexOf('class="home-ponsse"') &&
      files.home.indexOf('class="home-ponsse"') < files.home.indexOf('class="home-section decision-preview"'), 'Historical PONSSE block follows one real intervening section after 7 PARK');
check(files.home.includes('/evidence/karelia/ponsse-letter-20220405.png'), 'Original PONSSE 2022 letter stays intact on home');
check(files.globalCss.includes('.home-ponsse__grid') && files.globalCss.includes('grid-template-columns:minmax(0,36%)'), 'Owner-approved source scene restored beside text and PONSSE editorial styled');
check(files.contactForm.includes('compact ? 3 : 4') && files.css.includes('experience-dialog--contact'), 'Bounded contact UX with preserved lead form');
check(files.premium.includes('lastDialogTrigger') && files.premium.includes("opener.focus({ preventScroll: true })"), 'Dialog keyboard focus restored');
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
check(!files.footer.includes('data-consultant-open') && !files.footer.includes('data-contact-open') && files.footer.includes('mailto:'), 'Footer uses direct human contact without repetitive CTA or consultant menu');
check(files.lead.includes('data-contact-open'), 'Lead CTA opens modern contact form');
check(files.contactPage.includes('<ContactForm'), 'Contact page includes semantic form');
check(files.home.includes('data-consultant-open') && files.home.includes('data-contact-open'), 'Homepage close offers consultant and direct contact');
check(files.ready.includes('projectMail') && files.ready.includes('href={projectMail}') && files.header.includes('data-contact-open'), 'Ready-project route offers direct mail and header contact without repetitive CTAs');
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
check(files.home.includes('href="/contact/" data-contact-open data-source="home_primary"') && files.home.includes('href="/montazh-po-proektu/" data-contact-open data-project-status="ready"') && files.home.includes('Есть проект — запросить смету'), 'Homepage CTAs open contextual same-page contact, retain href fallback and Owner wording');
check(files.home.includes('AEROVENTA — инженерные системы вентиляции в СПб и Ленобласти'), 'Home SEO title distinct from primary installation service title');
check(files.layout.includes('retainedDescriptionFallback') && files.layout.includes('seoDescription') && files.layout.includes('content.seo_description?.trim()'), 'Five legacy SEO descriptions use safe metadata fallbacks, preserving Directus priority');
check(files.layout.includes('editorialOgFallback') && files.layout.includes('content.og_image || editorialOgFallback[content.path]'), 'Social sharing uses case-context media if Directus has not supplied an image');
check(!files.home.includes('<svg class="hero-engineering__overlay"') && files.home.includes('class="solution-mobile-pair"') && files.home.includes('class="home-shell process-strip"'), 'HERO has no invented arrows; mobile native split illustration and original stages remain present');
check(files.home.includes('/evidence/hero/engineering-scene-accepted-v43.webp') && files.home.includes('Комплексный подход к вентиляции'), 'Owner-locked original engineering illustration restored without replacing HOME HERO');
check(!files.home.includes('object-ribbon__number') && (files.home.match(/\['(?:Квартиры|Офисы|Рестораны|Магазины|Производства|Новостройки)/g) ?? []).length === 6, 'Object navigation has six named destinations without catalogue counters');
// 2026-10-13 Owner supersession: one group frame + four individually named source portraits.
// Fixture can render identity-safe text while binary uploads are pending; PUBLICATION is fail-closed.
const ownerTeamNames = ['Евгений Панов','Александр Тарасов','Денис Иванов','Александр Шаламов'];
const ownerTeamMedia = ['owner-team-group-20261015.webp','owner-evgeniy-panov-20261015.webp',
  'owner-aleksandr-tarasov-20261013.webp','owner-denis-ivanov-20261013.webp','owner-aleksandr-shalamov-20261013.webp'];
const ownerTeamSHA256 = {
  "owner-team-group-20261015.webp": "0a507849d6d8b54688779af5fab086e228272908310ff1c408b93c6afdaebb3a",
  "owner-evgeniy-panov-20261015.webp": "6227996e36b7c4b0a9cfb889f447b9dba6569a5d6a4154e628cf323aefec2f09",
  "owner-aleksandr-tarasov-20261013.webp": "9215087532eef31a03f3af4bc35ef062855ab0a22ac003b5e5bd4fdbf29e2a4a",
  "owner-denis-ivanov-20261013.webp": "c72222ae1090d94955e2d6824a125f7adffd8bfead4e6d050903c369b2e93362",
  "owner-aleksandr-shalamov-20261013.webp": "c2057be1490d987b82b237c1f728093831e8afe87b2b634da22a8257a1a0817a"
};
check(ownerTeamNames.every(name => files.about.includes(name)) &&
      ownerTeamMedia.every(name => files.about.includes('/evidence/team/' + name)) &&
      files.about.includes('hasOwnerGroup') && files.about.includes('hasAllOwnerPortraits') &&
      !files.about.includes('teamPhotos.slice(1).map') &&
      !files.about.includes('/evidence/team/img_5958.webp'),
      'New four-person identity-safe Owner mapping and group/portrait gating');
if (process.env.AEROVENTA_REQUIRE_OWNER_TEAM_MEDIA === 'true') {
  for (const name of ownerTeamMedia) {
    const pathname = path.join(root, 'apps/web/public/evidence/team', name);
    const bytes = await fs.readFile(pathname).catch(() => null);
    const actualSHA256 = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
    check(Boolean(bytes && bytes.length > 20000 && actualSHA256 === ownerTeamSHA256[name]),
      'Release requires exact Owner-provided media SHA256: ' + name);
  }
}
check(files.restaurants.includes("heroMedia={{ src:'/evidence/leont/owner-cover-v43.webp'") &&
      !files.restaurants.includes("heroMedia={{ src:'/evidence/leont/duct-installation-02.jpg'"), 'Restaurant direction uses authentic architectural context, retains montage only as case evidence');
const acceptedScene = await fs.stat(path.join(root, 'apps/web/public/evidence/hero/engineering-scene-accepted-v43.webp')).catch(() => null);
check(Boolean(acceptedScene?.isFile() && acceptedScene.size > 20000), 'Original accepted engineering-scene visual exists physically in build sources');

check(!/\/obekty\/#(?:private|commercial|warehouses|production)/.test(files.home + files.services), 'Owner: homepage/services never route categories through fragment detours');
for(const directRoute of ['/obekty/kvartiry-i-doma/','/obekty/ofisy-i-kommercheskie-pomeshcheniya/','/obekty/magaziny-i-sklady/','/obekty/proizvodstvo/']) {
  check(files.home.includes(directRoute) && files.services.includes(directRoute), 'Owner: category directly addresses destination '+directRoute);
}
check(files.home.includes('owner-luxury-airflow-20261010.png') && files.home.includes('hasOwnerHeroMedia') && files.home.includes('if (!hasOwnerHeroMedia) throw') && !files.home.includes('home-owner-editorial-1672.webp'), 'Current Owner-approved original blue-airflow HERO is fail-closed and not substituted');
check(files.airflow.includes('airflow-header-trace__route--supply') && files.airflow.includes('airflow-header-trace__route--exhaust') && !files.home.includes('solution-overlay-label'), 'Independent supply/exhaust TRACE remains; removed diagram does not assert a false connection');
check(!files.home.includes('РЕАЛЬНЫЙ МОНТАЖ · 7 PARK · ПАВЛОВСК') && files.home.includes('Реальный монтаж AEROVENTA на объекте 7 PARK'), 'Rejected visual caption gone, accessible attribution preserved');

const ownerMediaVariants = [
  'home-owner-editorial-640.webp',
  'home-owner-editorial-1100.webp',
  'home-owner-editorial-1672.webp',
  'services-owner-editorial-640.webp',
  'services-owner-editorial-1100.webp',
  'services-owner-editorial-1774.webp',
];
const mediaStats = await Promise.all(ownerMediaVariants.map(async name => {
  try { return await fs.stat(path.join(root, 'apps/web/public/evidence/hero', name)); }
  catch { return null; }
}));
check(mediaStats.every(stat => stat?.isFile() && stat.size > 20000), 'All six optimized Owner source image variants exist as nonempty files');
// 2026-10-14 Owner re-rejection supersedes the former two-photo services HERO gate.
// 2026-10-15 Owner P0: café photograph was expressly rejected as the
// services entry visual. Engineering integration illustration must be clearly
// identified as conceptual, never presented as a photographed AEROVENTA job.
check(files.services.includes('/evidence/hero/services-owner-editorial-1774.webp') &&
      !files.services.includes('<img src="/evidence/cafe/owner-cover-v43.webp"') &&
      !files.services.includes('/evidence/7park/duct-route.jpg') &&
      files.services.includes('services-hero__backdrop--single') &&
      files.services.includes('концептуальная иллюстрация'),
      'Services HERO uses one purposeful engineering illustration with truthful attribution and no rejected café photo');
for(const p of ['evidence/cafe/owner-cover-v43.webp']){
  const stat=await fs.stat(path.join(root,'apps/web/public',p)).catch(()=>null);
  check(Boolean(stat?.isFile() && stat.size>20000), 'Source-valid Services evidence asset exists: '+p);
}
check(files.home.includes('class="home-consultant-inline"') &&
      files.services.includes('class="services-consultant-inline"') &&
      files.css.includes('body:has(.home-hero--owner-airflow) .consultant-launcher') &&
      files.css.includes('body:has(.services-hero--owner-editorial) .consultant-launcher'),
      'Mobile consultant access remains reachable inline without fixed overlap on both changed heroes');

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

// Owner sports source stage: distinct editorial feature, gallery uses 4 exact
// photos, but do not label as Центр адаптивного спорта until Owner identity proof.
// ART RED TEAM 2026-10-15: verified owner P0/P1/P2 source corrections.
const caseSource = await read('apps/web/src/components/pages/EvidenceCasePage.astro');
const portfolioSource = await read('apps/web/src/components/pages/PortfolioHubPage.astro');
const servicesPage = files.services.slice(0, files.services.indexOf('<style>'));
check((servicesPage.match(/<article\b/g) || []).length === 1 &&
      (servicesPage.match(/<\/article>/g) || []).length === 1 &&
      !servicesPage.includes('hub-split') && !servicesPage.includes('hub-objects') &&
      servicesPage.trimEnd().endsWith('</article>'), 'ART-DELTA-01: one semantic services article, no abandoned sections');
check(files.about.includes('03 / Опыт на объектах') &&
      portfolioSource.includes('03 / Ваш объект') &&
      !caseSource.includes('<span>01 / Задача</span>'), 'ART-DELTA-02: consistent section counting');
check(caseSource.includes('case-gallery__archive-note') &&
      !caseSource.includes('<figcaption>{caption}</figcaption>\n              </figure>\\n            ))}'), 'ART-DELTA-03: no repetitive archive thumbnail captions');
check(caseSource.includes("'/blog/detail/kafe-rimskogo-korsakova-3/': {gallery:") &&
      !caseSource.includes("'/blog/detail/kafe-na-rimskogo-korsakova/':"), 'ART-DELTA-04: cafe documentary key correct');
check(portfolioSource.includes("kind:'Сервисно-образовательный центр'") &&
      !portfolioSource.includes("kind:'География'"), 'ART-DELTA-05: kind means object type');
check(files.layout.includes("'/services/': '/evidence/hero/services-owner-editorial-1774.webp'") &&
      files.layout.includes('rejectedServicesImage'), 'ART-DELTA-06: approved services social preview and rejected-cover protection');


check(portfolioSource.includes('class="portfolio-sport"') &&
      portfolioSource.includes('04 / Ваш объект') &&
      ['cover','02','03','04'].every(name=>portfolioSource.includes('/evidence/owner-portfolio/sport-komendantskiy/'+name+'.webp')) &&
      !portfolioSource.includes('<h2 id="portfolio-sport-title">Центр адаптивного спорта</h2>'),
      'Sport: independent, photo-backed feature; unverified exact identity not asserted');
for(const name of ['cover','02','03','04']){
  const img=await fs.stat(path.join(root,'apps/web/public/evidence/owner-portfolio/sport-komendantskiy',name+'.webp')).catch(()=>null);
  check(Boolean(img?.isFile()&&img.size>15000), 'Sports object selected provenance media exists: '+name);
}
const ownerPhotoManifest=JSON.parse(await read('migration/owner-portfolio-source-manifest-2026-10-15.json'));
check(ownerPhotoManifest.length===25 &&
  ownerPhotoManifest.filter(x=>x.status==='OWNER_PHOTO_ARCHIVE_SCOPE_FACTS_UNVERIFIED').length===21,
  'Owner photo provenance: 21 for seven object archives and four distinct sports candidates');
check(portfolioSource.includes('newOwnerCases.map') && portfolioSource.includes('portfolio-archive-viewer'),
  'Seven archive source cards plus five legacy portfolio cards with same-page accessible galleries');
check(files.globalCss.includes('.portfolio-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))'),
  'Portfolio uses 4/3/2 editorial grid');
const result = {
  generated_at: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS',
  checks: checks.length,
  failures,
};

await fs.writeFile(path.join(root, 'PRODUCT_EXPERIENCE_VALIDATION.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
