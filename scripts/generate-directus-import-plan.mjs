import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routes = JSON.parse(await fs.readFile(path.join(root, 'migration/route-contract.json'), 'utf8'));
const fixtures = JSON.parse(await fs.readFile(path.join(root, 'apps/web/src/data/content-fixtures.json'), 'utf8'));

const content = fixtures.map((item) => ({
  status: 'draft',
  content_type: item.content_type,
  path: item.path,
  slug: item.path === '/' ? 'home' : item.path.replace(/^\//, '').replace(/\/$/, '').split('/').at(-1),
  title: item.title,
  h1: item.h1,
  excerpt: null,
  body_html: null,
  owner_approved_at: null,
  business_role: item.business_role,
  primary_topic: item.business_role === 'LEGACY_ACQUISITION' ? 'алмазное бурение' : 'вентиляция',
  knowledge_allowed: false,
  source_legacy_url: new URL(item.path, 'https://aeroventa.ru').toString(),
  migration_evidence: routes.find((r) => r.path === item.path) ?? null,
  seo_title: item.seo_title,
  seo_description: null,
  canonical_override: null,
  robots_index: false,
  robots_follow: true,
  sitemap_include: false,
  og_title: null,
  og_description: null,
  schema_type: item.content_type === 'service' ? 'Service' : (item.content_type === 'article' ? 'Article' : (item.content_type === 'news' ? 'NewsArticle' : 'WebPage')),
  schema_json_extra: null,
  ai_origin: false,
  fact_check_status: 'pending',
  duplicate_check_status: 'pending',
  cannibalization_check_status: 'pending',
}));

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
  generated_at: new Date().toISOString(),
  collections: {
    content,
    content_categories: categories,
    redirects,
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

await fs.writeFile(path.join(root, 'migration/directus-import-plan.json'), JSON.stringify(plan, null, 2));
console.log(`Prepared Directus draft plan: ${content.length} content rows, ${redirects.length} route rules.`);
