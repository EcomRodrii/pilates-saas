# Sitemap Audit — https://www.tentare.app/sitemap.xml

Audited 2026-09-10. Source: `sitemap-urls.txt` (139 `<loc>` entries) + raw fetch of
`https://www.tentare.app/sitemap.xml` (799 lines, full `<url>` blocks with
lastmod/changefreq/priority) + `https://www.tentare.app/robots.txt` +
`sitemap_discovery.py` structural check.

## What works

- **XML is valid.** `sitemap_discovery.py` confirms `valid: true`, `kind: "urlset"`,
  HTTP 200, discovered via `robots.txt`'s `Sitemap:` directive. Correct namespace
  (`xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`), no stray namespaces
  (no `news:`/`image:`/`xhtml:` mixed in), well-formed `<url><loc>...</loc></url>`
  blocks throughout.
- **Well under both size limits.** 139 URLs, single flat `urlset` (no index needed).
  File is a few hundred KB at most — nowhere near the 50,000-URL / 50MB ceiling.
- **No sitemap URL is actually blocked by `robots.txt`**, once evaluated by real
  precedence rules (longest/most-specific match wins, not first-match). All 7
  `/network/*` URLs in the sitemap (`/network`, `/network/instructoras`,
  `/network/crear-perfil`, `/network/terminos`, `/network/privacidad`,
  `/network/instructoras/judith-clemente-barcelona`,
  `/network/instructoras/ciudad/barcelona`) are covered by an `Allow:` rule that is
  longer/more specific than the blanket `Disallow: /network/` beneath it, so they
  resolve to **allowed**. `/network` itself (no trailing slash) doesn't even match
  `Disallow: /network/` as a string prefix. No robots/sitemap contradiction found
  for the URLs actually in the sitemap today (see Finding 5 for the fragility of
  this setup going forward).
- **The `/ayuda/*` help-center articles carry real, differentiated `lastmod`
  values** (2026-08-28, 09-05, 09-08 — varying per article, tracking what actually
  got edited recently: `citas`, `cierre-de-ano`, `cobrar-en-la-caja`,
  `tentare-network`, etc.). This is what accurate lastmod tracking should look
  like, and it's a useful contrast against Finding 2 below.

## Findings

### Finding 1 — 37 of 139 URLs (27%) have no `<lastmod>` at all
- **Severity:** Medium
- **Description:** No `lastmod` element is present for: the homepage; all of
  `/network`, `/network/instructoras`, `/network/crear-perfil`,
  `/network/terminos`, `/network/privacidad`, and
  `/network/instructoras/ciudad/barcelona`; 12 of the 13 `/comparativa/tentare-vs-*`
  pages (all except `-glofox`, which has `2026-08-18`); `/recursos` (index);
  all 4 `/reservar/*` customer booking-widget pages; and all 14 `/ayuda/*`
  category hub pages (`/ayuda/empezar`, `/ayuda/reservas`, `/ayuda/clientes`,
  `/ayuda/instructores`, `/ayuda/pagos`, `/ayuda/bonos`, `/ayuda/portal`,
  `/ayuda/widget`, `/ayuda/automatizaciones`, `/ayuda/integraciones`,
  `/ayuda/app`, `/ayuda/configuracion`, `/ayuda/informes`, `/ayuda/problemas`).
  Meanwhile the 62 `/ayuda/*` leaf articles right below those same 14 category
  pages *do* carry lastmod. The inconsistency — present on some pages, absent on
  their siblings in the same template/section — is the thing to flag, not just
  the absence itself: Google has stated that when it detects a sitemap's lastmod
  hints are unreliable a meaningful fraction of the time, it may stop trusting
  lastmod from that sitemap sitewide.
- **Recommendation:** Either populate `lastmod` for every URL from real
  content-store timestamps, or drop the field from the sitemap generator
  entirely for now. Partial coverage is worse than none.

### Finding 2 — Where `lastmod` exists, several clusters share one identical, midnight-UTC batch timestamp rather than tracking real edits
- **Severity:** Low
- **Description:** All 16 `/funcionalidades*` URLs (index + 15 feature pages,
  e.g. `reservas-online`, `sustituciones`, `facturacion`...) are stamped
  `2026-08-11T00:00:00.000Z` — the exact same second, to the millisecond, on 16
  unrelated pages. Separately, 8 more unrelated pages (`/comparativa`,
  `/soluciones/cambiar-de-software`, `/glosario`, `/seguridad`, `/legal`,
  `/privacidad`, `/terminos`, `/cookies`) all share
  `2026-08-13T00:00:00.000Z`. A `T00:00:00.000Z` timestamp identical across a
  whole batch of otherwise-unrelated pages is a strong signal this is a
  deploy/generation-time stamp, not "last significant content change" per page —
  exactly what this skill's check #4 asks to catch.
- **Recommendation:** Drive `lastmod` from the CMS/content-store's actual
  updated-at field per page, not from a build-time constant.

### Finding 3 — `/funcionalidades/sustituciones` shares the site's top priority (1.0) with the homepage
- **Severity:** Info
- **Description:** Every other page on the site scores ≤0.9. The homepage
  (`priority=1`) and `/funcionalidades/sustituciones` (`priority=1`) are the
  only two URLs at the maximum, while its 15 sibling feature pages (including
  arguably more central ones like `/funcionalidades/reservas-online` or
  `/funcionalidades/bonos-y-membresias`) sit at 0.9. That's an internal
  inconsistency worth a look, but it has **zero effect on Google** — Google has
  publicly ignored the `priority` and `changefreq` sitemap tags since 2020 (this
  skill's own check table marks them Info/deprecated). All 139 URLs in this
  sitemap still carry both tags.
- **Recommendation:** Either fix the relative values for internal consistency
  (drop `sustituciones` to 0.9 to match its siblings, unless there's a real
  product reason it's the flagship feature), or — the higher-value move — stop
  maintaining `priority`/`changefreq` altogether and drop them from the
  generator. They add sitemap weight/maintenance for a signal Google discards.

### Finding 4 — `Disallow: /network/` sits below four narrower `Allow: /network/...` rules, with no future-proofing
- **Severity:** Medium
- **Description:** Today's setup works correctly under real crawler precedence
  (longest match wins), and no sitemap URL is currently blocked. But the shape
  is fragile: any **new** `/network/...` path added later (e.g. a future
  `/network/mensajes` or `/network/perfil`) would fall through to the blanket
  `Disallow: /network/` unless someone remembers to add a matching `Allow:`
  line above it. It also relies on every consumer correctly implementing
  Google/Bing-style specificity-based precedence rather than simple
  first-match/last-match parsing — some third-party SEO tools and simpler bots
  don't, and would report these pages as blocked when they aren't.
- **Recommendation:** Either invert the model (default-deny the whole
  `/network/` tree, allow only the exact indexable leaf patterns you actually
  want — which is what's effectively happening today, just confusingly
  ordered) with a comment explaining why, or scope the blanket disallow to the
  specific private subpaths instead of the whole tree (e.g.
  `Disallow: /network/mi-cuenta`, `Disallow: /network/mensajes`, etc.) so new
  public routes are allowed by default instead of needing an explicit opt-in.

### Finding 5 — Live customer booking-widget pages (`/reservar/*`) are mixed into the vendor's own marketing/content sitemap
- **Severity:** Info
- **Description:** `/reservar/tentare`, `/reservar/indira-herrero`,
  `/reservar/estudio-marta-pilates-yoga`, and `/reservar/estudio-salma` are
  public booking widgets for real, live Tentare customer studios (matches
  known production customers from prior audit history), carrying
  `priority=0.7`/`changefreq=daily` — the same weight class as the
  `/comparativa` and `/recursos` content pages. This isn't necessarily wrong
  (indexing a customer's public booking page can be legitimate SEO for that
  customer), but it means the vendor's own topical sitemap grows one entry per
  new signed customer, and its priority/changefreq values are asserting daily
  change with no lastmod ever supplied (see Finding 1) to back that claim up.
- **Recommendation:** Confirm this is an intentional product decision (each
  customer's booking page benefiting from being in Tentare's sitemap) rather
  than an oversight. If intentional, consider giving these entries an explicit,
  real `lastmod` sourced from the studio's schedule-change timestamp, or drop
  `changefreq`/`priority` from these specifically since they're unverifiable.

### Finding 6 — `/soluciones` has no index/hub page in the sitemap
- **Severity:** UNKNOWN
- **Description:** Every other content section has an index page in the
  sitemap (`/funcionalidades`, `/comparativa`, `/recursos`, `/ayuda`) — but
  `/soluciones` only contributes its two leaf pages
  (`/soluciones/cambiar-de-software`, `/soluciones/estudio-de-yoga`) with no
  `/soluciones` hub URL present.
- **Recommendation:** Verify whether an indexable `/soluciones` route exists.
  If it does, it's a real sitemap gap (Finding, not just informational). If the
  section was designed without a hub page, no action needed — flagging as
  UNKNOWN since this wasn't crawl-verified as part of this sitemap-only audit.

### Finding 7 — Quality-gate cluster sizes (thresholds per this skill; uniqueness itself is seo-content's job)
- **Severity:** Info / Warning (see breakdown)
- **Description:**
  - **`/ayuda/*` — 78 URLs** (2 top-level + 14 category hubs + 62 leaf
    articles), **56% of the entire sitemap**. This numerically crosses both the
    30-page WARNING and 50-page HARD STOP thresholds this skill enforces for
    programmatic page clusters. However, these are genuine help-center
    documentation articles with distinct, real content topics (not
    location-swapped doorway pages), so the location-page penalty logic isn't a
    direct match — the risk model here is "large templated cluster," not "same
    page/city swapped." Flagging the count per the instructions; handing the
    actual 60%+ uniqueness verification to seo-content.
  - **`/comparativa/tentare-vs-*` — 13 URLs.** Below the 30-page WARNING
    threshold today, but structurally this *is* the classic templated
    programmatic pattern the 60%-uniqueness rule exists for (fixed
    "Tentare vs. X" template, one variable — competitor name — swapped). Watch:
    if this list grows past 30 entries without materially differentiated
    content per competitor (real feature-by-feature deltas, not just a
    renamed template), apply the WARNING gate at that point.
  - **`/network/instructoras/*` — 2 URLs today** (1 instructor profile,
    1 city hub for Barcelona). Nowhere near either threshold numerically, but
    this is architecturally exactly the location/programmatic pattern (profile
    × city) this skill's gates exist to catch, and Tentare Network is a live
    product designed to scale this nationally. Recommend monitoring proactively
    — apply the 30/50 gates the moment city or profile count crosses them,
    rather than retroactively after the cluster is already large.
  - **`/reservar/*` — 4 URLs today** (one per signed customer studio). Same
    "designed to grow with customer count" profile as network/instructoras —
    same proactive-monitoring flag, currently far below threshold.
- **Recommendation:** No hard-stop action needed today (only `/ayuda/*`
  crosses the numeric thresholds, and it's documentation, not doorway pages).
  Revisit `/comparativa`, `/network/instructoras`, and `/reservar` counts on
  the next audit pass — they're all clusters built to scale.

## Missing pages / coverage gaps (check #6)

No sitemap URL is blocked by `robots.txt` under correct precedence rules (see
"What works"). No other obvious indexable-page gap was found relative to what
`robots.txt` allows, aside from the `/soluciones` hub-page question in
Finding 6, which is UNKNOWN without a live crawl. This audit did not
independently crawl the site to find pages *missing* from the sitemap beyond
that one structural inconsistency — cross-referencing actual site navigation
against the sitemap is recommended as a follow-up if not already covered
elsewhere in this orchestrated audit.

## URL count by section

| Section | Count | Notes |
|---|---|---|
| Home | 1 | `/` |
| funcionalidades | 16 | index + 15 feature pages |
| network | 7 | index, instructoras, crear-perfil, terminos, privacidad, 1 profile, 1 city hub |
| comparativa | 14 | index + 13 `tentare-vs-*` |
| soluciones | 2 | no index/hub page in sitemap (Finding 6) |
| recursos | 10 | index + 9 articles |
| ayuda | 78 | 2 top-level + 14 category hubs + 62 leaf articles (Finding 7) |
| legal | 4 | legal, privacidad, terminos, cookies |
| reservar (customer widgets) | 4 | Finding 5 |
| other | 4 | precios, glosario, seguridad, (home counted above) |
| **Total** | **139** | matches `sitemap-urls.txt` and raw XML `<url>` count |

Note: "other" above excludes home (counted separately) to avoid double-count;
16+7+14+2+10+78+4+4+4 = 139.
