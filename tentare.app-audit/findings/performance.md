# Performance / Core Web Vitals — tentare.app

Scope: `/`, `/precios`, `/funcionalidades/sustituciones`, `/comparativa`, `/network/instructoras`.
Measured 2026-09-10.

## Measurement environment — read this before the numbers

**No Core Web Vitals number in this report is real-user (CrUX) field data, and no Lighthouse
lab score could be produced either.** Both tool paths failed before producing a metric:

- `pagespeed_check.py` (PSI v5 + CrUX) → `google_auth.py --check` confirms **Tier -1, no
  Google API key configured** in this environment. Every call returned
  `"PSI rate limit exceeded (240 QPM / 25,000 QPD)"`, which for an unauthenticated/no-key
  request is PSI's generic failure message, not a real quota exhaustion — there is no field
  or lab data behind it.
- `lcp_subparts.py` (CrUX LCP subparts) → hard error: `Google API key not configured`.
- `unlighthouse_run.py` (local Lighthouse via Puppeteer/system Chrome) → found and launched
  system Chrome, discovered the sitemap (139 routes) and got partway through Unlighthouse's
  HTML-inspection phase (30–36% complete) **twice**, then crashed both times with
  `Error: Unable to get browser page` (`puppeteer-cluster` `Worker.js:41`) before it ever
  reached the Lighthouse-audit phase. No score, no LCP/INP/CLS number was produced by this
  path either. This matches a previously-documented resource constraint in this sandbox
  (`maquina-saturada-tsc-paralelos-db-local-muerta.md`), not a site problem.
- `npx lighthouse` CLI installed fine (v13.4.1) but there is **no Chrome/Chromium binary on
  PATH** in this shell (`chrome`/`chromium`/`google-chrome` all unresolved), so it could not
  run standalone either.

**Bottom line: LCP, INP, and CLS are UNKNOWN / unmeasurable in this environment.** I am not
reporting a 0–100 Lighthouse score or a CrUX percentile for any URL below — doing so would be
fabricated. What follows instead is TTFB measured directly via `curl` (a real, if partial,
network-timing data point — not a CWV metric) plus static HTML/resource analysis (image
dimensions, preload strategy, font strategy, script/DOM weight, cache headers) pulled from
`render_page.py --mode auto --json` output and direct `curl -I` checks. **Recommendation for
the orchestrator:** re-run `pagespeed_check.py` once a `GOOGLE_API_KEY` is configured (see
`~/.config/claude-seo/google-api.json` setup), or re-run `unlighthouse_run.py`/`npx
lighthouse` on a machine with more headroom and a real Chrome install, before treating this
page as performance-clean.

## What works

- **Hero LCP candidate is a real `<img>`, correctly preloaded.** On `/`, the largest visual
  element is the full-bleed hero background image (`hero-video-poster.jpg`, Next.js `Image`
  with `fill`), not the autoplay video itself — the video (`/producto/demo.mp4` /
  `.webm`, ~1.0 MB / ~0.8 MB) sits lower on the page with `preload="metadata"`, so it isn't
  competing for bandwidth at first paint. The poster image has a `<link rel="preload"
  fetchPriority="high">` with a full responsive `imageSrcSet` (640w–3840w), and the actual
  request resolves to ~53 KB at 1920w — a reasonable byte budget for a hero image.
- **Fonts are self-hosted via `next/font`, not Google Fonts.** All font files are served from
  `/_next/static/media/*.woff2` with `cache-control: public,max-age=31536000,immutable` —
  no render-blocking third-party font-origin connection, no FOIT from an external CSS fetch.
- **No third-party render-blocking scripts found on any of the 5 pages.** Every `<script
  src>` on `/`, `/precios`, `/funcionalidades/sustituciones`, `/comparativa`, and
  `/network/instructoras` is first-party (`/_next/static/chunks/...`), and Next.js emits them
  as `async`. The only external resource referenced at all is a `sellwithboost.com` badge SVG
  preload on the homepage (non-blocking, low priority).
- **DOM size is within budget on all 5 pages.** Rough element counts (opening-tag proxy) from
  raw SSR HTML: homepage ~1,181, `/precios` ~1,289 — both comfortably under the ~1,500-element
  "excessive DOM" threshold. `/comparativa`'s comparison table is only 7 `<tr>` / 90 `<td>`
  (≈6 data rows × 15 competitor columns), not the sprawling table its "wide" framing implied.
- **Images on `/funcionalidades/sustituciones` and `/network/instructoras` that use explicit
  dimensions do so correctly** (e.g. the sustituciones product screenshot ships `width="2880"
  height="1624"` — a real CLS-prevention signal, not guessed).
- **Static JS/font assets under `/_next/static/` are cached correctly**
  (`immutable, max-age=31536000`), so repeat views of the same deployment don't re-fetch
  script/font bytes.

## Findings

### 1. `public/` static assets (video, poster images, logo pieces) are never cached by the browser
- **Severity:** Medium
- **Description:** Everything served straight from `public/` — `/producto/demo.mp4`,
  `/producto/demo.webm`, `/producto/demo-poster.jpg`, `/hero-video-poster.jpg`,
  `/logo-piezas/*.webp` — responds `cache-control: public, max-age=0, must-revalidate`.
  Confirmed via `curl -I` on all five. That forces a conditional-GET revalidation round trip
  on every repeat visit to any marketing page, unlike `/_next/static/*` (fonts, JS, and
  `/_next/image`-optimized images), which correctly gets `immutable, max-age=31536000`. The
  video alone is ~1.8 MB combined (mp4+webm) being re-validated every visit instead of read
  from disk cache.
- **Recommendation:** Serve these through the Next.js `Image`/asset pipeline (which
  fingerprints URLs and can be cached immutably) instead of directly from `public/`, or add
  explicit long-lived `Cache-Control` headers for the `public/producto/*` and
  `public/logo-piezas/*` paths in `next.config`/Vercel headers config, with cache-busting via
  filename hash when the asset changes.

### 2. Hero `<img>` element itself doesn't carry `fetchPriority="high"` (only the preload `<link>` does)
- **Severity:** Low
- **Description:** The `<link rel="preload" as="image" ... fetchPriority="high">` for
  `hero-video-poster.jpg` is present and correct, but the `<img>` tag rendering that same
  image in the DOM has no `fetchPriority` attribute. Next.js's `Image` `priority` prop
  normally sets `fetchPriority="high"` on both the preload link and the `<img>` element in
  current versions — its absence on the tag itself suggests either an older codegen path or
  a manual `<img>`/non-`priority` usage for this element. Practical impact is small since the
  preload link already front-loads the fetch, but it's a low-cost fix.
- **Recommendation:** Confirm the hero `<Image>` uses the `priority` prop (not just a manual
  preload) so `fetchPriority="high"` lands on the `<img>` tag too.

### 3. Nine font families / 17 preloaded `.woff2` files on a single marketing page (homepage)
- **Severity:** Medium
- **Description:** The homepage `<html>` class list carries variable-font CSS classes for
  nine distinct type families (Plus Jakarta Sans, Instrument Serif, Instrument Sans, Outfit,
  Poppins, Cormorant Garamond, Libre Caslon Text, Figtree, IBM Plex Mono), and the `<head>`
  preloads 17 separate `.woff2` files up front. Each is self-hosted and cached immutably
  (good), but 17 concurrent font preloads compete for the same early connection/bandwidth
  budget that the LCP hero image and critical CSS also need, and can push out text-render
  timing on constrained connections even with `font-display: swap`/next/font's fallback-metric
  adjustment. This is a structural weight issue, not a caching issue.
- **Recommendation:** Audit whether all 9 families + all preloaded weights/styles are actually
  used above the fold on `/`. Preload only the font files needed for the first paint (hero H1
  + nav), and `next/font`-lazy the rest (serif/display faces used further down the page)
  instead of preloading them all in `<head>`.

### 4. Cold-path TTFB is materially worse than warm-path TTFB on two of the five pages
- **Severity:** Low–Medium (needs field-data confirmation)
- **Description:** `curl` TTFB timing (network-level, not a CWV metric) showed the *first*
  request in a burst to `/network/instructoras` and `/funcionalidades/sustituciones` taking
  meaningfully longer than immediate repeat requests: `/network/instructoras` 1.96s → 0.69s →
  0.49s → 0.44s across a short burst; `/funcionalidades/sustituciones` 1.02s → 0.16s → 0.12s →
  0.33s. `/`, `/precios`, `/comparativa` stayed in the 0.12s–0.5s band throughout. This pattern
  (slow-then-fast) is consistent with a serverless cold start or cache-miss on Vercel's edge
  for less-frequently-hit routes, particularly plausible for `/network/instructoras` since it's
  a marketplace listing that likely does a real data fetch (vs. the mostly-static marketing
  pages). A first-time visitor landing directly on a cold route would see this ~1–2s TTFB
  hit before any paint work even starts — enough on its own to put LCP in "needs improvement"
  territory for that visit.
- **Recommendation:** Once `GOOGLE_API_KEY` is available, check CrUX field TTFB /
  LCP-subparts specifically for `/network/instructoras` and `/funcionalidades/sustituciones`
  to see if this cold-path tax shows up at the 75th percentile in real traffic. If so, look at
  ISR/static generation for the instructor listing (or edge caching of its data fetch) rather
  than leaving it as an on-demand serverless render.

### 5. JS payload is moderate but not tiny (uncompressed reference point)
- **Severity:** Low
- **Description:** The homepage loads 22 first-party script chunks. Summed
  `Content-Length` **without** `Accept-Encoding` (i.e., uncompressed size — the CDN serves
  Brotli/gzip in real browser requests, so actual wire bytes are meaningfully smaller, likely
  in the ~450–550 KB range, not verified precisely here) totals ~1.48 MB uncompressed. All
  chunks load `async`, so this isn't a render-blocking issue, but it is main-thread parse/exec
  weight that's relevant to INP on first interaction. Not measured with a real browser in this
  environment, so treat as a weight red flag to verify, not a confirmed INP problem.
- **Recommendation:** No action needed unless a follow-up Lighthouse/unlighthouse run (once
  runnable) shows Total Blocking Time or INP issues tied to this; flagging as a data point for
  that future run.

## Metrics table

| URL | LCP | INP | CLS | TTFB (curl, network-only) | Notes |
|---|---|---|---|---|---|
| `/` | UNKNOWN (no working lab/field tool) | UNKNOWN | UNKNOWN | ~0.19–0.66s across 3 runs | Hero `<img>` (fill, preloaded, fetchPriority=high via link) is the likely LCP element, not the autoplay demo video (which is below the fold, `preload="metadata"`). |
| `/precios` | UNKNOWN | UNKNOWN | UNKNOWN | ~0.12–0.25s across 3 runs | No images/video in raw SSR HTML; 197 inline SVGs (icons), 448 divs — within DOM budget. |
| `/funcionalidades/sustituciones` | UNKNOWN | UNKNOWN | UNKNOWN | 0.12–1.02s (one cold outlier) | Product screenshot has explicit `width`/`height` (no CLS risk from that img); one `fill`-mode disciplina image (CLS risk depends on parent container CSS, not verifiable from HTML alone — recommend a visual check). |
| `/comparativa` | UNKNOWN | UNKNOWN | UNKNOWN | ~0.22–0.42s across 3 runs | Comparison table is SSR'd (not client-rendered), only 7 rows × 15 columns — smaller than the "wide table" framing suggested; horizontal scroll via `overflow-x:auto`, not a CLS mechanism. |
| `/network/instructoras` | UNKNOWN | UNKNOWN | UNKNOWN | 0.44–1.96s (cold-start pattern) | Only 1 `<img>` present in raw SSR HTML for a marketplace *listing* page — worth a manual/browser check to confirm instructor photos aren't purely client-fetched post-hydration (which would hurt both LCP timing and crawlability); largest cold/warm TTFB gap of the 5 URLs. |

## Field-data gap (explicit)

No CrUX 75th-percentile data was retrievable (no API key configured). This report cannot say
whether real Spanish users on real networks/devices are passing or failing LCP/INP/CLS
thresholds — it can only flag structural risks found in the HTML/resource layer. Treat every
severity above as "worth fixing regardless," not as a confirmed CWV failure.
