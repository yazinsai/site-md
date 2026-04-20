import { describe, expect, it } from "vitest";
import { createNextMdProxy } from "../src/proxy";

describe("proxy", () => {
  it("rewrites markdown request to internal API route", () => {
    const proxy = createNextMdProxy({ bypassSecret: "secret" });
    const request = new Request("https://example.com/docs.md");
    const response = proxy(request);
    expect(response).toBeTruthy();
    expect(response?.headers.get("x-middleware-rewrite")).toContain(
      "/api/__next_md/docs",
    );
  });

  it("blocks configured bot categories", () => {
    const proxy = createNextMdProxy({
      bypassSecret: "secret",
      bots: {
        trainingScrapers: "block",
      },
    });
    const request = new Request("https://example.com/docs", {
      headers: { "user-agent": "GPTBot" },
    });
    const response = proxy(request);
    expect(response?.status).toBe(403);
  });
});
