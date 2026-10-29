// AEROVENTA: read-only editorial metadata reconciliation, NOT a publisher.
// The Owner-accepted live website is the reference; no Directus/Beget writes.
import fs from 'node:fs/promises';
const token = process.env.DIRECTUS_STATIC_TOKEN;
if (!token) throw Error('DIRECTUS_STATIC_TOKEN is missing');
const live = 'https://aeroventa.ru';
const cms = 'https://cms.aeroventa.ru';
const normalize = p => p === '/' ? '/' : (p.startsWith('/') ? p : '/' + p).replace(/\/+$/, '') + '/';
const expected = JSON.parse(await fs.readFile('apps/web/src/data/expected-retained-paths.json', 'utf8')).map(normalize);
if (new Set(expected).size !== expected.length) throw Error('Duplicate source routes');
const requested = (process.env.RECONCILE_PATH || '').trim();
if (requested && !expected.includes(normalize(requested))) throw Error('Unrecognized route');
const routes = requested ? [normalize(requested)] : expected;
const records = [];
for (let offset = 0; offset < 10000; offset += 100) {
  const url = new URL('/items/content', cms);
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('fields', 'path,h1,seo_title,seo_description,status,owner_approved_at');
  const r = await fetch(url, {headers:{'Authorization':'Bearer '+token,'Accept':'application/json'}, signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw Error('Directus read HTTP '+r.status);
  const rows = (await r.json()).data;
  if (!Array.isArray(rows)) throw Error('Invalid Directus data');
  records.push(...rows);
  if (rows.length < 100) break;
}
const byPath = new Map();
const duplicates = [];
for (const r of records) {
  const p = normalize(String(r.path || ''));
  if (byPath.has(p)) duplicates.push(p);
  else byPath.set(p,r);
}
const clean = s => String(s || '').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
function extract(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  const descTag = (html.match(/<meta\b[^>]*>/gi)||[]).find(t=>/\bname\s*=\s*["']description["']/i.test(t));
  const desc = descTag?.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
  return {h1:clean(h1), title:clean(title), seo_description:clean(desc)};
}
function compare(a,b) { return (!a || !b) ? 'NOT_COMPARABLE' : (clean(a) === clean(b) ? 'MATCH' : 'DIFF'); }
const pages = new Array(routes.length);
let cursor = 0;
async function worker() {
  while (cursor < routes.length) {
    const i = cursor++, p = routes[i], record = byPath.get(p);
    const result = {path:p, cms_status:record?.status || 'MISSING',
      cms_owner_approved:Boolean(record?.owner_approved_at), live_http:null,
      h1:'NOT_COMPARABLE', title:'NOT_COMPARABLE', description:'NOT_COMPARABLE'};
    try {
      const r = await fetch(new URL(p,live), {headers:{'Accept':'text/html'},redirect:'follow',signal:AbortSignal.timeout(15000)});
      result.live_http = r.status;
      if (r.ok) {
        const v = extract(await r.text());
        result.h1=compare(v.h1,record?.h1);
        result.title=compare(v.title,record?.seo_title);
        result.description=compare(v.seo_description,record?.seo_description);
        result.live_h1=v.h1; result.cms_h1=record?.h1 || null;
        result.live_title=v.title; result.cms_title=record?.seo_title || null;
        result.live_description=v.seo_description; result.cms_description=record?.seo_description || null;
      }
    } catch {
      result.live_error = 'UNAVAILABLE_OR_TIMEOUT';
    }
    pages[i]=result;
  }
}
await Promise.all([worker(),worker(),worker(),worker()]);
const counts = {checked:routes.length,cms_records:records.length,drafts:records.filter(x=>x.status==='draft').length,
  published_owner_approved:records.filter(x=>x.status==='published'&&x.owner_approved_at).length,
  duplicate_cms_paths:duplicates.length,live_http_200:pages.filter(x=>x.live_http===200).length,
  live_unavailable:pages.filter(x=>x.live_http!==200).length,
  metadata_differences:pages.filter(x=>[x.h1,x.title,x.description].includes('DIFF')).length,
  all_three_fields_match:pages.filter(x=>[x.h1,x.title,x.description].every(v=>v==='MATCH')).length};
const report = {schema:'AEROVENTA_DIRECTUS_LIVE_METADATA_V1',
  truth:'Owner-accepted live website; CMS drafts are NOT publication authority',
  scope:'H1/title/description metadata ONLY; no body, media, UI or byte parity guarantee',
  no_mutation:true,source_sha:process.env.GITHUB_SHA || 'unknown',counts,pages};
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/DIRECTUS_LIVE_METADATA.json', JSON.stringify(report,null,2)+'\n');
const csvCell = v => '"'+String(v ?? '').replaceAll('"','""')+'"';
const rows = [['path','cms_status','cms_owner_approved','live_http','h1','title','description'],
  ...pages.map(p=>[p.path,p.cms_status,p.cms_owner_approved,p.live_http,p.h1,p.title,p.description])];
await fs.writeFile('reports/DIRECTUS_LIVE_METADATA.csv',rows.map(row=>row.map(csvCell).join(',')).join('\n')+'\n');
console.log('READ_ONLY_DIRECTUS_LIVE_RECONCILIATION='+JSON.stringify(counts));
if (process.env.GITHUB_STEP_SUMMARY) {
  const table = Object.entries(counts).map(([k,v])=>'| '+k.replaceAll('_',' ')+' | '+v+' |').join('\n');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    '### Directus versus accepted live site (metadata only)\n\n| Metric | Value |\n|---|---:|\n'+table+
    '\n\nNo Directus mutations, no publication and no Beget changes. HTML bodies and UI require separate comparison.\n');
}
