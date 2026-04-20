import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      proxy: "src/proxy.ts",
      handler: "src/handler.ts",
      config: "src/config.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["next", "react"],
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["cjs"],
    sourcemap: false,
    clean: false,
    target: "node18",
    platform: "node",
    outExtension: () => ({ js: ".cjs" }),
    noExternal: [
      "@clack/prompts",
      "picocolors",
      "recast",
      "@babel/parser",
      "@babel/types",
    ],
    banner: { js: "#!/usr/bin/env node" },
  },
]);
