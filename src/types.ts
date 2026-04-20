import type { NextRequest } from "next/server";

export type BotCategory = "training" | "search" | "userAgent";
export type BotAction = "markdown" | "block" | "passthrough";

export interface NextMdConfig {
  bots?: {
    trainingScrapers?: BotAction;
    searchCrawlers?: BotAction;
    userAgents?: BotAction;
    additionalPatterns?: Partial<Record<BotCategory, RegExp>>;
    overridePatterns?: Partial<Record<BotCategory, RegExp>>;
  };
  cacheTTL?: number;
  cacheMaxSize?: number;
  passthrough?: string[];
  contentSelector?: string;
  stripSelectors?: string[];
  llmsTxt?: {
    sitemapUrl?: string;
    title?: string;
    description?: string;
    pages?: Array<{ path: string; title: string; description?: string }>;
    cacheTTL?: number;
    maxPages?: number;
  };
  internalRoutePrefix?: string;
  bypassSecret?: string;
}

export interface DetectionResult {
  detected: boolean;
  method:
    | "llms-txt"
    | "llms-full-txt"
    | "md-suffix"
    | "format-param"
    | "user-agent"
    | "accept-header"
    | "none";
  action: BotAction;
  originalUrl: string;
  botCategory?: BotCategory;
}

export interface HeadersLike {
  get(name: string): string | null;
}

export interface DetectionInput {
  url: URL;
  headers: HeadersLike;
  config: ResolvedNextMdConfig;
}

export interface ResolvedNextMdConfig {
  bots: {
    trainingScrapers: BotAction;
    searchCrawlers: BotAction;
    userAgents: BotAction;
    additionalPatterns: Partial<Record<BotCategory, RegExp>>;
    overridePatterns: Partial<Record<BotCategory, RegExp>>;
  };
  cacheTTL: number;
  cacheMaxSize: number;
  passthrough: string[];
  contentSelector?: string;
  stripSelectors: string[];
  llmsTxt: {
    sitemapUrl: string;
    title?: string;
    description?: string;
    pages?: Array<{ path: string; title: string; description?: string }>;
    cacheTTL: number;
    maxPages: number;
  };
  internalRoutePrefix: string;
  bypassSecret: string;
}

export interface ConvertOptions {
  url: string;
  contentSelector?: string;
  stripSelectors?: string[];
}

export interface ConvertResult {
  title: string;
  markdown: string;
}

export interface HandlerDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type NextMiddlewareResult = Response | undefined;
export type NextRequestLike = NextRequest | Request;
