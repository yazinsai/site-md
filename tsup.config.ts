import { defineConfig } from "tsup";

export default defineConfig({
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
});
