# Directus V8 — read-only preflight

Status: **NO DIRECTUS MUTATION AUTHORIZED OR IMPLEMENTED BY V8**.

V8 closes the repository-side preparation gap before touching the shared Directus instance.
It deliberately separates three things:

1. deterministic generation of the draft-only import plan;
2. repository-local safety validation;
3. read-only inspection of the current shared Directus schema.

## 1. Local / CI gate

Run:

```bash
npm run directus:preflight:local
```

This regenerates `migration/directus-import-plan.json` from the canonical repo sources and validates that:

- every content row remains `draft`;
- `owner_approved_at` is null;
- `robots_index=false` and `sitemap_include=false`;
- `knowledge_allowed=false`;
- V7 core-content overrides are present in the generated Directus plan;
- 301 targets resolve to retained 200 routes;
- 410 rows have no target;
- `/montazh-ventiliacii/` remains direct/mixed;
- `/almaznoe-burenie/` remains partner-only;
- AI defaults remain disabled/fail-safe.

The generated plan has `generated_at: null` and a SHA-256 source fingerprint so identical inputs produce identical output.

## 2. Shared Directus snapshot — read only

The shared VPS Directus is production-adjacent infrastructure used alongside other projects. Do not restart, update, recreate, migrate or mutate the container/database for this step.

Provide `DIRECTUS_URL` and `DIRECTUS_ADMIN_TOKEN` only through the execution environment. Never commit them and never paste them into repository files.

Capture the current native schema:

```bash
npm run directus:snapshot:readonly
```

This performs only `GET /schema/snapshot` and writes the returned schema to the gitignored path:

```text
migration/private/directus/schema-current.json
```

Then inspect it locally against the AEROVENTA application-level contract:

```bash
npm run directus:snapshot:inspect
```

The inspection report is written to:

```text
migration/private/directus/schema-contract-inspection-v8.json
```

## 3. Native target diff — still no apply

`directus/desired-schema-contract.json` is **not** a Directus-native schema snapshot and must never be sent to schema apply.

Only after a Directus-native target snapshot has been produced for the approved model may a read-only difference be requested:

```bash
npm run directus:diff:readonly -- path/to/directus-native-target-snapshot.json
```

The repository script uses `POST /schema/diff`. Do not add `force=true` merely to bypass version/database-vendor incompatibility; resolve that incompatibility explicitly.

A CLI dry run is also acceptable against the correctly versioned Directus environment:

```bash
npx directus schema apply --dry-run path/to/directus-native-target-snapshot.json
```

## 4. Hard stop before mutation

V8 contains no schema-apply step.

Before any future Directus schema/content mutation:

1. current schema snapshot captured;
2. exact native target snapshot produced;
3. exact diff/dry-run reviewed;
4. database/shared-project impact assessed;
5. rollback/snapshot defined;
6. fresh Owner approval obtained immediately before the write.
