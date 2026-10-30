/**
 * Shared AEROVENTA structured editor contract. The existing Directus
 * collections (content_blocks + content_block_map) remain the ONLY block model.
 * No arbitrary HTML, remote image URLs or executable markup in block data.
 * Source-approved existing Astro templates remain unchanged without blocks.
 */
import type { CmsBlock, ContentBlockMap } from './types';

const supported = new Set(['text', 'cards', 'gallery', 'cta']);
const safePath = (value: unknown, image = false): value is string => {
  if (typeof value !== 'string' || value.length > 320 || !value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || value.includes('..') || /[?#<>"'\s]/.test(value)) return false;
  if (image) return /^\/(?:evidence|brand|upload|cms-media)\/[a-zA-Z0-9/_-]+\.(?:webp|avif|png|jpe?g)$/i.test(value);
  return /^\/(?:[a-zA-Z0-9_./-]+)?$/.test(value);
};
const safeText = (value: unknown, max = 3000): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001F]/.test(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function checkData(type: string, data: Record<string, unknown>, path: string): void {
  if (type === 'text') {
    if (!safeText(data.heading, 240) || !safeText(data.text, 8000)) throw new Error('Invalid text block at ' + path);
    return;
  }
  if (type === 'cta') {
    if (!safeText(data.label, 160) || !safePath(data.href) ||
        (data.heading !== undefined && !safeText(data.heading, 240))) throw new Error('Invalid CTA at ' + path);
    return;
  }
  if (type === 'cards' || type === 'gallery') {
    const items = data.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error('Invalid items at ' + path);
    if (data.heading !== undefined && !safeText(data.heading, 240)) throw new Error('Invalid section heading at ' + path);
    for (const item of items) {
      const x = record(item);
      if (!safeText(x.title, 240) || !safePath(x.image, true) ||
          (x.alt !== undefined && !safeText(x.alt, 350))) throw new Error('Invalid card/gallery image at ' + path);
      if (type === 'cards' && (!safePath(x.href) || (x.text !== undefined && !safeText(x.text, 1000)))) {
        throw new Error('Invalid linked card at ' + path);
      }
    }
  }
}
export function normalizeCmsBlocks(maps: ContentBlockMap[] | undefined, path: string, approved: boolean): CmsBlock[] {
  if (maps === undefined || maps === null) return [];
  if (!Array.isArray(maps) || maps.length > 100) throw new Error('Invalid CMS block relations at ' + path);
  const seen = new Set<string>();
  return maps.map((map, index) => {
    const value = map?.block_id;
    const id = value?.id;
    const type = value?.block_type;
    if (!id || typeof id !== 'string' || !supported.has(String(type)) || seen.has(id)) {
      throw new Error('Unknown, missing or duplicated CMS block at ' + path);
    }
    seen.add(id);
    if (approved && value?.fact_checked !== true) throw new Error('Unverified CMS block at ' + path);
    const data = record(value?.data);
    checkData(String(type), data, path);
    return {id, type: type as CmsBlock['type'], sort: Number(map.sort ?? index), data};
  }).sort((a,b)=>a.sort-b.sort);
}
