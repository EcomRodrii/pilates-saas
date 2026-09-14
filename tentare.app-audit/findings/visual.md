# Visual / Mobile Audit — tentare.app

Reviewed via static screenshots (no live capture needed, images pre-supplied).
Viewports covered: desktop (1920x1080 equivalent), laptop (1366x768), tablet
(768x1024), mobile (375x812). Pages: home, /precios, /comparativa,
/network/instructoras.

## What works

- **Home, mobile above-the-fold is solid.** H1 ("Software de gestión para
  estudios de Pilates"), the subhead, and the primary CTA ("Ver Tentare en
  acción") are all visible without scrolling, plus a floating WhatsApp
  button as a secondary contact channel.
- **Pricing page desktop hierarchy is clear.** Three cards, the middle
  "Estudio" plan visually promoted with a dark card + "MÁS ELEGIDO" badge
  and a filled CTA, exactly the pattern that drives conversion on
  comparison pricing pages.
- **Comparativa mobile handles a wide table well.** Instead of letting a
  14-column table break the layout, it collapses to one competitor column
  with an explicit "Desliza la tabla para ver todo →" affordance — a
  correct, deliberate mobile adaptation rather than a bug.
- **/network/instructoras is responsive as expected**: the desktop filter
  sidebar collapses into a single "Filtros" button + bottom sheet trigger
  on mobile, keeping the card grid usable at 375px width.
- **CTA tap targets are generally sized well** on mobile: "Ver Tentare en
  acción", "Empezar gratis", and the WhatsApp bubble all look comfortably
  above the 48x48px guidance.
- **Nav is consistent across breakpoints**: hamburger icon on mobile/tablet,
  full nav bar on desktop/laptop, same logo treatment everywhere.

## Findings

### 1. Decorative logo mark overlaps subhead text on desktop/laptop/tablet home hero
- **Severity**: Medium
- **Description**: On desktop, laptop, and tablet home screenshots
  (`home_desktop.png`, `home_laptop.png`, `home_tablet.png`), the large
  two-tone "T" brand mark rendered behind the hero sits directly across the
  subhead ("Gestiona reservas, clases, alumnos, pagos y profesores desde un
  solo lugar.") and, at 1366px, visibly touches the CTA button too. The
  shapes are semi-transparent but dark enough to reduce contrast on the
  white subhead text where they overlap — worse at laptop width where the
  hero has less horizontal room and the mark sits larger relative to the
  text column. On mobile this isn't an issue because the mark scales down
  and sits below the CTA, clear of any text.
- **Recommendation**: Either reduce the mark's opacity/size further at
  laptop (1280–1440px) breakpoints specifically, or shift its vertical
  position so it never intersects the subhead/CTA text box. Verify with a
  contrast check on the subhead where it crosses the mark.

### 2. Pricing page: primary CTA is below the fold on mobile
- **Severity**: Low
- **Description**: On `precios_mobile.png`, none of the three plan cards
  (and therefore none of "Empezar gratis" / "Hablar con nosotros") are
  visible without scrolling — only the headline, subhead, and the "7 días
  gratis · Sin tarjeta de crédito" pill are above the fold. The persistent
  header "Crear estudio" button is technically a CTA in the viewport, but
  it doesn't carry the plan-specific pricing context a visitor lands on
  this page to see.
- **Recommendation**: Not urgent given the header CTA is present, but
  consider trimming the intro copy or surfacing the middle plan's price
  earlier on mobile so a scroll isn't required to reach the differentiator
  (price) this page exists for.

### 3. /network/instructoras has effectively one listing
- **Severity**: Low (content/product, not strictly visual, but affects
  perceived above-the-fold usefulness)
- **Description**: Both desktop and mobile screenshots show "1 instructora"
  with a full filter sidebar/sheet built around a single result. The page
  is visually correct, but a new visitor filtering by city/specialty will
  almost always see an empty state. Not a rendering bug, flagged for
  product awareness since it undermines the value of the page layout
  investment.
- **Recommendation**: Out of scope for a visual fix; consider gating heavy
  filter UI until there's a critical mass of profiles, or route this to
  the product/content backlog rather than treating it as a design defect.

### 4. No layout-shift or overlap risk detected elsewhere
- **Severity**: Informational
- **Description**: Comparativa (desktop/mobile) and network/instructoras
  (desktop/mobile) show no overlapping elements, no cut-off text, and no
  broken images. Text legibility is good everywhere except finding #1.

## Screenshots reviewed

- `home_desktop.png` — Full hero at desktop width; nav + H1 + subhead + CTA + dashboard product screenshot, decorative mark overlaps subhead (see #1).
- `home_mobile.png` — Above-the-fold H1/subhead/CTA visible, WhatsApp floating button, no overlap issues.
- `home_tablet.png` — Same hero layout scaled to 768px, mark overlap present but lighter than laptop.
- `home_laptop.png` — 1366px width, worst case of the decorative-mark overlap (#1), touches both subhead and CTA area.
- `precios_desktop.png` — Three pricing cards with clear "MÁS ELEGIDO" hierarchy, all CTAs visible above fold.
- `precios_mobile.png` — Headline/subhead/trial pill visible, but pricing cards/CTAs require scrolling (#2).
- `comparativa_desktop.png` — Wide 14-column comparison table, readable, scrolls horizontally as expected on desktop.
- `comparativa_mobile.png` — Table collapses to one column with an explicit "swipe to see more" hint, good mobile adaptation.
- `network_instructoras_desktop.png` — Filter sidebar + card grid, only one listing present (#3).
- `network_instructoras_mobile.png` — Filters collapse into a single button, card renders cleanly at 375px.
