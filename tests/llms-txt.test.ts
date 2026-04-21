import { describe, expect, it } from "vitest";
import { generateLlmsFullTxt, generateLlmsTxt } from "../src/llms-txt";
import { resolveConfig } from "../src/config-resolve";

describe("llms generators", () => {
  it("builds llms.txt from configured pages", async () => {
    const config = resolveConfig({
      llmsTxt: {
        title: "My Site",
        pages: [{ path: "/docs", title: "Docs", description: "Documentation" }],
      },
    });
    const body = await generateLlmsTxt({
      baseUrl: "https://example.com",
      config,
      fetchImpl: fetch,
    });
    expect(body).toContain("# My Site");
    expect(body).toContain("[Docs](/docs.md): Documentation");
  });

  it("falls back to sitemap when no pages configured", async () => {
    const config = resolveConfig({
      llmsTxt: { title: "My Site" },
    });
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/blog/hello-world</loc></url>
  <url><loc>https://other.example.com/skipme</loc></url>
</urlset>`;
    const fetchImpl: typeof fetch = async () =>
      new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });

    const body = await generateLlmsTxt({
      baseUrl: "https://example.com",
      config,
      fetchImpl,
    });
    expect(body).toContain("[About](/about.md)");
    expect(body).toContain("[Hello World](/blog/hello-world.md)");
    expect(body).not.toContain("skipme");
  });

  it("returns title-only llms.txt when sitemap fetch fails", async () => {
    const config = resolveConfig({ llmsTxt: { title: "My Site" } });
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 500 });
    const body = await generateLlmsTxt({
      baseUrl: "https://example.com",
      config,
      fetchImpl,
    });
    expect(body).toContain("# My Site");
    expect(body).toContain("## Pages");
  });

  it("builds llms-full.txt with page conversions", async () => {
    const config = resolveConfig({
      llmsTxt: {
        title: "My Site",
        pages: [{ path: "/docs", title: "Docs" }],
      },
      bypassSecret: "secret",
    });

    const fetchImpl: typeof fetch = async () =>
      new Response("<html><head><title>Docs</title></head><body><main>Hi</main></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });

    const body = await generateLlmsFullTxt({
      baseUrl: "https://example.com",
      config,
      fetchImpl,
      bypassSecret: "secret",
    });

    expect(body).toContain("# My Site - Full Content");
    expect(body).toContain("> Source: https://example.com/docs");
    expect(body).toContain("# Docs");
  });
});
