#!/usr/bin/env node
/**
 * V14 - External acceptance checks (correction 3).
 *
 * Fixes vs. correction 2, based on a real staging run (PASS 273/275):
 *  KNOWN FACT C CLOSED - the "random unknown path" sanity check
 *  previously accepted banner OR noindex. The intended safety contract
 *  is the actual branded Astro 404 page, which carries BOTH the
 *  "AEROVENTA DRAFT PREVIEW" banner AND the full
 *  noindex/nofollow/noarchive/nosnippet directive set. The check now
 *  requires both, matching the same bar already applied to the 29 HTML
 *  200 routes. This is a strengthening, not a weakening, of the gate.
 *  This check still correctly reports FAIL while the underlying hosting-
 *  rule ErrorDocument target mismatch (KNOWN FACT B, tracked separately -
 *  BLOCKED pending a session with working raw file read on
 *  scripts/generate-hosting-rules.mjs / migration/hosting-rules.generated.conf)
 *  remains unfixed; that is correct, intended behavior for a hard gate.
 *
 *  KNOWN FACT D - the production fetch failure ("fetch failed") got a
 *  bounded robustness improvement, not a weakening: fetchRaw now retries
 *  once after a short delay before reporting failure, and surfaces
 *  Node's underlying error `cause` (e.g. an ECONNRESET/ETIMEDOUT/TLS
 *  code) in the failure detail for diagnosis. The production-separation
 *  check is still a hard gate; a persistent failure still fails the run.
 *
 * Usage:
 *   node scripts/v14-external-acceptance.mjs
 *   Reads scripts/v14-stage-config.local.json plus
 *   V14_BASIC_AUTH_USER / V14_BASIC_AUTH_PASSWORD env vars, and
 *   (optionally) DIRECTUS_STATIC_TOKEN for the exact-absence check.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadConfig() {
  const localPath = path.join(repoRoot, "scripts", "v14-stage-config.local.json");
  const examplePath = path.join(repoRoot, "scripts", "v14-stage-config.example.json");
  const configPath = existsSync(localPath) ? localPath : examplePath;
  if (configPath === examplePath) {
    console.warn("[v14-accept] WARNING: no local config found, using EXAMPLE config for URL defaults only.");
  }
  return JSON.parse(readFileSync(configPath, "utf8")).staging;
}

function loadJsonRequired(relPath) {
  const p = path.join(repoRoot, relPath);
  if (!existsSync(p)) throw new Error("[v14-accept] REQUIRED FILE MISSING: " + relPath);
  return JSON.parse(readFileSync(p, "utf8"));
}

function assertExactCountsAndSplitPdf(routeContract, preservedMedia, indexedPdf) {
  const counts = { 200: 0, 301: 0, 404: 0, 410: 0 };
  for (const r of routeContract) {
    if (!(r.http_outcome in counts)) {
      throw new Error("[v14-accept] Unexpected http_outcome in route-contract.json: " + r.http_outcome);
    }
    counts[r.http_outcome]++;
  }
  const expected = { 200: 30, 301: 13, 404: 1, 410: 54 };
  for (const key of Object.keys(expected)) {
    if (counts[key] !== expected[key]) {
      throw new Error(
        "[v14-accept] route-contract.json count mismatch for http_outcome=" + key +
        ": expected " + expected[key] + ", got " + counts[key] + ". Contract has drifted - STOP."
      );
    }
  }
  if (preservedMedia.length !== 8) {
    throw new Error("[v14-accept] preserved-media.json count mismatch: expected 8, got " + preservedMedia.length);
  }
  if (Array.isArray(indexedPdf) || typeof indexedPdf !== "object" || indexedPdf === null) {
    throw new Error("[v14-accept] indexed-pdf.json must be a single object.");
  }

  const twoHundredEntries = routeContract.filter((r) => r.http_outcome === 200);
  const pdfEntry = twoHundredEntries.find((r) => r.path === indexedPdf.path);
  if (!pdfEntry) {
    throw new Error(
      "[v14-accept] Indexed PDF path " + indexedPdf.path + " was not found among the 30 HTTP-200 " +
      "route-contract entries - contract/identity mismatch, STOP."
    );
  }
  const htmlEntries = twoHundredEntries.filter((r) => r.path !== indexedPdf.path);
  if (htmlEntries.length !== 29) {
    throw new Error(
      "[v14-accept] After excluding the indexed PDF, expected exactly 29 HTML HTTP-200 entries, got " +
      htmlEntries.length + ". STOP."
    );
  }
  console.log("[v14-accept] Contract counts verified exactly: 200=30 (29 HTML + 1 PDF), 301=13, 404=1, 410=54, preserved-media=8.");
  return { htmlEntries, pdfEntry };
}

async function fetchRaw(url, opts = {}) {
  const maxAttempts = 2;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { redirect: "manual", ...opts });
      const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
      return { ok: true, status: res.status, headers: res.headers, buf, text: buf.toString("utf8") };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  const causeInfo = lastErr && lastErr.cause
    ? " cause=" + (lastErr.cause.code || lastErr.cause.message || String(lastErr.cause))
    : "";
  return { ok: false, error: (lastErr?.message || String(lastErr)) + causeInfo + " (after " + maxAttempts + " attempts)" };
}

function basicAuthHeader() {
  const user = process.env.V14_BASIC_AUTH_USER;
  const pass = process.env.V14_BASIC_AUTH_PASSWORD;
  if (!user || !pass) return null;
  return "Basic " + Buffer.from(user + ":" + pass, "utf8").toString("base64");
}

async function main() {
  const cfg = loadConfig();
  const baseUrl = cfg.acceptanceBaseUrl;
  const productionUrl = cfg.productionBaseUrl;
  const canonicalOrigin = cfg.canonicalOrigin || productionUrl;
  const tokenValue = process.env.DIRECTUS_STATIC_TOKEN || null;

  const routeContract = loadJsonRequired("migration/route-contract.json");
  const preservedMedia = loadJsonRequired("migration/preserved-media.json");
  const indexedPdf = loadJsonRequired("migration/indexed-pdf.json");

  const { htmlEntries, pdfEntry } = assertExactCountsAndSplitPdf(routeContract, preservedMedia, indexedPdf);

  const auth = basicAuthHeader();
  if (!auth) {
    throw new Error("[v14-accept] Missing V14_BASIC_AUTH_USER / V14_BASIC_AUTH_PASSWORD env vars for authenticated checks.");
  }

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  // 1. Unauthenticated staging must be 401
  const unauth = await fetchRaw(baseUrl + "/");
  record("Unauthenticated staging -> 401", unauth.ok && unauth.status === 401, "status=" + (unauth.status ?? unauth.error));

  // 2. The 29 HTML 200 routes
  for (const route of htmlEntries) {
    const res = await fetchRaw(baseUrl + route.path, { headers: { Authorization: auth } });
    const pass = res.ok && res.status === 200;
    record("200 HTML " + route.path, pass, "got=" + (res.status ?? res.error));
    if (pass) {
      const expectedCanonical = canonicalOrigin + route.path;
      const escaped = expectedCanonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const canonicalMatch = new RegExp('rel=["\']canonical["\'][^>]*href=["\']' + escaped + '["\']|href=["\']' + escaped + '["\'][^>]*rel=["\']canonical["\']').test(res.text);
      record("  canonical == " + expectedCanonical, canonicalMatch, canonicalMatch ? "found" : "NOT FOUND");
      const robotsOk = ["noindex", "nofollow", "noarchive", "nosnippet"].every((d) => res.text.includes(d));
      record("  meta robots full directive set", robotsOk, robotsOk ? "all 4 present" : "missing directive(s)");
      record("  AEROVENTA DRAFT PREVIEW banner", res.text.includes("AEROVENTA DRAFT PREVIEW"), "checked body");
      record("  JSON-LD absent", !/application\/ld\+json/.test(res.text), "checked head/body");
      if (tokenValue) {
        record("  exact token absent", !res.text.includes(tokenValue), "substring scan");
      }
    }
  }

  // 3. Indexed PDF - binary identity only, no HTML checks
  {
    const res = await fetchRaw(baseUrl + pdfEntry.path, { headers: { Authorization: auth } });
    const pass = res.ok && res.status === 200;
    record("Indexed PDF " + pdfEntry.path, pass, "status=" + (res.status ?? res.error));
    if (pass) {
      record("  exact bytes (PDF)", res.buf.length === indexedPdf.source_bytes, "got=" + res.buf.length + " expected=" + indexedPdf.source_bytes);
      const sha = createHash("sha256").update(res.buf).digest("hex");
      record("  exact sha256 (PDF)", sha === indexedPdf.source_sha256, sha === indexedPdf.source_sha256 ? "match" : "MISMATCH");
      if (tokenValue) {
        record("  exact token absent (PDF)", !res.buf.toString("latin1").includes(tokenValue), "substring scan");
      }
    }
  }

  // 4. Redirects - exact absolute production Location
  for (const route of routeContract.filter((r) => r.http_outcome === 301)) {
    const res = await fetchRaw(baseUrl + route.path, { headers: { Authorization: auth } });
    const expectedLocation = canonicalOrigin + route.target;
    const pass = res.ok && res.status === 301 && res.headers.get("location") === expectedLocation;
    record("301 " + route.path + " -> " + expectedLocation, pass, "status=" + (res.status ?? res.error) + " location=" + res.headers?.get?.("location"));
  }

  // 5. Gone
  for (const route of routeContract.filter((r) => r.http_outcome === 410)) {
    const res = await fetchRaw(baseUrl + route.path, { headers: { Authorization: auth } });
    record("410 " + route.path, res.ok && res.status === 410, "got=" + (res.status ?? res.error));
  }

  // 6. Contract 404
  for (const route of routeContract.filter((r) => r.http_outcome === 404)) {
    const res = await fetchRaw(baseUrl + route.path, { headers: { Authorization: auth } });
    record("404 (contract) " + route.path, res.ok && res.status === 404, "got=" + (res.status ?? res.error));
  }

  // 7. Random unknown path -> 404 + branded preview page (banner AND full noindex set)
  const unknown = await fetchRaw(baseUrl + "/v14-acceptance-unknown-" + Date.now(), { headers: { Authorization: auth } });
  record("Unknown path -> 404", unknown.ok && unknown.status === 404, "status=" + (unknown.status ?? unknown.error));
  if (unknown.ok) {
    const bannerPresent = unknown.text.includes("AEROVENTA DRAFT PREVIEW");
    const noindexAll = ["noindex", "nofollow", "noarchive", "nosnippet"].every((d) => unknown.text.includes(d));
    record(
      "  404 is the branded preview page (banner AND full noindex directive set)",
      bannerPresent && noindexAll,
      "banner=" + bannerPresent + " noindexAll=" + noindexAll
    );
  }

  // 8. robots.txt
  const robots = await fetchRaw(baseUrl + "/robots.txt", { headers: { Authorization: auth } });
  record("robots.txt Disallow: / present", robots.ok && /Disallow:\s*\/\s*$/m.test(robots.text), "status=" + (robots.status ?? robots.error));

  // 9. Preserved media - exact bytes + sha256
  for (const media of preservedMedia) {
    const res = await fetchRaw(baseUrl + media.path, { headers: { Authorization: auth } });
    const pass = res.ok && res.status === 200;
    record("Preserved media " + media.path, pass, "status=" + (res.status ?? res.error));
    if (pass) {
      record("  exact bytes " + media.path, res.buf.length === media.source_bytes, "got=" + res.buf.length + " expected=" + media.source_bytes);
      const sha = createHash("sha256").update(res.buf).digest("hex");
      record("  exact sha256 " + media.path, sha === media.source_sha256, sha === media.source_sha256 ? "match" : "MISMATCH");
    }
  }

  // 10. Production separation
  const prod = await fetchRaw(productionUrl + "/");
  record("Production " + productionUrl + " -> 200", prod.ok && prod.status === 200, "status=" + (prod.status ?? prod.error));
  if (prod.ok) {
    record("  no preview banner on production", !prod.text.includes("AEROVENTA DRAFT PREVIEW"), "checked body");
    record("  no Basic Auth challenge on production", !prod.headers.get("www-authenticate"), "checked headers");
  }

  const passCount = results.filter((r) => r.pass).length;
  const summary = "V14 EXTERNAL ACCEPTANCE - " + new Date().toISOString() + "\n" +
    "Staging: " + baseUrl + " | Production: " + productionUrl + "\n" +
    "PASS " + passCount + "/" + results.length + "\n\n" +
    results.map((r) => (r.pass ? "PASS" : "FAIL") + "  " + r.name + "  (" + r.detail + ")").join("\n");

  console.log("\n" + summary);

  const outDir = path.join(repoRoot, "reports");
  if (!existsSync(outDir)) mkdirSync(outDir);
  const outFile = path.join(outDir, "v14-acceptance-" + Date.now() + ".log");
  writeFileSync(outFile, summary, "utf8");
  console.log("\n[v14-accept] Result log written locally to: " + outFile + " (gitignored, not committed)");

  const hardFail = results.some((r) => !r.pass);
  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error("[v14-accept] FATAL: " + (err.message || err));
  process.exit(1);
});
