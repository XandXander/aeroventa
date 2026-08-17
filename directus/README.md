# Directus schema implementation gate

`desired-schema-contract.json` is a **version-independent contract**, not a fabricated Directus snapshot.

A real Directus `schema snapshot` contains version/database-specific details. Therefore the safe implementation sequence is:

1. read the current Directus version and current schema;
2. generate a real snapshot of that instance;
3. prepare the proposed schema in a development/staging Directus instance;
4. run `schema apply --dry-run` against the target;
5. audit the diff;
6. ask Owner for explicit approval immediately before applying it.

Official Directus CLI supports:

```bash
npx directus schema snapshot --yes ./snapshot.yaml
npx directus schema apply --dry-run ./snapshot.yaml
npx directus schema apply --yes ./snapshot.yaml
```

**Do not run `schema apply --yes` on production without the separate write gate.**
