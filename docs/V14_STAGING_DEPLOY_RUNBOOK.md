# V14 - Isolated Staging Preview Deploy (AEROVENTA.RU)

Status: CORRECTION 3 applied, following a REAL staging run (build + FTPS
upload + external acceptance PASS 273/275). Gate: V14 STAGING PREVIEW
DEPLOY (Owner-authorized). V13 remains closed and untouched.

## What changed in Correction 3

1. **Duplicate postbuild closed (KNOWN FACT A).** `apps/web`'s own build
   script already chains `astro build && node ../../scripts/postbuild.mjs`,
   and `scripts/build-directus-v13-preview.mjs` drives that same npm
   workspace build - so postbuild already ran exactly once as part of the
   single build step. `scripts/v14-stage-deploy.mjs` previously ALSO
   invoked `scripts/postbuild.mjs` explicitly afterward. Real logs from
   an actual run showed this second, redundant postbuild executing with
   `release_mode=fixture` (a stale/wrong context) after the real
   `release_mode=preview` postbuild had already run correctly inside the
   build step. The explicit second call has been removed. The pipeline is
   now genuinely ONE Astro build + ONE postbuild.
2. **404 sanity check strengthened, not weakened (KNOWN FACT C).** The
   "random unknown path" acceptance check previously accepted
   `banner OR noindex`. It now requires the actual intended contract:
   the branded Astro 404 page carries BOTH the `AEROVENTA DRAFT PREVIEW`
   banner AND the full `noindex,nofollow,noarchive,nosnippet` directive
   set - matching the same bar already applied to the 29 HTML 200 routes.
   This correctly continues to FAIL while the underlying hosting-rule
   `ErrorDocument` mismatch (see Known Limitation below) is unresolved.
3. **Production fetch made more diagnosable, not weaker (KNOWN FACT D).**
   `fetchRaw()` now retries once after a short delay before reporting
   failure, and surfaces Node's underlying `err.cause` (e.g. a TLS/DNS/
   connection error code) in the failure detail. The production-
   separation check remains a hard gate; the run still fails if
   production is genuinely unreachable from the acceptance process. The
   observed `fetch failed` in the prior run is NOT evidence production is
   down (the site is separately confirmed reachable) - it indicates a
   Node-process-local network condition that needs a runtime recheck with
   the improved diagnostics to root-cause further.

## KNOWN FACT B - NOT fixed in this commit (explicit blocker)

The branded-404 body mismatch (`ErrorDocument 404 /404/` in the generated
hosting rules vs. the actual built file `apps/web/dist/404.html`) requires
editing `scripts/generate-hosting-rules.mjs` (the source generator) and
regenerating `migration/hosting-rules.generated.conf`. This session's
GitHub file-read tooling could not return the current body of either
file (same connector limitation documented in every prior V14 commit:
`get_file_contents` returns a bare confirmation with no inline text, and
generic fetches against `github.com` / `raw.githubusercontent.com` fail).
Editing a V13-adjacent generator/config file without seeing its current
exact content risks corrupting already-closed, working hosting rules -
which this bounded correction is not authorized to risk. This defect is
therefore left as a hard, correctly-failing acceptance check rather than
patched blind. It needs either a session/tool with working raw file read,
or the current content of those two files supplied directly, to produce
a precise, minimal patch (most likely: change the `ErrorDocument 404`
target from `/404/` to `/404.html` to match the real Astro output path,
or alternatively adjust Astro's trailing-slash output so `/404/index.html`
exists - the correct choice depends on seeing the actual generator logic
and how other routes' trailing slashes are handled).

`apps/web/public/.htaccess` was verified via a fresh directory listing to
NOT be a tracked file (only `robots.txt` and `upload/` exist there) - the
earlier expectation of a fourth tracked diff in that path was incorrect
and is not repeated here.

## Changed files (this commit)

| File | Change |
|---|---|
| `scripts/v14-stage-deploy.mjs` | removed the duplicate explicit postbuild step; build step now documented as the single source of the one postbuild run |
| `scripts/v14-external-acceptance.mjs` | 404 sanity now requires banner AND full noindex set (was OR); `fetchRaw` retries once and surfaces `err.cause` diagnostics |
| `docs/V14_STAGING_DEPLOY_RUNBOOK.md` | this file, updated |

No other file touched. `scripts/generate-hosting-rules.mjs` and
`migration/hosting-rules.generated.conf` are explicitly NOT touched in
this commit (see Known Fact B above). `scripts/v14-staging-runner.ps1`,
`scripts/v14-verify-head.mjs`, `scripts/v14-htpasswd.mjs`,
`scripts/v14-stage-config.example.json` unchanged from Correction 2. No
`package.json` change. No V13 pipeline file change. V13 not reopened.
Directus credentials not created/rotated - the existing Build Reader
credential (now loaded correctly per the separate, already-landed DPAPI
text-credential fix) is reused as-is.

## Quality bar preserved

This correction does not touch any of the previously-passing 273 checks'
underlying logic: the 29 retained HTML routes, 13 exact 301s, 54 exact
410s, contract 404, indexed PDF identity, 8 preserved media identities,
staging Basic Auth, production canonicals, full preview robots meta,
visible draft banner, JSON-LD suppression, `robots.txt` disallow, token
non-leakage, and the staging-only FTP guard are all unchanged. Only the
duplicate-postbuild removal, the 404-sanity strengthening, and the fetch
diagnostics were touched.

## Owner one-shot recovery + re-run

The Owner's local worktree has uncommitted edits from an aborted patch
attempt in exactly three tracked files:
`migration/hosting-rules.generated.conf`, `scripts/generate-hosting-rules.mjs`,
`scripts/v14-stage-deploy.mjs`. None of that was committed or pushed.
Remote `main` (this commit) is authoritative. The Owner should discard
those three local edits, fast-forward to this new `main`, and re-run the
staging runner - see the copy-ready PowerShell block provided in the
final chat response.

## Security boundaries (unchanged, reaffirmed)

- No secrets requested in chat at any point.
- No new Directus credential created or rotated; the existing Build
  Reader credential is reused as-is.
- Real deploy is impossible without a filled-in local config with no
  placeholder text and an explicit human attestation of FTP scoping.
- A live, fail-closed pre-upload directory listing independently defends
  against a misconfigured FTP scope.
- Upload transport is FTPS (explicit TLS), not plaintext FTP.
- Temporary auth artifacts live only in the OS temp directory for the
  duration of the upload and are always deleted afterward.
