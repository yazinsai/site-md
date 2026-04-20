import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";
import type { ConvertOptions, ConvertResult } from "./types";

const DEFAULT_STRIP_SELECTORS = [
  "script",
  "style",
  "nav",
  "footer",
  "header",
  "noscript",
  "iframe",
  "svg",
];

function absolutifyUrls(root: ParentNode, baseUrl: string): void {
  const tags: Array<{ selector: string; attr: "href" | "src" }> = [
    { selector: "a[href]", attr: "href" },
    { selector: "img[src]", attr: "src" },
  ];
  for (const tag of tags) {
    for (const node of root.querySelectorAll(tag.selector)) {
      const value = node.getAttribute(tag.attr);
      if (!value) continue;
      try {
        const absolute = new URL(value, baseUrl).toString();
        node.setAttribute(tag.attr, absolute);
      } catch {
        // ignore invalid URLs
      }
    }
  }
}

function cleanupMarkdown(markdown: string): string {
  return markdown
    .replace(/^\s+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^#+\s*$/gm, "")
    .trim();
}

function pickContent(document: Document, contentSelector?: string): Element {
  if (contentSelector) {
    const selected = document.querySelector(contentSelector);
    if (selected) return selected;
  }

  const readable = new Readability(document.cloneNode(true) as Document).parse();
  if (readable?.content) {
    const dom = new JSDOM(readable.content);
    return dom.window.document.body;
  }

  const fallback =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body;
  return fallback;
}

export function convertHtmlToMarkdown(html: string, options: ConvertOptions): ConvertResult {
  const dom = new JSDOM(html, { url: options.url });
  const { document } = dom.window;

  const stripSelectors = [...DEFAULT_STRIP_SELECTORS, ...(options.stripSelectors ?? [])];
  for (const selector of stripSelectors) {
    document.querySelectorAll(selector).forEach((node: Element) => node.remove());
  }

  const content = pickContent(document, options.contentSelector);
  absolutifyUrls(content, options.url);

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  td.use(gfm);

  const markdownBody = cleanupMarkdown(td.turndown(content.outerHTML || content.textContent || ""));
  const title = (document.title || "Untitled").trim();

  const markdown = cleanupMarkdown(`# ${title}\n\n${markdownBody}`);
  return { title, markdown };
}
