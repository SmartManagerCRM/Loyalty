#!/usr/bin/env node
// Copies the PUBLIC key file saved by the License Generator into app/trusted-keys.json (merging by keyId).
// Usage: npm run keys:import -w app -- /path/to/trusted-keys.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) { console.error("Usage: keys:import <public-key-file.json>"); process.exit(1); }
const incoming = JSON.parse(readFileSync(src, "utf8"));
const dest = fileURLToPath(new URL("../trusted-keys.json", import.meta.url));
const current = existsSync(dest) ? JSON.parse(readFileSync(dest, "utf8")) : [];
for (const k of incoming) {
  if (typeof k.keyId !== "string" || typeof k.publicKey !== "string" || Buffer.from(k.publicKey, "base64url").length !== 32) throw new Error("Not a valid public key entry");
  if (Object.keys(k).some((p) => !["keyId", "publicKey", "note", "notBefore", "notAfter"].includes(p))) throw new Error(`Unexpected property in key entry ${k.keyId}`);
  const i = current.findIndex((c) => c.keyId === k.keyId);
  if (i >= 0) current[i] = k; else current.push(k);
}
writeFileSync(dest, JSON.stringify(current, null, 2) + "\n");
console.log(`trusted-keys.json now lists: ${current.map((k) => k.keyId).join(", ")}`);
