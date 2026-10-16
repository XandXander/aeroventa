# AEROVENTA — Directus V12 deterministic DRAFT importer

## Scope

Repo-only preparation for the already-applied V11 schema. This package does **not** publish content, deploy Astro, change DNS, touch Bitrix, n8n, VPS containers, PostgreSQL, Redis, Traefik or Gotenberg.

Authoritative V11 base commit:

`346a16560719a83b6e3e1fbbadd63a16c60a9612`

Expected successful V11 schema-apply evidence hash:

`b3ed8151ee5f641550d4893369a1f46894f804cb`

Expected import source fingerprint:

`4a33c77aa5578bf6272a2f2763c9a16e6a7dc678ff88596c11da1c233cd23c78`

## Important V11 readback finding

At V11 HEAD, `scripts/generate-directus-import-plan.mjs` is deterministic (`generated_at = null`), but the committed `migration/directus-import-plan.json` can be stale because it was generated earlier. V12 therefore **regenerates the plan before every V12 validation/dry-run/apply/readback**.

The version-independent `directus/desired-schema-contract.json` also still documents the pre-V11 detail primary-key shape. V12 does **not** use that stale detail description as a write gate. The actual applied/validated authority for data import is `directus/target-schema-v11.json`, where both `project_details` and `service_details` have:

- own UUID `id` primary key;
- required unique `content_id` M2O → `content.id`.

## Deterministic imported data

Expected exact post-import counts:

- `content`: 29
- `content_categories`: 8
- `redirects`: 67
- `project_details`: 6
- `service_details`: 2
- `site_settings`: singleton payload
- `content_blocks`: 0
- `content_block_map`: 0
- `content_category_map`: 0

The importer never invents rows for the three structured collections that do not yet have deterministic source mappings.

## Safety invariants

Every imported content row must remain:

- `status = draft`
- `owner_approved_at = null`
- `robots_index = false`
- `robots_follow = true`
- `sitemap_include = false`
- `knowledge_allowed = false`
- `ai_origin = false`

Existing remote content that is published, approved, indexable, in sitemap, AI-knowledge-enabled, or outside the deterministic keyset blocks the write.

## Idempotency and partial-failure recovery

Natural unique keys:

- `content.path`
- `content_categories.path`
- `redirects.source_path`
- `project_details.content_id`
- `service_details.content_id`

The importer creates a missing managed row, updates an existing managed row, or records a no-op when it already matches. `path_ref` is never written to Directus; after content write/readback it resolves to the actual `content.id`.

If any request fails, the script stops immediately, writes a private journal under `migration/private/directus/`, and marks the run `PARTIAL_FAILURE_REQUIRES_FRESH_READBACK`. Do **not** blind-retry. Run dry-run again; it re-reads actual state and reconciles by the unique keys above.

The private journal contains pre-change values for updated rows and IDs for created rows, which is the evidence required to design an exact rollback if one is needed. V12 deliberately does not auto-delete/rollback production data.

## Commands

All commands require Node `>=22.19.0`.

### Local/CI static gate — no network, no write

```bash
npm run directus:v12:prepare
```

### Fresh Directus dry-run — read-only

Requires environment variables (never commit them):

```bash
DIRECTUS_URL="https://<directus-host>" \
DIRECTUS_ADMIN_TOKEN="<REDACTED>" \
npm run directus:v12:dry-run
```

This performs fresh schema snapshot + fresh data readback and writes nothing to Directus.

### Actual write — only after fresh explicit Owner approval

A write is blocked unless **both** `--apply` (through npm script) and the approval sentinel are present:

```bash
DIRECTUS_URL="https://<directus-host>" \
DIRECTUS_ADMIN_TOKEN="<REDACTED>" \
AEROVENTA_DIRECTUS_WRITE_APPROVED="YES_I_HAVE_FRESH_OWNER_APPROVAL" \
npm run directus:v12:apply
```

Do not set the approval sentinel before the separate change-control gate.

### Post-import exact readback — read-only

```bash
DIRECTUS_URL="https://<directus-host>" \
DIRECTUS_ADMIN_TOKEN="<REDACTED>" \
npm run directus:v12:readback
```

PASS requires exact counts, exact deterministic values, FK binding, unique `content_id`, and all draft/noindex/no-sitemap/no-owner-approval safety invariants.

## Rollback policy for the later real write

Before actual write, fresh dry-run must be saved. During apply, `migration/private/directus/v12-write-journal.json` records every create/update/no-op. If rollback becomes necessary:

1. stop; do not rerun blindly;
2. fresh readback current state;
3. for `update` journal entries, restore the captured `before` payload only after a separate rollback approval;
4. for `create` journal entries, delete only IDs proven to have been created by this V12 journal, again only after rollback approval;
5. run exact readback again.

No automatic rollback is performed because automatic deletion after a network/partial failure is riskier than controlled reconciliation.
