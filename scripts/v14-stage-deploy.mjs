#!/usr/bin/env node
/**
 * V14 - Isolated staging deploy for AEROVENTA.RU.
 *
 * Hard safety guarantees enforced in code (not just docs):
 *  - Refuses to run unless config.staging.remoteRoot contains the
 *    configured "requiredPathSegment" (default "staging"). This makes it
 *    structurally impossible for this script to target the production
 *    Bitrix document root even by operator typo.
 *  - Never deletes/overwrites anything outside remoteRoot.
 *  - Never reads/writes secrets to disk or git. Credentials come from
 *    process env vars set locally for this run only:
 *      V14_FTP_LOGIN, V14_FTP_PASSWORD
 *  - Reuses the already-validated V13 pipeline as black-box steps:
 *      node scripts/build-directus-v13-preview.mjs
 *      node scripts/validate-built-site.mjs
 *      node scripts/postbuild.mjs   (best-effort, tolerated if already run)
 *  - Aborts the whole run on any non-zero exit from build/validate.
 *
 * Usage:
 *   V14_FTP_LOGIN=... V14_FTP_PASSWORD=... node scripts/v14-stage-deploy.mjs [expectedHeadSha]
 *
 * Requires the optional dependency "basic-ftp" (deliberately NOT added to
 * package.json by this V14 change, to keep the committed manifest
 * untouched). Install locally before running:
 *   npm install --no-save basic-ftp
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadConfig() {
  const localPath = path.join(repoRoot, "scripts", "v14-stage-config.local.json");
  const examplePath = path.join(repoRoot, "scripts", "v14-stage-config.example.json");
  const configPath = existsSync(localPath) ? localPath : examplePath;
  const cfg = JSON.parse(readFileSync(configPath, "utf8")).staging;
  if (configPath === examplePath) {
    console.warn(
      "[v14-deploy] WARNING: using EXAMPLE config (no v14-stage-config.local.json found). " +
      "Create scripts/v14-stage-config.local.json (gitignored) with real staging values before real deploys."
    );
  }
  return cfg;
}

function assertSafeTarget(cfg) {
  const segment = cfg.requiredPathSegment || "staging";
  if (!cfg.remoteRoot || cfg.remoteRoot === "/" || !cfg.remoteRoot.includes(segment)) {
    throw new Error(
      "[v14-deploy] REFUSING TO DEPLOY: remoteRoot \"" + cfg.remoteRoot + "\" does not contain " +
      "required safety segment \"" + segment + "\". This guard exists specifically to prevent " +
      "ever writing into the production Bitrix document root. Aborting."
    );
  }
  if (!cfg.acceptanceBaseUrl || !cfg.acceptanceBaseUrl.includes(segment)) {
    throw new Error(
      "[v14-deploy] REFUSING TO DEPLOY: acceptanceBaseUrl \"" + cfg.acceptanceBaseUrl + "\" does not " +
      "look like an isolated staging host. Aborting."
    );
  }
}

function runStep(label, cmd, args) {
  console.log("\n[v14-deploy] STEP: " + label + " -> " + cmd + " " + args.join(" "));
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
  } catch (err) {
    throw new Error("[v14-deploy] STEP FAILED: " + label + " (exit " + (err.status ?? "?") + "). Aborting pipeline.");
  }
}

async function uploadDist(cfg) {
  const login = process.env.V14_FTP_LOGIN;
  const password = process.env.V14_FTP_PASSWORD;
  if (!login || !password) {
    throw new Error(
      "[v14-deploy] Missing V14_FTP_LOGIN / V14_FTP_PASSWORD env vars. " +
      "Set them locally for this run only; never commit them."
    );
  }

  let ftpMod;
  try {
    ftpMod = await import("basic-ftp");
  } catch {
    throw new Error(
      "[v14-deploy] Optional dependency 'basic-ftp' is not installed. " +
      "Run: npm install --no-save basic-ftp"
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
      user: login,
      password,
      secure: false,
    });
    console.log("[v14-deploy] Connected. Ensuring remote dir: " + cfg.remoteRoot);
    await client.ensureDir(cfg.remoteRoot);
    console.log("[v14-deploy] Uploading " + distDir + " -> " + cfg.remoteRoot + " (additive mirror)");
    await client.uploadFromDir(distDir, cfg.remoteRoot);
    console.log("[v14-deploy] Upload complete.");
  } finally {
    client.close();
  }
}

async function main() {
  const cfg = loadConfig();
  assertSafeTarget(cfg);

  const expectedSha = process.argv[2];
  runStep("Verify local HEAD", "node", expectedSha ? ["scripts/v14-verify-head.mjs", expectedSha] : ["scripts/v14-verify-head.mjs"]);
  runStep("Directus V13 preview build (validated pipeline, reused as-is)", "node", ["scripts/build-directus-v13-preview.mjs"]);
  runStep("Validate built site (validated pipeline, reused as-is)", "node", ["scripts/validate-built-site.mjs"]);

  try {
    runStep("Postbuild (best-effort, tolerated if already invoked by build step)", "node", ["scripts/postbuild.mjs"]);
  } catch (e) {
    console.warn("[v14-deploy] postbuild step warning (non-fatal, continuing): " + e.message);
  }

  await uploadDist(cfg);

  console.log(
    "\n[v14-deploy] DONE. Remote target was strictly: " + cfg.remoteRoot +
    "\n[v14-deploy] Production Bitrix root was never addressed by this script."
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
