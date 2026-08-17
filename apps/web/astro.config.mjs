import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://aeroventa.ru',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory'
  }
});
