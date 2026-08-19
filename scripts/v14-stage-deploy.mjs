#!/usr/bin/env node
/**
 * V14 - Isolated staging deploy for AEROVENTA.RU (hardened correction).
 *
 * Defects closed vs. the first V14 draft:
 *  (1) Loads the existing Windows-DPAPI-encrypted Build Reader token
 *      (decrypted by the PowerShell runner, handed in here only via
 *      process.env.DIRECTUS_URL / DIRECTUS_STATIC_TOKEN for this run).
 *      This script never creates, requests, or persists a credential.
 *  (6) Uploads over explicit FTPS (basic-ftp secure:true), not plaintext FTP.
 *  (8) Staging-target guard is config-attested + host-verified + a live
 *      pre-upload directory-listing check that aborts if Bitrix production
 *      markers (bitrix/, local/, urlrewrite.php) are present at the
 *      remote root - independent of what the hostname string claims.
 *  (9) HARD FAILS unless scripts/v14-stage-config.local.json exists and
 *      contains no literal "REPLACE" placeholder text anywhere. The
 *      .example config is never used for a real deploy.
 *  (5) Basic Auth is fully automated: htpasswd hash generated in-memory
 *      from credentials supplied via env vars for this run only, uploaded
 *      to the configured absolute AuthUserFile path (outside public_html),
 *      and a merged .htaccess (auth directives + the existing built
 *      redirect/410 rules from apps/web/dist/.htaccess) is uploaded to
 *      the remote root. No manual paste step.
 *
 * Required env vars for this run (set by the runner, cleared after):
 *   DIRECTUS_URL, DIRECTUS_STATIC_TOKEN   - for the reused V13 build step
 *   V14_FTP_LOGIN, V14_FTP_PASSWORD       - staging FTP(S) credentials
 *   V14_BASIC_AUTH_USER, V14_BASIC_AUTH_PASSWORD - staging Basic Auth creds
 *
 * Requires the optional dependency "basic-ftp" (not added to package.json,
 * kept out of the committed manifest deliberately):
 *   npm install --no-save --package-lock=false --no-audit --no-fund basic-ftp
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateHtpasswdLine } from "./v14-htpasswd.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

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
  if (forbidden.includes(url.hostname.toLowerCase())) {
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
}

async function preUploadSafetyListing(client, cfg) {
  const markers = cfg.productionMarkers || ["bitrix/", "local/", "urlrewrite.php"];
  const entries = await client.list(cfg.remoteRoot).catch(() => []);
  const names = entries.map((e) => e.name.toLowerCase());
  for (const marker of markers) {
    const bare = marker.replace(/\/$/, "").toLowerCase();
    if (names.includes(bare)) {
      throw new Error(
        "[v14-deploy] ABORTING: remote root " + cfg.remoteRoot + " already contains \"" + marker + "\", " +
        "which looks like a production Bitrix marker. Refusing to upload - this FTP scope may not be " +
        "isolated to staging as configured."
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

  let ftpMod;
  try {
    ftpMod = await import("basic-ftp");
  } catch {
    throw new Error(
      "[v14-deploy] Optional dependency 'basic-ftp' is not installed. Run:\n" +
      "  npm install --no-save --package-lock=false --no-audit --no-fund basic-ftp"
    );
  }

  const distDir = path.join(repoRoot, cfg.localDistDir);
  if (!existsSync(distDir)) {
    throw new Error("[v14-deploy] Local dist dir not found: " + distDir + ". Did the build step run?");
  }

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
    const tmpHtaccess = path.join(repoRoot, ".v14-tmp-htaccess");
    writeFileSync(tmpHtaccess, mergedHtaccess, "utf8");
    await client.uploadFrom(tmpHtaccess, path.posix.join(cfg.remoteRoot, ".htaccess"));

    console.log("[v14-deploy] Uploading htpasswd to absolute path outside public_html: " + cfg.authUserFileAbsolutePath);
    const tmpHtpasswd = path.join(repoRoot, ".v14-tmp-htpasswd");
    writeFileSync(tmpHtpasswd, htpasswdLine + "\n", "utf8");
    await client.uploadFrom(tmpHtpasswd, cfg.authUserFileAbsolutePath);

    console.log("[v14-deploy] Upload complete.");
  } finally {
    client.close();
  }
}

async function main() {
  const cfg = loadConfigStrict();
  assertSafeTarget(cfg);

  runStep("Verify worktree/HEAD (branch=main, clean tree)", "node", ["scripts/v14-verify-head.mjs"]);

  if (!process.env.DIRECTUS_URL || !process.env.DIRECTUS_STATIC_TOKEN) {
    throw new Error(
      "[v14-deploy] Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN in environment. " +
      "The runner must decrypt the existing DPAPI Build Reader token and export both " +
      "for this process only, then clear them afterward."
    );
  }

  runStep("Directus V13 preview build (reused pipeline, unmodified)", "node", ["scripts/build-directus-v13-preview.mjs"]);
  runStep("Postbuild (reused pipeline: writes robots Disallow:/ + runs validate-built-site internally)", "node", ["scripts/postbuild.mjs"]);

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
