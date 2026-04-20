import type { NextMdConfig, ResolvedNextMdConfig } from "./types";

const DEFAULT_BYPASS_SECRET = "site-md-dev-default-secret";

export const DEFAULT_PASSTHROUGH_PATTERNS = [
  "/_next/*",
  "/api/*",
  "/static/*",
  "/*.js",
  "/*.css",
  "/*.json",
  "/*.xml",
  "/*.txt",
  "/*.map",
  "/*.webmanifest",
  "/*.png",
  "/*.jpg",
  "/*.jpeg",
  "/*.gif",
  "/*.svg",
  "/*.ico",
  "/*.woff",
  "/*.woff2",
  "/*.ttf",
  "/*.eot",
];

function deserializeRegex(data: unknown): RegExp | undefined {
  if (
    data &&
    typeof data === "object" &&
    "source" in data &&
    "flags" in data &&
    typeof (data as { source: unknown }).source === "string" &&
    typeof (data as { flags: unknown }).flags === "string"
  ) {
    return new RegExp(
      (data as { source: string }).source,
      (data as { flags: string }).flags,
    );
  }
  return undefined;
}

function parseEnvConfig(raw: string | undefined): NextMdConfig | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as NextMdConfig & {
      bots?: {
        additionalPatterns?: Partial<Record<string, { source: string; flags: string }>>;
        overridePatterns?: Partial<Record<string, { source: string; flags: string }>>;
      };
    };

    const additionalPatterns: Partial<Record<"training" | "search" | "userAgent", RegExp>> = {};
    const overridePatterns: Partial<Record<"training" | "search" | "userAgent", RegExp>> = {};

    const addInput = parsed.bots?.additionalPatterns ?? {};
    const overInput = parsed.bots?.overridePatterns ?? {};

    for (const [key, value] of Object.entries(addInput)) {
      const regex = deserializeRegex(value);
      if (regex && (key === "training" || key === "search" || key === "userAgent")) {
        additionalPatterns[key] = regex;
      }
    }

    for (const [key, value] of Object.entries(overInput)) {
      const regex = deserializeRegex(value);
      if (regex && (key === "training" || key === "search" || key === "userAgent")) {
        overridePatterns[key] = regex;
      }
    }

    return {
      ...parsed,
      bots: {
        ...parsed.bots,
        additionalPatterns,
        overridePatterns,
      },
    };
  } catch {
    return undefined;
  }
}

function mergeConfig(base: NextMdConfig, extra: NextMdConfig): NextMdConfig {
  return {
    ...base,
    ...extra,
    bots: {
      ...base.bots,
      ...extra.bots,
      additionalPatterns: {
        ...(base.bots?.additionalPatterns ?? {}),
        ...(extra.bots?.additionalPatterns ?? {}),
      },
      overridePatterns: {
        ...(base.bots?.overridePatterns ?? {}),
        ...(extra.bots?.overridePatterns ?? {}),
      },
    },
    llmsTxt: {
      ...base.llmsTxt,
      ...extra.llmsTxt,
    },
    passthrough: [...(base.passthrough ?? []), ...(extra.passthrough ?? [])],
    stripSelectors: [...(base.stripSelectors ?? []), ...(extra.stripSelectors ?? [])],
  };
}

export function resolveConfig(input?: NextMdConfig): ResolvedNextMdConfig {
  const envConfig = parseEnvConfig(process.env.SITE_MD_CONFIG);
  const merged = mergeConfig(mergeConfig({}, envConfig ?? {}), input ?? {});
  const bypassSecret =
    merged.bypassSecret ||
    process.env.SITE_MD_BYPASS_SECRET ||
    process.env.SITE_MD_SECRET ||
    DEFAULT_BYPASS_SECRET;

  if (bypassSecret === DEFAULT_BYPASS_SECRET && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(
      "[site-md] No SITE_MD_BYPASS_SECRET configured. Using unsafe default secret.",
    );
  }

  return {
    bots: {
      trainingScrapers: merged.bots?.trainingScrapers ?? "markdown",
      searchCrawlers: merged.bots?.searchCrawlers ?? "markdown",
      userAgents: merged.bots?.userAgents ?? "markdown",
      additionalPatterns: merged.bots?.additionalPatterns ?? {},
      overridePatterns: merged.bots?.overridePatterns ?? {},
    },
    cacheTTL: merged.cacheTTL ?? 300,
    cacheMaxSize: merged.cacheMaxSize ?? 1000,
    passthrough: [...DEFAULT_PASSTHROUGH_PATTERNS, ...(merged.passthrough ?? [])],
    contentSelector: merged.contentSelector,
    stripSelectors: merged.stripSelectors ?? [],
    llmsTxt: {
      sitemapUrl: merged.llmsTxt?.sitemapUrl ?? "/sitemap.xml",
      title: merged.llmsTxt?.title,
      description: merged.llmsTxt?.description,
      pages: merged.llmsTxt?.pages,
      cacheTTL: merged.llmsTxt?.cacheTTL ?? 3600,
      maxPages: merged.llmsTxt?.maxPages ?? 100,
    },
    internalRoutePrefix: merged.internalRoutePrefix ?? "site-md",
    bypassSecret,
  };
}

export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function pathMatchesPattern(pathname: string, pattern: string): boolean {
  return wildcardToRegExp(pattern).test(pathname);
}
