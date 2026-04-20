import { describe, expect, it, vi } from "vitest";
import { createNextMdHandler } from "../src/handler";

describe("handler", () => {
  it("converts HTML to markdown for format=md requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        "<html><head><title>Home</title></head><body><main><p>hello</p></main></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    });

    const GET = createNextMdHandler({ bypassSecret: "secret" }, { fetchImpl });
    const response = await GET(
      new Request("https://example.com/page?format=md", {
        headers: { accept: "text/markdown" },
      }),
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("# Home");
  });

  it("returns 404 markdown on login redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "/login" },
      });
    });
    const GET = createNextMdHandler({ bypassSecret: "secret" }, { fetchImpl });
    const response = await GET(new Request("https://example.com/page.md"));
    expect(response.status).toBe(404);
  });
});
