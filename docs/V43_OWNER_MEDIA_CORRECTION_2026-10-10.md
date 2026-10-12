# V43 exact owner image assignment — 10 October 2026

> **2026-10-12 Owner confirmation — CURRENT, supersedes 10 October authorship uncertainty.** Every AEROVENTA photograph discussed here was taken personally by the Owner; some files were re-downloaded from websites to which the Owner originally uploaded them after phone originals were removed. This is Owner-authored photography, not third-party stock. Do not repeat authorship-rights demands or add extra team-photo publication switches merely for copyright. The mistaken gate was reverted in f1ba032d2a42a11d64c9ce1e9c29ce0cfc3896b6. Identifiable third-party people's separate consent, if applicable, is not an authorship issue.

> **Previous PENDING BINARY labels are historical.** Current PR #10 Git tree contains apps/web/public/evidence/hero/owner-luxury-airflow-20261010.png, apps/web/public/evidence/karelia/ponsse-letter-20220405.png and apps/web/public/evidence/karelia/p-teittinen-original.jpg. Read live HEAD to confirm current status; Git file presence is not staging/production proof.

Owner supplied exact same two copies of the home interior image (SHA256 `56704487b748269038168c1cb64f74b4415054e61a2e73b3e9a6f2eb002f83ee`, original 1774×887 PNG) and the PONSSE originals (Ponsse1 PNG 1481×2048 SHA256 `67287d0c52b42391a9e4e8ff105b779093b64b3cf5e2ddb3897218f69848f886`; signer portrait JPEG 533×800 SHA256 `73376f20193c18e4d99ba148df98ae21ec69988f5e372db72edc295a3b964d95`).
- `/services/`: existing `/evidence/hero/engineering-ductwork.jpg`. **SOURCE BINDING IMPLEMENTED.**
- `/montazh-ventiliacii/`: existing dimensional engineering `/evidence/hero/hiend-engineering-visual-owner-v43.webp`. **SOURCE BINDING IMPLEMENTED.**
- `/`: exact owner interior original must be stored as `apps/web/public/evidence/hero/owner-luxury-airflow-20261010.png`. **PENDING ORIGINAL BINARY IN GITHUB**; code automatically uses the approved image once present, otherwise preserves previous fallback; no false QA claim.
- PONSSE letter `apps/web/public/evidence/karelia/ponsse-letter-20220405.png`. **PENDING ORIGINAL BINARY IN GITHUB**; lightbox and full-resolution view implemented, shown only with original file available.
- PONSSE portrait `apps/web/public/evidence/karelia/p-teittinen-original.jpg`. **PENDING ORIGINAL BINARY IN GITHUB**; editorial signer image rendered only when original exists; rights must be checked before public release.
- 7 PARK case proof and exact SEO paths unchanged. No staging / production / DNS / Directus / merge.
- Tool boundary: GitHub `create_tree` and `create_blob` accept text/base64 parameters only and cannot consume local `/mnt/data` binary files; Python container has no network credentials or DNS access. A self-contained exact-byte transfer package is preserved as a recovery/output artifact.
