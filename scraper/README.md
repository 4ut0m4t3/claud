# UK PSA 10 / ACE 10 Pokemon Card Sold Comps Scraper

Pulls real **eBay UK sold listing** data for a fixed list of 6 PSA 10 Pokemon
cards and outputs a clean comp table. ACE 10 listings are also captured and
reported alongside PSA 10 so you can compare both grades.

## Cards

| # | Card        | Set                       | Number | Rarity                    |
|---|-------------|---------------------------|--------|---------------------------|
| 1 | Raboot      | SCR (Stellar Crown)       | 147    | Illustration Rare         |
| 2 | Lileep      | SCR (Stellar Crown)       | 145    | Illustration Rare         |
| 3 | Lana's Aid  | TWM (Twilight Masquerade) | 219    | Special Illustration Rare |
| 4 | Shiftry     | TEF (Temporal Forces)     | 163    | Illustration Rare         |
| 5 | Chatot      | TEF (Temporal Forces)     | 181    | Illustration Rare         |
| 6 | Gengar ex   | TEF (Temporal Forces)     | 104    | Double Rare               |

## What it does

For each card it hits eBay UK's sold-listings search:

```
https://www.ebay.co.uk/sch/i.html?_nkw={QUERY}&LH_Sold=1&LH_Complete=1&LH_PrefLoc=1&_sop=13
```

Then it filters results to only listings whose title:

- contains `PSA 10` / `PSA10`, or `ACE 10` / `ACE10`
- does **not** contain a wrong grade (`PSA 9`, `PSA 8`, `CGC x`, `BGS x`, `SGC x`, `ACE 9`, etc.)
- contains the correct card number
- contains the card's name keyword (e.g. `raboot`) — keeps unrelated cards
  that happen to share the number out of the comp set
- excludes known wrong-number variants (Lana's Aid 207, Gengar ex 193)

Each result is tagged `UK` or `International`. On eBay UK, UK-based listings
omit the "from X" attribute row so an absent country is treated as UK; non-UK
shippers are explicitly tagged. If a search returns fewer than 3 UK comps
the scraper retries without `LH_PrefLoc=1` and merges the extra results.

## Run

```bash
cd scraper
npm install        # also installs the Chromium browser via Playwright
npm run scrape
```

Outputs in the `scraper/` directory:

- `uk_psa10_comps.json` — full structured data (per-listing + per-grade,
  per-scope stats)
- `uk_psa10_comps.md` — markdown comp tables + lot summary

The console prints, per card: counts and median price for both grades, both
UK-only and all-comps, plus the sum-of-medians (estimated lot value) for each
grade × scope combination.

## Implementation notes

- A **fresh page is opened per request** because eBay's search pages keep
  firing analytics/ad requests forever, which crashes the renderer if a
  single page is reused too many times.
- **Resource blocking**: images, fonts, stylesheets and ad/analytics URLs
  are aborted to keep the renderer light.
- 3-5s random delay between page loads.
- Realistic desktop Chrome user agent + en-GB locale.
- `ignoreHTTPSErrors: true` is set on the browser context — needed for some
  sandboxed environments that intercept TLS; a no-op on a normal network.
- "No results" is handled gracefully — affected cards print `0 comps` and
  the markdown shows "No UK sold comps found" instead of erroring.
- eBay UK's listing-card layout is `li.s-card` with children
  `.s-card__title`, `.s-card__price`, `.s-card__caption` (sold date), and a
  set of `.s-card__attribute-row` rows from which we extract the country and
  seller. The legacy `li.s-item` selectors are retained as a fallback in
  case eBay rolls back.

If eBay redesigns again and selectors stop matching, update the selector
list inside `scrapeSearchPage()` in `uk_psa10_comps.js`.
