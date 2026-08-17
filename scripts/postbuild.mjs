import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'migration/hosting-rules.generated.conf');
const target = path.join(root, 'apps/web/dist/.htaccess');
await fs.copyFile(source, target);
console.log(`Copied hosting rules to ${target}`);

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts/validate-built-site.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Built-site validation failed with exit code ${code}`)));
});
