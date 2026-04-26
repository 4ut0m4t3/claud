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
- excludes known wrong-number variants (Lana's Aid 207, Gengar ex 193)

If a card has fewer than 3 UK comps, it re-runs the search without the
`LH_PrefLoc=1` (UK location) filter and tags those rows as `International`.

## Run

```bash
cd scraper
npm install        # also installs the Chromium browser via Playwright
npm run scrape
```

Outputs in the `scraper/` directory:

- `uk_psa10_comps.json` — full structured data (per-listing + per-grade stats)
- `uk_psa10_comps.md` — markdown comp tables + lot summary

The console prints, per card: comps found and median price for both PSA 10 and
ACE 10, plus the sum of medians (estimated lot value) for each grade.

## Notes

- 3-5 second random delay between page loads.
- Realistic desktop Chrome user agent + en-GB locale.
- Headless Chromium; no logins or cookies required.
- "No results" is handled gracefully — affected cards print "No UK sold comps
  found" instead of erroring.
- eBay's HTML changes occasionally; if selectors stop matching, update the
  selector list in `scrapeSearchPage()` inside `uk_psa10_comps.js`.
