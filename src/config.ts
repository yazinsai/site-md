import crypto from "node:crypto";
import type { NextMdConfig } from "./types";

function serializeRegexMap(
  map: Partial<Record<string, RegExp>> | undefined,
): Partial<Record<string, { source: string; flags: string }>> {
  const out: Partial<Record<string, { source: string; flags: string }>> = {};
  if (!map) return out;
  for (const [key, value] of Object.entries(map)) {
    if (!value) continue;
    out[key] = {
      source: value.source,
      flags: value.flags,
    };
  }
  return out;
}

function serializeConfig(config: NextMdConfig): string {
  return JSON.stringify({
    ...config,
    bots: {
      ...config.bots,
      additionalPatterns: serializeRegexMap(config.bots?.additionalPatterns),
      overridePatterns: serializeRegexMap(config.bots?.overridePatterns),
    },
  });
}

export function withNextMd<T extends Record<string, any>>(
  nextConfig: T,
  nextMdConfig: NextMdConfig = {},
): T {
  if (!process.env.SITE_MD_BYPASS_SECRET) {
    process.env.SITE_MD_BYPASS_SECRET = crypto.randomBytes(32).toString("hex");
  }
  process.env.SITE_MD_CONFIG = serializeConfig(nextMdConfig);

  const routePrefix = nextMdConfig.internalRoutePrefix ?? "__site_md";
  const missingBypass = [{ type: "header", key: "x-site-md-internal" }];

  const previousRewrites = nextConfig.rewrites;
  const injected = [
    {
      source: "/llms.txt",
      destination: `/api/${routePrefix}/llms.txt`,
      missing: missingBypass,
    },
    {
      source: "/llms-full.txt",
      destination: `/api/${routePrefix}/llms-full.txt`,
      missing: missingBypass,
    },
  ];

  return {
    ...nextConfig,
    async rewrites() {
      const existing =
        typeof previousRewrites === "function" ? await previousRewrites() : (previousRewrites ?? []);

      if (Array.isArray(existing)) {
        return [...injected, ...existing];
      }

      return {
        ...existing,
        beforeFiles: [...injected, ...(existing.beforeFiles ?? [])],
      };
    },
  };
}
