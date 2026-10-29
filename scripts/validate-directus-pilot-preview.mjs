import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
// Read only: compare the exact current draft excerpt to compiled preview HTML.
const path = '/blog/detail/ntff-polisan/';
if (process.env.AEROVENTA_RELEASE_MODE !== 'preview' || process.env.AEROVENTA_DIRECTUS_PILOT_PATH !== path)
  throw Error('Pilot requires explicitly enabled preview mode');
const token = process.env.DIRECTUS_STATIC_TOKEN;
if (!token) throw Error('Missing read-only Directus token');
const api = new URL('/items/content','https://cms.aeroventa.ru');
api.searchParams.set('filter[path][_eq]',path);
api.searchParams.set('fields','path,excerpt,status,owner_approved_at');
api.searchParams.set('limit','2');
const response = await fetch(api,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
if (!response.ok) throw Error('Directus read-only HTTP '+response.status);
const data = (await response.json()).data;
if (!Array.isArray(data)||data.length !== 1||data[0].path !== path||data[0].status !== 'draft'||
    data[0].owner_approved_at !== null||!String(data[0].excerpt||'').trim())
  throw Error('Expected one nonempty unapproved Directus draft');
const sha = createHash('sha256').update(data[0].excerpt).digest('hex');
const html = await fs.readFile('apps/web/dist'+path+'index.html','utf8');
const hits = [...html.matchAll(/<aside\b[^>]*data-directus-pilot-excerpt\b[^>]*>/gi)];
if(hits.length !== 1||!hits[0][0].includes(sha))
  throw Error('Exact current Directus draft excerpt absent from compiled pilot');
if(!/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html))
  throw Error('Draft pilot must be noindex');
const home = await fs.readFile('apps/web/dist/index.html','utf8');
if(home.includes('data-directus-pilot-excerpt')) throw Error('Pilot leaked onto HOME');
const report = {verdict:'PASS',mode:'preview',public_site_modified:false,
  cms_data_modified:false,source_sha:process.env.GITHUB_SHA||'unknown',
  path,field:'excerpt',sha256:sha,
  note:'Single case draft excerpt is in isolated HTML preview; no deployment.'};
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/DIRECTUS_SINGLE_CASE_PILOT.json',JSON.stringify(report,null,2)+'\n');
console.log('DIRECTUS_ONE_CASE_PREVIEW_PASS path='+path+' excerpt_sha256='+sha);
if(process.env.GITHUB_STEP_SUMMARY)
 await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
  '### Single draft-to-Astro pilot: PASS\n\n- Single route: '+path+
  '\n- Directus field: excerpt\n- Mode: preview/noindex\n- Writes: none\n- Excerpt SHA256: '+sha+'\n');
