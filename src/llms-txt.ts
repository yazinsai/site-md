import { convertHtmlToMarkdown } from "./convert";
import type { ResolvedNextMdConfig } from "./types";

export interface LlmsPage {
  path: string;
  title: string;
  description?: string;
}

function markdownPath(input: string): string {
  if (input === "/") return "/";
  if (input.endsWith(".md")) return input;
  return `${input}.md`;
}

function parseSitemap(xml: string): string[] {
  const out: string[] = [];
  const regex = /<loc>(.*?)<\/loc>/gims;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    const value = match[1]?.trim();
    if (value) out.push(value);
  }
  return out;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("timeout")), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function mapLimited<T, R>(
  list: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...list];
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift() as T;
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

function pathToTitle(path: string): string {
  if (path === "/" || path === "") return "Home";
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const cleaned = last.replace(/\.(html?|md)$/i, "");
  if (!cleaned) return "Home";
  return cleaned
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

async function fetchSitemapPages(params: {
  baseUrl: string;
  config: ResolvedNextMdConfig;
  fetchImpl: typeof fetch;
}): Promise<LlmsPage[]> {
  const sitemapUrl = new URL(params.config.llmsTxt.sitemapUrl, params.baseUrl).toString();
  try {
    const response = await withTimeout(
      params.fetchImpl(sitemapUrl, {
        headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
      }),
      5_000,
    );
    if (!response.ok) return [];
    const xml = await response.text();
    const urls = parseSitemap(xml).slice(0, params.config.llmsTxt.maxPages);
    const origin = new URL(params.baseUrl).origin;
    return urls
      .map((u) => {
        try {
          const parsed = new URL(u);
          if (parsed.origin !== origin) return undefined;
          return { path: parsed.pathname, title: pathToTitle(parsed.pathname) };
        } catch {
          return undefined;
        }
      })
      .filter((p): p is LlmsPage => p !== undefined);
  } catch {
    return [];
  }
}

export async function generateLlmsTxt(params: {
  baseUrl: string;
  config: ResolvedNextMdConfig;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const title = params.config.llmsTxt.title ?? new URL(params.baseUrl).hostname;
  const description = params.config.llmsTxt.description;
  const configured = params.config.llmsTxt.pages;
  const pages = configured?.length ? configured : await fetchSitemapPages(params);

  const lines = [`# ${title}`, ""];
  if (description) {
    lines.push(`> ${description}`, "");
  }

  lines.push("## Pages", "");
  for (const page of pages) {
    const desc = page.description ? `: ${page.description}` : "";
    lines.push(`- [${page.title}](${markdownPath(page.path)})${desc}`);
  }
  return lines.join("\n").trim();
}

async function collectPageUrls(params: {
  baseUrl: string;
  config: ResolvedNextMdConfig;
  fetchImpl: typeof fetch;
}): Promise<string[]> {
  if (params.config.llmsTxt.pages?.length) {
    return params.config.llmsTxt.pages.map((p) => new URL(p.path, params.baseUrl).toString());
  }

  const sitemapUrl = new URL(params.config.llmsTxt.sitemapUrl, params.baseUrl).toString();
  const response = await params.fetchImpl(sitemapUrl, {
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return parseSitemap(xml).slice(0, params.config.llmsTxt.maxPages);
}

export async function generateLlmsFullTxt(params: {
  baseUrl: string;
  config: ResolvedNextMdConfig;
  fetchImpl: typeof fetch;
  bypassSecret: string;
}): Promise<string> {
  const urls = await collectPageUrls(params);
  const title = params.config.llmsTxt.title ?? new URL(params.baseUrl).hostname;
  const output: string[] = [`# ${title} - Full Content`];
  const byteCap = 5 * 1024 * 1024;

  await mapLimited(urls, 3, async (pageUrl) => {
    if (Buffer.byteLength(output.join("\n"), "utf8") > byteCap) return;
    try {
      const response = await withTimeout(
        params.fetchImpl(pageUrl, {
          headers: {
            accept: "text/html",
            "user-agent": "site-md-internal/1.0",
            "x-site-md-internal": params.bypassSecret,
          },
        }),
        10_000,
      );

      if (!response.ok) {
        output.push(`\n<!-- Failed to fetch: ${new URL(pageUrl).pathname} -->`);
        return;
      }

      const html = await response.text();
      const converted = convertHtmlToMarkdown(html, { url: pageUrl });
      output.push(
        "",
        "---",
        `## ${converted.title}`,
        `> Source: ${pageUrl}`,
        "",
        converted.markdown,
      );
    } catch {
      output.push(`\n<!-- Failed to fetch: ${new URL(pageUrl).pathname} -->`);
    }
  });

  return output.join("\n").slice(0, byteCap);
}
