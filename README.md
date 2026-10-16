# AEROVENTA implementation T2

Local implementation package for the migration of `aeroventa.ru` from legacy Bitrix to:

- Astro static frontend;
- Directus content source of truth;
- exact legacy SEO route compatibility;
- future AI consultant and Publishing Agent integrations.

## Current status

Repository baseline is now present in GitHub. This remains **implementation/staging preparation only**: nothing has been written to Directus, Beget, VPS, n8n or production.

Primary business contract:

> **Монтаж вентиляции** is the primary commercial business.

Diamond-drilling content is retained only as `LEGACY_ACQUISITION` where it provides SEO traffic, useful content or lead acquisition. Current drilling leads may be transferred to trusted executors/partners; target content must not claim direct execution when that is not the current operating model.

## Safety

Fixture pages are intentionally `noindex` and are not production content. Do not deploy this package until migrated/approved content and the acceptance matrix pass.

## Automated safety checks

GitHub Actions `implementation-ci` validates route contracts and builds the fixture site without deployment.
`legacy-readonly-crawl` performs read-only HTTP GETs against the current site only when its migration inputs change (or when manually started). It stores the retained HTML/assets in a short-lived workflow artifact and never commits back to the repository.

## Local checks

```bash
node scripts/generate-hosting-rules.mjs
node scripts/validate-implementation.mjs
```

Current Astro prerequisites require Node 22.12.0+; `.nvmrc` is set accordingly.

When package installation is available:

```bash
npm install
npm run build:web
```

## Directory layout

- `apps/web` — Astro static website implementation skeleton.
- `directus` — desired schema contract and future schema-apply gate.
- `migration` — canonical route/media manifests and generated Apache routing.
- `scripts` — deterministic route generation/validation.
- `.github/workflows` — validation only; no production deployment workflow exists.
- `docs/source-of-truth` — T2 approved architecture/discovery artifacts.

## Production write gate

Before any GitHub write, Directus mutation, Beget upload, VPS/n8n change or production deploy, obtain a fresh explicit Owner approval.
