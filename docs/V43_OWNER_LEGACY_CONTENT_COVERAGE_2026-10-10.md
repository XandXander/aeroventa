# V43 Owner legacy object and photograph coverage register — 2026-10-10

## Evidence boundaries
- Compared: `migration/route-contract.json`, `migration/legacy-page-source-index.json` (29 existing fetched HTML evidence rows), `migration/legacy-source-manifest.json`, original indexed old Bitrix site `/blog/istorii-proektov/` and old case pages, current PR #10 source `EvidenceCasePage.astro`, `PortfolioHubPage.astro`, `PracticeHubPage.astro`, media Git tree.
- Current legacy SEO contract unchanged: **29 retained HTML 200 + 1 PDF 200 + 13 exact 301 + 54 exact 410 + 8 exact preserved media paths**. 98 normalized candidates including 404 technical removal.
- This is a **known documented object inventory**, not a guarantee every photograph in the original Bitrix object galleries has been captured. Current `legacy-source-manifest.json` captures only nine exact assets (eight images plus one PDF); additional original gallery assets beyond checked-in `evidence/*` require source-to-photo completeness proof. All original filenames/rights must be reconciled before publication.
- User-provided `Ponsse1.png` (345267 bytes) and `P Teittinen.jpg` (222062 bytes) are visually inspectable in ChatGPT Library `/САЙТ`, but the Files API returned **no authorized raw-byte materialization path**, including by `libfile_*` canonical IDs. Consequently neither original asset is present in this PR and neither must be claimed deployed. Portrait identity/right to publish remain unverified.
- REV2 HERO library ZIP and desktop/mobile reference PNGs also have no available raw-byte bridge; preserve current on-site HERO as fallback until originals can be acquired by an authorized transport. No fabricated substitute.
- Directus production published/approved content, consent/privacy, owner image-rights, mail readback and actual production cutover remain separate gates.

## Exact historic object catalogue
| Object (old Bitrix case) | Exact retained new URL | Source facts independently located | On-site case media (verified repository path) | Remaining |
|---|---|---|---|---|
| 7 PARK · Павловск | `/blog/detail/kak-my-sdali-7-domov/` | 7 houses; 18.11.2020–10.12.2020; supply/exhaust installation | `/evidence/7park/object-exterior.jpg`, `/evidence/7park/duct-route.jpg`; homepage uses approved **different** `object-exterior-day.jpg` + `duct-route.jpg` | Preserve two approved homepage photos, no 196-apartment or direct-customer claim; full original gallery-to-file audit open |
| Ресторан в ЖК «Леонтьевский Мыс» | `/blog/detail/restoran-v-zhk-leontevskiy-mys/` | Restaurant, Ждановская 45; ventilation + equipment; historical source says two weeks/five people | `/evidence/leont/duct-installation-01.jpg`, `-02.jpg` | Full gallery-to-file and publication-rights audit open; not an office |
| НТФФ «Полисан» | `/blog/detail/ntff-polisan/` | Салова 72; ventilation + equipment; historical June 2017–June 2018 | `/evidence/polisan/duct-installation-01.jpg`, `-02.jpg` | Keep distinct from ХИМПРОМ СПб and Ростелеком; additional photos/roles must not be mixed |
| Квартира на Маршала Жукова | `/blog/detail/kvartira-na-zhukova/` | Ventilation and equipment; old source reports approx. 100 running metres, two people and five days | `/evidence/zhukov/duct-installation-01.jpg`, `-02.jpg` | Scope/time are historical source claims, not generic pricing promises |
| PONSSE · Питкяранта | `/blog/detail/montazh-ventilyatsii-v-karelii/` | Supply/exhaust ventilation and equipment at service-training centre; two weeks, three specialists per old source. Appreciation letter dated 05.04.2022 thanks AEROVENTA team for working relationship and keeping deadlines | `/evidence/karelia/object-exterior.jpg`, `/evidence/karelia/equipment.jpg` | **Ponsse1.png raw bytes not available**; full-size document viewer and rights-controlled optional portrait not yet implemented. Do not infer letter's author endorsed specific hidden HVAC specification |
| Кафе, пр. Римского-Корсакова, 3 | `/blog/detail/kafe-rimskogo-korsakova-3/` | Supply/exhaust ventilation + equipment, old source claims 200 m² and five days | `/evidence/cafe/duct-installation-01.jpg`, `-02.jpg` | Do not generalize old case area/speed to any client estimate |

## Additional site and independent-photo contexts
- `/portfolio/` and `/blog/istorii-proektov/` contain indexes of those six cases, not six new duplicate SEO URLs.
- Additional historical job photographs visible in old marketing/carousel/portfolio without a reliable object attribution **do not authorize** a new object page. Identify precise old URL + original media path + real role first.
- The historical old primary service page and old homepage contain unsupported generic completion volumes/client satisfaction and direct drilling claims: do not repeat as current facts.
- `ХИМПРОМ СПб`, `Полисан`, and `Ростелеком` are separate identities. The two former names are not grounds for another indexable route without verified specific object/source/path evidence.
- 7 PARK object gallery and homepage pairing must not be mixed or duplicated as unrelated cases.
- Source of true images retained in `apps/web/public/evidence`: six distinct case folders plus approved 7 PARK exteriors. All case gallery images need external primary-source rights review before production; code-level path existence alone is insufficient.

## 10 October independent audit reconciliation
- HOME: preserve real 7 PARK evidence separately; rejected hero caption and misleading decorative arrows removed in earlier PR gate.
- Engineering scene: text **raster-baked**, verified against actual asset. Do not draw a white gradient across the baked labels. Copy and native-aspect illustration are separated on desktop; two accessible readable HTML supply/exhaust labels added on narrow mobile.
- NAV/CTA: five top-level items and independent consultant launcher were implemented in earlier PR #10 gate; no false working-LLM claim.
- IMAGE PLACEMENT: existing `hiend-engineering-visual-owner-v43.webp` moved to `/services/`, removed from `/montazh-ventiliacii/`. Montage page now uses a separate existing ductwork image as **illustrative photography**, with attributable real-case galleries below. Original filenames remain intact.
- PONSSE: editorial Russian-language attribution/letter content added, but original scan and full-size viewer are open pending raw bytes.
- HI-END acceptance still **OPEN** pending Owner review of real compiled desktop/tablet/mobile renders, REV2 exact original, scan rights, and commercial/backend production gates.
