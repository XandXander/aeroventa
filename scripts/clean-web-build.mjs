// Only disposable web build output and compiler caches. Never source media.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const relative of [
  '../apps/web/dist/',
  '../apps/web/.astro/',
  '../apps/web/node_modules/.vite/',
  '../node_modules/.vite/',
]) {
  await fs.rm(fileURLToPath(new URL(relative, import.meta.url)), { recursive: true, force: true });
}
