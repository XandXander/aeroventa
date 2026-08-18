# Directus V11 — O2O primary-key correction gate

Observed V10 apply attempt:

- precheck: PASS
- `/schema/apply`: HTTP 400
- Directus error: `Field "content_id" in collection "project_details" is a primary key`
- Directus UI remained `No Collections`; no successful schema mutation was observed.

## Root cause

V10 modeled both `project_details.content_id` and `service_details.content_id` as:

- primary key
- foreign key / Directus relational field

Directus 12.1.1 rejects this combination during schema apply.

Directus models one-to-one cardinality as an M2O foreign-key field with a UNIQUE constraint.
V11 therefore uses the canonical pattern for both detail collections:

- `id`: UUID primary key, non-relational
- `content_id`: UUID, required, UNIQUE, M2O -> `content.id`

This preserves the intended one-content-to-one-details invariant without using a relation as the collection primary key.

## V11 target

Expected native target:

- Directus `12.1.1`
- vendor `postgres`
- 9 AEROVENTA collections
- 110 fields
- 12 preserved Directus `systemFields`
- 9 relations
- no `articles`
- no schema-apply code in the repository package

## Mandatory gates before any apply

1. CI target validation PASS.
2. Fresh production `/schema/snapshot` still shows zero custom collections/fields/relations.
3. Fresh `/schema/diff` returns HTTP 200.
4. Diff contains only new AEROVENTA objects.
5. No `D` operations.
6. No system-field changes.
7. Fresh Owner approval immediately before a new `/schema/apply`.

V11 package itself does not apply or mutate Directus.
