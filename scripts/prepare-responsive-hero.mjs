// Bounded optional optimization. Never alter source artwork or block release when Sharp is absent.
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = path.join(root, 'apps/web/public/evidence/hero');
const source = path.join(media, 'owner-luxury-airflow-20261010.png');
if (!existsSync(source)) {
  console.log('OWNER_HERO_OPTIMIZE=SKIP_SOURCE_UNAVAILABLE');
} else {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (error) {
    console.warn('OWNER_HERO_OPTIMIZE=SKIP_SHARP_UNAVAILABLE; original PNG remains available');
  }
  if (sharp) {
    const original = await stat(source);
    const sizes = [640, 1100, 1774];
    await mkdir(media, {recursive:true});
    for (const width of sizes) {
      const destination = path.join(media, `owner-luxury-airflow-${width}.webp`);
      await sharp(source).resize({width,withoutEnlargement:true}).webp({quality:90,effort:5}).toFile(destination);
      const optimized = await stat(destination);
      console.log(`OWNER_HERO_OPTIMIZE width=${width} bytes=${optimized.size} source_bytes=${original.size}`);
    }
  }
}
