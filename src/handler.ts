import { cacheKey, createMarkdownCache, isResponseCacheable } from "./cache";
import { resolveConfig } from "./config-resolve";
import { convertHtmlToMarkdown } from "./convert";
import { detectRequest } from "./detect";
import { generateLlmsFullTxt, generateLlmsTxt } from "./llms-txt";
import type { HandlerDeps, NextMdConfig } from "./types";

let llmsTxtCache: { value: string; expiresAt: number } | undefined;
let llmsFullCache: { value: string; expiresAt: number } | undefined;

function markdownResponse(markdown: string, status = 200): Response {
  return new Response(markdown, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, User-Agent",
      "x-content-source": "site-md",
    },
  });
}

function isLoginRedirect(response: Response): boolean {
  if (response.status < 300 || response.status > 399) return false;
  const location = response.headers.get("location") ?? "";
  return /\/(login|auth|signin)/i.test(location);
}

function internalPathFromHandlerUrl(url: URL, routePrefix: string): string | undefined {
  const prefix = `/api/${routePrefix}`;
  if (url.pathname === prefix) return "/";
  if (!url.pathname.startsWith(`${prefix}/`)) return undefined;
  const suffix = url.pathname.slice(prefix.length);
  if (suffix === "/__root__") return "/";
  return suffix.startsWith("/") ? suffix : `/${suffix}`;
}

export function createNextMdHandler(configInput?: NextMdConfig, deps?: HandlerDeps) {
  const config = resolveConfig(configInput);
  const cache = createMarkdownCache(config);
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const now = deps?.now ?? Date.now;

  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const internalPath = internalPathFromHandlerUrl(url, config.internalRoutePrefix);
    const effectiveUrl = internalPath
      ? new URL(`${internalPath}${url.search}`, url.origin)
      : url;

    const detection = detectRequest({
      url: effectiveUrl,
      headers: request.headers,
      config,
    });

    if (detection.method === "llms-txt") {
      const expiry = llmsTxtCache?.expiresAt ?? 0;
      if (llmsTxtCache && now() < expiry) {
        return markdownResponse(llmsTxtCache.value);
      }
      const body = await generateLlmsTxt({
        baseUrl: url.origin,
        config,
        fetchImpl,
      });
      llmsTxtCache = {
        value: body,
        expiresAt: now() + config.llmsTxt.cacheTTL * 1000,
      };
      return markdownResponse(body);
    }

    if (detection.method === "llms-full-txt") {
      const expiry = llmsFullCache?.expiresAt ?? 0;
      if (llmsFullCache && now() < expiry) {
        return markdownResponse(llmsFullCache.value);
      }

      const built = await generateLlmsFullTxt({
        baseUrl: url.origin,
        config,
        fetchImpl,
        bypassSecret: config.bypassSecret,
      });
      llmsFullCache = {
        value: built,
        expiresAt: now() + config.llmsTxt.cacheTTL * 1000,
      };
      return markdownResponse(built);
    }

    const targetUrl = new URL(detection.originalUrl || effectiveUrl.toString());
    const lang = request.headers.get("accept-language");
    const key = cacheKey(targetUrl.toString(), lang);
    const cached = cache.get(key);
    if (cached) {
      return markdownResponse(cached.markdown, cached.status);
    }

    const response = await fetchImpl(targetUrl.toString(), {
      method: "GET",
      headers: {
        accept: "text/html",
        "accept-language": lang ?? "",
        "user-agent": "site-md-internal/1.0",
        "x-site-md-internal": config.bypassSecret,
      },
      redirect: "manual",
    });

    if (isLoginRedirect(response)) {
      return markdownResponse("# Not Found\n\nPage requires authentication.", 404);
    }

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return new Response("# Unsupported Content\n\nExpected HTML content.", {
        status: 415,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          vary: "Accept, User-Agent",
          "x-content-source": "site-md",
        },
      });
    }

    const html = await response.text();
    const converted = convertHtmlToMarkdown(html, {
      url: targetUrl.toString(),
      contentSelector: config.contentSelector,
      stripSelectors: config.stripSelectors,
    });

    const markdownRes = markdownResponse(converted.markdown);
    if (
      isResponseCacheable(response, {
        ignoreCacheControl: process.env.NODE_ENV === "test",
      })
    ) {
      cache.set(key, {
        markdown: converted.markdown,
        status: 200,
        headers: Object.fromEntries(markdownRes.headers.entries()),
        createdAt: now(),
      });
    }

    return markdownRes;
  };
}

export const GET = createNextMdHandler();
