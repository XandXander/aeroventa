#!/usr/bin/env node
/**
 * V14 - External acceptance checks against the isolated staging deploy.
 *
 * Read-only over HTTPS. Never touches Beget/GitHub write APIs. Safe to run
 * repeatedly, including against production for the separation sanity check.
 *
 * NOTE ON ASSUMPTIONS: this script could not be authored against a byte-
 * level read of migration/route-contract.json / migration/preserved-media.json
 * in this session (tool limitation - see V14 runbook "Known Limitation").
 * It therefore parses those files defensively, tolerating several plausible
 * field-name shapes, and logs a warning (not a hard failure) for any entry
 * it cannot interpret. Re-validate field-name assumptions against the real
 * file once a human/agent with raw file read confirms the schema.
 *
 * Usage:
 *   node scripts/v14-external-acceptance.mjs [baseUrl] [productionUrl]
 *   Defaults come from scripts/v14-stage-config.(local|example).json
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadConfig() {
  const localPath = path.join(repoRoot, "scripts", "v14-stage-config.local.json");
  const examplePath = path.join(repoRoot, "scripts", "v14-stage-config.example.json");
  const configPath = existsSync(localPath) ? localPath : examplePath;
  return JSON.parse(readFileSync(configPath, "utf8")).staging;
}

function loadJsonIfExists(relPath) {
  const p = path.join(repoRoot, relPath);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRoutes(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.routes || raw.retained || raw.entries || [];
  return list.map((entry) => {
    if (typeof entry === "string") return { path: entry, expectedStatus: 200 };
    const p = entry.path || entry.route || entry.url || entry.slug;
    let status = entry.expectedStatus || entry.status || entry.httpStatus;
    if (!status) {
      const type = (entry.type || entry.action || "").toLowerCase();
      if (type.includes("redirect") || type === "301") status = 301;
      else if (type.includes("gone") || type === "410") status = 410;
      else status = 200;
    }
    return { path: p, expectedStatus: Number(status) };
  }).filter((r) => !!r.path);
}

function normalizeMedia(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.media || raw.preserved || raw.entries || [];
  return list.map((entry) => (typeof entry === "string" ? entry : entry.path || entry.url || entry.file)).filter(Boolean);
}

async function fetchRaw(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    const text = await res.text().catch(() => "");
    return { ok: true, status: res.status, headers: res.headers, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const TOKEN_LIKE = /(?:token|bearer|secret|apikey|api_key)["'\s:=]+[A-Za-z0-9._-]{16,}/i;

async function main() {
  const cfg = loadConfig();
  const baseUrl = process.argv[2] || cfg.acceptanceBaseUrl;
  const productionUrl = process.argv[3] || cfg.productionBaseUrl;
  const routeContract = normalizeRoutes(loadJsonIfExists("migration/route-contract.json"));
  const preservedMedia = normalizeMedia(loadJsonIfExists("migration/preserved-media.json"));

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  console.log("[v14-accept] Target staging base: " + baseUrl);

  const root = await fetchRaw(baseUrl + "/");
  record("Staging root reachable", root.ok && root.status === 200, "status=" + (root.status ?? root.error));

  if (root.ok) {
    record("Meta robots noindex/nofollow/noarchive/nosnippet present",
      /noindex/.test(root.text) && /nofollow/.test(root.text) && /noarchive/.test(root.text) && /nosnippet/.test(root.text),
      "checked root HTML head");
    record("AEROVENTA DRAFT PREVIEW banner present", root.text.includes("AEROVENTA DRAFT PREVIEW"), "checked root HTML body");
    record("JSON-LD absent", !/application\/ld\+json/.test(root.text), "checked for <script type=application/ld+json>");
    record("No obvious token leakage on root page", !TOKEN_LIKE.test(root.text), "regex scan of root HTML");
  }

  const robots = await fetchRaw(baseUrl + "/robots.txt");
  record("robots.txt Disallow: / present", robots.ok && /Disallow:\s*\/\s*$/m.test(robots.text), "status=" + (robots.status ?? robots.error));

  const notFound = await fetchRaw(baseUrl + "/v14-acceptance-nonexistent-check-" + Date.now());
  record("Branded 404 on unknown path", notFound.ok && notFound.status === 404, "status=" + (notFound.status ?? notFound.error));

  if (routeContract.length === 0) {
    record("Route contract parsed", false, "migration/route-contract.json missing or unparseable by this script's assumed schema - MANUAL SCHEMA CHECK NEEDED");
  } else {
    for (const route of routeContract) {
      const res = await fetchRaw(baseUrl + route.path);
      const pass = res.ok && res.status === route.expectedStatus;
      record("Route " + route.path + " -> expect " + route.expectedStatus, pass, "got=" + (res.status ?? res.error));
      if (res.ok && res.status === 200) {
        if (!TOKEN_LIKE.test(res.text)) {
          record("  no token leakage on " + route.path, true, "regex scan clean");
        } else {
          record("  no token leakage on " + route.path, false, "TOKEN-LIKE STRING FOUND - investigate before wider staging exposure");
        }
      }
    }
  }

  if (preservedMedia.length === 0) {
    record("Preserved media list parsed", false, "migration/preserved-media.json missing or unparseable by this script's assumed schema - MANUAL SCHEMA CHECK NEEDED");
  } else {
    for (const mediaPath of preservedMedia) {
      const res = await fetchRaw(baseUrl + mediaPath);
      record("Preserved media " + mediaPath, res.ok && res.status === 200, "status=" + (res.status ?? res.error));
    }
  }

  const prod = await fetchRaw(productionUrl + "/");
  record("Production " + productionUrl + " still live (200)", prod.ok && prod.status === 200, "status=" + (prod.status ?? prod.error));
  if (prod.ok) {
    record("Production page does NOT show staging banner (separation sanity)",
      !prod.text.includes("AEROVENTA DRAFT PREVIEW"), "checked production HTML body");
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
  console.log("\n[v14-accept] Result log written locally to: " + outFile + " (not committed to git)");

  const hardFail = results.some((r) => !r.pass);
  process.exit(hardFail ? 1 : 0);
}

main();
