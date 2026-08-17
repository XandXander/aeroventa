import fixtures from '@/data/content-fixtures.json';
import expectedRetainedPaths from '@/data/expected-retained-paths.json';
import type { ContentRecord } from './types';

const normalizePath = (path: string) => {
  if (path === '/') return '/';
  if (!path || /[?#]/.test(path) || path.includes('..')) throw new Error(`Unsafe content path: ${path}`);
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
};

function assertSafeHtml(html: string, itemPath: string) {
  // Migration bridge only. Structured blocks remain the target model.
  // Fail closed on executable/embed constructs instead of trying to sanitize them silently.
  const forbidden = [
    /<\s*script\b/i,
    /<\s*(?:iframe|object|embed|base)\b/i,
    /\son[a-z0-9_-]+\s*=/i,
    /(?:javascript|vbscript)\s*:/i,
    /data\s*:\s*text\/html/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(html || '')) throw new Error(`Unsafe legacy HTML blocked for ${itemPath}: ${pattern}`);
  }
}

function assertSafePublishedRecord(item: ContentRecord): ContentRecord {
  if (!item.path) throw new Error('Published content item has no path');
  if (item.status !== 'published') throw new Error(`Refusing non-published Directus item: ${item.path}`);
  if (!item.owner_approved_at) throw new Error(`Refusing unapproved Directus item: ${item.path}`);
  if (!item.title?.trim()) throw new Error(`Published content item has no title: ${item.path}`);
  if (!item.h1?.trim()) throw new Error(`Published content item has no H1: ${item.path}`);
  if (item.robots_index && !item.seo_title?.trim()) throw new Error(`Indexable content item has no SEO title: ${item.path}`);
  assertSafeHtml(item.body_html || '', item.path);
  return { ...item, path: normalizePath(item.path) };
}

function assertCompleteRouteSet(items: ContentRecord[]) {
  const normalized = items.map((item) => normalizePath(item.path));
  const published = new Set(normalized);
  if (published.size !== normalized.length) throw new Error('Directus production build contains duplicate canonical paths');
  const missing = (expectedRetainedPaths as string[]).filter((path) => !published.has(normalizePath(path)));
  if (missing.length) {
    throw new Error(`Directus production build is missing ${missing.length} retained routes: ${missing.join(', ')}`);
  }
}

async function fetchDirectusContent(base: string): Promise<ContentRecord[]> {
  const url = new URL('/items/content', base);
  url.searchParams.set('filter[status][_eq]', 'published');
  url.searchParams.set('filter[owner_approved_at][_nnull]', 'true');
  url.searchParams.set('limit', '-1');
  url.searchParams.set(
    'fields',
    'path,title,h1,content_type,business_role,status,robots_index,robots_follow,sitemap_include,seo_title,seo_description,canonical_override,og_title,og_description,schema_type,schema_json_extra,excerpt,body_html,owner_approved_at'
  );

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = import.meta.env.DIRECTUS_STATIC_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Directus build fetch failed: HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('Directus payload.data is not an array');
  const items = payload.data.map(assertSafePublishedRecord);
  if (!items.length) throw new Error('DIRECTUS_URL is configured but no approved published content was returned');
  assertCompleteRouteSet(items);
  return items;
}

export async function getAllContent(): Promise<ContentRecord[]> {
  const directusUrl = import.meta.env.DIRECTUS_URL;
  if (directusUrl) return fetchDirectusContent(directusUrl);

  // Local implementation fixture only. All fixture records are intentionally noindex.
  return fixtures as ContentRecord[];
}

export async function getByPath(path: string): Promise<ContentRecord | undefined> {
  const normalized = normalizePath(path);
  return (await getAllContent()).find((item) => normalizePath(item.path) === normalized);
}
