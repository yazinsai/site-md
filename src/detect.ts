import { detectBotCategory, mergeBotPatterns } from "./bot-patterns";
import { prefersMarkdownOverHtml } from "./accept-parse";
import { pathMatchesPattern } from "./config-resolve";
import type { BotCategory, DetectionInput, DetectionResult } from "./types";

function stripMdSuffix(url: URL): URL {
  const out = new URL(url.toString());
  out.pathname = out.pathname.replace(/\.md$/i, "");
  return out;
}

function stripFormatParam(url: URL): URL {
  const out = new URL(url.toString());
  out.searchParams.delete("format");
  return out;
}

function botActionForCategory(category: BotCategory, input: DetectionInput): DetectionResult["action"] {
  if (category === "training") return input.config.bots.trainingScrapers;
  if (category === "search") return input.config.bots.searchCrawlers;
  return input.config.bots.userAgents;
}

function passthrough(pathname: string, input: DetectionInput): boolean {
  return input.config.passthrough.some((pattern) => pathMatchesPattern(pathname, pattern));
}

export function detectRequest(input: DetectionInput): DetectionResult {
  const internalHeader = input.headers.get("x-site-md-internal");
  if (internalHeader && internalHeader === input.config.bypassSecret) {
    return {
      detected: false,
      method: "none",
      action: "passthrough",
      originalUrl: input.url.toString(),
    };
  }

  if (input.url.pathname === "/llms.txt") {
    return {
      detected: true,
      method: "llms-txt",
      action: "markdown",
      originalUrl: input.url.toString(),
    };
  }

  if (passthrough(input.url.pathname, input)) {
    return {
      detected: false,
      method: "none",
      action: "passthrough",
      originalUrl: input.url.toString(),
    };
  }

  if (input.url.pathname === "/llms-full.txt") {
    return {
      detected: true,
      method: "llms-full-txt",
      action: "markdown",
      originalUrl: input.url.toString(),
    };
  }

  if (input.url.pathname.endsWith(".md")) {
    return {
      detected: true,
      method: "md-suffix",
      action: "markdown",
      originalUrl: stripMdSuffix(input.url).toString(),
    };
  }

  if (input.url.searchParams.get("format") === "md") {
    return {
      detected: true,
      method: "format-param",
      action: "markdown",
      originalUrl: stripFormatParam(input.url).toString(),
    };
  }

  const userAgent = input.headers.get("user-agent") ?? "";
  if (userAgent) {
    const patterns = mergeBotPatterns({
      additionalPatterns: input.config.bots.additionalPatterns,
      overridePatterns: input.config.bots.overridePatterns,
    });
    const category = detectBotCategory(userAgent, patterns);
    if (category) {
      return {
        detected: true,
        method: "user-agent",
        action: botActionForCategory(category, input),
        botCategory: category,
        originalUrl: input.url.toString(),
      };
    }
  }

  if (prefersMarkdownOverHtml(input.headers.get("accept"))) {
    return {
      detected: true,
      method: "accept-header",
      action: "markdown",
      originalUrl: input.url.toString(),
    };
  }

  return {
    detected: false,
    method: "none",
    action: "passthrough",
    originalUrl: input.url.toString(),
  };
}
