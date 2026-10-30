#!/usr/bin/env node
/** Deterministic pinned source+accepted-site baseline. No network, no writes to CMS. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
export async function readAcceptedBlueprint(){
 const content=(await readFile('migration/accepted-site-cms-blueprint-v1.json.gz.b64','utf8')).trim();
 if(!/^[A-Za-z0-9+/]+=*$/.test(content)||content.length>500000)throw Error('Untrusted baseline encoding');
 const bytes=gunzipSync(Buffer.from(content,'base64'),{maxOutputLength:2800000});
 const plan=JSON.parse(bytes.toString('utf8'));
 if(plan.format!=='AEROVENTA_OWNER_ACCEPTED_CMS_BASELINE_V1'||
    plan.origin_source_sha!=='afc1cc10d75a1f434c51e173128d93f9b09e041a'||
    plan.summary.canonical_pages!==49||plan.pages.length!==49||plan.summary.fields!==2342)
   throw Error('Pinned baseline contract mismatch');
 return bytes;
}
if(process.argv[1]?.endsWith('pr12-cms-blueprint-decode.mjs')){
 const output=process.argv[2]||'release_out/accepted-site-cms-blueprint-v1.json';
 const bytes=await readAcceptedBlueprint();
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,bytes);
 console.log('ACCEPTED_CMS_BLUEPRINT_DECODE_PASS bytes='+bytes.length);
}
