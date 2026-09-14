# Backlink Profile — tentare.app

**Data tier available: 0 (Common Crawl + verify crawler only).** Confirmed via
`backlinks_auth.py --check`: no Moz API key, no Bing Webmaster API key
configured in this environment. No Moz/Bing calls were attempted (would just
fail on missing credentials).

## What was checked

`commoncrawl_graph.py tentare.app` — Common Crawl web graph (domain-level
PageRank / harmonic centrality from the CC host graph).

```json
{
  "domain": "tentare.app",
  "in_crawl": false,
  "in_rankings": false,
  "pagerank": null,
  "pagerank_rank": null,
  "harmonic_centrality": null,
  "harmonic_centrality_rank": null,
  "n_hosts": null,
  "note": "Domain not found in Common Crawl data. It may be too new, too small, or not yet crawled."
}
```

Source: Common Crawl Web Graph, release `cc-main-2026-jan-feb-mar`
(confidence: 0.50, domain-level only). Freshness: this release is a quarterly
snapshot (source: https://commoncrawl.org/web-graphs), so it reflects the web
graph as crawled sometime in the Jan–Mar 2026 window, not real-time.

No known/candidate backlink URLs were supplied for this audit, so
`verify_backlinks.py` was not run — there was nothing to spot-check.

## Findings

- **tentare.app does not appear in the Common Crawl host graph at all**
  (`in_crawl: false`, `in_rankings: false`). No PageRank, no harmonic
  centrality, no referring-host count is available — not "zero," but
  genuinely absent from this dataset.
- Given the domain's known age and traffic profile (launched publicly
  2026-08-19 per prior audit history — see `docs/` in the app repo), this is
  the expected outcome for a young domain: Common Crawl's web graph is built
  from quarterly crawls, and a small/new site frequently isn't discovered or
  isn't included in the ranked subset yet. This is **not evidence of zero
  backlinks in reality** — it's an absence in one specific, free, domain-level
  dataset.
- **No referring domains, notable linking sites, anchor text, or toxic-link
  signals can be reported** because Tier 0 with an empty Common Crawl result
  produces no data to work from at all.

## Explicitly UNKNOWN / NOT AVAILABLE (no data source in this environment)

- **Domain Authority (DA) / Page Authority (PA)**: NOT AVAILABLE — requires
  Moz API (not configured).
- **Referring domain count / list**: NOT AVAILABLE — Common Crawl graph
  returned no data for this domain; DataForSEO/Moz would be needed for an
  actual referring-domains report.
- **Anchor text distribution**: NOT AVAILABLE — no source in this tier
  provides anchor-text-level detail (would require Moz anchors, Bing link
  details, or DataForSEO).
- **Toxic/spammy link detection, spam score**: NOT AVAILABLE — no source in
  this tier scores link toxicity (would require Moz Spam Score or
  DataForSEO).
- **Link velocity / trend over time**: NOT AVAILABLE — free sources
  (including Common Crawl) don't track this; DataForSEO-only capability.
- **Follow/nofollow ratio, geographic distribution of links**: NOT AVAILABLE
  at this tier.

## Backlink Health Score

**INSUFFICIENT DATA — no numeric score produced.** Per scoring policy, fewer
than 4 of the 7 weighted factors (referring domains, domain quality
distribution, anchor text naturalness, toxic link ratio, link velocity,
follow/nofollow ratio, geographic relevance) have any data source at Tier 0,
and the one factor Common Crawl could theoretically speak to (domain
authority signal, via PageRank) returned null for this domain. Producing a
score here would be misleading.

## Recommendation

**Severity: Low / Info.** Nothing concerning was found — there's no toxic
link pattern, no spam signal, no negative finding at all here, just an
absence of data. Given tentare.app is a recently-launched domain with (per
this scan) no backlink footprint visible yet in free public datasets, if the
team wants actual visibility into inbound links going forward, two zero/low
cost options would close this gap:
- **Moz Link Explorer free tier** (moz.com/products/api, 2,500 rows/month) —
  would unlock DA/PA, referring domain counts, and basic spam scoring
  (Tier 1 in this tooling).
- **Bing Webmaster Tools** (bing.com/webmasters, free, requires verifying
  ownership of tentare.app) — would unlock inbound-link reporting for this
  property specifically (Tier 2).

This is optional and not urgent — there is no current evidence of a problem
to fix, only a monitoring gap for a young domain that's expected to still be
building its link profile.
