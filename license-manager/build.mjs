// Bundles src/core.ts (+ license-core, noble) and inlines it into one self-contained index.html.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const out = await build({ entryPoints: ["src/core.ts"], bundle: true, write: false, format: "iife", globalName: "LM", target: "es2020", minify: true, legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script>/gi, "<\\/script>");
const html = readFileSync("template.html", "utf8").replace("/*__CORE__*/", () => js);
writeFileSync("index.html", html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB), sha256 ${createHash("sha256").update(html).digest("hex")}`);
