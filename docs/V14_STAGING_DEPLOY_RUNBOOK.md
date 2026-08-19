# V14 - Isolated Staging Preview Deploy (AEROVENTA.RU)

Status: HARDENED CORRECTION applied. Gate: V14 STAGING PREVIEW DEPLOY (Owner-authorized).
V13 remains closed and untouched. This gate only adds/hardens new files; no
existing pipeline file (`build-directus-v13-preview.mjs`, `postbuild.mjs`,
`validate-built-site.mjs`) was modified.

## What changed in this correction (9 defects closed)

1. **Credential reuse, not creation.** The runner decrypts the existing
   Windows-DPAPI-encrypted Build Reader token
   (`build-reader.dpapi`, path supplied via config) and exports
   `DIRECTUS_URL=https://cms.aeroventa.ru` + `DIRECTUS_STATIC_TOKEN` for the
   build child-process only, clearing both in a `finally` block. It
   optionally preflights the token: content read expected `200`, `/users`
   expected `401`/`403`. No new Directus credential is ever created.
2. **No frozen SHA.** `v14-verify-head.mjs` no longer compares against a
   baked-in commit. The runner requires branch `main` + a clean tracked
   worktree, runs `git fetch origin main`, fast-forwards only if the local
   HEAD is an ancestor of `origin/main`, and fails closed on divergence.
   The resulting HEAD (whatever it is) is what gets built.
3. **Exact contract schema.** `v14-external-acceptance.mjs` now reads
   `migration/route-contract.json` as an array of
   `{ path, target, http_outcome }` and hard-fails unless counts are
   exactly `200=30, 301=13, 404=1, 410=54`, before any HTTP call is made.
4. **Full authenticated acceptance matrix**, per confirmed schema:
   unauthenticated staging -> 401; the 30 `200` routes (29 retained HTML
   pages among them) -> 200 + canonical `https://aeroventa.ru<path>` +
   `noindex,nofollow,noarchive,nosnippet` + `AEROVENTA DRAFT PREVIEW` +
   JSON-LD absent + exact `DIRECTUS_STATIC_TOKEN` value absent; the 13
   `301` routes -> exact `Location` match; the 54 `410` routes -> 410; the
   1 contract `404` -> 404; a random unknown path -> 404 + branded/noindex
   sanity; `robots.txt: Disallow: /`; the 8 preserved-media entries and the
   1 indexed PDF (`/upload/medialibrary/fa1/fa1b840c9474c6030bf2ccb0c725c3e4.pdf`)
   -> 200 + exact byte length + exact SHA-256; production `aeroventa.ru`
   -> 200, no preview banner, no Basic Auth challenge header.
5. **Fully automated Basic Auth.** The runner prompts locally (hidden
   input) for a Basic Auth username/password and an FTP(S) login/password.
   The deploy script generates the Apache `{SHA}` htpasswd line in memory
   (`v14-htpasswd.mjs`'s exported `generateHtpasswdLine`), uploads it to
   the configured absolute `authUserFileAbsolutePath` (outside
   `public_html`), and uploads a merged `.htaccess` (Basic Auth directives
   prepended to the existing built redirect/410 rules from
   `apps/web/dist/.htaccess`) to the remote root. No manual paste step.
6. **Explicit FTPS**, not plaintext FTP: `basic-ftp` is called with
   `secure: true` (AUTH TLS) on port 21.
7. **`.gitignore` handled via nested files**, not by editing the
   unreadable root `.gitignore` (see "Known limitation" below):
   `scripts/.gitignore` ignores `v14-stage-config.local.json`;
   `reports/.gitignore` ignores everything in `reports/` except itself.
   Functionally identical to adding those two lines to the root file,
   without risking an overwrite of unknown existing root rules.
8. **Hardened staging-target guard**, replacing the old naive substring
   check: requires `https://`, requires the host to equal the configured
   `stagingHostname` exactly, rejects `aeroventa.ru`/`www.aeroventa.ru`
   explicitly, requires staging URL != production URL, requires
   `remoteRoot != "/"`, requires an explicit operator attestation
   `ftpAccountScopedToStagingOnly: true` in the local config, and - the
   part that actually defends against a misconfigured FTP scope even if
   every string above looks right - lists the remote root over the live
   FTPS connection before uploading and **aborts hard** if `bitrix/`,
   `local/`, or `urlrewrite.php` are present there.
9. **Real deploy hard-fails** unless `scripts/v14-stage-config.local.json`
   exists and contains no literal `REPLACE` text anywhere in the file. The
   `.example` config is never used as a fallback for a real deploy (it is
   still used by the acceptance script purely for read-only URL defaults
   when no local config exists, e.g. to preview what a report would look
   like - never for credentials or upload targets).

## Changed files (this commit)

| File | Change |
|---|---|
| `scripts/.gitignore` | new - ignores `v14-stage-config.local.json` |
| `reports/.gitignore` | new - ignores everything in `reports/` except itself |
| `scripts/v14-stage-config.example.json` | updated - Directus/DPAPI/FTPS/AuthUserFile/scoping fields added |
| `scripts/v14-verify-head.mjs` | rewritten - branch+clean-tree check, no frozen SHA |
| `scripts/v14-htpasswd.mjs` | rewritten - exports `generateHtpasswdLine` for automated use, CLI mode unchanged for manual preview |
| `scripts/v14-stage-deploy.mjs` | rewritten - DPAPI-sourced env, FTPS, automated htpasswd/.htaccess upload, hardened guard + pre-upload listing check, strict local-config requirement |
| `scripts/v14-external-acceptance.mjs` | rewritten - exact contract schema/counts, full authenticated matrix, byte/sha256 checks |
| `scripts/v14-staging-runner.ps1` | rewritten - git fetch/ff-pull instead of frozen SHA, DPAPI decrypt with preflight, prompts for Basic Auth + FTP creds, clears all secrets in `finally` |
| `docs/V14_STAGING_DEPLOY_RUNBOOK.md` | this file, rewritten |

No `package.json` change. No `build-directus-v13-preview.mjs`,
`postbuild.mjs`, or `validate-built-site.mjs` change.

## Known limitation (carried over, still accurate)

This session's GitHub connector file-read tool still returns only a
"successfully downloaded" confirmation for text files (no inline body),
and generic URL fetches against `github.com` / `raw.githubusercontent.com`
/ `cdn.jsdelivr.net` for this repo still fail. This is why the root
`.gitignore` was left untouched and nested `.gitignore` files were used
instead (see defect #7 above) - editing the root file blind risked
destroying existing unread rules. All schema facts used in this
correction (route-contract fields/counts, preserved-media fields/count,
indexed-pdf identity, DPAPI path, Directus URL) were supplied directly by
the orchestrator as confirmed facts, not re-derived from a file read.

## Owner action still required after GPT-5.6 Sol verification

WHERE -> Beget control panel: `cp.beget.com/domains` and `cp.beget.com/ftp`

EXACT ACTION -> Confirm/create the isolated staging site + an FTP account
whose home directory is scoped to that site only, then fill in
`scripts/v14-stage-config.local.json` (copied from the `.example` file)
with: `ftpHost`, `remoteRoot` (as seen from inside that scoped FTP
account - typically `/public_html`), `authUserFileAbsolutePath` (the full
path outside `public_html`, visible in the Beget Sites panel), and set
`ftpAccountScopedToStagingOnly: true` only once that scoping is verified
in the panel.

EXPECTED RESULT -> A config file the deploy script will accept (no
`REPLACE` placeholders) and a guard (`ftpAccountScopedToStagingOnly`)
that is only ever set to `true` after a human has actually looked at the
Beget panel and confirmed the FTP account's scope - this script cannot
verify that fact remotely, so it structurally requires the operator to
attest to it.

WHAT TO RETURN -> Confirmation that `v14-stage-config.local.json` is
filled in and that the FTP account's home directory was visually
confirmed scoped to the staging site in the Beget panel. No password is
ever returned in chat; it is entered only when the PS1 runner prompts.

## Deploy / acceptance flow

1. `./scripts/v14-staging-runner.ps1`
2. Runner requires `main` + clean tree, fetches + fast-forwards origin/main.
3. Runner decrypts the existing DPAPI Build Reader token, exports it for
   the build step only, preflights it, clears it after the build+postbuild
   steps complete.
4. Runner prompts for Basic Auth + FTP(S) credentials (hidden input).
5. Deploy script re-validates the staging-target guard independently,
   lists the remote root and aborts on any Bitrix marker, then uploads
   over FTPS, plus the generated htpasswd + merged `.htaccess`.
6. Runner runs the acceptance script: exact contract-count validation,
   then the full authenticated/unauthenticated/byte/sha256 matrix,
   writing one local `reports/` log (gitignored).
7. All secrets are cleared from the process environment in `finally`
   blocks regardless of success or failure.

## Security boundaries

- No secrets requested in chat at any point.
- No new Directus credential created; the existing Build Reader token is
  reused, decrypted locally, and never leaves the local process memory.
- Real deploy is impossible without a filled-in local config containing
  no placeholder text, and without an explicit human attestation that the
  FTP account is scope-isolated.
- A live pre-upload directory listing check independently defends against
  a misconfigured FTP scope, regardless of what the config claims.
- Upload transport is FTPS (explicit TLS), not plaintext FTP.
- `.htpasswd` is generated and uploaded automatically; the plaintext
  password only ever exists in the runner's process memory for the
  duration of the run.
