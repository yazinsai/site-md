# site-md

Repository: `github.com/yazinsai/md-site`

Serve clean Markdown from your Next.js pages for AI agents and crawlers.

Your normal users still get regular HTML. Agent traffic gets content-focused Markdown.

---

## Why this exists

Most AI agents fetch fully hydrated HTML pages with lots of script/layout noise.
`site-md` gives them cleaner content automatically:

- Detects agent requests (`Accept`, User-Agent, `.md`, `?format=md`, etc.)
- Rewrites those requests to an internal route
- Fetches your public page HTML safely
- Converts it to Markdown
- Returns `text/markdown`

No big app rewrite. Just wire in 2 files.

---

## Install

```bash
pnpm add site-md
```

---

## Quick start (2 files)

### 1) Add middleware/proxy

Create `middleware.ts` (recommended) or `proxy.ts` in your app root:

```ts
export { proxy as middleware } from "site-md/proxy";

export const config = {
  matcher: [
    "/((?!api|_next|static|favicon.ico|.*\\.(?:js|css|json|xml|txt|map|webmanifest|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
```

### 2) Add the internal API route

Create `app/api/site_md/[...path]/route.ts`:

```ts
export { GET } from "site-md/handler";
```

That is enough to start serving Markdown for agent-style requests.

---

## Optional config with `withNextMd`

Use `withNextMd` in `next.config.ts` if you want custom cache behavior, bot policy, llms files, etc.

```ts
import { withNextMd } from "site-md/config";

export default withNextMd(
  {
    reactStrictMode: true,
  },
  {
    internalRoutePrefix: "site_md",
    cacheTTL: 600,
    passthrough: ["/admin/*", "/dashboard/*"],
    stripSelectors: [".cookie-banner"],
    bots: {
      trainingScrapers: "block",
      searchCrawlers: "markdown",
      userAgents: "markdown",
    },
    llmsTxt: {
      sitemapUrl: "/sitemap.xml",
      title: "My Site",
      description: "Public docs and pages for AI consumers",
    },
  },
);
```

> Important: keep `internalRoutePrefix` aligned with your route folder:
> `app/api/<internalRoutePrefix>/[...path]/route.ts`

---

## Detection methods (first match wins)

`site-md` can trigger Markdown mode using:

1. Internal bypass header (used for safe self-fetch)
2. `/llms.txt` and `/llms-full.txt`
3. `.md` suffix (`/docs.md`)
4. `?format=md` (`/docs?format=md`)
5. Bot User-Agent patterns
6. `Accept` header preference (`text/markdown` > `text/html`)

If no rule matches, request passes through unchanged.

---

## Bot policy

You can define behavior by bot category:

- `trainingScrapers`: training bots (`GPTBot`, `Bytespider`, etc.)
- `searchCrawlers`: search bots
- `userAgents`: interactive user-agent clients

Each category can be:

- `markdown`
- `block` (403)
- `passthrough`

---

## What responses look like

Markdown responses include:

- `Content-Type: text/markdown; charset=utf-8`
- `Vary: Accept, User-Agent`
- `X-Content-Source: site-md`

---

## Endpoints you get

- `/llms.txt` - index of pages for LLM consumers
- `/llms-full.txt` - assembled full content (from sitemap or configured pages)

---

## Security / behavior notes

- Internal self-fetches use a bypass secret header to prevent rewrite loops.
- Self-fetches do not forward cookies or auth headers.
- `Accept-Language` is forwarded for locale-aware pages.
- Cache key includes URL + language.
- Redirect-to-login responses are treated as non-public content and return 404 Markdown.

---

## Package exports

- `site-md/proxy` - request detection + rewrite layer
- `site-md/handler` - HTML to Markdown conversion route handler
- `site-md/config` - `withNextMd()` helper
- `site-md` - full re-exports

---

## Local development

```bash
pnpm install
pnpm test
pnpm test:integration
pnpm build
```

---

## Troubleshooting

### I get 404 for rewritten requests

- Make sure the internal route exists:
  `app/api/site_md/[...path]/route.ts`
- Make sure `internalRoutePrefix` matches the folder name.

### Agents still receive HTML

- Confirm middleware/proxy file is loaded by Next.
- Check matcher is not excluding your target route.
- Test directly with:
  - `curl -H "Accept: text/markdown" http://localhost:3000/`
  - `curl http://localhost:3000/docs.md`

### I want different bot behavior

Set `bots.trainingScrapers`, `bots.searchCrawlers`, and `bots.userAgents` in `withNextMd()`.
