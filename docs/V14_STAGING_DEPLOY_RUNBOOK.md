# V14 - Isolated Staging Preview Deploy (AEROVENTA.RU)

Status: repository-side tooling implemented. Gate: V14 STAGING PREVIEW DEPLOY (Owner-authorized).
V13 remains closed and untouched; this gate only adds new files.

## Staging model

Isolated Beget subdomain, created as its **own site** (own `public_html`,
separate from the production Bitrix document root) + HTTP Basic Auth on
top of the already-validated V13 preview protections (noindex/nofollow/
noarchive/nosnippet meta, suppressed JSON-LD, `robots.txt: Disallow: /`,
branded 404, `AEROVENTA DRAFT PREVIEW` banner).

```
Production (untouched):  aeroventa.ru            -> existing Bitrix docroot
Staging (new, isolated): staging.aeroventa.ru     -> new site, own public_html
                          + .htaccess Basic Auth   -> scoped FTP account only
```

Beget supports creating a subdomain as a brand-new site with its own
directory (Панель -> Домены и поддомены -> "Создать новый сайт для
поддомена"), and supports FTP accounts scoped to a single home directory
(Панель -> FTP-аккаунты), and supports per-directory `.htaccess` Basic
Auth on standard Apache shared hosting.

## Implemented files (this commit)

| File | Purpose |
|---|---|
| `scripts/v14-verify-head.mjs` | Fails closed unless local git HEAD matches the expected baseline SHA. |
| `scripts/v14-htpasswd.mjs` | Generates one Apache `{SHA}` htpasswd line locally, from an interactively-typed password. Never writes the password to disk/git. |
| `scripts/v14-stage-config.example.json` | Non-secret config template (host, remote path, staging/production URLs). Copy to `v14-stage-config.local.json` (gitignored) for real values. |
| `scripts/v14-stage-deploy.mjs` | Orchestrates: HEAD check -> reused V13 build -> reused V13 validator -> reused postbuild -> FTP upload to the isolated staging path only. Hard-refuses to run if the configured remote path/URL don't contain a `staging` path segment. |
| `scripts/v14-external-acceptance.mjs` | Read-only HTTPS acceptance checks against the deployed staging site (and a production separation sanity check). Writes one local log under `reports/` (not committed). |
| `scripts/v14-staging-runner.ps1` | Single Windows entry point tying all of the above together, prompting locally for credentials (hidden input, never logged/committed). |

No existing file was modified. `package.json` was intentionally left
untouched; the optional FTP dependency (`basic-ftp`) is installed on
demand with `npm install --no-save basic-ftp` rather than being added to
the committed manifest, to keep this change strictly additive.

## Known limitation encountered while building this gate

In this working session, the GitHub connector's file-read tool returned
only a "successfully downloaded" confirmation for `.mjs`/`.json` files
(no inline text body was returned to the model), and generic URL fetching
against `github.com`, `raw.githubusercontent.com`, and `cdn.jsdelivr.net`
for this repo's files also failed. Directory listings, file names, sizes,
and commit metadata WERE retrieved successfully and are accurate.

Practical effect: the exact byte-level CLI contract of
`scripts/build-directus-v13-preview.mjs`, `scripts/postbuild.mjs`,
`scripts/validate-built-site.mjs`, and the exact JSON schema of
`migration/route-contract.json` / `migration/preserved-media.json` could
not be confirmed line-by-line this session. The V14 tooling above treats
those as black boxes invoked by their confirmed filenames/paths
(`node scripts/<name>.mjs`, the standard convention already implied by
the V13 closed-gate runbook name), and the acceptance script parses the
two migration JSON files defensively (several plausible field-name
shapes, with an explicit warning - not a silent pass - if neither shape
matches).

**Before the first real staging deploy**, a quick sanity pass (by
GPT-5.6 Sol or a session with working raw file read) should confirm:
1. `build-directus-v13-preview.mjs` and `validate-built-site.mjs` are
   indeed run via plain `node scripts/<file>.mjs` (matches V13 gate
   convention) rather than via an npm script with extra required flags.
2. The real field names inside `migration/route-contract.json` and
   `migration/preserved-media.json`.

If either assumption is wrong, only `scripts/v14-stage-deploy.mjs` /
`scripts/v14-external-acceptance.mjs` need a small adjustment - no
architectural change.

## Owner's one unavoidable action

WHERE -> Beget control panel: https://cp.beget.com/domains and
https://cp.beget.com/ftp

EXACT ACTION -> Create a new subdomain `staging.aeroventa.ru` as a
**new site** (own `public_html`, not linked into the existing
aeroventa.ru site directory), then create one FTP account scoped
**only** to that new site's home directory.

EXPECTED RESULT -> A staging host/FTP login/password that physically
cannot reach the production Bitrix directory, because the FTP account's
home directory is restricted to `staging.aeroventa.ru` only.

WHAT TO RETURN -> The FTP host, port, and the staging subdomain name
(not the password - that stays local, entered only when
`v14-staging-runner.ps1` prompts for it). Paste these into a local,
gitignored `scripts/v14-stage-config.local.json` (copy of the `.example`
file) on the machine that will run the deploy.

## Deploy / acceptance flow

1. `./scripts/v14-staging-runner.ps1 -ExpectedHeadSha <sha>`
2. Runner verifies HEAD, runs the reused V13 build + validator.
3. Runner prompts for staging FTP credentials locally (hidden, not
   logged/committed) and hands them to `v14-stage-deploy.mjs` via
   process env vars for that run only.
4. Deploy script re-checks the "staging-only" target guard independently,
   then uploads `apps/web/dist` to the isolated remote path.
5. Runner runs `v14-external-acceptance.mjs`, which performs the checks
   listed in section 6 of the V14 objective against the live staging URL,
   plus a production-separation sanity check.
6. One consolidated log is written under `reports/` locally (gitignored,
   never pushed).

## Security boundaries

- No secrets requested in chat; all credential entry happens locally in
  the Owner's own PowerShell session via hidden prompts.
- `scripts/v14-stage-deploy.mjs` hard-fails (independent of the runner)
  if the configured remote path or staging URL does not contain a
  `staging` path segment - this is a code-level guard against ever
  writing to the production Bitrix document root, not just a
  documentation promise.
- The staging FTP account should itself be scoped by Beget to the new
  subdomain's home directory only (see Owner action above), giving a
  second, host-level layer of the same guarantee.
- `.htpasswd` content is generated locally via `v14-htpasswd.mjs` and
  never written to disk or git; only the resulting hash line is meant to
  be pasted directly onto the server.
- Acceptance logs and htpasswd hashes are written only to the local
  `reports/` directory, which should stay gitignored and is never pushed
  by any script in this change.
