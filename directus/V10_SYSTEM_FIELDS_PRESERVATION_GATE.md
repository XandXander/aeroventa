# Directus V10 — preserve production system indexes

Status: **READ-ONLY TARGET CORRECTION. NO SCHEMA APPLY.**

## Why V10 exists

The V9 remote `POST /schema/diff` returned HTTP 200 and the expected AEROVENTA delta size (9 collections, 108 fields, 9 relations), but also returned 12 `kind: E` changes under `systemFields`.

Observed detail for all 12 changes:

- path: `schema.is_indexed`
- current (`lhs`): `true`
- V9 target (`rhs`): `false`

These are Directus system-field indexes and are outside AEROVENTA scope. Therefore V9 is **NOT authorized for apply**.

V10 preserves the exact 12 system-field index flags from the Owner-captured production snapshot (`Directus 12.1.1`, PostgreSQL):

1. `directus_activity.timestamp`
2. `directus_oauth_clients.date_created`
3. `directus_oauth_codes.expires_at`
4. `directus_oauth_codes.used_at`
5. `directus_oauth_consents.client`
6. `directus_oauth_tokens.code_hash`
7. `directus_oauth_tokens.expires_at`
8. `directus_oauth_tokens.previous_session`
9. `directus_oauth_tokens.session`
10. `directus_revisions.activity`
11. `directus_revisions.parent`
12. `directus_sessions.oauth_client`

All remain `schema.is_indexed: true`.

## Repository gate

```bash
npm run directus:target:generate
npm run directus:target:validate
```

Expected: 9 collections, 108 custom fields, 12 preserved systemFields, 9 relations, validation PASS.

## Remote diff acceptance

Run `POST /schema/diff` only. V10 passes only if:

- HTTP 200;
- 9 AEROVENTA collections;
- 108 AEROVENTA fields;
- 9 AEROVENTA relations;
- **zero `kind: D`**;
- **zero system-field `kind: E`**;
- no rename/destructive operation;
- no Directus system collection mutation.

The diff hash is evidence only. A fresh Owner approval is still required immediately before any future `/schema/apply`.
