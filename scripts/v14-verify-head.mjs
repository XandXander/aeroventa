#!/usr/bin/env node
/**
 * V14 - Fresh HEAD verifier.
 * Confirms the local checkout HEAD matches the SHA the Owner/orchestrator
 * expects before any staging build/deploy proceeds. Fails closed.
 *
 * Usage:
 *   node scripts/v14-verify-head.mjs <expectedShaOrRef>
 *   node scripts/v14-verify-head.mjs        (prints current HEAD only)
 */
import { execSync } from "node:child_process";

function currentHead() {
  return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
}

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const expected = process.argv[2];
const head = currentHead();
const branch = currentBranch();

console.log("[v14-verify-head] branch=" + branch + " head=" + head);

if (!expected) {
  console.log("[v14-verify-head] No expected SHA supplied; printed current HEAD only.");
  process.exit(0);
}

if (head.toLowerCase() !== expected.toLowerCase() &&
    !head.toLowerCase().startsWith(expected.toLowerCase())) {
  console.error(
    "[v14-verify-head] MISMATCH: local HEAD (" + head + ") != expected (" + expected + "). " +
    "Refusing to proceed. Pull/checkout the correct commit before re-running."
  );
  process.exit(1);
}

console.log("[v14-verify-head] OK: local HEAD matches expected baseline.");
process.exit(0);
