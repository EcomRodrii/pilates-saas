# Schema.org Audit — tentare.app

Scope: JSON-LD structured data detected across pages checked in this and prior
audit passes (homepage, /precios pricing consistency, /funcionalidades hub +
one child, /comparativa hub + one child, /glosario, and
/network/instructoras/judith-clemente-barcelona). Not a full-site crawl —
see coverage matrix and UNKNOWN rows below for what was not checked.

## What works

- **Homepage** (`https://www.tentare.app`) emits a rich, valid JSON-LD graph:
  `SoftwareApplication` + `Offer` (pricing), `FAQPage`/`Question`/`Answer`,
  `Organization` + `ContactPoint`, `WebSite` + `SearchAction`, and
  `SiteNavigationElement`. All `@context` values use `https://schema.org`,
  no placeholder text found.
- **No fabricated `aggregateRating`/`Review` schema anywhere checked.**
  Google's `SoftwareApplication` rich result technically wants
  `aggregateRating`, but Tentare has no real review corpus to back one —
  omitting it entirely is the correct, honest choice. Flagged here as a
  **positive**, not a gap to fix. Do not recommend adding a fabricated
  rating to "complete" the rich-result eligibility.
- **Pricing in schema matches on-page pricing.** The three price points
  (29/59/149 EUR) in the homepage `Offer` schema are consistent with what's
  visibly displayed on both the homepage and `/precios` — no stale/drifted
  numbers.
- **`/glosario` uses `DefinedTermSet`/`DefinedTerm` correctly** — the right
  type for a glossary, not misapplied as `FAQPage` or `Article`.
- **Instructor profile (`/network/instructoras/judith-clemente-barcelona`)
  has valid, real `Person` schema** — `name`, `jobTitle`,
  `address.addressLocality`, `image`, `description`, `url`, `isPartOf`, all
  matching visible on-page content. Address is city-level only
  (`addressLocality: "Barcelona"`, no street), which is the appropriate
  privacy choice for a freelance individual rather than a storefront. No
  invented credentials, metrics, or ratings. (Full detail already covered in
  `findings/local.md` — not re-verified here, cited for schema completeness.)
- **`BreadcrumbList` present and correctly nested** on the Network
  hub/listing/city/profile pages, matching visible URL hierarchy.
- **No fake/misapplied `LocalBusiness` schema** on directory pages that
  aren't businesses (e.g. the Barcelona city page correctly avoids declaring
  itself a `LocalBusiness`).

## Findings

### Title: FAQPage schema present on homepage — no current Google SERP benefit
- **Severity:** Info
- **Description:** The homepage emits valid `FAQPage`/`Question`/`Answer`
  JSON-LD. Google retired FAQ rich results for all sites (superseding the
  Aug 2023 gov/health-only restriction), so this schema no longer produces
  any SERP feature. The markup itself is technically correct (valid
  `@type`, required `mainEntity`/`acceptedAnswer` properties present, no
  placeholder text) — this is not a validation failure, just a change in
  Google's feature support.
- **Recommendation:** No action required. Leaving the existing FAQPage
  markup in place is harmless (schema validators will still pass it), but
  do not invest further effort expanding it for Google SERP purposes — there
  is no rich-result upside. Any potential AI/GEO-assistant citation benefit
  from FAQ-structured content is unconfirmed and should not be used to
  justify expansion.

### Title: Listing/city pages in `/network` lack `ItemList` schema
- **Severity:** Medium
- **Description:** Per `findings/local.md`, `/network/instructoras` and
  `/network/instructoras/ciudad/barcelona` emit only `BreadcrumbList`
  JSON-LD — no `ItemList`/`CollectionPage` wrapping the instructor cards.
  Cross-referenced here because it's a structured-data gap, not just a local
  SEO one: `ItemList` is the correct, non-fabricated schema pattern for "this
  page lists N verified instructor profiles," and is worth fixing before the
  directory scales past one instructor/one city.
- **Recommendation:** Add `ItemList` schema to both listing pages, each
  `ListItem` pointing to the real instructor profile URL. Do not add
  position/rating fields that aren't genuinely computed. (Full context and
  priority rationale already in `findings/local.md`; not duplicating the
  scale-risk analysis here.)

### Title: No schema opportunities identified on `/funcionalidades` or `/comparativa` beyond what's already present
- **Severity:** Info
- **Description:** The `/funcionalidades` hub + one checked child page, and
  the `/comparativa` hub + one checked child page, were reviewed in an
  earlier pass with no major structured-data issues noted (no deprecated
  types, no invalid blocks). Depth of that check was limited (hub + 1 child
  each, not full sibling coverage) — see coverage matrix.
- **Recommendation:** If `/comparativa` children are competitor-comparison
  pages, consider `WebPage` + `mainEntity` referencing the compared
  `SoftwareApplication` entities (Tentare vs. competitor) only if factual,
  non-promotional comparison data is already present in visible page copy —
  do not fabricate comparison claims into schema that aren't shown to users.
  Not enough of `/comparativa`'s children were checked to give this more
  than an Info-level suggestion.

## Coverage matrix

| Page | Checked? | Schema found | Validation |
|---|---|---|---|
| `/` (homepage) | Yes | SoftwareApplication+Offer, FAQPage, Organization+ContactPoint, WebSite+SearchAction, SiteNavigationElement | Pass |
| `/precios` | Partial (pricing cross-check only) | Not independently inspected for its own JSON-LD graph | N/A — only price-value consistency verified |
| `/funcionalidades` (hub) | Yes | Checked, no issues noted | Pass |
| `/funcionalidades/*` (1 child) | Yes | Checked, no issues noted | Pass |
| `/funcionalidades/*` (other children) | No | UNKNOWN | UNKNOWN |
| `/comparativa` (hub) | Yes | Checked, no issues noted | Pass |
| `/comparativa/*` (1 child) | Yes | Checked, no issues noted | Pass |
| `/comparativa/*` (other children) | No | UNKNOWN | UNKNOWN |
| `/glosario` | Yes | DefinedTermSet/DefinedTerm | Pass |
| `/network` (hub) | Yes (via local.md) | BreadcrumbList only | Pass, but thin |
| `/network/instructoras` (listing) | Yes (via local.md) | BreadcrumbList only | Missing ItemList (see Findings) |
| `/network/instructoras/ciudad/barcelona` | Yes (via local.md) | BreadcrumbList only | Missing ItemList (see Findings) |
| `/network/instructoras/judith-clemente-barcelona` | Yes (via local.md) | Person, BreadcrumbList | Pass |
| `/recursos` | No | UNKNOWN | UNKNOWN |
| `/ayuda` | No | UNKNOWN | UNKNOWN |
| Legal pages (LSSI/privacidad/etc.) | No | UNKNOWN | UNKNOWN |

## Generated JSON-LD for recommended additions

`ItemList` for `/network/instructoras` (listing page) — illustrative shape,
populate `itemListElement` from the real, currently-displayed instructor set
only (today that's a list of one, Judith Clemente):

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "url": "https://www.tentare.app/network/instructoras/judith-clemente-barcelona"
    }
  ]
}
```

Same pattern applies to `/network/instructoras/ciudad/barcelona`, scoped to
whichever instructors are shown on that city page.

## Limitations

- This audit is not a full-site crawl. Coverage is limited to the pages
  listed in the matrix above, carried over from three prior audit passes.
- `/recursos`, `/ayuda`, and legal pages were never fetched — marked
  UNKNOWN rather than assumed clean or broken.
- `/precios` was only checked for price-value consistency against the
  homepage's `Offer` schema, not independently inspected for its own
  JSON-LD graph structure.
- No DataForSEO or Google Rich Results Test API access in this session;
  findings are based on static/rendered JSON-LD inspection, not live SERP
  feature confirmation.
