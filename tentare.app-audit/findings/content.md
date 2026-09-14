# Content Quality & E-E-A-T Audit — tentare.app

Sample: homepage (pre-fetched render) + 8 pages fetched fresh via `render_page.py --mode auto --json`
on 2026-09-10. This is a reduced sample per orchestrator instructions, not a full-site crawl (139 URLs
in sitemap). Two pages (`/comparativa/tentare-vs-bsport`, `/ayuda/empezar/crear-tu-cuenta`) are used as
proxies for their respective clusters (13 comparativa pages, ~60 ayuda articles) — findings for those
clusters are **extrapolated from one sample each** and marked as such. Not verified: the other 12
comparativa pages, ~59 other ayuda articles, other `/soluciones/*` and `/network/instructoras/ciudad/*`
pages, blog/recursos archive as a whole.

Word counts below are computed from `extracted_text` (trafilatura-cleaned, nav/footer stripped), so
they reflect main-content depth, not raw HTML size.

## What works

- **Specific, falsifiable claims instead of generic SaaS marketing copy.** `/precios` states exact
  prices (29€/59€/149€ per month), exact limits ("Hasta 150 alumnas activas"), "Sin permanencia" — this
  is the opposite of vague "flexible pricing" language quality raters are trained to discount.
- **`/recursos/estudios-pilates-de-exito` is genuinely well-sourced.** It cites named external sources
  inline for every statistical claim — Statista/Lifestyle.fit, El Debate, Scheduling Kit, Smart Health
  Clubs, Gym Factory, StudioPulse — with a explicit "Fuentes:" line and a caveat that the cited figures
  are sector data, "no de Tentare" (not conflating industry stats with the product's own numbers). This
  is a strong Authoritativeness/Trustworthiness signal and a good AI-citation candidate (clearly
  attributed, quotable stats like "94% ocupación reformer vs 71% mat").
- **`/comparativa/tentare-vs-bsport` is unusually honest for a competitor-comparison page.** It
  explicitly concedes ground to the competitor ("bsport sigue siendo hoy la opción más madura en esos
  puntos", "No somos mejores en todo — y te lo contamos abajo, sin rodeos"), dates its data ("Basado en
  información pública de bsport a mediados de 2026"), and disclaims trademark/goodwill ("bsport es
  marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo"). This
  is exactly the kind of first-party trust signal the Sept 2025 QRG rewards and is rare in the
  comparison-page genre (see `seo-competitor-pages` for the standard this meets).
- **`/soluciones/estudio-de-yoga` self-limits its claims.** It explicitly states what is *not* built yet
  ("Hoy no hay ninguna función pensada solo para yoga — sin certificaciones (RYT o similares)... porque
  el motor real es el mismo para las dos disciplinas") rather than overclaiming feature parity to rank
  for "software gestión yoga" queries. This is a trust-building pattern, not typical
  programmatic-SEO padding.
- **`/funcionalidades/sustituciones` uses concrete scenario walkthroughs** ("22:47 — La baja de la
  noche anterior", "07:40 — La baja a dos horas de la clase") with specific mechanics (45-minute
  windows, 2-minute floor, top-3 candidate list) instead of abstract feature bullets — reads as written
  by someone who has actually operated the feature, a first-hand-experience (E) signal.
- **`/glosario` frames itself explicitly as neutral**: "Definiciones neutrales, no un argumentario" —
  and cross-links to deeper guides where they exist, rather than being 60 shallow stub definitions with
  no onward path.
- **`/ayuda/empezar/crear-tu-cuenta` has visible authorship + freshness metadata**: "Equipo
  Tentare · Actualizado el 28 de agosto de 2026" and a human-support closer ("Escríbenos y te
  respondemos nosotros, no un bot") — both are Trustworthiness signals the QRG explicitly looks for.

## Findings

### /precios
- **Title:** Below blog-post-length minimum, but appropriate for a pricing page
- **Severity:** Info
- **Description:** 843 words extracted. Not a "content" page in the topical-coverage sense — no
  applicable minimum from the table (closest analog is a product/service page floor of 300–800, which
  this clears comfortably). Contains a section listing plan differences with what look like a FAQ-style
  breakdown further down (not fully quoted here — UNKNOWN whether FAQPage structured data is present;
  that belongs to the technical/schema skill, not this content audit).
- **Recommendation:** No content-quality action needed. If pursuing AI-citation readiness further,
  confirm the price table is marked up as such (schema check is out of scope here).

### /funcionalidades/sustituciones
- **Title:** Strong depth and specificity; no content-quality issues found
- **Severity:** Info
- **Description:** 920 words. Clears the 800-word service-page floor. Demonstrates Experience (E) via
  concrete operational detail — exact timing thresholds, "Cuatro niveles de autonomía" — that reads as
  product-knowledge rather than templated feature-page copy. Explicitly documents a known limitation
  ("Vacaciones... no dispara sustituciones automáticas sobre las clases que ya tenía asignadas... Es una
  decisión deliberada") instead of only listing capabilities — a Trustworthiness pattern (matches the
  internal project note that this is a deliberately scoped decision, #558/A5).
- **Recommendation:** None required for this page. Worth checking (out of this audit's sample) whether
  the other `/funcionalidades/*` pages hit the same bar, since this was flagged as "highest-priority
  feature page" — UNKNOWN for the rest of the cluster.

### /comparativa/tentare-vs-bsport — thin relative to its own page type, cluster risk flagged
- **Title:** Comparison page is short and top-heavy with disclaimers; extrapolated cluster risk for the
  other 12 `/comparativa/*` pages
- **Severity:** Medium
- **Description:** Only 214 words of extracted running text (plus what is very likely a comparison
  table/feature-matrix rendered as structured markup rather than prose — the low word count together
  with visible "diferencias que se notan cada mes" language suggests most of the page's substance is in
  a table, not paragraph content). Comparison pages generally need enough prose to explain *why* the
  differences matter (not just list them) to be both helpful and AI-citation-ready as standalone
  quotable content. Text present is high-quality (see "What works") but there isn't much of it.
  **Extrapolation, not verified:** if the other 12 comparativa pages (vs. Bsport-equivalents like
  Mindbody, GymDesk, Eversports, Wodify, etc. per the sitemap naming pattern) follow the same
  template — short intro + disclaimer boilerplate + a feature table — they risk being judged as
  near-duplicate content across the cluster (same disclaimer paragraph, same structure, only the
  competitor name and a few facts swapped). This is the single highest-risk pattern for "scaled content
  abuse" flags under the Sept 2025 QRG if the prose-to-boilerplate ratio is low on all 13. This was
  **not checked** on the other 12 — only inferred from one sample.
- **Recommendation:** Pull the actual word count and unique-content ratio (boilerplate paragraph vs.
  competitor-specific prose) for all 13 comparativa pages before concluding this is fine at scale. If
  the disclaimer/intro paragraph is templated identically across all 13 (likely, given the wording
  pattern seen here), that's expected and acceptable — what matters is whether the *specific claims*
  section is genuinely differentiated per competitor or is also templated with placeholders swapped in.
  Defer to `seo-competitor-pages` sub-skill for the structural standard; this note is scoped to whether
  content depth/uniqueness holds up, which needs the other 12 pages fetched to confirm.

### /soluciones/estudio-de-yoga — thin content
- **Title:** Below topical-coverage floor for a solutions/service page
- **Severity:** Medium
- **Description:** Only 197 words extracted. Well short of the 800-word service-page floor (and even
  short of the 500-word homepage floor). The content quality per-word is high (see "What works" — it's
  honest about current feature gaps rather than padded), but there simply isn't much of it: no
  yoga-specific use cases, no testimonials, no yoga-studio-specific pricing/workflow detail beyond what
  applies to Pilates generally. This reads as a placeholder "we also do this" page rather than a
  developed solutions page targeting yoga-studio search intent.
- **Recommendation:** Either expand with yoga-specific operational detail (class formats, instructor
  certification handling even if absent today, studio-type-specific testimonials/case studies) to clear
  the service-page floor, or, if this is intentionally a minimal placeholder while the product pivots
  gradually (plausible given the explicit "esta página se actualiza" language), consider noindex or a
  lower-priority sitemap entry until it has real depth — thin pages targeting commercial intent
  ("software gestión yoga") without matching depth are a QRG risk.

### /recursos/estudios-pilates-de-exito — strong, no action needed
- **Title:** Well-sourced blog content, clears floor, strong E-E-A-T
- **Severity:** Info
- **Description:** 882 words in the portion inspected (page likely continues beyond the excerpt pulled
  — UNKNOWN full length, but the 882-word sample alone already approaches the 1,500-word blog-post
  floor and the structure, "Lección 1/2/3", suggests more follows). Citations are specific, dated,
  attributed, and separated from the site's own claims. This is the strongest E-E-A-T page in the
  sample.
- **Recommendation:** Confirm full word count clears 1,500 (not verified past the excerpt). If it
  falls short, this is a low-priority gap given the quality of what's there — better to add another
  sourced "lección" than to pad existing sections.

### /ayuda/empezar/crear-tu-cuenta — appropriate depth for a help article, cluster caveat
- **Title:** Right-sized how-to content; cluster depth unverified
- **Severity:** Low (page itself) / Medium (cluster-scale risk, unverified)
- **Description:** 214 words. This is correctly scoped for a single-task how-to article (3-step
  account-creation guide) — a help article of this type is not expected to hit the 1,500-word blog
  floor; comprehensiveness for its narrow task is what matters, and it has that (clear steps, one
  edge case called out — "no hace falta confirmar el email antes de empezar a usarlo"). Byline +
  update date + human-support closer are good Trust signals.
  **Extrapolation, not verified:** the ~60-article `/ayuda/*` cluster is a classic setting for
  templated, near-duplicate structure (step 1/step 2/step 3/"¿te ha ayudado este artículo?" boilerplate
  repeated per article) — which is fine for UX consistency but risks looking formulaic if many articles
  are equally short AND cover overlapping/thin topics. This single article looked appropriately scoped
  (not padded, not vague), but that doesn't establish the other ~59 are equally well-matched to their
  task complexity — some help topics (e.g., billing/Stripe edge cases, RLS-adjacent permission
  questions) plausibly need more depth than a 3-step guide.
- **Recommendation:** Spot-check 3–5 more `/ayuda/*` articles covering more complex topics (billing,
  cancellations, permissions) to confirm depth scales with task complexity rather than every article
  defaulting to ~200 words regardless of topic. Not done in this pass.

### /network/instructoras/ciudad/barcelona — thin, programmatic page
- **Title:** Very thin content, marketplace still pre-launch scale
- **Severity:** High (for this URL and, by extrapolation, likely every other `/network/instructoras/ciudad/*` page)
- **Description:** Only 40 words of extracted text, and most of that is chrome (nav labels: "Beta",
  "Explorar instructoras", "Cómo funciona", "Entrar como estudio", "Iniciar sesión", filter UI). The only
  actual content is "Instructoras de Pilates y Yoga en Barcelona — 1 instructora en Barcelona" and a
  single listing (Judith Clemente, Yoga). This is a textbook thin/doorway-page risk: a
  programmatically-generated city-landing-page template with almost no unique content and, in this
  instance, inventory of exactly one. Per the project's own memory notes this marketplace ("Tentare
  Network") is genuinely early-stage (gamificación catálogo empty, "1 socia de 202 con tarjeta guardada"
  elsewhere in the codebase notes general early traction), so this is consistent with real product state,
  not a bug — but it's still a quality-rater risk if these city pages are indexed and templated across
  many cities with equally sparse inventory.
- **Recommendation:** This is squarely in `seo-programmatic` sub-skill territory (programmatically
  generated pages, one per city) — defer the structural fix recommendation there, but the content
  observation to hand off: pages with 0-1 listings should very likely be noindexed or excluded from the
  sitemap until they clear a minimum inventory threshold (e.g., 3+ instructors), rather than indexed
  with near-zero unique content. Verify sitemap-urls.txt for how many `/network/instructoras/ciudad/*`
  URLs exist and cross-check likely inventory levels before indexing decisions.

### /glosario — solid reference page
- **Title:** No issues found
- **Severity:** Info
- **Description:** 1,176 words across many short definitions, explicitly framed as neutral rather than
  a sales argument, with cross-links to longer guides. This is an appropriate format for a glossary —
  breadth over depth-per-term, low duplication risk since each entry is a distinct concept (Veri*Factu
  vs TicketBAI, marketplace model, etc.), not a templated pattern repeated with swapped variables.
- **Recommendation:** None.

## AI Citation Readiness (qualitative)

- **Best candidates for AI citation:** `/recursos/estudios-pilates-de-exito` (attributed, dated,
  specific statistics) and `/glosario` (clean, quotable, neutral definitions with clear scope
  boundaries — e.g., "Un software que cumple Veri*factu no cumple TicketBAI automáticamente").
- **Weakest candidates:** `/network/instructoras/ciudad/barcelona` (almost no extractable prose) and,
  pending verification, the rest of the `/comparativa/*` cluster if it follows the thin pattern seen in
  the Bsport sample.
- UNKNOWN: presence/correctness of structured data (FAQPage, Article, Product schema) across any of
  these pages — that is a technical-SEO check, not covered by this content-quality pass.

## Explicitly out of scope / not checked in this pass

- The other 12 `/comparativa/*` pages (only 1 of 13 sampled, per instruction).
- The other ~59 `/ayuda/*` articles (only 1 sampled, per instruction).
- Other `/soluciones/*` pages beyond yoga (e.g., other discipline pages, if they exist).
- Other `/network/instructoras/ciudad/*` pages beyond Barcelona.
- Full-page word count for `/recursos/estudios-pilates-de-exito` (only first ~4,000 characters inspected
  in detail; likely continues).
- Structured data / schema markup on any page (belongs to a technical-SEO check).
- Internal duplication/cannibalization analysis between comparativa pages (belongs to a separate
  duplication check, flagged here only as a risk to watch).
