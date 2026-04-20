# Plan: `next-md` npm package

## Context

AI agents hitting Next.js sites get hydrated HTML full of scripts and layout noise. We're building an npm package that intercepts agent requests and serves clean markdown — zero changes to the user's app code beyond 2 setup files. The original spec (`/Users/rock/ai/projects/md-proxy/spec.md`) describes a standalone reverse proxy; we're intentionally narrowing to a **Next.js-only npm package** first (per user direction). The spec remains useful as a reference for the detection cascade and conversion pipeline, but the architecture diverges.

**Competition**: `accept.md` handles Accept headers only. Vercel has a template but it's DIY. Our package covers the full detection cascade + automatic conversion + llms.txt generation + bot-category policy in one install.

**Name**: `next-md` (old Material Design package, zero dependents, 5 years stale — disputable). Fallback: `nextjs-md`.

---

## Architecture: Two Layers

**Why two layers**: Detection is lightweight (string matching). Conversion is heavy (DOM parsing + Readability + Turndown, requires Node.js). Separating them means human traffic never pays the conversion cost.

```
Request → proxy.ts (detection) → agent? → rewrite to /api/__next_md/[...path]
                                → human? → pass through unchanged

/api/__next_md/[...path] → self-fetch original page as HTML
                         → Readability + Turndown → markdown response
```

### Self-Fetch Loop Prevention

**Problem**: The route handler self-fetches the original page. That request re-enters proxy.ts. On serverless (Vercel), proxy and handler may run in different processes/regions, so a per-process random token won't work.

**Solution**: Deployment-wide secret via environment variable.

1. `withNextMd()` generates a random secret at build time → `process.env.NEXT_MD_BYPASS_SECRET`
2. The handler attaches it as `x-next-md-internal: <secret>` on every self-fetch
3. The proxy checks for it first — if present and matches, skip detection entirely
4. The `withNextMd()` rewrites also use `missing: [{ type: 'header', key: 'x-next-md-internal' }]` so rewrite rules don't match internal fetches
5. If user doesn't use `withNextMd()`, the secret falls back to `process.env.NEXT_MD_SECRET` (user sets it manually) or a hardcoded default with a console warning

This works across processes because env vars are deployment-wide and consistent.

### Self-Fetch Policy

Self-fetch requests are explicitly scoped to **public page content**:
- Strip all cookies from the self-fetch request
- Set `Accept: text/html` and a neutral User-Agent (`next-md-internal/1.0`)
- Do not forward `Authorization` or session headers
- Forward `Accept-Language` from the original request (so locale-aware pages render correctly)
- Cache key includes the path + `Accept-Language` value to avoid locale cross-contamination
- If the origin returns a redirect to a login page (3xx to `/login`, `/auth`, etc.), return 404 with a clear error — the page is not public

---

## User Setup (after `npm install next-md`)

### Minimal (2 files, ~6 lines)

**`proxy.ts`** (or `middleware.ts` for Next.js 14-15):
```ts
export { proxy } from 'next-md/proxy'
export const config = {
  matcher: ['/((?!api|_next|static|favicon.ico|.*\\.(?:js|css|json|xml|txt|map|webmanifest|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$).*)'],
}
```

**`app/api/__next_md/[...path]/route.ts`**:
```ts
export { GET } from 'next-md/handler'
```

### Advanced (add `next.config.ts` for config + rewrites)

```ts
import { withNextMd } from 'next-md/config'
export default withNextMd({ /* existing config */ }, {
  cacheTTL: 600,
  passthrough: ['/admin/*', '/dashboard/*'],
  stripSelectors: ['.cookie-banner'],
  bots: {
    trainingScrapers: 'block',    // block GPTBot, Bytespider, etc.
    searchCrawlers: 'markdown',   // serve markdown to PerplexityBot, etc.
    userAgents: 'markdown',       // serve markdown to ChatGPT-User, etc.
  },
  llmsTxt: { sitemapUrl: '/sitemap.xml', title: 'My Site' },
})
```

---

## Package Structure

```
next-md/
├── src/
│   ├── index.ts              # Re-exports public APIs
│   ├── types.ts              # All TypeScript interfaces
│   ├── bot-patterns.ts       # Bot UA patterns grouped by category
│   ├── accept-parse.ts       # RFC 7231 Accept header parser
│   ├── detect.ts             # Detection cascade (pure functions)
│   ├── convert.ts            # HTML → markdown (Readability + Turndown)
│   ├── cache.ts              # LRU cache wrapper with explicit key definition
│   ├── proxy.ts              # createNextMdProxy() + default export
│   ├── handler.ts            # createNextMdHandler() + GET export
│   ├── config.ts             # withNextMd() next.config wrapper
│   └── llms-txt.ts           # /llms.txt + /llms-full.txt generation
├── tests/
│   ├── detect.test.ts
│   ├── convert.test.ts
│   ├── accept-parse.test.ts
│   ├── handler.test.ts
│   ├── proxy.test.ts
│   ├── llms-txt.test.ts
│   ├── cache.test.ts
│   └── fixture-app/          # Minimal Next.js app for integration tests
│       ├── app/
│       │   ├── page.tsx
│       │   ├── docs/page.tsx
│       │   └── api/__next_md/[...path]/route.ts
│       ├── proxy.ts
│       ├── next.config.ts
│       └── package.json
├── tsup.config.ts
├── tsconfig.json
├── package.json
├── README.md
└── LICENSE
```

### Package exports (tree-shakeable)

- `next-md/proxy` — detection logic only (lightweight, Edge-compatible)
- `next-md/handler` — conversion logic (jsdom, Readability, Turndown — Node.js only)
- `next-md/config` — `withNextMd()` wrapper
- `next-md` — re-exports everything

### Dependencies

| Package | Purpose |
|---------|---------|
| `@mozilla/readability` ^0.6.0 | Content extraction from HTML |
| `turndown` ^7.2.4 | HTML → markdown |
| `@joplin/turndown-plugin-gfm` ^1.0.12 | Tables, strikethrough, task lists |
| `jsdom` ^25.0.0 | DOM for Readability (linkedom lacks `cloneNode`/`getComputedStyle`) |
| `lru-cache` ^11.0.0 | In-memory cache |

Peer deps: `next >=14.0.0`

---

## Detection Cascade (`src/detect.ts`)

Runs top-to-bottom, first match wins.

### Input/Output

```ts
interface DetectionResult {
  detected: boolean
  method: 'llms-txt' | 'llms-full-txt' | 'md-suffix' | 'format-param' | 'user-agent' | 'accept-header' | 'none'
  action: 'markdown' | 'block' | 'passthrough'
  originalUrl: string  // Full normalized URL (not just path)
  botCategory?: 'training' | 'search' | 'user-agent'
}
```

### Cascade

1. **Internal bypass** — check `x-next-md-internal` header against `NEXT_MD_BYPASS_SECRET`. If match → `{ detected: false }`.
2. **Passthrough check** — skip `/_next/*`, `/api/*`, `/static/*`, and all static file extensions (`.js`, `.css`, `.json`, `.xml`, `.txt`, `.map`, `.webmanifest`, `.png`, `.jpg`, `.svg`, `.woff2`, etc.) plus user-configured paths.
3. **`/llms.txt` or `/llms-full.txt`** — exact path match.
4. **`.md` suffix** — strip suffix, preserve full URL (basePath, query string, protocol, host). E.g. `/docs/setup.md?lang=en` → fetch `/docs/setup?lang=en`.
5. **`?format=md`** — strip `format` param, preserve rest of query string. E.g. `/page?format=md&lang=en` → fetch `/page?lang=en`.
6. **User-Agent regex** — match against bot patterns grouped by category. Look up category → config action (`markdown`/`block`/`passthrough`). Return the action.
7. **Accept header** — RFC 7231 quality-value parsing. Markdown only if `text/markdown` q-value strictly > `text/html` q-value. `Accept: */*` alone → HTML.
8. **No match** → `{ detected: false, method: 'none' }`

### Bot Categories (`src/bot-patterns.ts`)

```ts
export const BOT_CATEGORIES = {
  training: /GPTBot|Bytespider|CCBot|meta-externalagent|Google-Extended|Applebot-Extended|Amazonbot|FacebookBot/i,
  search: /OAI-SearchBot|PerplexityBot|YouBot/i,
  userAgent: /ChatGPT-User|Perplexity-User|Claude-SearchTool/i,
} as const

export type BotCategory = keyof typeof BOT_CATEGORIES
export type BotAction = 'markdown' | 'block' | 'passthrough'
```

Default policy: all categories → `'markdown'`. Users override per-category in config.

---

## Conversion Pipeline (`src/convert.ts`)

1. Parse HTML with **jsdom**
2. Strip: `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<noscript>`, `<iframe>`, `<svg>`, plus user-configured selectors
3. Extract content with **Readability** (fall back to `<main>`/`<article>`/`<body>`)
4. Convert with **Turndown** + GFM plugin (ATX headings, fenced code blocks)
5. Absolutify all URLs (links + images) using the page's base URL
6. Prepend page title as H1
7. Clean up whitespace, remove empty headings

### Response headers
```
Content-Type: text/markdown; charset=utf-8
Vary: Accept, User-Agent
X-Content-Source: next-md
```

---

## Cache Design (`src/cache.ts`)

### Cache Key

```ts
function cacheKey(url: string, lang: string | null): string {
  // Normalize: strip trailing slash, lowercase host, sort query params
  const normalized = normalizeUrl(url)
  return lang ? `${normalized}::${lang}` : normalized
}
```

- Key = normalized URL + `Accept-Language` value (to separate locale variants)
- No user/session data in key — only public pages are cached
- Query strings are included in the key (different params = different content)

### Cacheability Rules

- Only cache responses with status 200
- Never cache if origin response has `Set-Cookie` header (indicates personalized content)
- Never cache if origin response has `Cache-Control: private` or `no-store`
- TTL: configurable, default 300s (5 minutes)
- Max entries: configurable, default 1000

### Implementation

`lru-cache` with TTL support. On Vercel serverless, cache lives for the function instance lifetime (limited but still helps for burst traffic). For self-hosted, cache persists as long as the process runs.

---

## llms.txt Generation (`src/llms-txt.ts`)

### `/llms.txt` format
```markdown
# Site Title

> Site description

## Pages

- [Getting Started](/docs/getting-started.md): Quick setup guide
- [API Reference](/docs/api.md): Complete API docs
```

### `/llms-full.txt` format
```markdown
# Site Title - Full Content

---
## Getting Started
> Source: https://mysite.com/docs/getting-started

[full page markdown]

---
```

### Operational Constraints

- **Concurrency**: max 3 concurrent self-fetches when building `/llms-full.txt`
- **Page cap**: default 100 pages (configurable via `llmsTxt.maxPages`)
- **Byte cap**: abort and serve partial if response exceeds 5MB
- **Per-page timeout**: 10s per self-fetch, skip page on timeout
- **Partial failure**: if a page fails to fetch/convert, skip it with a comment (`<!-- Failed to fetch: /path -->`) and continue
- **Caching**: cache the built result for 1 hour (configurable). First request triggers build; subsequent requests serve from cache
- **Sitemap parsing**: lightweight string/regex parsing (no XML library dependency)

---

## Config Schema (`src/types.ts`)

```ts
export interface NextMdConfig {
  /** Bot category policies */
  bots?: {
    trainingScrapers?: BotAction  // default: 'markdown'
    searchCrawlers?: BotAction    // default: 'markdown'
    userAgents?: BotAction        // default: 'markdown'
    /** Additional UA patterns to match (merged with defaults) */
    additionalPatterns?: Record<BotCategory, RegExp>
    /** Replace default patterns entirely */
    overridePatterns?: Record<BotCategory, RegExp>
  }
  /** Cache TTL in seconds (default: 300) */
  cacheTTL?: number
  /** Maximum cache entries (default: 1000) */
  cacheMaxSize?: number
  /** Paths to never intercept — glob patterns (merged with defaults) */
  passthrough?: string[]
  /** CSS selector for main content area (default: auto-detect via Readability) */
  contentSelector?: string
  /** CSS selectors to strip before conversion */
  stripSelectors?: string[]
  /** llms.txt generation */
  llmsTxt?: {
    sitemapUrl?: string       // default: '/sitemap.xml'
    title?: string
    description?: string
    pages?: Array<{ path: string; title: string; description?: string }>
    cacheTTL?: number         // default: 3600
    maxPages?: number         // default: 100
  }
  /** Internal route prefix (default: '__next_md') */
  internalRoutePrefix?: string
  /** Bypass secret (auto-generated by withNextMd, or set manually) */
  bypassSecret?: string
}
```

### Config Sharing Between Layers

`withNextMd()` does two things at build time:
1. Serializes config into `process.env.NEXT_MD_CONFIG` (RegExp stored as `{ source, flags }`)
2. Generates a random bypass secret → `process.env.NEXT_MD_BYPASS_SECRET`

Both proxy and handler read from these env vars. Explicit options passed to `createNextMdProxy()`/`createNextMdHandler()` override env config.

---

## Middleware Composition

`createNextMdProxy()` returns `NextResponse | undefined`. Returning `undefined` signals "I didn't handle this":

```ts
const nextMd = createNextMdProxy()
export async function proxy(request: NextRequest) {
  const mdResponse = nextMd(request)
  if (mdResponse) return mdResponse
  return auth(request)  // next-auth takes over for non-agent traffic
}
```

---

## Build

**tsup** with 4 entry points (`index`, `proxy`, `handler`, `config`). ESM + CJS dual output. DTS generation enabled. `next` and `react` externalized.

---

## Implementation Order

### Phase 1 — Core
1. `src/types.ts` — all interfaces and config types
2. `src/bot-patterns.ts` — bot UA patterns grouped by category + tests
3. `src/accept-parse.ts` — RFC 7231 Accept header parser + tests
4. `src/detect.ts` — full detection cascade with normalization + tests
5. `src/convert.ts` — HTML→markdown pipeline + tests
6. `src/cache.ts` — LRU wrapper with explicit key/cacheability rules + tests

### Phase 2 — Integration
7. `src/handler.ts` — route handler with self-fetch, cookie stripping, locale forwarding + tests
8. `src/proxy.ts` — proxy/middleware with bypass check, bot-category policy + tests
9. `src/index.ts` — re-exports

### Phase 3 — Config + Build
10. `src/config.ts` — `withNextMd()` with rewrite injection, secret generation, env serialization
11. `tsup.config.ts` + `tsconfig.json` + `package.json`
12. Build and verify all exports resolve correctly

### Phase 4 — llms.txt
13. `src/llms-txt.ts` — generation with concurrency/byte/timeout limits + tests
14. Wire into handler (handle `/llms.txt` and `/llms-full.txt` paths)

### Phase 5 — Integration Testing
15. `tests/fixture-app/` — minimal Next.js app with the package wired up
16. Integration tests: curl-style assertions for all detection methods
17. Verify no infinite loops, correct cache behavior, bot blocking

### Phase 6 — Polish
18. README with setup instructions
19. Error handling edge cases (404s, timeouts, non-HTML responses, redirect-to-login detection)
20. LICENSE

---

## Verification

1. `pnpm test` — all unit tests pass
2. `pnpm build` — tsup produces correct ESM/CJS/DTS outputs
3. Start the fixture Next.js app with `next dev`, run integration tests:
   - `curl -H "Accept: text/markdown" localhost:3000/` → markdown
   - `curl localhost:3000/page.md` → markdown (`.md` suffix)
   - `curl localhost:3000/page?format=md` → markdown (query param)
   - `curl localhost:3000/page?format=md&lang=en` → markdown (preserves other params)
   - `curl -A "GPTBot" localhost:3000/` → markdown (UA detection)
   - `curl -A "Bytespider" localhost:3000/` with `trainingScrapers: 'block'` → 403
   - `curl localhost:3000/` → normal HTML (no detection)
   - `curl localhost:3000/llms.txt` → site index markdown
   - `curl localhost:3000/api/something` → passthrough (not intercepted)
   - No infinite loops on any self-fetch path
   - Second request to same URL is served from cache (check response time)
4. Verify `Vary: Accept, User-Agent` header present on all markdown responses
