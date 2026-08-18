# AEROVENTA — V13 Directus DRAFT Preview → Astro

## Scope

V13 is a repo-only preview bridge for the already-imported V12 Directus draft dataset.

It does **not**:

- publish Directus content;
- set `owner_approved_at`;
- enable robots indexing or sitemap inclusion;
- write to Directus;
- deploy Astro;
- change DNS;
- switch off Bitrix;
- modify n8n or shared VPS services.

Authoritative base at V13 preparation:

`6c284ffe2d7599a677a62348adbd862dde1ac8d4`

V12 production Directus state already confirmed before V13:

- `content`: 29 draft rows;
- `content_categories`: 8;
- `redirects`: 67;
- `project_details`: 6;
- `service_details`: 2;
- `content_blocks`: 0;
- `content_block_map`: 0;
- `content_category_map`: 0;
- published/approved/indexable/sitemap/knowledge-enabled counts: 0.

## Release modes

Astro content loading now has three explicit modes:

- `fixture` — local/CI implementation fixtures; Directus is forbidden in this mode;
- `preview` — reads only Directus `draft` rows with `owner_approved_at = null`;
- `production` — unchanged fail-closed contract: reads only `published` rows with non-null `owner_approved_at`.

If `DIRECTUS_URL` is set in fixture mode, the build fails instead of silently changing content source.

## Preview safety gates

Every Directus row accepted by preview must satisfy all of the following:

- `status = draft`;
- `owner_approved_at = null`;
- `robots_index = false`;
- `sitemap_include = false`;
- `knowledge_allowed = false`;
- `ai_origin = false`;
- title and H1 are present;
- any transitional `body_html` has `pending_review` or `reviewed_safe` status and passes the existing fail-closed executable/embedded/inline-style HTML guard.

The preview route set must exactly equal the retained route contract. Missing, duplicate or unexpected canonical paths fail the build.

## Search-engine isolation

Preview pages additionally force:

`noindex,nofollow,noarchive,nosnippet`

The layout displays a visible `AEROVENTA DRAFT PREVIEW` banner and suppresses JSON-LD in preview mode.

After a preview build, `scripts/postbuild.mjs` replaces preview `robots.txt` with:

```text
User-agent: *
Disallow: /
```

This replacement is preview-only; fixture and production behavior are unchanged.

## Authentication

Preview requires both:

- `DIRECTUS_URL` using HTTPS;
- `DIRECTUS_STATIC_TOKEN`.

Use a dedicated read-only Directus token/policy. V13 needs read access to `content` only. Do not use a token with create/update/delete permissions for the preview host.

Secrets must stay in environment variables and must never be committed. Existing built-site validation already checks that `DIRECTUS_STATIC_TOKEN` bytes do not leak into `dist`.

## Commands

Static repo gate, no network and no Directus write:

```bash
npm run directus:v13:preview:validate
```

Build a real draft preview, read-only against Directus:

```bash
DIRECTUS_URL="https://cms.aeroventa.ru" \
DIRECTUS_STATIC_TOKEN="<READ_ONLY_TOKEN>" \
npm run directus:v13:preview:build
```

The wrapper sets `AEROVENTA_RELEASE_MODE=preview` itself. Do not set `production` for draft review.

## Production invariant

V13 does not relax production publication rules. Production mode continues to require:

- Directus `status = published`;
- non-null `owner_approved_at`;
- `reviewed_safe` for any rendered HTML bridge content;
- the existing canonical/route completeness checks.

Draft preview is therefore a separate read-only review path, not a publication shortcut.

## Next bounded stage

After V13 repo CI is green, the next change-control gate is creation of a dedicated Directus read-only preview credential and one controlled preview build. Preview hosting/deployment remains a separate approval because it changes runtime infrastructure/exposure.
