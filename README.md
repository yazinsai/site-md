<p align="center">
  <img src="https://raw.githubusercontent.com/yazinsai/site-md/main/assets/hero.png" alt="site-md converts your Next.js pages to clean Markdown for AI agents" width="720" />
</p>

<h1 align="center">site-md</h1>

<p align="center">
  <strong>Serve clean Markdown from your Next.js site — for AI agents, crawlers, and LLMs.</strong>
  <br/>
  Your human visitors keep getting HTML. AI agents get fast, clean Markdown of the same pages.
  <br/>
  No content duplication. No rewrites. Just drop in two files.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/site-md"><img src="https://img.shields.io/npm/v/site-md.svg?style=flat-square&color=e9a94b&labelColor=171717" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/site-md"><img src="https://img.shields.io/npm/dm/site-md.svg?style=flat-square&color=8ab87a&labelColor=171717" alt="downloads"></a>
  <a href="https://bundlephobia.com/package/site-md"><img src="https://img.shields.io/bundlephobia/minzip/site-md?style=flat-square&color=d97757&labelColor=171717&label=size" alt="bundle size"></a>
  <a href="https://www.npmjs.com/package/site-md"><img src="https://img.shields.io/npm/types/site-md.svg?style=flat-square&color=6a89b8&labelColor=171717" alt="types"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/site-md.svg?style=flat-square&color=a8a29e&labelColor=171717" alt="MIT license"></a>
  <a href="https://github.com/yazinsai/site-md"><img src="https://img.shields.io/github/stars/yazinsai/site-md?style=flat-square&color=f0c14b&labelColor=171717" alt="github stars"></a>
</p>

<p align="center">
  <a href="#install-in-60-seconds">Install</a> ·
  <a href="#let-claude-code-or-any-agent-install-it-for-you">Agent install</a> ·
  <a href="#how-detection-works">How it works</a> ·
  <a href="#configuration-optional">Config</a> ·
  <a href="#troubleshooting">Troubleshooting</a>
</p>

---

```
GET /docs                           →  <html>…</html>   (humans)
GET /docs.md                        →  # Docs …         (agents)
GET /docs   Accept: text/markdown   →  # Docs …         (agents)
```

---

## Install in 60 seconds

```bash
pnpm add site-md     # or npm i site-md / yarn add site-md
```

Then create these **two files** in your Next.js app:

**`middleware.ts`** (project root)

```ts
export { proxy as middleware } from "site-md/proxy";

export const config = {
  matcher: [
    "/((?!api|_next|static|favicon.ico|.*\\.(?:js|css|json|xml|txt|map|webmanifest|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
```

**`app/api/site-md/[...path]/route.ts`**

```ts
export { GET } from "site-md/handler";
```

> **Do not** put this under `app/api/__site_md/...` or any folder starting with `_`. The Next.js App Router treats underscore-prefixed folders as [private folders](https://nextjs.org/docs/app/getting-started/project-structure#private-folders) and won't register routes inside them.

That's it. Restart your dev server and try:

```bash
curl http://localhost:3000/               # HTML
curl http://localhost:3000/index.md       # Markdown
curl -H "Accept: text/markdown" http://localhost:3000/
```

---

## Let Claude Code (or any agent) install it for you

Copy the block below verbatim into Claude Code, Cursor, or any coding agent. It will set up site-md end-to-end and verify it works.

````markdown
Install `site-md` in this Next.js app so AI agents and crawlers get clean Markdown versions of our pages. Follow every step below and debug any failure before declaring success.

**Critical gotchas — read before you start:**
- The route folder **must be `site-md`** (the package default). Do not put it under `app/api/__site_md/...` or any folder starting with `_` — Next.js App Router treats any `_`-prefixed folder as a [private folder](https://nextjs.org/docs/app/getting-started/project-structure#private-folders) and silently excludes it from routing. Symptom: `/index.md` returns 307/404 or HTML from your `not-found.tsx`.
- If `next.config.*` already exists, **edit it in place** — do not overwrite. Read it first, add the `withNextMd` import, and wrap the existing export. Match the existing file extension; if unsure, prefer `.mjs` (Next.js < 15 does not load `next.config.ts`).
- If a `README.md` already exists, **append** a short section — do not overwrite.

1. Install the package:
   - Detect the package manager (pnpm, npm, yarn, bun) by checking for lockfiles.
   - Run the install command, e.g. `pnpm add site-md`.

2. Create `middleware.ts` at the project root (or `src/middleware.ts` if this project uses `src/`). Use this exact content:

   ```ts
   export { proxy as middleware } from "site-md/proxy";

   export const config = {
     matcher: [
       "/((?!api|_next|static|favicon.ico|.*\\.(?:js|css|json|xml|txt|map|webmanifest|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$).*)",
     ],
   };
   ```

   If a `middleware.ts` already exists, merge the import and export `proxy as middleware` so both run. Ask me if the merge is ambiguous.

3. Create `app/api/site-md/[...path]/route.ts` (use `src/app/...` if this project uses `src/`). The folder name is `site-md` — **not** `__site_md`:

   ```ts
   export { GET } from "site-md/handler";
   ```

4. (Optional) Wrap `next.config.{ts,js,mjs}` with `withNextMd` so `/llms.txt` and `/llms-full.txt` are wired up and the bypass secret is generated:

   ```ts
   import { withNextMd } from "site-md/config";

   export default withNextMd(
     {
       // existing next config here
     },
     {
       llmsTxt: {
         title: "<my site name>",
         description: "<one-line site description>",
       },
     },
   );
   ```

   If `next.config.ts` fails to load (older Next versions), rename to `next.config.mjs` and keep the same contents.

5. Verify it works. Restart the dev server after creating/editing any of the files above — middleware and config are not hot-reloaded.
   - Start the dev server in the background.
   - `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/` → expect `200 text/html`.
   - `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/index.md` → expect `200 text/markdown`.
   - `curl -s http://localhost:3000/llms.txt | head -5` → expect a Markdown index starting with `# <my site name>`.
   - If `/index.md` returns HTML or a 307: the route folder name starts with `_` (rename to `site-md`), `internalRoutePrefix` doesn't match the folder, or the dev server wasn't restarted. Fix and re-run — do not declare success until all three checks pass.

6. Add a short note to the README (append — do not overwrite) telling maintainers that agent traffic is served Markdown via site-md, and link to https://github.com/yazinsai/site-md.

Report back with: package manager used, every file created/modified (full paths), and the raw output of the three curl checks.
````

---

## How detection works

A request is treated as "agent" and served Markdown when **any** of these match (first wins):

| Trigger                                 | Example                                  |
| --------------------------------------- | ---------------------------------------- |
| Path ends with `.md`                    | `/docs.md`, `/blog/post.md`              |
| `?format=md` query param                | `/docs?format=md`                        |
| `Accept: text/markdown` header          | agents that negotiate content            |
| Known bot User-Agent                    | `GPTBot`, `ClaudeBot`, `Googlebot`, …    |
| Path is `/llms.txt` or `/llms-full.txt` | standard LLM index files                 |

Everything else passes through untouched.

---

## Configuration (optional)

Only needed if you want to tune caching, bot policy, or the `llms.txt` output. Wrap your `next.config.ts`:

```ts
import { withNextMd } from "site-md/config";

export default withNextMd(
  {
    reactStrictMode: true,
  },
  {
    cacheTTL: 600,                         // cache Markdown for 10 min
    passthrough: ["/admin/*", "/app/*"],   // never convert these
    stripSelectors: [".cookie-banner"],    // remove from Markdown output
    bots: {
      trainingScrapers: "block",           // block GPTBot, Bytespider, etc.
      searchCrawlers: "markdown",
      userAgents: "markdown",
    },
    llmsTxt: {
      title: "My Site",
      description: "Public docs for AI consumers",
      sitemapUrl: "/sitemap.xml",          // used to build /llms-full.txt
    },
  },
);
```

### Bot policy values

Each bot category accepts one of:

- `"markdown"` — serve Markdown (default)
- `"block"` — return `403 Forbidden`
- `"passthrough"` — serve the normal HTML page

### Changing the internal route prefix

`internalRoutePrefix` must match your route folder:

```
app/api/<internalRoutePrefix>/[...path]/route.ts
```

The default prefix is `site-md`.

**Never start this name with an underscore.** Next.js App Router treats `_`-prefixed folders as private and silently excludes them from routing, so `__site_md`, `_md`, etc. will 404. Safe choices: `site-md`, `site_md`, `md`.

---

## What you get for free

- **`/llms.txt`** — Markdown index of your site, good for LLM discovery.
- **`/llms-full.txt`** — concatenated full-content Markdown pulled from your sitemap.
- **Response headers**:
  - `Content-Type: text/markdown; charset=utf-8`
  - `Vary: Accept, User-Agent`
  - `X-Content-Source: site-md`

---

## Safety notes

- Internal self-fetches carry a bypass header so they can't loop.
- Self-fetches strip cookies and auth — only public content is converted.
- Login redirects are treated as non-public and return a 404 Markdown response.
- Cache key includes URL + `Accept-Language`.

---

## Package exports

| Import                 | What it is                                 |
| ---------------------- | ------------------------------------------ |
| `site-md/proxy`        | Next.js middleware that detects + rewrites |
| `site-md/handler`      | App Router `GET` handler for conversion    |
| `site-md/config`       | `withNextMd()` next.config wrapper         |
| `site-md`              | Full re-exports                            |

---

## Troubleshooting

**Agents still receive HTML.**
- Is `middleware.ts` in the project root (or `src/` if you use that layout)?
- Does the matcher include the path you're testing?
- Try `curl http://localhost:3000/index.md` — if that works but `Accept: text/markdown` doesn't, the issue is the header, not the route.

**404, 307, or HTML on `/index.md`.**
- Your route folder name starts with `_` (e.g. `__site_md`). Next.js App Router treats any `_`-prefixed folder as private and won't register routes inside it. Rename the folder to something like `site-md` and set `internalRoutePrefix: "site-md"` in `withNextMd` to match.
- Or: `internalRoutePrefix` doesn't match the folder name. They must be identical.
- Restart the dev server — middleware and `next.config` are not hot-reloaded.

**`/llms.txt` is empty.**
- Set `llmsTxt.sitemapUrl` (defaults to `/sitemap.xml`) or provide `llmsTxt.pages` explicitly.

---

## Local development

```bash
pnpm install
pnpm test
pnpm test:integration
pnpm build
```

---

## License

MIT — see [LICENSE](./LICENSE).

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/yazinsai">@yazinsai</a> ·
    <a href="https://github.com/yazinsai/site-md">GitHub</a> ·
    <a href="https://www.npmjs.com/package/site-md">npm</a> ·
    <a href="https://github.com/yazinsai/site-md/issues">Report an issue</a>
  </sub>
</p>
