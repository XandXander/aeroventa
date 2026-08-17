# Directus schema gate

The file `desired-schema-contract.json` is an **application-level contract**, not a Directus-native snapshot.
Do not pass it directly to `directus schema apply`.

The supported deployment flow is intentionally split into read-only planning and separately-approved mutation:

1. Run repository-local deterministic Directus plan generation and V8 safety validation.
2. Capture the current Directus schema snapshot from the target instance using read-only `GET /schema/snapshot`.
3. Inspect the current native snapshot against `desired-schema-contract.json` locally.
4. Produce a Directus-native target snapshot for the approved content model in a controlled staging/dev instance using the same compatible Directus version/database vendor.
5. Run Directus `/schema/diff` and/or `schema apply --dry-run` against that native target snapshot.
6. Review the exact diff and database/shared-project impact.
7. Obtain a fresh Owner approval immediately before any mutation.
8. Only then apply the separately authorized schema change.

Directus documents schema snapshot/diff/apply as admin-only operations and uses a schema hash to protect against applying a stale diff.
Do not use `force=true` as a routine bypass for Directus-version or database-vendor mismatch.

No production schema mutation is implemented or authorized by this repository baseline.
