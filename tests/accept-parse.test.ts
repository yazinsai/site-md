import { describe, expect, it } from "vitest";
import {
  parseAcceptHeader,
  prefersMarkdownOverHtml,
  qualityForMediaType,
} from "../src/accept-parse";

describe("accept parser", () => {
  it("parses media types and q values", () => {
    const entries = parseAcceptHeader("text/html;q=0.8, text/markdown;q=1");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ mediaType: "text/html", q: 0.8 });
    expect(entries[1]).toEqual({ mediaType: "text/markdown", q: 1 });
  });

  it("supports wildcard fallback", () => {
    const entries = parseAcceptHeader("*/*;q=0.7");
    expect(qualityForMediaType(entries, "text/html")).toBe(0.7);
  });

  it("detects markdown preference strictly greater than html", () => {
    expect(prefersMarkdownOverHtml("text/markdown;q=0.9,text/html;q=0.8")).toBe(true);
    expect(prefersMarkdownOverHtml("text/html;q=0.9,text/markdown;q=0.8")).toBe(false);
  });

  it("breaks equal-q ties by explicit listing order", () => {
    expect(prefersMarkdownOverHtml("text/markdown, text/html, */*")).toBe(true);
    expect(prefersMarkdownOverHtml("text/html, text/markdown, */*")).toBe(false);
    expect(prefersMarkdownOverHtml("text/markdown, */*")).toBe(true);
  });

  it("does not treat bare wildcards as a markdown preference", () => {
    expect(prefersMarkdownOverHtml("*/*")).toBe(false);
    expect(prefersMarkdownOverHtml("text/html")).toBe(false);
  });
});
