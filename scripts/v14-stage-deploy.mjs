#!/usr/bin/env node
/**
 * V14 - Isolated staging deploy for AEROVENTA.RU (correction 2).
 *
 * This script is the ONLY place the V13 build + postbuild are invoked for
 * a staging run (defect #1 fix). The runner must NOT pre-build; it only
 * decrypts/sets DIRECTUS_URL + DIRECTUS_STATIC_TOKEN, preflights them,
 * then calls this script once.
 *
 * Defects closed vs. correction 1:
 *  (1) Exactly one V13 build + one postbuild happen here, and only here.
 *  (5) authUserFileAbsolutePath (used inside the generated .htaccess,
 *      an Apache filesystem path) is now distinct from
 *      authUserFileFtpPath (the path basic-ftp actually uploads to, as
 *      seen from inside the scoped FTP account). They are never the
 *      same field anymore.
 *  (6) preUploadSafetyListing no longer swallows list() errors into an
 *      empty array - any failure to list the remote root is a HARD ABORT,
 *      and cfg.stagingHostname is required to literally equal
 *      "staging.aeroventa.ru".
 *  (7) Temporary auth files are written to the OS temp directory with a
 *      randomized name, and always deleted in a finally block regardless
 *      of upload success or failure. No raw password is ever written to
 *      disk (only the generated htpasswd hash line).
 *  (8) basic-ftp availability is verified/installed BEFORE any credential
 *      is required by this script's own preflight (mirrors the runner's
 *      pre-prompt check; this script re-checks independently so it is
 *      still safe if invoked directly).
 *
 * Required env vars for this run (set by the runner, cleared by the
 * runner's outer finally after acceptance completes - NOT by this script):
 *   DIRECTUS_URL, DIRECTUS_STATIC_TOKEN
 *   V14_FTP_LOGIN, V14_FTP_PASSWORD
 *   V14_BASIC_AUTH_USER, V14_BASIC_AUTH_PASSWORD
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateHtpasswdLine } from "./v14-htpasswd.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const REQUIRED_STAGING_HOSTNAME = "staging.aeroventa.ru";

function loadConfigStrict() {
  const localPath = path.join(repoRoot, "scripts", "v14-stage-config.local.json");
  if (!existsSync(localPath)) {
    throw new Error(
      "[v14-deploy] REFUSING: scripts/v14-stage-config.local.json does not exist. " +
      "Copy v14-stage-config.example.json to that filename and fill in real values. " +
      "This script never falls back to the example config for a real deploy."
    );
  }
  const raw = readFileSync(localPath, "utf8");
  if (/REPLACE/.test(raw)) {
    throw new Error(
      "[v14-deploy] REFUSING: v14-stage-config.local.json still contains a literal " +
      "\"REPLACE\" placeholder. Fill in every field with a real value before deploying."
    );
  }
  return JSON.parse(raw).staging;
}

function assertSafeTarget(cfg) {
  if (cfg.stagingHostname !== REQUIRED_STAGING_HOSTNAME) {
    throw new Error(
      "[v14-deploy] REFUSING: config.stagingHostname must be exactly \"" + REQUIRED_STAGING_HOSTNAME +
      "\", got \"" + cfg.stagingHostname + "\"."
    );
  }
  let url;
  try {
    url = new URL(cfg.acceptanceBaseUrl);
  } catch {
    throw new Error("[v14-deploy] REFUSING: acceptanceBaseUrl is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("[v14-deploy] REFUSING: acceptanceBaseUrl must be https.");
  }
  if (url.hostname !== cfg.stagingHostname) {
    throw new Error(
      "[v14-deploy] REFUSING: acceptanceBaseUrl host (" + url.hostname + ") != configured " +
      "stagingHostname (" + cfg.stagingHostname + ")."
    );
  }
  const forbidden = (cfg.forbiddenHostnames || []).map((h) => h.toLowerCase());
  if (forbidden.includes(url.hostname.toLowerCase()) ||
      url.hostname.toLowerCase() === "aeroventa.ru" ||
      url.hostname.toLowerCase() === "www.aeroventa.ru") {
    throw new Error("[v14-deploy] REFUSING: staging hostname is a forbidden production hostname.");
  }
  if (cfg.acceptanceBaseUrl === cfg.productionBaseUrl) {
    throw new Error("[v14-deploy] REFUSING: staging URL equals production URL.");
  }
  if (!cfg.remoteRoot || cfg.remoteRoot === "/") {
    throw new Error("[v14-deploy] REFUSING: remoteRoot is empty or \"/\".");
  }
  if (cfg.ftpAccountScopedToStagingOnly !== true) {
    throw new Error(
      "[v14-deploy] REFUSING: config.ftpAccountScopedToStagingOnly is not explicitly true. " +
      "This is the operator's attestation that the FTP account's home directory on Beget is " +
      "scoped to the staging site only. Set it to true only after confirming that in the Beget panel."
    );
  }
  if (!cfg.authUserFileAbsolutePath || !cfg.authUserFileFtpPath) {
    throw new Error(
      "[v14-deploy] REFUSING: both authUserFileAbsolutePath (used in .htaccess) and " +
      "authUserFileFtpPath (used for the FTP upload) must be set, and are intentionally distinct fields."
    );
  }
}

async function ensureBasicFtpAvailable() {
  try {
    await import("basic-ftp");
    return;
  } catch {
    console.warn("[v14-deploy] 'basic-ftp' not resolvable, attempting local install (not saved to package.json)...");
  }
  try {
    execFileSync(
      "npm",
      ["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", "basic-ftp"],
      { cwd: repoRoot, stdio: "inherit" }
    );
  } catch (err) {
    throw new Error("[v14-deploy] npm install of 'basic-ftp' failed: " + (err.message || err));
  }
  try {
    await import("basic-ftp");
  } catch {
    throw new Error("[v14-deploy] 'basic-ftp' still not resolvable after install attempt. Aborting before any upload.");
  }
}

async function preUploadSafetyListing(client, cfg) {
  const markers = cfg.productionMarkers || ["bitrix/", "local/", "urlrewrite.php"];
  let entries;
  try {
    entries = await client.list(cfg.remoteRoot);
  } catch (err) {
    throw new Error(
      "[v14-deploy] ABORTING: could not list remote root " + cfg.remoteRoot + " (" + (err.message || err) + "). " +
      "A failed listing is treated as unsafe by design - refusing to upload without positive proof the " +
      "directory is clear of production markers."
    );
  }
  const names = entries.map((e) => e.name.toLowerCase());
  for (const marker of markers) {
    const bare = marker.replace(/\/$/, "").toLowerCase();
    if (names.includes(bare)) {
      throw new Error(
        "[v14-deploy] ABORTING: remote root " + cfg.remoteRoot + " already contains \"" + marker + "\", " +
        "which looks like a production Bitrix marker. Refusing to upload."
      );
    }
  }
}

function runStep(label, cmd, args) {
  console.log("\n[v14-deploy] STEP: " + label + " -> " + cmd + " " + args.join(" "));
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
  } catch (err) {
    throw new Error("[v14-deploy] STEP FAILED: " + label + " (exit " + (err.status ?? "?") + "). Aborting pipeline.");
  }
}

function buildMergedHtaccess(cfg) {
  const authBlock =
    "# --- V14 staging Basic Auth (generated) ---\n" +
    "AuthType Basic\n" +
    "AuthName \"" + cfg.basicAuthRealm + "\"\n" +
    "AuthUserFile \"" + cfg.authUserFileAbsolutePath + "\"\n" +
    "Require valid-user\n" +
    "# --- end V14 staging Basic Auth ---\n\n";

  const distHtaccessPath = path.join(repoRoot, cfg.localDistDir, ".htaccess");
  const existing = existsSync(distHtaccessPath) ? readFileSync(distHtaccessPath, "utf8") : "";
  return authBlock + existing;
}

async function uploadDist(cfg) {
  const ftpLogin = process.env.V14_FTP_LOGIN;
  const ftpPassword = process.env.V14_FTP_PASSWORD;
  const basicUser = process.env.V14_BASIC_AUTH_USER;
  const basicPassword = process.env.V14_BASIC_AUTH_PASSWORD;

  if (!ftpLogin || !ftpPassword) {
    throw new Error("[v14-deploy] Missing V14_FTP_LOGIN / V14_FTP_PASSWORD env vars.");
  }
  if (!basicUser || !basicPassword) {
    throw new Error("[v14-deploy] Missing V14_BASIC_AUTH_USER / V14_BASIC_AUTH_PASSWORD env vars.");
  }

  const htpasswdLine = generateHtpasswdLine(basicUser, basicPassword);
  const mergedHtaccess = buildMergedHtaccess(cfg);

  const ftpMod = await import("basic-ftp");

  const distDir = path.join(repoRoot, cfg.localDistDir);
  if (!existsSync(distDir)) {
    throw new Error("[v14-deploy] Local dist dir not found: " + distDir + ". Did the build step run?");
  }

  const tmpSuffix = randomBytes(8).toString("hex");
  const tmpHtaccess = path.join(os.tmpdir(), "v14-htaccess-" + tmpSuffix);
  const tmpHtpasswd = path.join(os.tmpdir(), "v14-htpasswd-" + tmpSuffix);

  const client = new ftpMod.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: cfg.ftpHost,
      port: cfg.ftpPort || 21,
      user: ftpLogin,
      password: ftpPassword,
      secure: true, // explicit FTPS (AUTH TLS), not plaintext FTP
    });

    await preUploadSafetyListing(client, cfg);

    console.log("[v14-deploy] Ensuring remote dir: " + cfg.remoteRoot);
    await client.ensureDir(cfg.remoteRoot);
    console.log("[v14-deploy] Uploading " + distDir + " -> " + cfg.remoteRoot + " (additive mirror)");
    await client.uploadFromDir(distDir, cfg.remoteRoot);

    console.log("[v14-deploy] Uploading merged staging .htaccess (auth + existing redirect/410 rules)");
    writeFileSync(tmpHtaccess, mergedHtaccess, "utf8");
    await client.uploadFrom(tmpHtaccess, path.posix.join(cfg.remoteRoot, ".htaccess"));

    console.log("[v14-deploy] Uploading htpasswd via FTP path: " + cfg.authUserFileFtpPath);
    writeFileSync(tmpHtpasswd, htpasswdLine + "\n", "utf8");
    await client.uploadFrom(tmpHtpasswd, cfg.authUserFileFtpPath);

    console.log("[v14-deploy] Upload complete.");
  } finally {
    client.close();
    for (const f of [tmpHtaccess, tmpHtpasswd]) {
      try { if (existsSync(f)) unlinkSync(f); } catch { /* best-effort cleanup */ }
    }
  }
}

async function main() {
  const cfg = loadConfigStrict();
  assertSafeTarget(cfg);
  await ensureBasicFtpAvailable();

  if (!process.env.DIRECTUS_URL || !process.env.DIRECTUS_STATIC_TOKEN) {
    throw new Error(
      "[v14-deploy] Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN in environment. " +
      "The runner must decrypt the existing DPAPI Build Reader token and export both " +
      "before calling this script."
    );
  }

  runStep("Verify worktree/HEAD (branch=main, clean tree)", "node", ["scripts/v14-verify-head.mjs"]);
  runStep("Directus V13 preview build (reused pipeline, unmodified) - ONE build only", "node", ["scripts/build-directus-v13-preview.mjs"]);
  runStep("Postbuild (reused pipeline: writes robots Disallow:/ + runs validate-built-site internally) - ONE postbuild only", "node", ["scripts/postbuild.mjs"]);

  await uploadDist(cfg);

  console.log(
    "\n[v14-deploy] DONE. Remote target was strictly: " + cfg.remoteRoot + " on host " + cfg.ftpHost +
    "\n[v14-deploy] Production Bitrix root was never addressed by this script."
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
