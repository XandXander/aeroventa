import fixtures from '@/data/content-fixtures.json';
import expectedRetainedPaths from '@/data/expected-retained-paths.json';
import coreContentV7 from '@/data/core-content-v7.json';
import type { ContentRecord } from './types';
import { normalizeCmsBlocks } from './cms-blocks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const normalizePath = (path: string) => {
  if (path === '/') return '/';
  if (!path || /[?#]/.test(path) || path.includes('..')) throw new Error(`Unsafe content path: ${path}`);
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
};

const forbiddenPublishedPaths = new Set(['/404.php']);
const allowedReleaseModes = new Set(['fixture', 'preview', 'review', 'production', 'incremental']);

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

  return {
    ...item, path: normalizedPath,
    cms_blocks: normalizeCmsBlocks(item.body_blocks, normalizedPath, true),
  };
}

function assertSafePreviewRecord(item: ContentRecord): ContentRecord {
  if (!item.path) throw new Error('Preview content item has no path');
  const normalizedPath = normalizePath(item.path);
  if (forbiddenPublishedPaths.has(normalizedPath)) {
    throw new Error(`Preview content conflicts with reserved migration route: ${normalizedPath}`);
  }
  if (item.status !== 'draft') throw new Error(`Preview accepts draft content only: ${normalizedPath}`);
  if (item.owner_approved_at !== null) throw new Error(`Preview draft unexpectedly has owner approval: ${normalizedPath}`);
  if (item.robots_index !== false) throw new Error(`Preview draft is indexable in Directus: ${normalizedPath}`);
  if (item.sitemap_include !== false) throw new Error(`Preview draft is included in sitemap: ${normalizedPath}`);
  if (item.knowledge_allowed !== false) throw new Error(`Preview draft is enabled for AI knowledge: ${normalizedPath}`);
  if (item.ai_origin !== false) throw new Error(`Preview draft unexpectedly claims AI origin: ${normalizedPath}`);
  if (!item.title?.trim()) throw new Error(`Preview content item has no title: ${normalizedPath}`);
  if (!item.h1?.trim()) throw new Error(`Preview content item has no H1: ${normalizedPath}`);

  const body = item.body_html || '';
  if (body) {
    if (!['pending_review', 'reviewed_safe'].includes(String(item.body_html_safety_status))) {
      throw new Error(`Preview HTML bridge has invalid safety status: ${normalizedPath}`);
    }
    assertSafeHtml(body, normalizedPath);
  }

  return {
    ...item,
    path: normalizedPath,
    cms_blocks: normalizeCmsBlocks(item.body_blocks, normalizedPath, false),
    robots_index: false,
    sitemap_include: false,
    owner_approved_at: null,
  };
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

function assertExactPreviewRouteSet(items: ContentRecord[]) {
  const normalized = items.map((item) => normalizePath(item.path));
  const actual = new Set(normalized);
  const expected = new Set((expectedRetainedPaths as string[]).map(normalizePath));

  if (actual.size !== normalized.length) throw new Error('Directus preview contains duplicate canonical paths');

  const missing = [...expected].filter((path) => !actual.has(path));
  const unexpected = [...actual].filter((path) => !expected.has(path));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Directus preview route-set drift: missing=${missing.join(', ') || 'none'}; unexpected=${unexpected.join(', ') || 'none'}`,
    );
  }
}

type DirectusMode = 'preview' | 'review' | 'production' | 'incremental';

const directusFields = [
  'id','path','slug','title','h1','content_type','business_role','status',
  'robots_index','robots_follow','sitemap_include','knowledge_allowed','ai_origin',
  'seo_title','seo_description','canonical_override',
  'og_title','og_description','og_image','schema_type','schema_json_extra',
  'published_at','updated_at_public',
  'excerpt','body_html','body_html_safety_status','hero_file','lead_intent','owner_approved_at',
  'body_blocks.sort','body_blocks.block_id.id','body_blocks.block_id.block_type',
  'body_blocks.block_id.data','body_blocks.block_id.fact_checked'
].join(',');

// Only the exact media captured and SHA-locked for this GitHub review may
// become public image paths. Never render authenticated Directus URLs live.
function mediaRegistry(): Record<string, {path: string}> {
  if (!['incremental','review'].includes(String(import.meta.env.AEROVENTA_RELEASE_MODE || ''))) return {};
  const file = resolve('release_out/approved-astro/media-registry.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  if (registry.format !== 'AEROVENTA_CMS_MEDIA_REGISTRY_V1' ||
      registry.source_sha !== process.env.GITHUB_SHA) {
    throw new Error('CMS media registry not bound to this immutable source');
  }
  return registry.files as Record<string,{path:string}>;
}
function hydrateReleaseMedia(item: ContentRecord): ContentRecord {
  const registry = mediaRegistry();
  const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const imageKeys = new Set(['image','file','cover','photo','hero_file','og_image','thumbnail']);
  const value = (source: unknown, key = '', depth = 0): unknown => {
    if(depth > 12)throw new Error('CMS image graph too deep');
    if(typeof source==='string' && imageKeys.has(key) && idPattern.test(source)) {
      const found=registry[source.toLowerCase()];
      if(!found)throw new Error('CMS image not staged for '+item.path);
      return found.path;
    }
    if(Array.isArray(source))return source.map(v=>value(v,key,depth+1));
    if(source && typeof source==='object')return Object.fromEntries(
      Object.entries(source).map(([k,v])=>[k,value(v,k,depth+1)]));
    return source;
  };
  return value(item) as ContentRecord;
}

async function fetchDirectusPage(base: string, offset: number, mode: DirectusMode): Promise<ContentRecord[]> {
  const url = new URL('/items/content', base);
  if (mode === 'production' || mode === 'incremental') {
    url.searchParams.set('filter[status][_eq]', 'published');
    url.searchParams.set('filter[owner_approved_at][_nnull]', 'true');
  } else {
    url.searchParams.set('filter[status][_eq]', 'draft');
    url.searchParams.set('filter[owner_approved_at][_null]', 'true');
  }
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('fields', directusFields);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = import.meta.env.DIRECTUS_STATIC_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Directus ${mode} build fetch failed: HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('Directus payload.data is not an array');
  return payload.data.map((item: ContentRecord) => {
    const hydrated = ['incremental','review'].includes(mode) ? hydrateReleaseMedia(item) : item;
    return mode !== 'preview' ? assertSafePublishedRecord(hydrated) : assertSafePreviewRecord(hydrated);
  });
}

async function fetchDirectusContent(base: string, mode: DirectusMode): Promise<ContentRecord[]> {
  const items: ContentRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await fetchDirectusPage(base, offset, mode);
    items.push(...page);
    if (page.length < 100) break;
    if (offset > 10000) throw new Error('Directus pagination safety limit exceeded');
  }

  if (!items.length) throw new Error(`DIRECTUS_URL is configured but no ${mode} content was returned`);
  if (mode === 'production') assertCompleteRouteSet(items);
  else if (mode === 'preview') assertExactPreviewRouteSet(items);
  // Incremental releases intentionally do NOT require all 29 legacy records to
  // be owner-approved. Only the explicit release selection may be emitted.
  return items;
}

function getFixtureContent(): ContentRecord[] {
  const overrides = coreContentV7 as Record<string, Partial<ContentRecord>>;
  const fixturePaths = new Set((fixtures as ContentRecord[]).map((item) => normalizePath(item.path)));

  for (const [path, override] of Object.entries(overrides)) {
    const normalizedPath = normalizePath(path);
    if (!fixturePaths.has(normalizedPath)) throw new Error(`V7 fixture override points to unknown retained route: ${normalizedPath}`);
    if (override.body_html) assertSafeHtml(override.body_html, normalizedPath);
  }

  return (fixtures as ContentRecord[]).map((item) => {
    const override = overrides[normalizePath(item.path)] ?? {};
    return {
      ...item,
      ...override,
      // V7 is review/fixture content only. These safety gates cannot be relaxed by an override.
      path: normalizePath(item.path),
      status: 'fixture_stub',
      robots_index: false,
      owner_approved_at: null,
      body_html_safety_status: 'fixture',
    };
  });
}

export async function getAllContent(): Promise<ContentRecord[]> {
  const directusUrl = import.meta.env.DIRECTUS_URL;
  const releaseMode: string = String(import.meta.env.AEROVENTA_RELEASE_MODE || 'fixture');

  if (!allowedReleaseModes.has(releaseMode)) {
    throw new Error(`Unsupported AEROVENTA_RELEASE_MODE: ${releaseMode}`);
  }

  if (releaseMode === 'preview') {
    if (!directusUrl) throw new Error('Directus draft preview requires DIRECTUS_URL');
    if (!import.meta.env.DIRECTUS_STATIC_TOKEN) {
      throw new Error('Directus draft preview requires a dedicated read-only DIRECTUS_STATIC_TOKEN');
    }
    return fetchDirectusContent(directusUrl, 'preview');
  }

  if (releaseMode === 'review') {
    if (!directusUrl || !import.meta.env.DIRECTUS_STATIC_TOKEN) {
      throw new Error('Exact draft visual review requires authenticated read-only Directus');
    }
    const selectedPaths = String(import.meta.env.AEROVENTA_INCREMENTAL_PATHS || '')
      .split(',').map(p=>p.trim()).filter(Boolean);
    if (selectedPaths.length<1 || selectedPaths.length>15 ||
        new Set(selectedPaths).size!==selectedPaths.length ||
        selectedPaths.some(p=>p!==normalizePath(p))) {
      throw new Error('Visual review must select 1-15 exact normalized draft routes');
    }
    const selected = new Set(selectedPaths);
    const drafts = await fetchDirectusContent(directusUrl, 'review');
    const byPath = new Map(drafts.map(x=>[x.path,x]));
    if (selectedPaths.some(p=>!byPath.has(p))) throw new Error('Selected draft is unavailable');
    const existing = getFixtureContent();
    const known = new Set(existing.map(x=>x.path));
    const composed = existing.map(row=>selected.has(row.path)?{...row,...byPath.get(row.path)!}:row);
    for(const p of selectedPaths) {
      if(known.has(p))continue;
      if(!/^\/blog\/detail\/[a-z0-9-]+\/$/.test(p))throw new Error('New visual review route not allowed');
      composed.push(byPath.get(p)!);
    }
    return composed;
  }

  if (releaseMode === 'incremental') {
    if (!directusUrl || !import.meta.env.DIRECTUS_STATIC_TOKEN) {
      throw new Error('Incremental production requires authenticated read-only Directus');
    }
    const exactPathsRaw = String(import.meta.env.AEROVENTA_INCREMENTAL_PATHS || '');
    const selectedPaths = exactPathsRaw.split(',').map((p) => p.trim()).filter(Boolean);
    if (!selectedPaths.length || selectedPaths.length > 15 || selectedPaths.some((p) => p !== normalizePath(p))) {
      throw new Error('Incremental build requires 1-15 explicit, normalized paths');
    }
    const selected = new Set(selectedPaths);
    if (selected.size !== selectedPaths.length) throw new Error('Duplicate incremental paths');
    const approved = await fetchDirectusContent(directusUrl, 'incremental');
    const approvedByPath = new Map(approved.map((item) => [item.path, item]));
    if (selectedPaths.some((p) => !approvedByPath.has(p))) {
      throw new Error('Selected path is not published + owner approved in Directus');
    }
    const base = getFixtureContent();
    const knownPaths = new Set(base.map((item) => normalizePath(item.path)));
    const released = base.map((item) => {
      const change = approvedByPath.get(normalizePath(item.path));
      return change && selected.has(normalizePath(item.path)) ? {...item, ...change} : item;
    });
    for (const path of selectedPaths) {
      if (knownPaths.has(path)) continue;
      // New content is only allowed under the established article path family.
      // Existing static Astro routes cannot be shadowed through CMS input.
      if (!new RegExp('^/blog/detail/[a-z0-9-]+/$').test(path)) {
        throw new Error('A new CMS route must be a /blog/detail/<slug>/ article');
      }
      const record = approvedByPath.get(path)!;
      if (record.content_type !== 'article' && record.content_type !== 'news') {
        throw new Error('New route must use ArticlePage renderer');
      }
      released.push(record);
    }
    return released;
  }

  if (releaseMode === 'production') {
    if (!directusUrl) throw new Error('Production release requires DIRECTUS_URL; fixture content is forbidden');
    return fetchDirectusContent(directusUrl, 'production');
  }

  if (directusUrl) {
    throw new Error('DIRECTUS_URL is set in fixture mode; choose AEROVENTA_RELEASE_MODE=preview or production explicitly');
  }

  return getFixtureContent();
}

export async function getByPath(path: string): Promise<ContentRecord | undefined> {
  const normalized = normalizePath(path);
  return (await getAllContent()).find((item) => normalizePath(item.path) === normalized);
}
