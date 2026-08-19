# V14 - Isolated Staging Preview Deploy (AEROVENTA.RU)

Status: CORRECTION 2 applied (runtime-consistency fixes, found by GPT-5.6
Sol reading the actual committed file bodies). Gate: V14 STAGING PREVIEW
DEPLOY (Owner-authorized). V13 remains closed and untouched.

## What changed in Correction 2 (8 confirmed runtime defects closed)

1. **Duplicate build / cleared-env crash fixed.** The runner previously
   built once itself, cleared `DIRECTUS_URL`/`DIRECTUS_STATIC_TOKEN`, then
   called the deploy script - which also builds and requires those same
   env vars, guaranteeing failure. The runner **no longer pre-builds**. It
   only decrypts/sets the Directus env, hard-preflights it, prompts
   credentials, and calls `v14-stage-deploy.mjs` exactly once; that script
   is now the single place the V13 build + postbuild run. The token stays
   set through the acceptance step (so acceptance can assert its exact
   value is absent from served bodies) and is cleared in one outer
   `finally` in the runner, alongside every other secret.
2. **Directus preflight is now a hard gate on both checks.** Content read
   uses `GET /items/content?limit=1` and must return exactly `200`
   (previously non-200 was logged and ignored); `/users` must return `401`
   or `403` (unchanged, already hard). The status-code helper
   (`Get-HttpStatusCode`) uses plain try/catch against
   `Invoke-WebRequest`'s thrown exception, which works on both Windows
   PowerShell 5.1 and PowerShell 7+ - it no longer depends on
   `-SkipHttpErrorCheck`, which is a PowerShell-7-only parameter that would
   error out on the Owner's default Windows PowerShell 5.1.
3. **Indexed PDF confirmed as the 30th HTTP-200 contract entry.**
   `route-contract.json`'s 30 `200` entries are 29 HTML routes + the
   indexed PDF (`/upload/medialibrary/fa1/fa1b840c9474c6030bf2ccb0c725c3e4.pdf`).
   The acceptance script now locates the contract entry whose `path`
   equals `indexedPdf.path`, hard-asserts exactly 29 entries remain, and
   applies HTML-only checks (canonical/meta-robots/banner/JSON-LD/token
   scan) only to those 29 - the PDF entry gets only the binary-identity
   check (status 200 + exact byte length + exact SHA-256).
4. **Redirect target comparison fixed.** `route-contract.json` stores
   relative targets (e.g. `/almaznoe-burenie/`), but the generated hosting
   rules issue absolute redirects to `https://aeroventa.ru/...`. The
   acceptance script now requires
   `Location === canonicalOrigin + route.target` for every 301, not
   `route.target` alone.
5. **Apache path vs. FTP path split.** `authUserFileAbsolutePath` (used
   inside the generated `.htaccess`'s `AuthUserFile` directive - an Apache
   filesystem path) and `authUserFileFtpPath` (the path `basic-ftp`
   actually uploads to, as seen from inside the staging-scoped FTP
   account) are now two distinct required config fields. The deploy script
   uses each for its correct purpose and never conflates them.
6. **Pre-upload safety listing now fails closed.** `client.list(...)` is
   no longer wrapped in `.catch(() => [])`; any failure to list the remote
   root **aborts the whole deploy** rather than silently treating an
   unreadable directory as "empty and therefore safe." `stagingHostname`
   is now also hard-required to literally equal `staging.aeroventa.ru`.
7. **Temp auth files no longer leak into the repo.** The merged
   `.htaccess` and the generated `.htpasswd` line are now written to the
   OS temp directory (`os.tmpdir()`) with a randomized filename, and are
   deleted in a `finally` block on both success and failure. No raw Basic
   Auth or FTP password is ever written to disk - only the generated
   htpasswd hash line, and only transiently.
8. **Dependency preflight moved before any credential prompt.** The
   runner (and, independently, the deploy script if invoked directly)
   checks whether `basic-ftp` is resolvable, installs it locally with
   `npm install --no-save --package-lock=false --no-audit --no-fund
   basic-ftp` if missing, and hard-fails **before** prompting for any
   secret if it still cannot be resolved after the install attempt.
   `package.json`/`package-lock.json` are never modified.

## Changed files (this commit)

| File | Change |
|---|---|
| `scripts/v14-stage-config.example.json` | split `authUserFileAbsolutePath` / `authUserFileFtpPath` |
| `scripts/v14-stage-deploy.mjs` | single build/postbuild owner, fail-closed listing, temp-file cleanup, dependency preflight, split auth-path fields |
| `scripts/v14-external-acceptance.mjs` | PDF/HTML split (29 vs 30), absolute redirect target comparison |
| `scripts/v14-staging-runner.ps1` | no pre-build, hard content preflight via PS5.1-safe helper, dependency preflight before credential prompt, single outer secret-clearing `finally` |
| `docs/V14_STAGING_DEPLOY_RUNBOOK.md` | this file, rewritten |

`scripts/v14-verify-head.mjs` and `scripts/v14-htpasswd.mjs` are
unchanged from Correction 1 (no defect touched them). No `package.json`
change. No `build-directus-v13-preview.mjs`, `postbuild.mjs`, or
`validate-built-site.mjs` change. V13 not reopened.

## One-click sequence (now structurally consistent end to end)

1. Require `main` + clean tree; `git fetch origin main`; fast-forward
   only; record the exact resulting HEAD.
2. Require local config with no `REPLACE` placeholders.
3. Ensure `basic-ftp` resolvable (install if needed) - before any
   credential prompt.
4. Decrypt the existing DPAPI Build Reader token in memory.
5. Hard preflight: `/items/content?limit=1` = 200; `/users` = 401/403.
6. Prompt locally for Basic Auth + FTP(S) credentials (hidden input).
7. Call the deploy script once: it runs the ONE V13 preview build, the
   ONE postbuild, the fail-closed pre-upload safety listing, generates
   Basic Auth, and uploads over FTPS.
8. Call the acceptance script: unauthenticated 401; 29 HTML routes get
   the full HTML preview matrix; the indexed PDF gets binary-identity
   checks only; 13 redirects checked against the exact absolute
   production Location; 54 Gone routes checked; the 1 contract 404
   checked; a random unknown path checked for branded 404 + noindex;
   `robots.txt` checked; 8 preserved-media entries checked for exact
   bytes/SHA-256; production checked for 200/no-banner/no-Basic-Auth.
9. Temp auth files deleted. All secrets cleared in one outer `finally`.

No claim of a real Beget staging PASS is made without an actual execution
against real infrastructure - this commit is a structural/code
correction only.

## Owner action still required (unchanged, still not requested yet)

The Owner is **not** being asked to create the Beget staging site in this
correction. That remains the same one action documented previously:
confirm/create the isolated staging site + scoped FTP account in the
Beget panel, then fill in `scripts/v14-stage-config.local.json` (now
including both `authUserFileAbsolutePath` and `authUserFileFtpPath`) and
set `ftpAccountScopedToStagingOnly: true` only once that scoping is
visually confirmed.

## Security boundaries (unchanged, reaffirmed)

- No secrets requested in chat at any point.
- No new Directus credential created; the existing Build Reader token is
  reused, decrypted locally, and cleared in one outer `finally`.
- Real deploy is impossible without a filled-in local config with no
  placeholder text and an explicit human attestation of FTP scoping.
- A live, fail-closed pre-upload directory listing independently defends
  against a misconfigured FTP scope.
- Upload transport is FTPS (explicit TLS), not plaintext FTP.
- Temporary auth artifacts live only in the OS temp directory for the
  duration of the upload and are always deleted afterward.
