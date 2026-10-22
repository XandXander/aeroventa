// Release output must never inherit client chunks or HTML from an earlier build.
// These are generated web-workspace directories only; public evidence is untouched.
import {rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
for(const relative of ['../apps/web/dist/','../apps/web/node_modules/.astro/','../apps/web/node_modules/.vite/','../apps/web/.astro/','../node_modules/.vite/']){
  await rm(fileURLToPath(new URL(relative,import.meta.url)),{recursive:true,force:true});
}
console.log('Clean web build output and local compiler caches');
