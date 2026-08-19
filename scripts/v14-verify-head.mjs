#!/usr/bin/env node
/**
 * V14 - Worktree/HEAD sanity check (no frozen SHA).
 *
 * The frozen-baseline-SHA gate from the first V14 draft has been removed
 * per the V14 correction: an orchestrator-frozen SHA goes stale the moment
 * anyone else pushes to main. Freshness is now established by the runner
 * (git fetch + fast-forward-only pull) BEFORE this script runs; this
 * script only asserts the resulting local state is safe to build from:
 *   - branch is exactly "main"
 *   - tracked worktree is clean (no uncommitted changes)
 * It prints the resulting HEAD for the log; it does not compare it to
 * anything frozen.
 *
 * Usage:
 *   node scripts/v14-verify-head.mjs
 */
import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  console.error("[v14-verify-head] REFUSING: current branch is \"" + branch + "\", not \"main\". Aborting.");
  process.exit(1);
}

const status = sh("git status --porcelain");
if (status.length > 0) {
  console.error("[v14-verify-head] REFUSING: tracked worktree is not clean. Commit/stash changes first.\n" + status);
  process.exit(1);
}

const head = sh("git rev-parse HEAD");
console.log("[v14-verify-head] OK: branch=main, worktree clean, HEAD=" + head);
process.exit(0);
