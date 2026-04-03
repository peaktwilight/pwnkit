import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";

const outdir = "dist";

rmSync(outdir, { force: true, recursive: true });
mkdirSync(outdir, { recursive: true });

// Stub out optional dev-only dependencies that Ink tries to import
const stubPlugin = {
  name: "stub-optional",
  setup(build) {
    const stubModules = ["react-devtools-core", "yoga-wasm-web"];
    const filter = new RegExp(`^(${stubModules.join("|")})$`);
    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default {}; export const activate = () => {};",
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["packages/cli/src/index.ts"],
  outfile: `${outdir}/pwnkit.js`,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __pwnkitCreateRequire } from "node:module";\nconst require = __pwnkitCreateRequire(import.meta.url);',
  },
  external: [
    "better-sqlite3",
    "drizzle-orm",
    "drizzle-orm/*",
    "cfonts",
  ],
  plugins: [stubPlugin],
});

cpSync("packages/templates/attacks", `${outdir}/attacks`, { recursive: true });
cpSync("packages/dashboard/dist", `${outdir}/dashboard`, { recursive: true });

// Fix double shebang
const bundlePath = `${outdir}/pwnkit.js`;
const bundle = readFileSync(bundlePath, "utf8").replace(
  "#!/usr/bin/env node\n#!/usr/bin/env node\n",
  "#!/usr/bin/env node\n"
);
writeFileSync(bundlePath, bundle);

// Write a clean package.json for publishing (no workspace: deps)
const rootPkg = JSON.parse(readFileSync("package.json", "utf8"));
const publishPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  type: "module",
  description: rootPkg.description,
  bin: { "pwnkit-cli": "./pwnkit.js" },
  files: ["pwnkit.js", "attacks", "dashboard"],
  keywords: rootPkg.keywords,
  author: rootPkg.author,
  homepage: rootPkg.homepage,
  bugs: rootPkg.bugs,
  repository: rootPkg.repository,
  license: rootPkg.license,
  engines: { node: ">=20" },
  dependencies: {
    "better-sqlite3": rootPkg.dependencies["better-sqlite3"],
    "cfonts": "^3.3.1",
    "drizzle-orm": rootPkg.dependencies["drizzle-orm"],
  },
};
writeFileSync(`${outdir}/package.json`, JSON.stringify(publishPkg, null, 2) + "\n");
copyFileSync("LICENSE", `${outdir}/LICENSE`);
copyFileSync("README.md", `${outdir}/README.md`);

console.log(`Bundled pwnkit-cli v${rootPkg.version} → ${outdir}/`);
