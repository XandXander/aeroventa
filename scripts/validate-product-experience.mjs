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
  favicon: await read('apps/web/public/favicon.svg'),
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

check(files.header.includes('data-consultant-open'), 'Header has consultant entry point');
check(files.footer.includes('data-consultant-open') && files.footer.includes('data-contact-open'), 'Footer has consultant and form entry points');
check(files.lead.includes('data-contact-open'), 'Lead CTA opens modern contact form');
check(files.contactPage.includes('<ContactForm'), 'Contact page includes semantic form');
check(files.home.includes('data-consultant-open') && files.home.includes('data-contact-open'), 'Homepage close offers consultant and direct contact');
check(files.ready.includes('data-contact-open') && files.ready.includes('data-project-status="ready"'), 'Ready-project route preserves contextual contact');
check(files.notReady.includes('data-contact-open') && files.notReady.includes('data-consultant-open'), 'No-project route exposes form and consultant');

check(files.airflow.includes('airflow-header-trace__route--supply'), 'AIRFLOW TRACE supply route preserved');
check(files.airflow.includes('airflow-header-trace__route--exhaust'), 'AIRFLOW TRACE exhaust route preserved');
check(files.airflow.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'AIRFLOW TRACE reduced-motion behavior preserved');
check(files.airflow.includes('mobile-contact-dock'), 'Persistent mobile contact dock preserved');

check(files.favicon.includes('#ff4d00') && files.favicon.includes('#081728'), 'Route-cut favicon keeps orange/navy identity');
check(!/fan|blade|propeller/i.test(files.favicon), 'Favicon has no literal fan/blade identity');
check(files.header.includes('brand-mark__supply') && files.header.includes('brand-mark__return'), 'Header route-cut mark preserved');
check(files.footer.includes('brand-mark__supply') && files.footer.includes('brand-mark__return'), 'Footer route-cut mark preserved');

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
