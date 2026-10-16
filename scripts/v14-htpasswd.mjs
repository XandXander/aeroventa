#!/usr/bin/env node
/**
 * V14 - Apache "{SHA}" htpasswd line generator (shared module + CLI).
 *
 * Exports generateHtpasswdLine(username, password) so the automated
 * deploy pipeline can build the credential file in-memory (no manual
 * paste step - see V14 defect #5). Also runnable standalone for a human
 * to preview the generated line; standalone mode never writes anything
 * to disk or git.
 *
 * Usage (standalone):
 *   node scripts/v14-htpasswd.mjs <username>
 */
import { createHash } from "node:crypto";
import { stdin, stdout } from "node:process";

export function generateHtpasswdLine(username, password) {
  if (!username || !password || password.length < 8) {
    throw new Error("[v14-htpasswd] username required and password must be >= 8 chars.");
  }
  const sha1b64 = createHash("sha1").update(password, "utf8").digest("base64");
  return username + ":{SHA}" + sha1b64;
}

function readSecret(promptText) {
  return new Promise((resolve) => {
    stdout.write(promptText);
    let value = "";
    const onData = (chunk) => {
      const ch = chunk.toString("utf8");
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode?.(false);
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch.charCodeAt(0) === 3) {
        process.exit(1);
      } else if (ch.charCodeAt(0) === 127) {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("v14-htpasswd.mjs");
if (isMain) {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node scripts/v14-htpasswd.mjs <username>");
    process.exit(1);
  }
  const password = await readSecret('Password for staging user "' + username + '" (input hidden): ');
  try {
    const line = generateHtpasswdLine(username, password);
    console.log("\n--- Preview only (standalone mode writes nothing to disk/git) ---");
    console.log(line);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
