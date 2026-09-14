# Technical SEO Audit — tentare.app

Scope note: this pass covers robots.txt precedence, canonical/URL consistency, security
headers, mobile viewport, and a spot-check of console errors on 6 pages total
(`/`, `/precios`, `/comparativa`, `/network`, `/ayuda`, `/network/instructoras`). It is
one pass across all checklist categories, not an exhaustive deep-dive on any one of them.
Anything not directly observed is marked UNKNOWN.

## What works

- **HTTPS + HSTS**: `Strict-Transport-Security: max-age=63072000` present on the homepage
  response (no `includeSubDomains`/`preload` directive, but the base directive is present
  and the max-age is a healthy 2 years).
- **Clickjacking protection**: `X-Frame-Options: DENY` and `Content-Security-Policy:
  frame-ancestors 'none'` both present on the homepage.
- **Self-referencing canonicals, all consistent on `www` + `https`**: verified on `/`,
  `/precios`, `/comparativa`, `/network`, `/ayuda`, and `/network/instructoras` — every one
  returns `200` and a `<link rel="canonical">` pointing to its own exact
  `https://www.tentare.app/...` URL. No canonical pointed to a different host, scheme, or
  a trailing-slash variant.
- **Mobile viewport meta tag present**: `<meta name="viewport" content="width=device-width,
  initial-scale=1"/>` confirmed in the rendered homepage HTML (`homepage-render.json`).
- **URL structure is clean across the full sitemap** (139 URLs, `sitemap-urls.txt`):
  - No trailing slashes on any URL.
  - No query parameters on any URL.
  - No uppercase characters in any path.
  - 100% of URLs use `https://www.tentare.app` consistently — zero `http://`, zero bare
    `tentare.app` (non-www), zero mixed-case host.
- **No redirect chains observed**: `/`, `/precios`, `/comparativa`, `/network`, `/ayuda`,
  and `/network/instructoras` all returned `200` directly with an empty `redirect_chain`
  (no 301/302 hops).
- **No console errors observed** on the 6 pages checked in this pass (`/`, `/precios`,
  `/comparativa`, `/network`, `/ayuda`, `/network/instructoras` — the last two newly
  checked in this run; `/` and `/precios` reconfirmed; `/reservar/tentare` was confirmed
  clean in the prior attempt and is not re-verified here).
- **Server-rendered, not client-rendered**: `is_spa: false` on every page checked, with
  `render_page.py --mode auto` resolving via a raw fetch (no Playwright render needed) on
  `/`, `/precios`, `/comparativa`, `/network`, `/ayuda`. Content is present in the initial
  HTML response — no JS-rendering dependency for indexing on these pages.
- **Valid, rich structured data on the homepage**: 9 JSON-LD blocks, all `valid: true`,
  covering `SoftwareApplication`/`Offer`, `FAQPage` (with `Question`/`Answer`),
  `Organization`/`ContactPoint`, `WebSite` (with `SearchAction`), and 4×
  `SiteNavigationElement` blocks. Not validated on other pages in this pass (UNKNOWN
  elsewhere).
- **Sitemap is a flat, non-indexed `sitemap.xml`** at the canonical host with `Host` and
  `Sitemap` both pointing to `https://www.tentare.app` — consistent with the canonical
  host used everywhere else.

## Findings

### 1. `robots.txt` blanket `Disallow: /network/` is overridden by more-specific `Allow` rules — net effect is correct, but the ordering is fragile and worth cleaning up
- **Severity**: Low
- **Description**: `robots.txt` lists `Allow: /network`, `Allow: /network/instructoras`,
  `Allow: /network/crear-perfil`, `Allow: /network/terminos`, and
  `Allow: /network/privacidad` individually, followed later by a blanket
  `Disallow: /network/`. Per the standard robots.txt precedence rule (RFC 9309 / Google's
  documented behavior), rule order in the file does **not** determine precedence — the
  **most specific matching rule wins**, regardless of whether it's an Allow or Disallow and
  regardless of which one appears first or last in the file. `Allow: /network/instructoras`
  is more specific (longer matching path) than `Disallow: /network/`, so it wins for
  `/network/instructoras` and everything under that path prefix, including the
  `/network/instructoras/<slug>` profile pages and `/network/instructoras/ciudad/<city>`
  pages that are present in the sitemap (e.g.
  `https://www.tentare.app/network/instructoras/judith-clemente-barcelona`,
  `https://www.tentare.app/network/instructoras/ciudad/barcelona`). Net effect: those pages
  are correctly crawlable. However, any `/network/` sub-path that is **not** covered by one
  of the five explicit `Allow` lines (e.g. a future `/network/foo` route) would fall through
  to the blanket `Disallow: /network/` and be blocked — likely unintentionally, since the
  five `Allow` lines suggest the intent is "most of /network/ is public."
- **Recommendation**: Not urgent to fix functionally (current sitemap URLs are all
  correctly allowed), but for maintainability and to avoid silently blocking future
  `/network/*` routes, restructure so the blanket disallow isn't needed — e.g. remove
  `Disallow: /network/` entirely and disallow only the specific non-public sub-paths (if
  any exist), or add a comment in robots.txt noting that specificity, not order, governs
  precedence, so future edits don't assume first-match-wins.

### 2. `/reservar/*` booking-widget pages are indexed via sitemap with no robots.txt exclusion
- **Severity**: Informational
- **Description**: Four `/reservar/<studio-slug>` pages are present in the sitemap
  (`/reservar/tentare`, `/reservar/indira-herrero`, `/reservar/estudio-marta-pilates-yoga`,
  `/reservar/estudio-salma`), and `/reservar` is **not** among the paths listed in
  `robots.txt`'s `Disallow` block (which does disallow adjacent transactional paths like
  `/confirmar-reserva`, `/disponibilidad`, `/no-puedo`). This means these four per-studio
  booking-widget pages are both crawlable and explicitly submitted for indexing. This is an
  architectural choice, not inherently a defect — these are the public embeddable booking
  widgets for named studios (marketing/SEO surface for studio names), distinct from the
  disallowed transactional flow paths. Flagging as a factual note for the orchestrator/
  product owner to confirm this is intentional (e.g. that indexing a customer's booking page
  under the tentare.app domain, rather than only the customer's own embedded widget, is the
  desired SEO/privacy posture), since only 4 of presumably many customer studios appear
  seeded into the sitemap.
- **Recommendation**: No technical change needed unless product intent differs from current
  behavior. Confirm with the site owner whether all customer studios should have a
  `/reservar/<slug>` page indexed, or whether this list should be capped/curated (thin/
  near-duplicate content risk if this list grows to hundreds of near-identical booking
  widget pages with the studio name as the only differentiator — not verified either way in
  this pass, content of these 4 pages was not fetched here).

### 3. HSTS header lacks `includeSubDomains` and `preload`
- **Severity**: Low
- **Description**: Homepage response header is `Strict-Transport-Security: max-age=63072000`
  only. No `includeSubDomains` directive (subdomains like a future `api.tentare.app` or
  staging subdomains would not be covered by this HSTS policy) and no `preload` directive
  (site is not eligible for browser HSTS preload lists as configured).
- **Recommendation**: Low priority. If all subdomains are also served over HTTPS-only,
  consider adding `includeSubDomains; preload` and submitting to hstspreload.org for
  defense-in-depth. Not a blocker — HSTS is present and long-lived, which is the important
  part.

### 4. No explicit `X-Content-Type-Options` header observed
- **Severity**: Low
- **Description**: The homepage response headers (`Access-Control-Allow-Origin`,
  `Cache-Control`, `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Frame-Options`, etc.) do not include `X-Content-Type-Options: nosniff`. Only the
  homepage headers were inspected (from `homepage-render.json`) — not re-verified on other
  pages in this pass.
- **Recommendation**: Add `X-Content-Type-Options: nosniff` as a defense-in-depth header
  (standard, low-effort, no downside). Low priority given the CSP and X-Frame-Options are
  already solid.

### 5. Broad `Access-Control-Allow-Origin: *` on the homepage HTML response
- **Severity**: Informational
- **Description**: The homepage response includes `Access-Control-Allow-Origin: *`. This is
  unusual for an HTML document response (CORS headers are normally relevant for
  fetch/XHR-consumed resources, not top-level page navigations, where they're typically a
  no-op) — most likely an artifact of the CDN/Vercel edge config applying a blanket CORS
  header to all responses rather than something scoped to specific API routes. Not a direct
  SEO issue and not necessarily a security issue for a public marketing page, but worth a
  sanity check that this isn't unintentionally also applied to authenticated API responses
  elsewhere (out of scope for this technical-SEO pass — flagging for `tentare-seguridad` if
  not already reviewed there).
- **Recommendation**: Confirm this CORS header is scoped appropriately and not leaking onto
  any authenticated JSON API response. No SEO action needed on the marketing pages
  themselves.

## Not checked in this pass (UNKNOWN)

- Canonical tags, headers, and console errors on the ~133 sitemap URLs not in the 6-page
  sample (in particular: `/comparativa/tentare-vs-*` (13 pages), `/funcionalidades/*` (12
  pages), `/ayuda/*` sub-pages, `/network/instructoras/<slug>` profile pages, and the 4
  `/reservar/<slug>` pages).
- Core Web Vitals (LCP/INP/CLS) — no field or lab performance data was gathered in this
  pass; only static HTML/header inspection was performed.
- hreflang (out of scope here per the skill's cross-skill delegation to `seo-hreflang`;
  also no evidence of internationalization in the sitemap — all 139 URLs are Spanish-only
  paths with no locale prefixes, so hreflang is likely not applicable, but not formally
  verified).
- IndexNow protocol adoption (Bing/Yandex/Naver) — not checked.
- `noindex` meta tags or `X-Robots-Tag` headers on any page other than the 6 sampled (all 6
  sampled pages returned 200 with no noindex observed in the fetched HTML, and no
  `X-Robots-Tag` header was present in the homepage headers dump).
- Structured data validity on pages other than the homepage.
- Redirect behavior for non-www → www or http → https (only observed that sitemap URLs are
  already 100% consistent on `https://www.tentare.app`; the actual redirect status codes
  for `http://tentare.app` or `https://tentare.app` were not fetched in this pass).
