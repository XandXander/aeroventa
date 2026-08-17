# Directus schema gate

The file `desired-schema-contract.json` is an **application-level contract**, not a Directus-native snapshot.
Do not pass it directly to `directus schema apply`.

The supported deployment flow is intentionally split into read-only planning and separately-approved mutation:

1. Capture the current Directus schema snapshot from the target instance.
2. Produce a Directus-native target snapshot for the approved content model in a controlled staging/dev instance.
3. Run Directus schema diff / `schema apply --dry-run`.
4. Review the exact diff and database impact.
5. Obtain a fresh Owner approval.
6. Only then apply the schema change.

Directus documents schema snapshot/diff/apply as admin-only operations and uses a schema hash to protect against applying a stale diff.

No production schema mutation is implemented or authorized by this repository baseline.
