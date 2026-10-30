/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DIRECTUS_URL?: string;
  readonly DIRECTUS_STATIC_TOKEN?: string;
  readonly AEROVENTA_RELEASE_MODE?: 'fixture' | 'preview' | 'review' | 'production' | 'incremental';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  aeroventaTrack?: (name:string,input?:Record<string,unknown>)=>void;
  ym?: ((...args:unknown[])=>void) & {a?:unknown[][];l?:number};
}
