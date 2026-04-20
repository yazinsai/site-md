# Agent-Friendly Markdown Proxy for React Sites

A reverse proxy that sits in front of React-based sites (Next.js, Remix, Astro, etc.) and serves clean markdown to AI agents while leaving human traffic untouched.

## Problem

AI agents — search bots, RAG crawlers, coding assistants, chat browsing tools — hit React sites and get hydrated HTML full of `<script>` bundles, client-side state, and layout noise. The actual content is buried. These agents need clean markdown, but:

1. Most frameworks lack declarative Accept-header routing (only Next.js has it)
2. Retrofitting every loader/route in an existing app is high-effort and fragile
3. New bot User-Agents appear constantly — keeping detection in-app is a maintenance burden

A proxy decouples detection + conversion from the app itself.

## Architecture

```
Client (browser / AI agent)
        │
        ▼
┌─────────────────────┐
│   Markdown Proxy    │  ← Detection + conversion layer
│  (standalone server) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Origin React App   │  ← Next.js / Remix / Astro / etc.
│  (unchanged)        │
└─────────────────────┘
```

The proxy:
1. Inspects every inbound request against the detection cascade
2. If **agent detected**: fetches the page from origin, converts HTML → markdown, responds with `Content-Type: text/markdown`
3. If **human detected**: reverse-proxies the request through to origin unmodified

The origin app requires zero changes.

## Detection Cascade

Requests are evaluated top-to-bottom. First match wins.

### 1. Explicit URL Convention (Highest Confidence)

| Signal | Action |
|---|---|
| Path is `/llms.txt` | Serve site index as markdown |
| Path is `/llms-full.txt` | Serve full site content as single markdown file |
| Path ends in `.md` (e.g. `/docs/setup.md`) | Strip `.md`, fetch `/docs/setup` from origin, convert, serve markdown |
| Query param `?format=md` | Fetch origin URL (without param), convert, serve markdown |

These are explicit opt-in. No ambiguity. Based on the [llms.txt convention](https://llmstxt.org/) (1000+ adopters).

### 2. User-Agent Matching

Match against known AI bot User-Agent strings:

**Training scrapers** (serve markdown or block per config):
```
GPTBot, ClaudeBot, Bytespider, CCBot, meta-externalagent,
Applebot-Extended, Google-Extended, Amazonbot, FacebookBot
```

**Search/RAG crawlers** (serve markdown):
```
OAI-SearchBot, PerplexityBot, YouBot
```

**User-triggered agents** (serve markdown — these represent real users):
```
ChatGPT-User, Perplexity-User, Claude-SearchTool
```

**Combined regex:**
```
/GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-SearchTool|PerplexityBot|Perplexity-User|YouBot|Bytespider|CCBot|meta-externalagent|Google-Extended|Applebot-Extended|Amazonbot|FacebookBot/i
```

Reliability: high. These bots self-identify. The regex must be user-configurable so new bots can be added without a proxy release.

### 3. Accept Header Content Negotiation

If the request's `Accept` header includes `text/markdown` with higher priority than `text/html`, serve markdown.

Examples:
- `Accept: text/markdown, */*` → markdown (prefers it, accepts anything as fallback)
- `Accept: text/markdown` → markdown
- `Accept: text/html, text/markdown;q=0.9` → HTML (html has higher implicit q=1.0)
- `Accept: text/html` → HTML
- `Accept: */*` → HTML (no markdown preference expressed)

This catches AI coding agents (Claude Code, Cursor, Windsurf) that use `WebFetch` tools sending `Accept: text/markdown, */*`. It's standards-compliant HTTP content negotiation (RFC 7231) — no special AI detection needed.

### 4. No Match → Pass Through

If none of the above trigger, proxy the request to origin unmodified. Normal browser traffic is never affected.

### Detection Summary (Decision Tree)

```
Request arrives
  │
  ├─ URL is /llms.txt or /llms-full.txt?
  │   └─ YES → serve pre-built markdown index/dump
  │
  ├─ URL ends in .md or has ?format=md?
  │   └─ YES → fetch origin page, convert to markdown, serve
  │
  ├─ User-Agent matches bot regex?
  │   └─ YES → fetch origin page, convert to markdown, serve
  │
  ├─ Accept header prefers text/markdown over text/html?
  │   └─ YES → fetch origin page, convert to markdown, serve
  │
  └─ NONE matched → reverse-proxy to origin unchanged
```

## HTML → Markdown Conversion

### Pipeline

```
Origin HTML response
  │
  ├─ 1. Strip non-content: <script>, <style>, <nav>, <footer>, <header>,
  │     cookie banners, analytics pixels, SVG sprites, <noscript>
  │
  ├─ 2. Extract main content: prefer <main> or <article>, fall back to
  │     <body> with layout wrappers removed
  │
  ├─ 3. Convert to markdown: heading hierarchy, links (absolute URLs),
  │     images (absolute URLs + alt text), code blocks (preserve language),
  │     tables, lists
  │
  └─ 4. Clean up: collapse excessive whitespace, remove empty headings,
        strip zero-content sections
```

### Libraries

Use [mozilla/readability](https://github.com/nicholasgross/readability) (or the `@mozilla/readability` npm package) for content extraction, then [turndown](https://github.com/mixmark-io/turndown) for HTML → markdown conversion. Both are battle-tested, handle React-rendered HTML well, and have no native dependencies.

### Response Headers

```http
Content-Type: text/markdown; charset=utf-8
Vary: Accept, User-Agent
X-Content-Source: markdown-proxy
```

The `Vary` header is critical — it tells CDNs and caches that the same URL can return different content depending on `Accept` and `User-Agent`.

## `/llms.txt` and `/llms-full.txt` Generation

The proxy needs to know which pages exist on the site to build these index files. Two approaches:

### Option A: Sitemap-Based (Recommended)

Fetch the origin's `/sitemap.xml`, extract all URLs, and build:
- `/llms.txt` — title + one-line description + markdown URL for each page
- `/llms-full.txt` — concatenated markdown of all pages (with `---` separators and URL headers)

Refresh on a schedule (e.g. hourly) or on-demand with a cache.

### Option B: Config-Provided

The user supplies a list of paths in the proxy config. Simpler, but requires manual updates.

## Configuration

```yaml
# proxy.config.yaml

# Required
origin: "https://myapp.com"
port: 3100

# Bot detection
bots:
  # Regex for User-Agent matching (overrides default)
  user_agent_regex: "/GPTBot|ChatGPT-User|ClaudeBot|PerplexityBot|.../i"
  # Action per bot category
  training_scrapers: "markdown"   # "markdown" | "block" | "passthrough"
  search_crawlers: "markdown"
  user_agents: "markdown"

# Content extraction
extraction:
  # CSS selectors for main content (tried in order, first match wins)
  content_selectors:
    - "main"
    - "article"
    - "[role='main']"
    - "#content"
  # CSS selectors to always strip (in addition to defaults)
  strip_selectors:
    - ".cookie-banner"
    - ".newsletter-signup"
    - "#ads"

# llms.txt generation
llms_txt:
  source: "sitemap"               # "sitemap" | "config"
  sitemap_url: "/sitemap.xml"     # relative to origin
  refresh_interval: 3600          # seconds
  # Or, if source is "config":
  # pages:
  #   - path: "/docs/getting-started"
  #     title: "Getting Started"
  #     description: "Quick setup guide"

# Caching
cache:
  enabled: true
  ttl: 300                        # seconds; markdown responses are cached
  max_entries: 1000

# Paths to exclude from agent detection (always pass through)
passthrough:
  - "/api/*"
  - "/_next/*"
  - "/static/*"
  - "*.js"
  - "*.css"
  - "*.png"
  - "*.jpg"
  - "*.svg"
  - "*.woff2"
```

## Why a Proxy Instead of In-App

| Concern | In-app (per-framework) | Proxy |
|---|---|---|
| **Next.js** | Clean — `has` condition on rewrites handles Accept headers declaratively in `next.config.js`. Middleware also works. | Proxy still simpler if you want one solution across multiple apps |
| **Remix** | No declarative config. Must add `respondTo()` logic to every loader via `remix-utils`. Repetitive and easy to miss routes. | Proxy covers all routes automatically |
| **Astro** | No declarative config. Middleware (v4.13+) or server endpoints only. | Same — proxy is less intrusive |
| **Bot list updates** | Redeploy the app | Update proxy config, no app changes |
| **Multiple apps** | Implement in each one | One proxy, many origins |
| **Content extraction** | App already has the data pre-render — could serve markdown directly from source | Proxy works on rendered HTML; may miss content behind client-side fetches |

**Trade-off**: If you control a single Next.js app and want zero infrastructure, the native `rewrites` + `has` approach is cleaner. The proxy is for teams running multiple sites, non-Next.js frameworks, or sites they don't control the source of.

### Next.js Native Alternative (No Proxy Needed)

For teams that only have Next.js apps and prefer no extra infrastructure:

```js
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/api/markdown/:path*',
        has: [{ type: 'header', key: 'accept', value: '(.*)text/markdown(.*)' }],
      },
    ];
  },
};
```

```js
// pages/api/markdown/[...path].js (or app/api/markdown/[...path]/route.js)
// Fetch the page's data, render to markdown, return with Content-Type: text/markdown
```

This is the only framework where you can do it declaratively. Remix and Astro require imperative code in every route handler.

## Caching Strategy

Markdown conversion is CPU-bound (DOM parse + extract + convert). Cache aggressively:

- **Cache key**: `origin_url + detection_method` (same URL can serve different content based on how the agent was detected, though in practice the markdown output is the same)
- **Simpler cache key**: just the origin URL, since the markdown output doesn't vary by detection method
- **TTL**: configurable, default 5 minutes. Most marketing/docs sites don't change every minute.
- **Invalidation**: cache-bust on deploy via a webhook or manual purge endpoint
- **Storage**: in-memory LRU for single-instance, Redis for multi-instance

## The Invisible Agent Problem

AI coding agents making requests via bare `curl` or generic HTTP clients are undetectable — no special UA, no Accept header. They look identical to a developer running `curl`.

This is **unsolvable at the proxy layer**. The only mitigation: make the explicit URL convention (`.md` suffix, `?format=md`, `/llms.txt`) well-known enough that agent tool authors configure their tools to use it. The proxy supports all of these patterns.

## Emerging Standards (Watch, Don't Build On)

- 51 active IETF drafts for AI agent identity (AgentID JWTs, Agent Passports, `/.well-known/ai`) — all at "I-D Exists" stage, zero production adoption
- W3C "AI Agent Protocol" community group — 215 members, no spec yet
- No registered well-known URIs for AI at IANA
- No custom headers like `X-AI-Agent` in use anywhere

None of these are usable today. The proxy's detection cascade (URL convention → UA → Accept header) covers everything that's real right now. When standards mature, they slot into the cascade as a new detection layer.

## Tech Stack (Suggested)

- **Runtime**: Node.js (for `@mozilla/readability` and `turndown` compatibility)
- **Proxy layer**: `http-proxy` or `hono` with a custom proxy middleware
- **HTML parsing**: `linkedom` or `jsdom` (for Readability)
- **Content extraction**: `@mozilla/readability`
- **HTML → MD**: `turndown` + `turndown-plugin-gfm` (for tables)
- **Cache**: `lru-cache` in-memory, optional Redis adapter
- **Config**: YAML via `js-yaml`
- **Deployment**: Docker container, or any Node.js host. Sits in front of the origin like any reverse proxy.

## MVP Scope

1. Reverse proxy with pass-through for non-agent traffic
2. Detection cascade (URL conventions, UA regex, Accept header parsing)
3. HTML → markdown conversion via Readability + Turndown
4. `/llms.txt` generation from sitemap
5. In-memory LRU cache with configurable TTL
6. YAML config file
7. Docker image

## Non-Goals (For Now)

- Per-bot response customization (e.g. shorter content for training scrapers vs full content for search bots)
- IP range verification for bot authenticity
- JavaScript rendering / headless browser (origin app serves SSR HTML; if it doesn't, the proxy can't help)
- Authentication / API key management for bot access
- Analytics dashboard for agent traffic
