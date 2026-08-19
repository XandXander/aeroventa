#!/usr/bin/env node
/**
 * V14 - Local .htpasswd (Apache "{SHA}" format) line generator.
 *
 * Generates a Basic-Auth credential line for the isolated staging
 * directory WITHOUT ever writing the plaintext password to disk or git.
 * Uses Apache's native "{SHA}" htpasswd format (sha1 + base64), which
 * mod_auth_basic on standard Apache/Beget hosting accepts natively - no
 * external dependency required.
 *
 * Usage:
 *   node scripts/v14-htpasswd.mjs <username>
 *   -> prompts for a password interactively (input hidden), prints
 *      "username:{SHA}xxxx" to stdout only. Nothing is persisted by this
 *      script. Paste the printed line into the server-side htpasswd file.
 */
import { createHash } from "node:crypto";
import { stdin, stdout } from "node:process";

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

const username = process.argv[2];
if (!username) {
  console.error("Usage: node scripts/v14-htpasswd.mjs <username>");
  process.exit(1);
}

const password = await readSecret('Password for staging user "' + username + '" (input hidden): ');
if (!password || password.length < 8) {
  console.error("[v14-htpasswd] Refusing weak/empty password (min 8 chars).");
  process.exit(1);
}

const sha1b64 = createHash("sha1").update(password, "utf8").digest("base64");
const line = username + ":{SHA}" + sha1b64;

console.log("\n--- Copy the line below into the staging .htpasswd file on the server ---");
console.log(line);
console.log("--- Nothing above was written to disk or git by this script. ---");
