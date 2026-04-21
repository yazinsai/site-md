import { describe, expect, it } from "vitest";
import { detectRequest } from "../src/detect";
import { resolveConfig } from "../src/config-resolve";

function run(url: string, headers: Record<string, string> = {}) {
  const config = resolveConfig({
    bypassSecret: "secret",
  });
  return detectRequest({
    url: new URL(url),
    headers: new Headers(headers),
    config,
  });
}

describe("detectRequest", () => {
  it("ignores internal bypass requests", () => {
    const result = run("https://example.com/docs", { "x-site-md-internal": "secret" });
    expect(result.detected).toBe(false);
  });

  it("detects md suffix and strips it", () => {
    const result = run("https://example.com/docs/setup.md?lang=en");
    expect(result.detected).toBe(true);
    expect(result.method).toBe("md-suffix");
    expect(result.originalUrl).toBe("https://example.com/docs/setup?lang=en");
  });

  it("detects format=md and preserves other query params", () => {
    const result = run("https://example.com/page?format=md&lang=en");
    expect(result.method).toBe("format-param");
    expect(result.originalUrl).toBe("https://example.com/page?lang=en");
  });

  it("detects user agent category and action", () => {
    const config = resolveConfig({
      bypassSecret: "secret",
      bots: {
        trainingScrapers: "block",
      },
    });
    const result = detectRequest({
      url: new URL("https://example.com/"),
      headers: new Headers({ "user-agent": "GPTBot/1.0" }),
      config,
    });
    expect(result.method).toBe("user-agent");
    expect(result.botCategory).toBe("training");
    expect(result.action).toBe("block");
  });

  it("detects accept header markdown preference", () => {
    const result = run("https://example.com/", {
      accept: "text/html;q=0.5,text/markdown;q=0.9",
    });
    expect(result.method).toBe("accept-header");
    expect(result.detected).toBe(true);
  });

  it("detects Claude Code's user-agent as userAgent category", () => {
    const result = run("https://example.com/", {
      "user-agent":
        "Claude-User (claude-code/2.1.116; +https://support.anthropic.com/)",
    });
    expect(result.method).toBe("user-agent");
    expect(result.botCategory).toBe("userAgent");
    expect(result.action).toBe("markdown");
  });

  it("returns passthrough for normal html traffic", () => {
    const result = run("https://example.com/");
    expect(result.detected).toBe(false);
    expect(result.method).toBe("none");
  });
});
