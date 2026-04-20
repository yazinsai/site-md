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
