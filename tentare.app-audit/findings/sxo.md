# SXO — Search Experience Optimization (tentare.app)

**Method note (read before trusting any claim below):** signals come from `render_page.py` on
the homepage and 4 site pages, and from live `WebSearch` queries run 2026-09-10. WebSearch is a
snapshot of what Google returned to this tool at this moment — it is **not** a rank tracker.
Nothing below should be read as "Tentare ranks #N for X." Where a query returned no Tentare URL
in the snapshot, that is reported as "did not appear in this snapshot," explicitly marked
**UNKNOWN** for actual ranking, never as "not ranking."

---

## SERP Analysis Summary

| Query | Intent | Dominant page type observed | Tentare page (type) |
|---|---|---|---|
| software gestión estudio pilates | Commercial investigation | Review directories (GetApp) + vendor landing pages (DeporWeb, SyncroFitness) + blog listicles (Sammy, Grupo ZAS) | Homepage (Landing Page) — didn't appear in snapshot |
| software para estudio de pilates | Commercial investigation | Same mix, plus "10 mejores" listicles (Fitune) and free-tool directories (GetApp.es) | Homepage — didn't appear in snapshot |
| alternativas a mindbody españa | Comparison / dissatisfaction | Alternatives listicles (GetApp, Appvizer) + **a competitor's own blog** (lorari.com/blog) | `/comparativa/tentare-vs-mindbody` (Comparison) — didn't appear in snapshot |
| bsport vs momence | Direct comparison | Review-aggregator compare tools (GetApp, SoftwareAdvice, Capterra, SourceForge) **and** vendor-made 1:1 comparison landing pages (pro.bsport.io/comparison/momence, lp.momence.com/fr/bsport) | N/A (Tentare isn't a party to this query) — used to validate Tentare's own `/comparativa/*` format |
| instructora pilates barcelona | Local / mixed (training courses + individual freelancers) | Pilates-school course pages + individual freelance-instructor sites/portfolios (anitapilates.com) + tutor marketplaces (tusclasesparticulares, infoclases) | `/network/instructoras/ciudad/barcelona` (Local/Directory) |
| cómo cubrir una baja de instructora de pilates | Informational / procedural | Mostly off-topic "how to become an instructor" career content + one on-topic press-style article (diariocritico.com, "notas de prensa" section) | `/recursos/cubrir-baja-instructora` (Blog Post/Guide) |
| factura electrónica verifactu estudio pilates | Informational + commercial | Competitor comparison articles (TIMP "comparativa 2026", Viday landing page) + generic blog (Sammy) | `/recursos/facturacion-electronica-verifactu` (Blog Post/Guide) — didn't appear in snapshot |

---

## What Works

- **The `/comparativa/tentare-vs-X` pages are the correct page type.** The "bsport vs momence"
  SERP shows the same structural pattern — review-aggregator compare tools *and* vendor-authored
  1:1 comparison landing pages both rank for head-to-head queries — validating Tentare's own
  12-page `/comparativa/*` set as the right format for its branded vs-competitor queries.
  Rendered content for `/comparativa/tentare-vs-bsport` also does something most vendor
  comparisons don't: it names where the competitor is still ahead ("bsport sigue siendo hoy la
  opción más madura en esos puntos") instead of a one-sided pitch — this concedes-ground honesty
  is a trust signal the Comparison-type taxonomy rewards (pros/cons, not just a verdict).
- **The `/recursos/*` guides are correctly typed as Blog Post/Guide**, matching the taxonomy's
  informational-intent structure: problem statement → numbered steps/explanation → resolution,
  with internal glossary cross-links. `cubrir-baja-instructora` opens on the exact emotional
  trigger a 22:47 phone call produces, which lines up with the query's implicit urgency.
- **Homepage schema stack is appropriately rich for a Landing Page**: `SoftwareApplication` +
  `Offer`, `FAQPage`, `Organization`/`ContactPoint`, `WebSite`/`SearchAction`, plus 4
  `SiteNavigationElement` blocks — covers the taxonomy's "Required elements" for this page type.
- **The `/network` local-instructor-marketplace concept is the right page TYPE** for
  "instructora pilates [ciudad]" queries — a directory of local providers is what that SERP
  expects (individual freelancer sites, tutor marketplaces). The direction is right even though
  execution (below) isn't there yet.

---

## Findings

### F1 — Homepage geo-branding contradicts national SaaS scope (CRITICAL)

**Query/signal:** homepage `<title>` = "Software de Gestión para Estudios de Pilates en
Barcelona", H1 = "Software de gestión para estudios de Pilates", meta description explicitly
scopes the pitch to "en Barcelona... desde 29 €/mes." Meanwhile `/funcionalidades` (15 pages)
and `/comparativa` (12 pages) target Spain broadly with no city qualifier, and the homepage's own
JSON-LD is `SoftwareApplication`/`Offer` — **not** `LocalBusiness** — with no address, no map, no
geo coordinates, no city-specific testimonial in the rendered text.

**Description:** This is a two-directional mismatch, both bad:
- A searcher with **national** commercial intent ("software gestión estudio pilates" from
  Valencia, Sevilla, Madrid — the exact query tested above) lands on a page whose H1/meta says
  "en Barcelona." Per the persona-scoring Clarity dimension (answer must be clear within 10
  seconds), this plants doubt about product-city scope at the worst possible moment — first
  impression, before trust is built.
- A searcher with **genuinely local** intent (expecting a Local Page per taxonomy: address, map,
  NAP, local social proof) gets a national SaaS pitch with a city word bolted onto the title tag
  and nothing else Local-Page-shaped behind it. This is precisely the taxonomy's documented
  mismatch pattern — "Generic Service Page missing local signals (HIGH)" — but on a Landing Page
  instead of a Service Page, and self-inflicted rather than accidental.
- The schema and the copy also disagree with each other: `SoftwareApplication` (correct, national
  product) sits under a title/meta that reads as city-scoped — an internal coherence problem for
  Google's classification of the page, not just a human-facing one.

**Recommendation:** Pick one strategy, don't run both through the same URL:
1. **(Recommended)** Drop the city qualifier from the homepage `<title>`/H1/meta entirely and let
   `/network/instructoras/ciudad/barcelona` own Barcelona-local intent. This matches what's
   already true structurally (SoftwareApplication schema, national `/funcionalidades` and
   `/comparativa` scope) and removes the contradiction at zero cost.
2. If Barcelona-first is a deliberate go-to-market bet (e.g. to bootstrap local-marketplace
   authority), then build the Local Page taxonomy's actual required elements on the homepage or a
   dedicated `/barcelona` landing page: `LocalBusiness` schema, a "estudios de Barcelona que ya
   usan Tentare" section with named studios, and copy that matches the local trust bar — not just
   a swapped keyword in the title tag.

### F2 — `/network/instructoras/ciudad/barcelona` is the right type, empty on depth (HIGH)

**Query/signal:** "instructora pilates barcelona" — SERP is dominated by established training
schools (Polestar, CIM Formación, LATES Y LATES) and individual freelance-instructor
sites/portfolios (anitapilates.com) plus tutor marketplaces (tusclasesparticulares, infoclases)
with multiple listed professionals. Tentare's own page, rendered: "1 instructora en Barcelona" —
a single listing (Judith Clemente, Yoga).

**Description:** The page type is correct (Local/Directory matches the SERP's marketplace
pattern), but content depth is critical — a one-listing directory cannot compete on a query where
every third-party result shows multiple named providers or an established school brand. This
isn't a type mismatch to fix with copy; it's an inventory problem that undermines an otherwise
sound page-type decision.

**Recommendation:** Don't index/promote per-city marketplace pages until they clear a minimum
listing threshold (e.g. 5+ instructors per city) — a near-empty directory ranking or being shared
is worse than not surfacing at all for this query type. Prioritize supply-side growth
(`/network/crear-perfil` adoption) for Barcelona before treating this URL as a competitive SEO
asset.

### F3 — No owned "best/comprehensive" round-up asset for broad commercial-investigation queries (MEDIUM)

**Query/signal:** "software gestión estudio pilates" and "software para estudio de pilates" —
both snapshots are dominated by third-party listicles/directories (GetApp, Sammy "mejor software
gestión pilates," Fitune "10 mejores," Grupo ZAS "guía") rather than any single vendor's own
homepage.

**Description:** Tentare's comparison content is entirely 1:1 (`tentare-vs-mindbody`,
`tentare-vs-bsport`, etc.) — there's no owned page shaped like the format this SERP actually
rewards at the top-of-funnel stage: a multi-option round-up/checklist that a searcher hits
*before* they've narrowed to a specific competitor name. (`/recursos/checklist-elegir-software-estudio`
exists and may partially cover this — worth checking whether it's built as a comparison round-up
or a generic checklist; not fetched in this pass.)

**Recommendation:** Confirm whether `/recursos/checklist-elegir-software-estudio` already serves
this intent; if not, or if it's too generic, consider a dedicated "mejor software para gestión de
estudios de pilates" round-up page using the Comparison-page taxonomy (criteria table, multiple
vendors including honest non-Tentare mentions, clear "best for X" segmentation) rather than
relying on the 1:1 pages to catch broad discovery traffic.

### F4 — Verifactu/compliance topic ceded to direct competitors' comparison content (MEDIUM)

**Query/signal:** "factura electrónica verifactu estudio pilates" — snapshot surfaces
**timp.pro** ("Software para centros de pilates con Verifactu: comparativa 2026") and
**viday.es** — both of which Tentare has dedicated `/comparativa/tentare-vs-timp` and
`/comparativa/tentare-vs-viday` pages against — plus a generic Sammy blog post. Tentare's own
`/recursos/facturacion-electronica-verifactu` (rendered: solid, correctly-typed
definitional/procedural guide, ~2,500 chars extracted) did not appear in the snapshot.

**Description:** Two known competitors are combining the shared regulatory topic (Verifactu, a
hard 2026 compliance deadline every Spanish studio owner is searching about right now) with
vendor-comparison framing, capturing both informational and commercial intent in one page.
Tentare's page is purely informational — correct type, but a narrower format than what's
currently winning this specific query.

**Recommendation:** Not a page-type fix — a content-format one. Consider adding a short "qué
mirar en el software que elijas para cumplir Verifactu" section with a lightweight comparison
angle to `/recursos/facturacion-electronica-verifactu`, or cross-link it explicitly to the
relevant `/comparativa/tentare-vs-timp` and `/comparativa/tentare-vs-viday` pages so the guide
captures the reader before they leave to compare vendors elsewhere.

### F5 — "alternativas a mindbody" competitor visibility (LOW / UNKNOWN)

**Query/signal:** a competitor (Lorari) has its own blog/alternatives-listicle content
(lorari.com/blog/alternativas-mindbody-estudios-bienestar-2026) appearing in this snapshot.
Tentare's `/comparativa/tentare-vs-mindbody` — the correct page type for this exact intent
(Comparison) — did not appear.

**Description:** Cannot distinguish, from this tool, between (a) an actual ranking/authority gap,
(b) an indexing issue, or (c) normal snapshot noise (WebSearch is not exhaustive and not a rank
tracker). The page type itself is not the problem here — it's the taxonomy-correct format for
this query.

**Recommendation:** Verify in Google Search Console whether `/comparativa/tentare-vs-mindbody` has
impressions/position data for "alternativas a mindbody" and variants before investing further;
this is a backlink/authority question, not an SXO page-type fix. **Mark UNKNOWN.**

### F6 — "cómo cubrir una baja" query: good type match, unverifiable PR asset (LOW)

**Query/signal:** SERP is mostly off-topic career-training content ("cómo ser instructor de
pilates") plus one on-topic result: a "notas de prensa" (press-release section) article on
diariocritico.com discussing automated substitute-instructor management for pilates studios.
`WebFetch` on that URL returned HTTP 403 — **could not verify** whether it names or links Tentare.

**Description:** Tentare's own `/recursos/cubrir-baja-instructora` is well-matched to this query
(problem → 4 manual steps → automated resolution, correct Blog Post/Guide structure) and faces a
thin, mostly-irrelevant SERP — a low-competition opportunity if the page is indexed and the title
tag doesn't get bucketed with the "how to become an instructor" career-training cluster it's
currently surrounded by.

**Recommendation:** Confirm via GSC whether the diariocritico.com press piece is an earned
placement for Tentare (if so, it's a backlink asset worth reinforcing); separately, double-check
the page's `<title>` doesn't share vocabulary with "cómo ser instructora de pilates" (career
training) to avoid topical confusion with that unrelated but keyword-adjacent cluster. **Mark
UNKNOWN on the press article's authorship/linking.**

---

## Derived User Stories (2+ journey stages, cited to signals above)

1. **As an estudio owner comparing software options broadly** (awareness), I want a single page
   that ranks multiple vendors so I don't have to search vendor-by-vendor, because I don't yet
   know which competitor names to search for, but I'm blocked by **comparison fatigue** — Tentare
   has no round-up page, only 1:1 comparisons. *(Source: F3, listicle-dominated SERP for
   "software gestión estudio pilates.")*
2. **As a studio owner already using TIMP or Viday and facing the 2026 Verifactu deadline**
   (consideration), I want to know if switching solves my compliance problem AND is worth the
   migration effort, because the deadline is real and imminent, but I'm blocked by **information
   gap** — the compliance guide and the vendor-switching case aren't connected on the same page.
   *(Source: F4.)*
3. **As a Barcelona studio owner searching a national query** (decision), I want confirmation this
   product works for my city without a city-limited plan, because the homepage headline makes me
   wonder, but I'm blocked by **trust/scope ambiguity** created by the "en Barcelona" framing on
   an otherwise national product. *(Source: F1.)*
4. **As someone looking to hire or find a substitute pilates instructor in Barcelona** (awareness),
   I want to browse several qualified local instructors, because one option isn't a real choice,
   but I'm blocked by **thin inventory** — the directory shows one listing against a SERP full of
   schools and individual portfolios with real selection. *(Source: F2.)*
5. **As a studio owner at 22:47 with an instructor no-show** (decision, high urgency), I want the
   exact fix right now, because I've lost the evening already, and this is well served — the guide
   opens on that exact scenario. Low barrier here; main risk is discoverability, not content fit.
   *(Source: F6.)*

---

## Limitations

- WebSearch results are a point-in-time snapshot from this tool, not verified Google rank
  positions, not logged-in/personalized results, and not geo-located to Spain — treat all "did
  not appear in this snapshot" statements as inconclusive on actual ranking, confirmed only via
  Google Search Console.
- `WebFetch` on diariocritico.com returned HTTP 403 — could not confirm whether that article
  names or links Tentare; F6's press-asset claim is unverified.
- Did not check for AI Overview presence/citations, PAA box contents, or ad density directly (the
  WebSearch tool used here returns synthesized results, not a raw SERP screenshot) — PAA/AIO-based
  signals in the user stories above are inferred from related-content themes, not confirmed PAA
  question text.
- Did not render/parse `/recursos/checklist-elegir-software-estudio` or the remaining 8
  `/comparativa/*` pages — F3's recommendation should be re-checked against that page's actual
  content before treating it as a real gap.
- No access to Google Search Console or GA4 in this pass — all ranking/authority questions (F1,
  F5, F6) are flagged UNKNOWN rather than asserted.

---

Recommend `/seo content` for deeper E-E-A-T review of the `/recursos/*` guides, and `/seo local`
for a dedicated GBP/local-pack assessment before deciding F1's direction (drop city qualifier vs.
build out genuine local signals).
