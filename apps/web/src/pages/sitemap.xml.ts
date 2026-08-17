import type { APIRoute } from 'astro';
import { getAllContent } from '@/lib/content-source';
import { SITE } from '@/lib/site';

export const GET: APIRoute = async () => {
  const items = (await getAllContent()).filter(
    (item) => item.status === 'published' && Boolean(item.owner_approved_at) && item.robots_index && item.sitemap_include !== false
  );
  const urls = items.map((item) => `<url><loc>${new URL(item.path, SITE.origin).toString()}</loc></url>`).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
