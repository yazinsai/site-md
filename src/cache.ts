import { LRUCache } from "lru-cache";
import type { ResolvedNextMdConfig } from "./types";

export interface CacheEntry {
  markdown: string;
  status: number;
  headers: Record<string, string>;
  createdAt: number;
}

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.host = url.host.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, "");
  }

  const params = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  url.search = "";
  for (const [key, value] of params) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

export function cacheKey(url: string, lang: string | null): string {
  const normalized = normalizeUrl(url);
  return lang ? `${normalized}::${lang}` : normalized;
}

export function isResponseCacheable(
  response: Response,
  options?: { ignoreCacheControl?: boolean },
): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;
  if (options?.ignoreCacheControl) return true;
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (/\bprivate\b/i.test(cacheControl)) return false;
  if (/\bno-store\b/i.test(cacheControl)) return false;
  return true;
}

export function createMarkdownCache(config: ResolvedNextMdConfig): LRUCache<string, CacheEntry> {
  return new LRUCache<string, CacheEntry>({
    max: config.cacheMaxSize,
    ttl: config.cacheTTL * 1000,
  });
}
