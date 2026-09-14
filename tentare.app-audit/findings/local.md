# Local SEO — Tentare Network (marketplace/directory component)

**Scope note (read before the findings below):** Tentare-the-company is a national
B2B SaaS (studio management software), not a local business — generic checks
like "does Tentare have a Google Business Profile / physical NAP" **do not
apply** to the company and were not run. What was audited instead is
`/network` and its sub-pages, which function as a **freelance-instructor
directory/marketplace** (Yelp/Bark-style vertical), judged against
**local-directory SEO standards** (structured listings, per-entity schema,
location landing page quality, scalability thresholds) rather than
single-location LocalBusiness standards.

Pages audited (all fetched rendered via `render_page.py --mode auto`, none
flagged as SPA shells needing forced Playwright render):
- `/network` (hub)
- `/network/instructoras` (listing)
- `/network/instructoras/ciudad/barcelona` (the one city page in the sitemap)
- `/network/instructoras/judith-clemente-barcelona` (the one instructor profile in the sitemap)

Confirmed via `sitemap.xml`: exactly one city page (Barcelona) and one
instructor profile (Judith Clemente) are indexed today. No other
`/network/instructoras/ciudad/*` or instructor-slug URLs exist yet.

## What works

- **No fabricated review data anywhere.** Neither the instructor profile nor
  the listing/city pages contain star ratings, review counts, or
  `aggregateRating`. This is the single most important thing to get right on
  a marketplace and it's clean — nothing to walk back later.
- **Person schema on the instructor profile is real, not templated filler.**
  `judith-clemente-barcelona` outputs valid `Person` JSON-LD with
  `name`, `jobTitle`, `address.addressLocality`, `image`, `description`,
  `url`, and `isPartOf` — all fields match visible on-page content
  (experience text, city, photo). No invented credentials or metrics.
- **City-level-only address on the instructor profile is the right privacy
  call.** `address.addressLocality: "Barcelona"` with no street address is
  appropriate for a freelance individual (not a storefront) and creates no
  false NAP expectation to later contradict.
- **BreadcrumbList schema is present and correctly nested on all three
  sub-pages** (Instructoras → city → individual, or Home → Instructoras →
  city), matching the visible URL hierarchy.
- **No fake/misapplied `LocalBusiness` schema.** The city page (Barcelona)
  correctly does NOT declare itself as a `LocalBusiness` — it's a directory
  page, not a business, and it wasn't shoehorned into that type. That
  restraint is correct even though it means the page currently has *no*
  directory-appropriate schema at all (see Findings).
- **Clean URL pattern already built for scale**: `/network/instructoras/ciudad/<slug>`
  and `/network/instructoras/<instructor-slug>` are unambiguous, human-readable,
  city/instructor-scoped templates — evidence this was designed as a
  program from day one, not a one-off page (see the proactive flag below).
- **No `noindex` on any of the four pages** — all are crawlable/indexable as intended.

## Findings

### Title: City landing page's canonical tag points to the homepage, not itself
- **Severity:** Critical
- **Description:** `/network/instructoras/ciudad/barcelona` declares
  `<link rel="canonical" href="https://www.tentare.app">` — the bare
  homepage. This tells Google the canonical/authoritative URL for this
  content is the homepage, which can suppress the city page from ranking for
  "instructoras pilates/yoga Barcelona" queries entirely (the exact traffic
  this page exists to capture). The hub (`/network`), listing
  (`/network/instructoras`), and instructor profile pages all self-canonicalize
  correctly — this looks like a template bug isolated to the `ciudad/[slug]`
  route.
- **Recommendation:** Fix the canonical to self-reference
  `https://www.tentare.app/network/instructoras/ciudad/barcelona` (dynamically
  built from the route slug, not hardcoded). Verify against Search Console
  once fixed to confirm Google re-crawls with the corrected canonical — this
  is the kind of issue that's invisible in a browser and only shows up in
  crawl/indexing data.

### Title: `/network` hub page's H1 is the generic SaaS hero, not marketplace-relevant
- **Severity:** Medium
- **Description:** The only H1 on `/network` is "Tu estudio, A OTRO NIVEL"
  — the same product-marketing headline pattern used for the core studio-management
  SaaS, not anything referencing the instructor marketplace, Pilates/Yoga, or
  location. Page `<title>` and meta description ("Tentare Network — Encuentra
  tu instructora de Pilates y Yoga") are on-topic, but the H1 (the strongest
  on-page relevance signal after title) doesn't reinforce them. This dilutes
  topical signal for a page meant to rank for marketplace/directory intent.
- **Recommendation:** Give `/network` its own H1 that names the marketplace
  and its core entities/locations, e.g. "Tentare Network — instructoras de
  Pilates y Yoga verificadas" (or similar), separate from the SaaS landing
  page's hero.

### Title: Listing and city pages have no `ItemList`/directory-appropriate schema
- **Severity:** Medium
- **Description:** `/network/instructoras` and
  `/network/instructoras/ciudad/barcelona` only emit `BreadcrumbList` JSON-LD.
  Neither declares an `ItemList` (or `CollectionPage` with `ItemList`)
  wrapping the instructor cards shown on the page. For a directory/listing
  page, `ItemList` is the correct, non-fabricated way to help search engines
  (and AI answer engines) understand "this page is a list of N verified
  instructor profiles in this city" — distinct from and preferable to
  misapplying `LocalBusiness`, which the site correctly avoided. With only
  one instructor today this is low-impact, but it's the right time to add
  the pattern before it needs to scale across many listings at once.
- **Recommendation:** Add `ItemList` schema to both listing pages, with each
  `ListItem` pointing to the instructor profile URL (using only real,
  already-displayed data — no fabricated position/rating fields).

### Title: [PROACTIVE] URL/template pattern signals designed scale-up — re-check uniqueness and page-count thresholds BEFORE it happens, not after
- **Severity:** High (process flag, not a live defect today)
- **Description:** Today there is exactly one city page and one instructor
  profile in the sitemap — far under this skill's own 30-page WARNING /
  50-page HARD STOP thresholds for location-page doorway risk, so no
  violation exists right now. However, the URL structure
  (`/network/instructoras/ciudad/<slug>`) is a clear, deliberate, scalable
  template — not a one-off page — and the homepage copy itself says
  "Empezamos con las primeras instructoras en Barcelona y Madrid, y vamos a
  sumar más ciudades según se una gente" (Madrid is already named as next).
  The moment more cities/instructors are added, this becomes exactly the
  kind of near-identical, template-generated location-page set that the
  60%+ uniqueness bar and the 30/50-page thresholds exist to catch — and by
  then there may already be dozens of thin pages live.
- **Recommendation:** Before publishing the Madrid city page (or any
  subsequent city), run the doorway-page swap test and the 60%+ uniqueness
  check against the Barcelona template NOW, while there's only one page to
  fix the template on, rather than after 10-30 near-duplicate city pages
  exist. In particular verify: (a) city pages differ by more than the city
  name substitution (local context, not just a find-replace), and (b) the
  per-instructor pages retain genuine unique content (bio, experience,
  specialties) as volume grows, since Judith's profile bio is substantive
  today but nothing in the template guarantees future profiles will be.

### Title: Instructor profile has no `sameAs`/verification-linking data despite on-page "verified" badges
- **Severity:** Low
- **Description:** The rendered page displays "Email verificado" and
  "Identidad verificada" badges for Judith Clemente, but the `Person` schema
  has no corresponding structured signal (e.g., `sameAs`, or a custom
  `additionalProperty`) that would let search/AI engines pick up the
  verification claim as structured data rather than only as page text. Not
  a defect — the current schema doesn't fabricate anything — just an
  opportunity, and worth flagging given "3 of top 5 AI visibility factors
  are citation/verification-related" per this skill's brief.
- **Recommendation:** Low priority given single-profile scale today;
  consider adding `additionalProperty` (e.g. `PropertyValue` for
  "emailVerified"/"identityVerified") to `Person` schema once there are
  enough profiles to matter for AI-visibility differentiation. Do not add
  numeric trust "scores" — keep it boolean/qualitative to avoid the
  fabricated-rating trap.

## Limitations / what could not be assessed

- **No live GBP/business-listing or SERP-position data.** DataForSEO MCP
  tools were not available in this session, so no verification of actual
  Google local-pack rankings, live listing status, or `business_listings_search`
  data was possible for Barcelona-area queries. All findings above are based
  solely on rendered page HTML/JSON-LD.
- **Tier-1 directory citation presence (Yelp, BBB, etc.) — UNKNOWN / not
  applicable in the traditional sense.** Individual freelance instructors are
  not the kind of entity indexed on Yelp/BBB, and Tentare-the-company is not
  a local business either, so standard citation-directory checks don't map
  cleanly onto this marketplace. Not run; flag as UNKNOWN rather than
  fabricating a citation audit that doesn't fit the entity type.
- **Review velocity / "18-day rule" — not assessable.** There is no review
  system evident on these pages (correctly — no ratings are shown), so
  review-velocity ranking dynamics don't apply to this component yet.
- **Madrid or any other future city page — not assessed**, because none
  exists yet; the proactive flag above is the substitute for that check.
- **GBP embed / Maps / photo-evidence checks were skipped as N/A** by design
  for this component, per the scope note — Tentare Network doesn't operate
  physical locations for these signals to apply to.
