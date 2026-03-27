import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const outdir = "dist";

rmSync(outdir, { force: true, recursive: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ["packages/cli/src/index.ts"],
  outfile: `${outdir}/index.js`,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __nightfangCreateRequire } from "node:module";\nconst require = __nightfangCreateRequire(import.meta.url);',
  },
  external: [
    "better-sqlite3",
    "drizzle-orm",
    "drizzle-orm/*",
  ],
});

cpSync("packages/templates/attacks", `${outdir}/attacks`, { recursive: true });

const bundlePath = `${outdir}/index.js`;
const bundle = readFileSync(bundlePath, "utf8").replace(
  "#!/usr/bin/env node\n#!/usr/bin/env node\n",
  "#!/usr/bin/env node\n"
);
writeFileSync(bundlePath, bundle);
