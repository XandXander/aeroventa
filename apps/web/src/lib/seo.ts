import { SITE } from './site';
import type { ContentRecord } from './types';

export function canonicalUrl(path: string, override?: string | null): string {
  if (!override) return new URL(path, SITE.origin).toString();
  const url = new URL(override, SITE.origin);
  if (url.origin !== SITE.origin) throw new Error(`External canonical is not allowed: ${override}`);
  return url.toString();
}

export function robotsValue(content: ContentRecord): string {
  const index = Boolean(content.robots_index && content.status === 'published' && content.owner_approved_at);
  const follow = content.robots_follow !== false;
  return `${index ? 'index' : 'noindex'},${follow ? 'follow' : 'nofollow'}`;
}

const schemaTypeFromContent = (content: ContentRecord) => {
  const requested = content.schema_type;
  const allowed = new Set(['WebPage', 'Article', 'BlogPosting', 'NewsArticle', 'Service', 'AboutPage', 'ContactPage', 'FAQPage']);
  if (requested && allowed.has(requested)) return requested;
  if (content.content_type === 'article') return 'Article';
  if (content.content_type === 'news') return 'NewsArticle';
  if (content.content_type === 'service') return 'Service';
  return 'WebPage';
};

const breadcrumbParent = (path: string) => {
  if (path.startsWith('/blog/detail/')) return { name: 'Блог', path: '/blog/' };
  if (path.startsWith('/blog/') && path !== '/blog/') return { name: 'Блог', path: '/blog/' };
  if (path.startsWith('/news/') && path !== '/news/') return { name: 'Новости', path: '/news/' };
  return null;
};

export function jsonLd(content: ContentRecord) {
  const type = schemaTypeFromContent(content);
  const reserved = new Set(['@context', '@type', 'url', 'name', 'headline']);
  const extra = Object.fromEntries(
    Object.entries(content.schema_json_extra || {}).filter(([key]) => !reserved.has(key))
  );

  const page: Record<string, unknown> = {
    '@type': type,
    '@id': `${canonicalUrl(content.path, content.canonical_override)}#page`,
    name: content.h1,
    url: canonicalUrl(content.path, content.canonical_override),
    ...extra,
  };

  if (['Article', 'BlogPosting', 'NewsArticle'].includes(type)) {
    page.headline = content.h1;
    if (content.published_at) page.datePublished = content.published_at;
    if (content.updated_at_public) page.dateModified = content.updated_at_public;
  }
  if (type === 'Service') page.areaServed = SITE.serviceArea;

  const items: Record<string, unknown>[] = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE.origin },
  ];
  const parent = breadcrumbParent(content.path);
  if (parent) items.push({ '@type': 'ListItem', position: 2, name: parent.name, item: canonicalUrl(parent.path) });
  if (content.path !== '/') items.push({ '@type': 'ListItem', position: items.length + 1, name: content.h1, item: canonicalUrl(content.path, content.canonical_override) });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      page,
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl(content.path, content.canonical_override)}#breadcrumbs`,
        itemListElement: items,
      },
    ],
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
}
