# GEO (Generative Engine Optimization) Readiness — tentare.app

Scope: structural readiness for AI answer engines (ChatGPT/SearchGPT, Perplexity,
Google AI Overviews, Bing Copilot, Claude). **Actual AI-search visibility —
whether these engines cite tentare.app today — is NOT measurable from this
audit.** No DataForSEO MCP tools were available in this session, so all
platform-visibility scores below are marked UNKNOWN rather than estimated.

## What works

- **AI crawlers are allowed.** `robots.txt` uses a blanket `User-Agent: *` /
  `Allow: /` with `Disallow:` rules scoped only to authenticated/private
  routes (`/network/mi-cuenta`, `/network/mensajes`, dashboard, etc.). There
  are no crawler-specific blocks for GPTBot, OAI-SearchBot, ClaudeBot, or
  PerplexityBot — they fall under the blanket allow. CCBot/anthropic-ai
  (training-only crawlers) are also not blocked; this is neutral/optional,
  not a defect.
- **Homepage is server-rendered, not an SPA.** `homepage-render.json` reports
  `is_spa: false` for the homepage, and the three sampled interior pages
  (`/glosario`, `/funcionalidades/reservas-online`, `/recursos`) all returned
  full content on a raw fetch (`is_spa: false` on each, no Playwright render
  needed). AI crawlers that don't execute JavaScript (most don't, reliably)
  can read the real content directly.
- **Rich structured data on the homepage.** JSON-LD includes
  `SoftwareApplication` + `Offer` (product/pricing entity), `FAQPage` with
  `Question`/`Answer` pairs (direct-answer format, ideal for citation),
  `Organization` + `ContactPoint` (brand entity), `WebSite` + `SearchAction`,
  and multiple `SiteNavigationElement` blocks. This is a strong,
  above-average authority/entity signal for a SaaS marketing site.
- **`/glosario` is close to an ideal citability format already.** It's a
  literal glossary of short, self-contained, neutral definitions ("no un
  argumentario" — explicitly not marketing copy, by the page's own framing),
  each 30–60 words, several linking out to a longer guide. This is close to
  the extractable answer-block pattern AI engines favor, though most
  individual definitions are shorter than the 134–167 word optimal-citation
  range (see Finding 1).
- **`/recursos` index and `/funcionalidades/reservas-online` mix direct
  claims/data with narrative.** The resources index gives one-line, factual
  summaries per guide (e.g., data sourced to Club Pilates, SLT, BASI,
  Eversports, Statista, Capterra/G2), and the reservations feature page
  states a concrete quantified claim up front ("Un estudio de sesenta
  alumnas genera unos cuantos mensajes al día...").
- **No llms.txt, no RSL 1.0 license file.** Confirmed absent. Per GEO
  practice today this is Low/Info severity, not a real gap — llms.txt has no
  adoption by Google Search or the major AI answer engines' primary crawlers,
  and RSL 1.0 is an emerging/optional licensing signal, not a ranking or
  citation factor. Not worth prioritizing ahead of structural fixes below.

## Findings

### Finding 1 — Glossary and feature-page answers are shorter than the optimal citation length, or buried under UI/comparison-table content
- **Severity:** Medium
- **Description:** The 134–167 word range correlates with highest AI-citation
  rates. `/glosario` definitions run ~30–60 words each — good for a quick
  answer but on the short side; there's no expanded, self-contained 150-word
  version of each definition co-located with the short one (only a "read
  more" link to a separate guide, which AI crawlers may or may not follow in
  a single pass). `/funcionalidades/reservas-online`, meanwhile, opens with a
  strong two-sentence direct claim but the bulk of the page's substantive
  content is a feature-comparison table ("Reformer avanzado" vs "Tu estudio"
  rules) — table cells are much harder for LLMs to extract as a clean,
  citable passage than a prose paragraph.
- **Recommendation:** For high-intent glossary terms and each `/funcionalidades/*`
  page, add one self-contained 130–170 word prose paragraph immediately under
  the H1/H2 that directly answers the implicit question ("What is X",
  "How does Tentare handle X") without requiring the reader to parse a table
  or follow a link. Keep the table as supporting detail, not the only source
  of the answer.

### Finding 2 — Headings are not consistently question-based
- **Severity:** Low
- **Description:** Sampled H2-equivalent labels are declarative/marketing
  style ("El coste real de reservar por WhatsApp", "Tus reglas, y las
  excepciones a tus reglas") rather than question phrasing. Question-form
  headings ("¿Cuánto cuesta gestionar reservas por WhatsApp?") map more
  directly onto how users phrase prompts to AI engines and are easier for
  the engine to match to a query.
- **Recommendation:** For cornerstone pages (`/glosario` entries,
  `/funcionalidades/*`, `/recursos/*` guides, `/comparativa/*`), add or
  A/B a question-form H2/H3 variant above or alongside the existing
  declarative heading, particularly on pages already ranking for
  informational queries. Not worth a full rewrite of brand-voice marketing
  headings sitewide.

### Finding 3 — Brand entity signals outside the site are UNKNOWN / likely thin
- **Severity:** Medium
- **Description:** Brand-mention correlation with AI citation is strongest
  for YouTube (~0.737), then Reddit, then Wikipedia entity presence; Domain
  Rating/backlinks correlate weakly (~0.266). This audit had no tool access
  to verify Tentare's actual presence on YouTube, Reddit, Wikipedia, or
  LinkedIn — mark all four **UNKNOWN**. Given Tentare is a young,
  Spain-only, single-vertical SaaS (per repo history — public launch only
  since 2026-08-19, `docs`/CLAUDE.md), it is reasonable to assume no
  Wikipedia entity exists and YouTube/Reddit presence is minimal to none,
  but this needs direct verification, not inference.
- **Recommendation:** Verify current presence (search each platform for
  "Tentare" + "pilates" + "software estudio") before investing further GEO
  budget. If absent: a YouTube channel with short product-demo/how-to videos
  (highest correlation of any single signal) is the single highest-leverage
  GEO investment available to a small SaaS site, ahead of on-page tweaks.

### Finding 4 — Programmatic page clusters (`/comparativa/*`, `/network/instructoras/*`) are structurally good AI-citation targets, and sitemap.md already flags their risk
- **Severity:** Low (cross-reference, no new fetch needed)
- **Description:** `/comparativa/tentare-vs-*` (13 pages, "Tentare vs
  competitor" template) and `/network/instructoras/*` (instructor × city
  profile pages) are exactly the kind of narrow, comparison/entity-specific
  page AI engines like to cite for "X vs Y" or "pilates instructor in
  [city]" prompts — *if* each page has genuinely distinct, factual content
  rather than templated boilerplate. `findings/sitemap.md` (Finding under
  "60%-uniqueness" discussion) already flags `/comparativa/*` as sitting
  below the 30-page programmatic-content WARNING threshold today but
  structurally matching the pattern the uniqueness gate exists for, and
  flags `/network/instructoras/*` (2 URLs today, national-scale product) for
  the same reason. `findings/sitemap.md` also documents that 12 of 13
  `/comparativa/*` pages and all `/network/*` public pages have no
  `lastmod`, and that a `robots.txt` `Disallow: /network/` sits below
  narrower `Allow:` rules with no future-proofing (Finding 4 in that file) —
  both reduce crawl/freshness confidence for AI crawlers on exactly the
  cluster most likely to be cited.
- **Recommendation:** No new action beyond what `sitemap.md` already
  recommends (uniqueness verification via seo-content, add `lastmod`,
  restructure the `/network/` robots rule to default-deny with explicit
  allow-listed public leaves). For GEO specifically: as the `/comparativa/*`
  cluster grows, ensure each page states the comparison's specific factual
  differentiators in the first ~150 words rather than only in a feature
  table, per Finding 1.

## Score

Structural-readiness dimensions only (not a measure of actual citation
outcomes):

| Dimension | Weight | Est. score | Basis |
|---|---|---|---|
| Citability | 25% | 65/100 | Good raw material (glossary, FAQPage, direct-claim openers) but passages generally shorter than the 134–167w optimum, and key feature detail is table-locked (Finding 1) |
| Structural Readability | 20% | 80/100 | SSR (not SPA) confirmed on homepage + 3 sampled pages; JSON-LD present; headings mostly declarative not question-form (Finding 2) |
| Multi-Modal Content | 15% | UNKNOWN | Not assessed — no video/image-alt/transcript audit performed this pass |
| Authority & Brand Signals | 20% | UNKNOWN (likely low, unverified) | Strong on-page entity markup (Organization/ContactPoint), but off-page brand presence (YouTube/Reddit/Wikipedia/LinkedIn) unverified — Finding 3 |
| Technical Accessibility | 20% | 85/100 | robots.txt allows all named AI crawlers by blanket rule; no llms.txt/RSL (Low/Info only, per current adoption) |

**Overall GEO Health Score: UNKNOWN (partial) — computable sub-dimensions
average ~77/100, but Multi-Modal and Authority/Brand are UNKNOWN and weight
35% of the total; do not report a single blended number as authoritative
until those are verified.**

## Platform-specific visibility (Google AIO, ChatGPT, Perplexity, Bing Copilot)

All **UNKNOWN**. No DataForSEO MCP tools (`ai_optimization_chat_gpt_scraper`,
`ai_opt_llm_ment_search`) were available in this session to check live
citation status on any platform. This audit only assessed structural
readiness (crawler access, markup, content shape) — it did not and cannot
confirm whether any AI engine currently cites tentare.app.

## Top 5 highest-impact changes (by effort)

1. **Verify off-page brand presence (YouTube/Reddit/Wikipedia/LinkedIn)** —
   effort: Low (research only, ~1 hr). Highest-correlation unknown; decides
   whether Finding 3's recommendation is needed at all.
2. **Add a YouTube channel with short demo/how-to videos**, if absent —
   effort: Medium-High (ongoing content production). Single strongest brand
   signal per the correlation table.
3. **Add 130–170-word direct-answer paragraphs to `/glosario` terms and
   `/funcionalidades/*` pages**, above the tables — effort: Low-Medium
   (copywriting, no new infra).
4. **Convert 5–10 cornerstone H2s to question form** on `/glosario`,
   `/recursos/*`, `/comparativa/*` — effort: Low.
5. **Add `lastmod` + fix the `/network/` robots precedence issue** (already
   flagged in `findings/sitemap.md`) — effort: Low, shared benefit with
   classic SEO, improves AI-crawler freshness confidence on the highest-value
   programmatic clusters.
