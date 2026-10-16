import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const routeContractPath = path.join(root, 'migration/route-contract.json');
const fixturesPath = path.join(root, 'apps/web/src/data/content-fixtures.json');
const priorityDraftsPath = path.join(root, 'migration/priority-content-drafts.json');
const coreContentV7Path = path.join(root, 'apps/web/src/data/core-content-v7.json');
const outPath = path.join(root, 'migration/directus-import-plan.json');

const [routeBytes, fixtureBytes, priorityBytes, coreV7Bytes] = await Promise.all([
  fs.readFile(routeContractPath),
  fs.readFile(fixturesPath),
  fs.readFile(priorityDraftsPath),
  fs.readFile(coreContentV7Path),
]);

const routes = JSON.parse(routeBytes.toString('utf8'));
const fixtures = JSON.parse(fixtureBytes.toString('utf8'));
const priorityDrafts = JSON.parse(priorityBytes.toString('utf8'));
const coreContentV7 = JSON.parse(coreV7Bytes.toString('utf8'));

const sourceFingerprint = crypto
  .createHash('sha256')
  .update(routeBytes)
  .update(fixtureBytes)
  .update(priorityBytes)
  .update(coreV7Bytes)
  .digest('hex');

const coreOverridePaths = new Set(Object.keys(coreContentV7));
const fixturePaths = new Set(fixtures.map((item) => item.path));
for (const overridePath of coreOverridePaths) {
  if (!fixturePaths.has(overridePath)) {
    throw new Error(`core-content-v7 override has no retained fixture route: ${overridePath}`);
  }
}

const content = fixtures.map((item) => {
  const draft = priorityDrafts[item.path] ?? null;
  const coreOverride = coreContentV7[item.path] ?? null;
  const bodyHtml = coreOverride?.body_html ?? draft?.body_html ?? null;

  return {
    status: 'draft',
    content_type: item.content_type,
    path: item.path,
    slug: item.path === '/' ? 'home' : item.path.replace(/^\//, '').replace(/\/$/, '').split('/').at(-1),
    title: coreOverride?.title ?? draft?.title ?? item.title,
    h1: coreOverride?.h1 ?? draft?.h1 ?? item.h1,
    excerpt: coreOverride?.excerpt ?? draft?.excerpt ?? null,
    body_html: bodyHtml,
    body_html_safety_status: bodyHtml ? 'pending_review' : 'not_applicable',
    owner_approved_at: null,
    business_role: item.business_role,
    primary_topic:
      (coreOverride?.lead_intent ?? item.lead_intent) === 'DRILLING_PARTNER'
        ? 'алмазное бурение'
        : (item.business_role.includes('VENTILATION') ||
            item.business_role === 'PRIMARY_COMMERCIAL' ||
            item.business_role === 'PRIMARY_BRAND_HOME'
          ? 'вентиляция'
          : null),
    knowledge_allowed: false,
    lead_intent: coreOverride?.lead_intent ?? item.lead_intent ?? null,
    source_legacy_url: new URL(item.path, 'https://aeroventa.ru').toString(),
    migration_evidence: {
      route: routes.find((r) => r.path === item.path) ?? null,
      draft_basis: draft?.source_basis ?? null,
      verification_status: draft?.verification ?? 'PENDING_SOURCE_MIGRATION',
      core_content_v7_override: Boolean(coreOverride),
    },
    seo_title: coreOverride?.seo_title ?? draft?.seo_title ?? item.seo_title,
    seo_description: coreOverride?.seo_description ?? draft?.seo_description ?? null,
    canonical_override: null,
    robots_index: false,
    robots_follow: true,
    sitemap_include: false,
    og_title: null,
    og_description: null,
    schema_type:
      item.content_type === 'service'
        ? 'Service'
        : item.content_type === 'article'
          ? 'Article'
          : item.content_type === 'news'
            ? 'NewsArticle'
            : 'WebPage',
    schema_json_extra: null,
    ai_origin: false,
    fact_check_status: 'pending',
    duplicate_check_status: 'pending',
    cannibalization_check_status: 'pending',
  };
});

const redirects = routes
  .filter((r) => [301, 410].includes(Number(r.http_outcome)))
  .map((r) => ({
    source_path: r.path,
    target_path: Number(r.http_outcome) === 301 ? r.target : null,
    status_code: Number(r.http_outcome),
    reason: r.content_requirement || r.strategic_role || r.source_class,
    source_evidence: {
      yandex_indexed: r.yandex_indexed,
      yandex_impressions_6m: r.yandex_impressions_6m,
      gsc_impressions_16m: r.gsc_impressions_16m,
      current_backlinks: r.current_backlinks,
    },
    active: true,
    validated_at: null,
  }));

const categories = [
  ['/blog/', 'Блог', 'content_hub'],
  ['/blog/istorii-proektov/', 'Истории проектов', 'project_hub'],
  ['/blog/obzory-i-intervyu/', 'Обзоры и интервью', 'legacy_hub'],
  ['/blog/poleznye-stati/', 'Полезные статьи', 'article_hub'],
  ['/news/', 'Новости', 'news_hub'],
  ['/news/korporativnaya-zhizn/', 'Корпоративная жизнь', 'news_category'],
  ['/news/istoriya-kompanii/', 'История компании', 'news_category'],
  ['/news/znachimye-sobytiya/', 'Значимые события', 'news_category'],
].map(([categoryPath, name, category_type]) => ({
  status: 'draft',
  name,
  slug: categoryPath.replace(/^\//, '').replace(/\/$/, '').split('/').at(-1),
  path: categoryPath,
  category_type,
  description: null,
  robots_index: false,
}));

const plan = {
  format: 'aeroventa-directus-import-plan-v1',
  safety: 'DRAFT_ONLY_NO_PUBLISH',
  generated_at: null,
  source_fingerprint_sha256: sourceFingerprint,
  collections: {
    content,
    content_categories: categories,
    redirects,
    project_details: [
      {
        path_ref: '/blog/detail/kak-my-sdali-7-domov/',
        object_type: 'жилой квартал',
        location: 'Павловск, Ленинградская область',
        client_display_name: null,
        scope: 'Монтаж приточно-вытяжной вентиляции',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: '7 домов',
        duration: '18.11.2020–10.12.2020',
        completion_date: '2020-12-10',
        commercial_visibility: 'public_historical_case',
      },
      {
        path_ref: '/blog/detail/restoran-v-zhk-leontevskiy-mys/',
        object_type: 'ресторан',
        location: 'ЖК «Леонтьевский Мыс», Ждановская ул., 45, Санкт-Петербург',
        client_display_name: null,
        scope: 'Монтаж приточно-вытяжной вентиляции и вентиляционного оборудования',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: null,
        duration: '2 недели по legacy-источнику',
        completion_date: null,
        commercial_visibility: 'public_historical_case',
      },
      {
        path_ref: '/blog/detail/ntff-polisan/',
        object_type: 'фармацевтическое предприятие',
        location: 'ул. Салова, 72, Санкт-Петербург',
        client_display_name: 'НТФФ «Полисан»',
        scope: 'Монтаж приточно-вытяжной вентиляции и оборудования',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: null,
        duration: 'июнь 2017 – июнь 2018',
        completion_date: null,
        commercial_visibility: 'public_historical_case',
      },
      {
        path_ref: '/blog/detail/kvartira-na-zhukova/',
        object_type: 'квартира',
        location: 'Маршала Жукова, Санкт-Петербург',
        client_display_name: null,
        scope: 'Монтаж приточно-вытяжной вентиляции',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: 'около 100 погонных метров с оборудованием по legacy-источнику',
        duration: '5 дней по legacy-источнику',
        completion_date: null,
        commercial_visibility: 'public_historical_case',
      },
      {
        path_ref: '/blog/detail/montazh-ventilyatsii-v-karelii/',
        object_type: 'сервисно-образовательный центр',
        location: 'Питкяранта, Республика Карелия',
        client_display_name: 'PONSSE',
        scope: 'Монтаж приточно-вытяжной вентиляции и оборудования',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: null,
        duration: '2 недели по legacy-источнику',
        completion_date: null,
        commercial_visibility: 'public_historical_case',
      },
      {
        path_ref: '/blog/detail/kafe-rimskogo-korsakova-3/',
        object_type: 'кафе',
        location: 'проспект Римского-Корсакова, 3, Санкт-Петербург',
        client_display_name: null,
        scope: 'Монтаж приточно-вытяжной вентиляции и вентиляционного оборудования',
        systems: ['приточно-вытяжная вентиляция'],
        work_volume: '200 м² по legacy-источнику',
        duration: '5 дней по legacy-источнику',
        completion_date: null,
        commercial_visibility: 'public_historical_case',
      },
    ],
    service_details: [
      {
        path_ref: '/montazh-ventiliacii/',
        service_family: 'монтаж вентиляции',
        service_area: 'Санкт-Петербург и Ленинградская область',
        direct_execution: true,
        fulfillment_model: 'mixed',
        pricing_visibility: 'owner_controlled',
      },
      {
        path_ref: '/almaznoe-burenie/',
        service_family: 'алмазное бурение',
        service_area: 'Санкт-Петербург и Ленинградская область',
        direct_execution: false,
        fulfillment_model: 'partner',
        pricing_visibility: 'do_not_reuse_stale_legacy_price_claims',
      },
    ],
    site_settings: {
      company_display_name: 'AEROVENTA',
      primary_business: 'Монтаж вентиляции',
      phone: '+7 922 640 99 22',
      email: 'aeroventaspb@yandex.ru',
      service_region: 'Санкт-Петербург и Ленинградская область',
      ai_consultant_enabled: false,
      emergency_disable_ai: true,
    },
  },
};

await fs.writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(
  `Prepared deterministic Directus draft plan: ${content.length} content rows, ${redirects.length} route rules, source ${sourceFingerprint}.`,
);
