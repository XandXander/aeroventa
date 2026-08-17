import fixtures from '@/data/content-fixtures.json';
import expectedRetainedPaths from '@/data/expected-retained-paths.json';
import type { ContentRecord } from './types';

const normalizePath = (path: string) => {
  if (path === '/') return '/';
  if (!path || /[?#]/.test(path) || path.includes('..')) throw new Error(`Unsafe content path: ${path}`);
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
};

const forbiddenPublishedPaths = new Set(['/404.php']);

function assertSafeHtml(html: string, itemPath: string) {
  if (!html) return;

  // Transitional migration bridge only. Structured blocks remain the target model.
  // Fail closed on executable, embedded, form, SVG/MathML and inline-style constructs.
  // This is an additional guard, not a general-purpose sanitizer.
  const forbidden = [
    /<\s*(?:script|style|iframe|object|embed|base|form|input|button|textarea|select|option|link|meta|svg|math)\b/i,
    /\son[a-z0-9_-]+\s*=/i,
    /\sstyle\s*=/i,
    /\ssrcdoc\s*=/i,
    /(?:javascript|vbscript)\s*:/i,
    /data\s*:\s*text\/html/i,
    /\s(?:href|src|xlink:href|action|formaction)\s*=\s*["']?\s*data\s*:/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(html)) throw new Error(`Unsafe legacy HTML blocked for ${itemPath}: ${pattern}`);
  }
}

function assertSafePublishedRecord(item: ContentRecord): ContentRecord {
  if (!item.path) throw new Error('Published content item has no path');
  const normalizedPath = normalizePath(item.path);
  if (forbiddenPublishedPaths.has(normalizedPath)) {
    throw new Error(`Published content conflicts with reserved migration route: ${normalizedPath}`);
  }
  if (item.status !== 'published') throw new Error(`Refusing non-published Directus item: ${normalizedPath}`);
  if (!item.owner_approved_at) throw new Error(`Refusing unapproved Directus item: ${normalizedPath}`);
  if (!item.title?.trim()) throw new Error(`Published content item has no title: ${normalizedPath}`);
  if (!item.h1?.trim()) throw new Error(`Published content item has no H1: ${normalizedPath}`);
  if (item.robots_index && !item.seo_title?.trim()) throw new Error(`Indexable content item has no SEO title: ${normalizedPath}`);

  const body = item.body_html || '';
  if (body) {
    if (item.body_html_safety_status !== 'reviewed_safe') {
      throw new Error(`Published HTML bridge content is not safety-reviewed: ${normalizedPath}`);
    }
    assertSafeHtml(body, normalizedPath);
  }

  return { ...item, path: normalizedPath };
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

async function fetchDirectusPage(base: string, offset: number): Promise<ContentRecord[]> {
  const url = new URL('/items/content', base);
  url.searchParams.set('filter[status][_eq]', 'published');
  url.searchParams.set('filter[owner_approved_at][_nnull]', 'true');
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set(
    'fields',
    [
      'path','title','h1','content_type','business_role','status',
      'robots_index','robots_follow','sitemap_include',
      'seo_title','seo_description','canonical_override',
      'og_title','og_description','schema_type','schema_json_extra',
      'excerpt','body_html','body_html_safety_status','lead_intent','owner_approved_at'
    ].join(',')
  );

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = import.meta.env.DIRECTUS_STATIC_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Directus build fetch failed: HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('Directus payload.data is not an array');
  return payload.data.map(assertSafePublishedRecord);
}

async function fetchDirectusContent(base: string): Promise<ContentRecord[]> {
  const items: ContentRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await fetchDirectusPage(base, offset);
    items.push(...page);
    if (page.length < 100) break;
    if (offset > 10000) throw new Error('Directus pagination safety limit exceeded');
  }

  if (!items.length) throw new Error('DIRECTUS_URL is configured but no approved published content was returned');
  assertCompleteRouteSet(items);
  return items;
}

export async function getAllContent(): Promise<ContentRecord[]> {
  const directusUrl = import.meta.env.DIRECTUS_URL;
  const releaseMode = import.meta.env.AEROVENTA_RELEASE_MODE;

  if (directusUrl) return fetchDirectusContent(directusUrl);

  if (releaseMode === 'production') {
    throw new Error('Production release requires DIRECTUS_URL; fixture content is forbidden');
  }

  // Local/CI implementation fixture only. All fixture records are intentionally noindex.
  return fixtures as ContentRecord[];
}

export async function getByPath(path: string): Promise<ContentRecord | undefined> {
  const normalized = normalizePath(path);
  return (await getAllContent()).find((item) => normalizePath(item.path) === normalized);
}
