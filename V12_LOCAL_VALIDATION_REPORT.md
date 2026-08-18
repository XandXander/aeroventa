# AEROVENTA V12 — Local validation report

Validation scope: generated V12 overlay files only, using Node.js 22.16.0 and a local mock Directus REST server. No production Directus/VPS/n8n/Bitrix/Beget write or read was performed.

## Passed checks

1. `node --check` — all four V12 `.mjs` files PASS.
2. Static deterministic validator PASS with the expected contract:
   - content 29
   - content_categories 8
   - redirects 67
   - project_details 6
   - service_details 2
   - target schema 9 collections / 110 fields / 9 relations / 12 systemFields.
3. Initial remote dry-run against empty mock:
   - `DRY_RUN_PASS_NO_WRITE`
   - 29 content creates planned
   - 67 redirects creates planned
   - no remote mutation.
4. Write-approval guard PASS:
   - `--apply` without `AEROVENTA_DIRECTUS_WRITE_APPROVED=YES_I_HAVE_FRESH_OWNER_APPROVAL` exits before any data mutation.
5. Partial-failure recovery test PASS:
   - mock returned an intentional HTTP 500 on write #12;
   - journal status became `PARTIAL_FAILURE_REQUIRES_FRESH_READBACK`;
   - 11 completed operations were recorded;
   - next dry-run reconciled existing partial state instead of assuming a clean database.
6. Recovery apply PASS:
   - `APPLY_V12_DRAFT_DATA_PASS`;
   - exact counts 29 / 8 / 67 / 6 / 2 / singleton;
   - structured collections remained 0 / 0 / 0.
7. Exact post-import readback PASS.
8. Published/indexable pre-existing content fail-closed guard PASS.
9. Second dry-run after successful import PASS with all managed rows classified as no-op:
   - content 29 no-op
   - categories 8 no-op
   - redirects 67 no-op
   - project_details 6 no-op
   - service_details 2 no-op
   - site_settings 1 no-op.

## Not claimed by this local validation

- No claim is made that current production Directus data is still empty.
- No claim is made that production schema has not drifted after V11.
- Those are intentionally re-checked by V12 via fresh `/schema/snapshot` and fresh collection readback immediately before any real write.
