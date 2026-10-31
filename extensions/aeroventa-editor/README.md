# AEROVENTA · editorial module (source candidate; NOT deployed)

Native **Directus Studio module**. It reuses the signed-in human user's
Directus session via `useApi()`; never uses, requests, logs, or embeds a
Build Reader token.

## What is implemented

- Read-only list of existing Directus `content` items (limit 100);
- One strictly bounded editor on an existing **unapproved draft** at
  `/blog/detail/ntff-polisan/`, allowing ONLY `excerpt`;
- Explicit before/after review and confirm; server re-read before PATCH;
- Fail-closed protection on status/owner_approved_at/path/ID changes;
- Status, approval, canonical URL, media, schema, and other pages are not editable;
- **No build trigger, auto-publication, Beget integration, or public site modifications**.

This is intentionally a pilot. The complete HI-END editorial UI (D-066) will
expand to all approved content types only after a tested draft/edit-preview
loop and owner acceptance. Do not interpret a built module as a live install.

## Build and test (offline, in the source checkout)

```sh
cd extensions/aeroventa-editor
npm install --no-audit --no-fund
npm test
npm run build
```

Install to the running Directus instance **only after** compatible host
version verification, a verified CMS backup, a rollback procedure,
staging test, and separate Owner authorization. No SSH/Beget/VPS step
is included in this source-only scope.

## Editorial safety model

1. Built-in Directus roles/policies decide if the signed-in user has update rights.
2. The module itself only patches `{excerpt: <reviewed string>}` on the one
   whitelisted existing draft, never promotes any record to published.
3. The 29 legacy drafts are not a source of truth for production.
4. A successful save **does not** alter `aeroventa.ru`. Existing Astro
   directus-preview CI can then read it and build an isolated noindex candidate.
5. This is NOT an atomic compare-and-swap: if a concurrent update happens between
   the second GET and PATCH, Directus standard REST PATCH may overwrite that field.
   Strong optimistic locking requires an audited server-side write gate.
6. No special extension policies, schema migrations, or Directus runtime changes
   have been applied.

See [official Directus custom modules docs](https://directus.com/docs/guides/extensions/app-extensions/modules).
