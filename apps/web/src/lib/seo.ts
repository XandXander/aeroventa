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

export function jsonLd(content: ContentRecord) {
  const type = schemaTypeFromContent(content);
  const reserved = new Set(['@context', '@type', 'url', 'name', 'headline']);
  const extra = Object.fromEntries(
    Object.entries(content.schema_json_extra || {}).filter(([key]) => !reserved.has(key))
  );

  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    name: content.h1,
    url: canonicalUrl(content.path, content.canonical_override),
    ...extra,
  };

  if (['Article', 'BlogPosting', 'NewsArticle'].includes(type)) base.headline = content.h1;
  if (type === 'Service') base.areaServed = SITE.serviceArea;
  return base;
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
}
