/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DIRECTUS_URL?: string;
  readonly DIRECTUS_STATIC_TOKEN?: string;
  readonly AEROVENTA_RELEASE_MODE?: 'fixture' | 'preview' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
