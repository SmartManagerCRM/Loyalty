import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Trusted license-verification PUBLIC keys are compiled into the app.
 * Source: $SMLOYALTY_TRUSTED_KEYS_FILE if set, otherwise app/trusted-keys.json.
 * The private signing key never exists in this project.
 */
function loadTrustedKeys(): unknown[] {
  const file = process.env.SMLOYALTY_TRUSTED_KEYS_FILE ?? resolve(__dirname, "trusted-keys.json");
  if (!existsSync(file)) return [];
  const keys = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  for (const k of keys) {
    if (typeof k.keyId !== "string" || typeof k.publicKey !== "string") throw new Error(`Invalid trusted key entry in ${file}`);
    if (Object.keys(k).some((n) => /priv|secret|seed/i.test(n))) throw new Error(`Refusing to embed key material that looks private in ${file}`);
  }
  return keys;
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: { __TRUSTED_KEYS__: JSON.stringify(loadTrustedKeys()), __APP_VERSION__: JSON.stringify("1.0.0") },
  build: { target: "es2020", sourcemap: false, chunkSizeWarningLimit: 1200 },
  server: { host: true },
  test: { include: ["src/tests/**/*.test.ts"], environment: "node", testTimeout: 30000 },
});
