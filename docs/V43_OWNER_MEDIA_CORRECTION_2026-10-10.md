# V43 exact owner image assignment — 10 October 2026
Owner supplied exact same two copies of the home interior image (SHA256 `56704487b748269038168c1cb64f74b4415054e61a2e73b3e9a6f2eb002f83ee`, original 1774×887 PNG) and the PONSSE originals (Ponsse1 PNG 1481×2048 SHA256 `67287d0c52b42391a9e4e8ff105b779093b64b3cf5e2ddb3897218f69848f886`; signer portrait JPEG 533×800 SHA256 `73376f20193c18e4d99ba148df98ae21ec69988f5e372db72edc295a3b964d95`).
- `/services/`: existing `/evidence/hero/engineering-ductwork.jpg`. **SOURCE BINDING IMPLEMENTED.**
- `/montazh-ventiliacii/`: existing dimensional engineering `/evidence/hero/hiend-engineering-visual-owner-v43.webp`. **SOURCE BINDING IMPLEMENTED.**
- `/`: exact owner interior original must be stored as `apps/web/public/evidence/hero/owner-luxury-airflow-20261010.png`. **PENDING ORIGINAL BINARY IN GITHUB**; code automatically uses the approved image once present, otherwise preserves previous fallback; no false QA claim.
- PONSSE letter `apps/web/public/evidence/karelia/ponsse-letter-20220405.png`. **PENDING ORIGINAL BINARY IN GITHUB**; lightbox and full-resolution view implemented, shown only with original file available.
- PONSSE portrait `apps/web/public/evidence/karelia/p-teittinen-original.jpg`. **PENDING ORIGINAL BINARY IN GITHUB**; editorial signer image rendered only when original exists; rights must be checked before public release.
- 7 PARK case proof and exact SEO paths unchanged. No staging / production / DNS / Directus / merge.
- Tool boundary: GitHub `create_tree` and `create_blob` accept text/base64 parameters only and cannot consume local `/mnt/data` binary files; Python container has no network credentials or DNS access. A self-contained exact-byte transfer package is preserved as a recovery/output artifact.
