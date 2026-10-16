# AEROVENTA PR #12 — exact user-supplied team media

Expected directory: `apps/web/public/evidence/team/`

Extracted byte-for-byte from `AEROVENTA_PR12_EXACT_FIVE_WEBP_2026-10-13(1).zip` on 2026-10-13. The original submitted archive includes `SHA256.txt`; all five archive members were independently rehashed and matched the manifest. No image transformations, face edits, or role reassignments.

Filename | SHA256
--- | ---
`owner-team-group-20261013.webp` | `f9474e25485aebfe753a05fd3dcc5c5689395b28ddd6938fa5159fc186872266`
`owner-evgeniy-panov-20261013.webp` | `94e2f478060147981f3fce3a9740c2439641cf30dbdaf64c5ee25d6565a0888b`
`owner-aleksandr-tarasov-20261013.webp` | `9215087532eef31a03f3af4bc35ef062855ab0a22ac003b5e5bd4fdbf29e2a4a`
`owner-denis-ivanov-20261013.webp` | `c72222ae1090d94955e2d6824a125f7adffd8bfead4e6d050903c369b2e93362`
`owner-aleksandr-shalamov-20261013.webp` | `c2057be1490d987b82b237c1f728093831e8afe87b2b634da22a8257a1a0817a`

Order and identity binding: Евгений Панов — Технический директор; Александр Тарасов — Операционный директор; Денис Иванов — Руководитель проектов; Александр Шаламов — Инженер-проектировщик. Group image is not a documentary claim about an actual completed facility.

**Current transport gate:** GitHub blob API takes base64 string; attachment is available as sandbox bytes but current connector layer has not yielded a string preserving original byte sequence. NO media binary is claimed committed until Git blob and tree readback match these exact digests. In fixture mode missing assets remain explicit fallback. To validate exact binaries for release: `AEROVENTA_REQUIRE_OWNER_TEAM_MEDIA=true npm run validate`.
