import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node20", format: "cjs", sourcemap: false, logLevel: "info", external: ["electron"] };
await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "out/main/main.cjs" });
await build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "out/preload/preload.cjs" });
