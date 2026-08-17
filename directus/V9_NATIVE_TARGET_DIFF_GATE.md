# Directus V9 — native target + remote diff gate

Observed production baseline (Owner-provided read-only `/schema/snapshot`, 2026-08-17):

- Directus: `12.1.1`
- vendor: `postgres`
- custom collections: `0`
- custom fields: `0`
- custom relations: `0`

The previous test collection `articles` was removed by the Owner before this baseline was captured.

V9 generates `directus/target-schema-v9.json` with only the nine approved AEROVENTA collections. It does not contain or delete `articles`, and it does not modify Directus system collections.

## Repository gate

```bash
npm run directus:target:generate
npm run directus:target:validate
```

Expected target identity:

- version `1`
- Directus `12.1.1`
- vendor `postgres`
- 9 AEROVENTA collections
- no schema apply code

## Remote diff gate — read only

Run from the browser console while authenticated at `https://cms.aeroventa.ru`:

```js
(async()=>{const u='https://raw.githubusercontent.com/XandXander/aeroventa/main/directus/target-schema-v9.json';const t=await fetch(u,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('target '+r.status);return r.json()});const r=await fetch('/schema/diff',{method:'POST',credentials:'include',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify(t)});const x=await r.text();console.log('HTTP',r.status,x);try{await navigator.clipboard.writeText(x)}catch{}return x})()
```

`POST /schema/diff` is a comparison request only. Do **not** call `/schema/apply` in V9.

Acceptance for the remote diff:

1. HTTP 200.
2. No delete (`kind: D`) or rename operations.
3. No Directus system collection changes.
4. New objects limited to the approved AEROVENTA schema.
5. No `force=true`.
6. Diff hash captured for evidence only; it is not approval to apply.

After the exact diff is reviewed, a fresh Owner approval is required immediately before any schema mutation.
