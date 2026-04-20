import { describe, expect, it } from "vitest";
import { cacheKey, isResponseCacheable, normalizeUrl } from "../src/cache";

describe("cache utilities", () => {
  it("normalizes host, trailing slash, and query sort", () => {
    const normalized = normalizeUrl("https://EXAMPLE.com/docs/?b=2&a=1");
    expect(normalized).toBe("https://example.com/docs?a=1&b=2");
  });

  it("includes language in key", () => {
    const key = cacheKey("https://example.com/docs", "en-US");
    expect(key).toContain("::en-US");
  });

  it("respects cache-control rules", () => {
    const ok = new Response("x", { status: 200 });
    const privateRes = new Response("x", {
      status: 200,
      headers: { "cache-control": "private, max-age=10" },
    });
    expect(isResponseCacheable(ok)).toBe(true);
    expect(isResponseCacheable(privateRes)).toBe(false);
  });
});
