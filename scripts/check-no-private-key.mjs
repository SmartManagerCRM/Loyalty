#!/usr/bin/env node
// Fails if anything that looks like signing-key material is present in the mobile app's inputs or build outputs.
// Usage: node scripts/check-no-private-key.mjs [extra paths or .apk/.aab/.ipa files...]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const targets = [join(root, "app/dist"), join(root, "app/android/app/src/main/assets"), join(root, "app/ios/App/App/public"), join(root, "app/trusted-keys.json"), ...process.argv.slice(2)];
const problems = [];

const BAD_TEXT = [/BEGIN (EC |OPENSSH |RSA )?PRIVATE KEY/, /smloyalty-signing-key/, /"seed"\s*:/, /"privateKey"\s*:/, /signLicense\b/, /generateSigningKey\b/];
const BAD_NAME = /\.(smlkey|p12|pem|key)$|signing-key/i;

function scanText(label, text) {
  for (const re of BAD_TEXT) if (re.test(text)) problems.push(`${label}: matches ${re}`);
}
function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).flatMap((f) => walk(join(p, f)));
  return [p];
}
function scanFile(f) {
  if (BAD_NAME.test(f)) problems.push(`${f}: suspicious file name`);
  if (statSync(f).size > 20 * 1024 * 1024) return;
  if (/\.(js|mjs|json|html|css|map|txt|xml|properties|plist)$/.test(f)) scanText(f, readFileSync(f, "utf8"));
}

for (const t of targets) {
  if (!existsSync(t)) continue;
  if (/\.(apk|aab|ipa|zip)$/.test(t)) {
    const names = execFileSync("unzip", ["-Z1", t], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n");
    for (const n of names) if (BAD_NAME.test(n) && !/META-INF\/.*\.(RSA|SF|MF)$/.test(n)) problems.push(`${t}!${n}: suspicious entry`);
    for (const n of names.filter((x) => /assets\/public\/.*\.(js|json|html)$/.test(x))) scanText(`${t}!${n}`, execFileSync("unzip", ["-p", t, n], { encoding: "utf8", maxBuffer: 1 << 28 }));
    continue;
  }
  for (const f of walk(t)) scanFile(f);
}

const keysFile = join(root, "app/trusted-keys.json");
if (existsSync(keysFile)) {
  const keys = JSON.parse(readFileSync(keysFile, "utf8"));
  for (const k of keys) {
    for (const prop of Object.keys(k)) if (!["keyId", "publicKey", "note", "notBefore", "notAfter"].includes(prop)) problems.push(`trusted-keys.json: unexpected property "${prop}"`);
    if (Buffer.from(String(k.publicKey), "base64url").length !== 32) problems.push(`trusted-keys.json: ${k.keyId} is not a 32-byte public key`);
  }
}

if (problems.length) {
  console.error("PRIVATE KEY CHECK FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("OK: no signing-key material found in", targets.filter(existsSync).map((t) => t.replace(root, "")).join(", "));
