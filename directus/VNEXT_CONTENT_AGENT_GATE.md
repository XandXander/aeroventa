# Directus VNext Content + Agent Gate

This gate extends the accepted V11 Directus model for the new site, Requests handoff, Premium Consultant projection and Publishing Agent workflow.

## Hard boundary

V25 is **tooling and deterministic planning only**.

It does not authorize or perform a production schema mutation.

The VNext contract is application-level, not a Directus-native snapshot.

## Additive target

V11 is preserved unchanged.

Add to `content`:
- page_purpose
- primary_user_intent
- primary_search_intent
- public_facts
- evidence_refs
- limitations
- agent_summary
- last_fact_verified_at

Add collections:
- `requests`
- `publication_jobs`

Add only the two planned M2O publication-job → content relations.

Do not change the existing V11 `content.publication_job_id` field in this gate.

## Local deterministic preflight

```
npm run directus:vnext:preflight:local
```

Expected:
- `PASS_ADDITIVE_PLAN`
- `PASS`
- destructive operations = 0

Generated deterministic plan:
`migration/directus-vnext-plan.json`

## Runtime read-only preflight

Requires an authorized Directus admin/schema token.

1. Capture fresh schema:
```
npm run directus:snapshot:readonly
```

2. Inspect the snapshot against VNext:
```
npm run directus:vnext:inspect -- migration/private/directus/schema-current.json
```

3. If the result is `ADDITIVE_DELTA_REQUIRED`, create a Directus-native target snapshot on a compatible dev/staging Directus instance.

4. Run the existing read-only/native diff:
```
npm run directus:diff:readonly -- <native-target-snapshot.json>
```

5. Audit exact diff and shared-project impact.

6. Obtain fresh Owner approval immediately before mutation.

7. Apply only through a separately authorized implementation gate.

## Stop conditions

STOP if:
- admin snapshot is unavailable;
- target Directus version/vendor differs unexpectedly;
- any planned operation is destructive;
- any VNext field already exists with a different type;
- a relation conflicts with existing schema;
- a diff includes unrelated collections;
- fresh Owner approval is absent.

Never use `force=true` as a normal bypass.
