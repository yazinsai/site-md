import { NextResponse } from "next/server";
import { resolveConfig } from "./config-resolve";
import { detectRequest } from "./detect";
import type { NextMdConfig, NextMiddlewareResult, NextRequestLike } from "./types";

function rewriteUrl(requestUrl: URL, targetOriginalUrl: string, routePrefix: string): URL {
  const originalPath = new URL(targetOriginalUrl).pathname;
  const clean = originalPath.replace(/^\/+/, "");
  const catchAllPath = clean.length > 0 ? clean : "__root__";
  return new URL(`/api/${routePrefix}/${catchAllPath}`, requestUrl.origin);
}

export function createNextMdProxy(configInput?: NextMdConfig) {
  const config = resolveConfig(configInput);
  return function proxy(request: NextRequestLike): NextMiddlewareResult {
    const url = new URL(request.url);
    const detection = detectRequest({
      url,
      headers: request.headers,
      config,
    });

    if (!detection.detected) return undefined;
    if (detection.action === "passthrough") return undefined;

    if (detection.action === "block") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (detection.method === "llms-txt" || detection.method === "llms-full-txt") {
      const target = new URL(`/api/${config.internalRoutePrefix}${url.pathname}`, url.origin);
      return NextResponse.rewrite(target);
    }

    const target = rewriteUrl(url, detection.originalUrl, config.internalRoutePrefix);
    target.search = new URL(detection.originalUrl).search;
    return NextResponse.rewrite(target);
  };
}

export const proxy = createNextMdProxy();
