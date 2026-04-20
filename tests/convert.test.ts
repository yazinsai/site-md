import { describe, expect, it } from "vitest";
import { convertHtmlToMarkdown } from "../src/convert";

describe("convertHtmlToMarkdown", () => {
  it("extracts readable content and strips scripts", () => {
    const html = `
      <html>
        <head>
          <title>Docs</title>
          <script>alert("x")</script>
        </head>
        <body>
          <main>
            <h2>Intro</h2>
            <p>Hello world</p>
            <a href="/guide">Guide</a>
          </main>
        </body>
      </html>
    `;

    const result = convertHtmlToMarkdown(html, { url: "https://example.com/docs" });
    expect(result.markdown).toContain("# Docs");
    expect(result.markdown).toContain("Hello world");
    expect(result.markdown).toContain("(https://example.com/guide)");
    expect(result.markdown).not.toContain("alert(");
  });
});
