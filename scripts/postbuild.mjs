import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'migration/hosting-rules.generated.conf');
const dist = path.join(root, 'apps/web/dist');
const target = path.join(dist, '.htaccess');
const releaseMode = process.env.AEROVENTA_RELEASE_MODE || 'fixture';

await fs.copyFile(source, target);
console.log(`Copied hosting rules to ${target}`);

if (releaseMode === 'preview') {
  const robots = 'User-agent: *\nDisallow: /\n';
  await fs.writeFile(path.join(dist, 'robots.txt'), robots);
  console.log('Applied V13 preview robots.txt: Disallow: /');
}

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts/validate-built-site.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Built-site validation failed with exit code ${code}`)));
});
