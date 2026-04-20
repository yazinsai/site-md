import { describe, expect, it } from "vitest";
import { mergeConfig } from "../src/cli/merge-config";
import { mergeMiddleware } from "../src/cli/merge-middleware";

describe("mergeMiddleware", () => {
  it("writes fresh when no existing file", () => {
    const r = mergeMiddleware(null);
    expect(r.kind).toBe("fresh");
    if (r.kind === "fresh") {
      expect(r.source).toContain(`export { proxy as middleware } from "site-md/proxy"`);
      expect(r.source).toContain("matcher");
    }
  });

  it("detects already-installed", () => {
    const src = `export { proxy as middleware } from "site-md/proxy";\nexport const config = { matcher: ["/"] };\n`;
    const r = mergeMiddleware(src);
    expect(r.kind).toBe("already-installed");
  });

  it("wraps a plain named middleware export", () => {
    const src = `import { NextResponse } from "next/server";

export function middleware(request) {
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
`;
    const r = mergeMiddleware(src);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toContain(`from "site-md/proxy"`);
    expect(r.source).toContain("__userMiddleware");
    expect(r.source).toContain("__siteMdProxy(request)");
    expect(r.source).toContain("export function middleware");
    // user's config preserved
    expect(r.source).toContain("matcher");
  });

  it("wraps a const arrow middleware export", () => {
    const src = `export const middleware = async (request) => {
  return Response.json({ ok: true });
};

export const config = { matcher: ["/"] };
`;
    const r = mergeMiddleware(src);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toContain("__userMiddleware");
    expect(r.source).toContain("await __userMiddleware(request)");
  });

  it("reports unsupported when no middleware export exists", () => {
    const src = `export const helper = () => 1;\n`;
    const r = mergeMiddleware(src);
    expect(r.kind).toBe("unsupported");
  });
});

describe("mergeConfig", () => {
  const opts = { title: "Acme", description: "Acme docs" };

  it("wraps a plain ESM default export", () => {
    const src = `const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toContain(`from "site-md/config"`);
    expect(r.source).toContain("withNextMd(nextConfig,");
    expect(r.source).toContain(`"Acme"`);
    expect(r.source).toContain("reactStrictMode: true");
  });

  it("wraps an inline-object default export", () => {
    const src = `export default { reactStrictMode: true };\n`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toMatch(/withNextMd\(\{[^}]*reactStrictMode/);
  });

  it("wraps a CJS module.exports", () => {
    const src = `module.exports = { reactStrictMode: true };\n`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toContain(`require("site-md/config")`);
    expect(r.source).toContain("withNextMd(");
  });

  it("detects already-wrapped ESM", () => {
    const src = `import { withNextMd } from "site-md/config";
export default withNextMd({}, { llmsTxt: { title: "x" } });
`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("already-wrapped");
  });

  it("detects already-wrapped CJS", () => {
    const src = `const { withNextMd } = require("site-md/config");
module.exports = withNextMd({}, { llmsTxt: { title: "x" } });
`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("already-wrapped");
  });

  it("wraps a default export that uses a call expression (e.g. withBundleAnalyzer)", () => {
    const src = `const withBundleAnalyzer = require("@next/bundle-analyzer")();

export default withBundleAnalyzer({
  reactStrictMode: true,
});
`;
    const r = mergeConfig(src, opts);
    expect(r.kind).toBe("merged");
    if (r.kind !== "merged") return;
    expect(r.source).toContain("withNextMd(withBundleAnalyzer({");
  });
});
