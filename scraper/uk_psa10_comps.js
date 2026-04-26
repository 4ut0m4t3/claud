/**
 * UK PSA 10 / ACE 10 Pokemon Card Sold Comps Scraper
 *
 * Pulls actual UK sold listing data from eBay UK for a defined list of
 * PSA 10 (and ACE 10) Pokemon cards and outputs JSON + Markdown comp tables.
 *
 * Usage:
 *   npm install
 *   npm run scrape
 */

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// Card list
// ---------------------------------------------------------------------------
const CARDS = [
  {
    name: 'Raboot',
    number: '147',
    set: 'Stellar Crown',
    setCode: 'SCR',
    rarity: 'Illustration Rare',
    query: 'raboot 147 psa 10',
    excludeNumbers: [],
  },
  {
    name: 'Lileep',
    number: '145',
    set: 'Stellar Crown',
    setCode: 'SCR',
    rarity: 'Illustration Rare',
    query: 'lileep 145 psa 10',
    excludeNumbers: [],
  },
  {
    name: "Lana's Aid",
    number: '219',
    set: 'Twilight Masquerade',
    setCode: 'TWM',
    rarity: 'Special Illustration Rare',
    query: "lana's aid 219 psa 10",
    excludeNumbers: ['207'],
  },
  {
    name: 'Shiftry',
    number: '163',
    set: 'Temporal Forces',
    setCode: 'TEF',
    rarity: 'Illustration Rare',
    query: 'shiftry 163 psa 10',
    excludeNumbers: [],
  },
  {
    name: 'Chatot',
    number: '181',
    set: 'Temporal Forces',
    setCode: 'TEF',
    rarity: 'Illustration Rare',
    query: 'chatot 181 psa 10',
    excludeNumbers: [],
  },
  {
    name: 'Gengar ex',
    number: '104',
    set: 'Temporal Forces',
    setCode: 'TEF',
    rarity: 'Double Rare',
    query: 'gengar ex 104 psa 10',
    excludeNumbers: ['193'],
  },
];

// ---------------------------------------------------------------------------
// eBay UK URL builder
// ---------------------------------------------------------------------------
function buildEbayUrl(query, { ukOnly = true } = {}) {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: '1',
    LH_Complete: '1',
    _sop: '13',
    _ipg: '120',
  });
  if (ukOnly) params.set('LH_PrefLoc', '1');
  return `https://www.ebay.co.uk/sch/i.html?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Grade detection
// ---------------------------------------------------------------------------
const PSA10_RE = /\bpsa\s*-?\s*10\b/i;
const ACE10_RE = /\bace\s*-?\s*10\b/i;
const WRONG_GRADE_RES = [
  /\bpsa\s*-?\s*9\b/i,
  /\bpsa\s*-?\s*8\b/i,
  /\bpsa\s*-?\s*7\b/i,
  /\bcgc\s*-?\s*\d/i,
  /\bbgs\s*-?\s*\d/i,
  /\bsgc\s*-?\s*\d/i,
  /\bace\s*-?\s*9\b/i,
  /\bace\s*-?\s*8\b/i,
];

function detectGrade(title) {
  const hasPsa10 = PSA10_RE.test(title);
  const hasAce10 = ACE10_RE.test(title);
  if (hasPsa10 && !hasAce10) return 'PSA 10';
  if (hasAce10 && !hasPsa10) return 'ACE 10';
  if (hasPsa10 && hasAce10) return 'PSA 10';
  return null;
}

function hasWrongGrade(title, detected) {
  for (const re of WRONG_GRADE_RES) {
    if (re.test(title)) {
      if (detected === 'PSA 10' && /\bpsa\b/i.test(title) && /\b10\b/.test(title)) {
        if (/\bpsa\s*-?\s*10\b/i.test(title)) continue;
      }
      if (detected === 'ACE 10' && /\back\b/i.test(title) && /\b10\b/.test(title)) {
        if (/\bace\s*-?\s*10\b/i.test(title)) continue;
      }
      return true;
    }
  }
  return false;
}

function titleHasNumber(title, number) {
  const re = new RegExp(`(?:^|[^\\d])${number}(?:[^\\d]|$)`);
  return re.test(title);
}

// ---------------------------------------------------------------------------
// Date parsing for "Sold  15 Apr 2026" etc.
// ---------------------------------------------------------------------------
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};
function parseSoldDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/sold/i, '').trim();
  const m = cleaned.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return cleaned;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return cleaned;
  return `${m[3]}-${month}-${day}`;
}

function parsePriceGbp(raw) {
  if (!raw) return null;
  const m = raw.match(/£\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ''));
}

// ---------------------------------------------------------------------------
// Scrape one search results page
// ---------------------------------------------------------------------------
async function scrapeSearchPage(page, url) {
  console.log(`  GET ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  try {
    await page.waitForSelector('ul.srp-results, .srp-results, li.s-item', { timeout: 15000 });
  } catch {
    return [];
  }

  return page.$$eval('li.s-item', (nodes) => {
    const items = [];
    for (const li of nodes) {
      const titleEl = li.querySelector('.s-item__title');
      if (!titleEl) continue;
      const title = titleEl.innerText.trim();
      if (/^shop on ebay$/i.test(title)) continue;

      const linkEl = li.querySelector('a.s-item__link');
      const url = linkEl ? linkEl.href : null;

      const priceEl = li.querySelector('.s-item__price');
      const priceText = priceEl ? priceEl.innerText.trim() : null;

      const dateEl = li.querySelector('.s-item__caption--signal, .s-item__title--tag, .s-item__ended-date, .s-item__caption');
      const dateText = dateEl ? dateEl.innerText.trim() : null;

      const sellerEl = li.querySelector('.s-item__seller-info-text, .s-item__seller-info');
      const seller = sellerEl ? sellerEl.innerText.trim() : null;

      const imgEl = li.querySelector('.s-item__image-img, img.s-item__image-img, img');
      const imageUrl = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;

      items.push({ title, url, priceText, dateText, seller, imageUrl });
    }
    return items;
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function computeStats(prices) {
  if (!prices.length) return { count: 0, min: null, max: null, median: null, mean: null };
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: sorted.length,
    min: round2(min),
    max: round2(max),
    median: round2(median),
    mean: round2(mean),
  };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Per-card scrape + filter
// ---------------------------------------------------------------------------
async function scrapeCard(page, card) {
  console.log(`\nScraping ${card.name} (#${card.number})...`);
  const ukUrl = buildEbayUrl(card.query, { ukOnly: true });

  let raw = await scrapeSearchPage(page, ukUrl);
  let usedInternational = false;

  let filtered = applyFilters(raw, card).map((it) => ({ ...it, scope: 'UK' }));

  if (filtered.length < 3) {
    console.log(`  Only ${filtered.length} UK comps — retrying without UK filter`);
    await delay(randomBetween(3000, 5000));
    const intUrl = buildEbayUrl(card.query, { ukOnly: false });
    const intRaw = await scrapeSearchPage(page, intUrl);
    const intFiltered = applyFilters(intRaw, card)
      .filter((it) => !filtered.some((u) => u.url && u.url === it.url))
      .map((it) => ({ ...it, scope: 'International' }));
    filtered = [...filtered, ...intFiltered];
    usedInternational = true;
  }

  console.log(
    `  ${card.name}: scraped ${raw.length} listings, ${filtered.length} passed filters` +
      (usedInternational ? ' (incl. international fallback)' : '')
  );

  const psa10 = filtered.filter((it) => it.grade === 'PSA 10');
  const ace10 = filtered.filter((it) => it.grade === 'ACE 10');

  return {
    card_name: card.name,
    card_number: card.number,
    set: card.set,
    set_code: card.setCode,
    rarity: card.rarity,
    query: card.query,
    sold_listings: filtered,
    stats: {
      psa10: computeStats(psa10.map((it) => it.price_gbp).filter((p) => p != null)),
      ace10: computeStats(ace10.map((it) => it.price_gbp).filter((p) => p != null)),
      combined: computeStats(filtered.map((it) => it.price_gbp).filter((p) => p != null)),
    },
  };
}

function applyFilters(raw, card) {
  const out = [];
  for (const r of raw) {
    const grade = detectGrade(r.title);
    if (!grade) continue;
    if (hasWrongGrade(r.title, grade)) continue;
    if (!titleHasNumber(r.title, card.number)) continue;
    if (card.excludeNumbers.some((bad) => titleHasNumber(r.title, bad))) continue;

    const price = parsePriceGbp(r.priceText);
    if (price == null) continue;

    out.push({
      title: r.title,
      price_gbp: price,
      sold_date: parseSoldDate(r.dateText),
      url: r.url,
      seller: r.seller,
      image_url: r.imageUrl,
      grade,
    });
  }
  return out;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------
function buildMarkdown(result) {
  const lines = [];
  lines.push('# UK PSA 10 / ACE 10 Pokemon Card Sold Comps');
  lines.push('');
  lines.push(`Scraped: ${result.scraped_at}`);
  lines.push('');
  lines.push('Source: eBay UK sold listings (LH_Sold=1, LH_Complete=1, LH_PrefLoc=1).');
  lines.push('Where UK comps were < 3, an international fallback search was used and those rows are tagged "International".');
  lines.push('');

  for (const c of result.cards) {
    lines.push(`## ${c.card_name} — ${c.set} #${c.card_number}`);
    lines.push(`*${c.rarity}*`);
    lines.push('');

    if (!c.sold_listings.length) {
      lines.push('No UK sold comps found.');
      lines.push('');
      continue;
    }

    lines.push('| Date | Grade | Price (£) | Scope | Title |');
    lines.push('|------|-------|-----------|-------|-------|');
    const rows = [...c.sold_listings].sort((a, b) =>
      String(b.sold_date || '').localeCompare(String(a.sold_date || ''))
    );
    for (const r of rows) {
      const titleCell = r.url ? `[${escapeMd(r.title)}](${r.url})` : escapeMd(r.title);
      lines.push(
        `| ${r.sold_date || '?'} | ${r.grade} | ${r.price_gbp.toFixed(2)} | ${r.scope} | ${titleCell} |`
      );
    }
    lines.push('');

    lines.push('**Stats**');
    lines.push('');
    lines.push('| Grade | Count | Min | Median | Mean | Max |');
    lines.push('|-------|-------|-----|--------|------|-----|');
    for (const [label, key] of [
      ['PSA 10', 'psa10'],
      ['ACE 10', 'ace10'],
      ['Combined', 'combined'],
    ]) {
      const s = c.stats[key];
      if (!s.count) {
        lines.push(`| ${label} | 0 | - | - | - | - |`);
      } else {
        lines.push(
          `| ${label} | ${s.count} | £${s.min.toFixed(2)} | £${s.median.toFixed(2)} | £${s.mean.toFixed(2)} | £${s.max.toFixed(2)} |`
        );
      }
    }
    lines.push('');
  }

  lines.push('## Lot summary');
  lines.push('');
  lines.push('| Card | PSA 10 median | ACE 10 median | PSA 10 count | ACE 10 count |');
  lines.push('|------|---------------|---------------|--------------|--------------|');
  let psaSum = 0;
  let aceSum = 0;
  for (const c of result.cards) {
    const p = c.stats.psa10.median;
    const a = c.stats.ace10.median;
    if (p != null) psaSum += p;
    if (a != null) aceSum += a;
    lines.push(
      `| ${c.card_name} #${c.card_number} | ${p != null ? '£' + p.toFixed(2) : '-'} | ${a != null ? '£' + a.toFixed(2) : '-'} | ${c.stats.psa10.count} | ${c.stats.ace10.count} |`
    );
  }
  lines.push(`| **Sum of medians** | **£${psaSum.toFixed(2)}** | **£${aceSum.toFixed(2)}** | | |`);
  lines.push('');
  return lines.join('\n');
}

function escapeMd(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();

  const cards = [];
  for (const card of CARDS) {
    try {
      const cardResult = await scrapeCard(page, card);
      cards.push(cardResult);
    } catch (err) {
      console.error(`  ERROR scraping ${card.name}:`, err.message);
      cards.push({
        card_name: card.name,
        card_number: card.number,
        set: card.set,
        set_code: card.setCode,
        rarity: card.rarity,
        query: card.query,
        sold_listings: [],
        stats: {
          psa10: computeStats([]),
          ace10: computeStats([]),
          combined: computeStats([]),
        },
        error: err.message,
      });
    }
    await delay(randomBetween(3000, 5000));
  }

  await browser.close();

  const result = {
    scraped_at: new Date().toISOString(),
    source: 'ebay.co.uk sold listings',
    cards,
  };

  await writeFile('uk_psa10_comps.json', JSON.stringify(result, null, 2));
  await writeFile('uk_psa10_comps.md', buildMarkdown(result));

  console.log('\n=========================================');
  console.log('Final summary');
  console.log('=========================================');
  let psaSum = 0;
  let aceSum = 0;
  for (const c of cards) {
    const psa = c.stats.psa10;
    const ace = c.stats.ace10;
    console.log(
      `${c.card_name.padEnd(12)} #${c.card_number}  ` +
        `PSA10: ${String(psa.count).padStart(2)} comps, median ${psa.median != null ? '£' + psa.median.toFixed(2) : '-'}  |  ` +
        `ACE10: ${String(ace.count).padStart(2)} comps, median ${ace.median != null ? '£' + ace.median.toFixed(2) : '-'}`
    );
    if (psa.median != null) psaSum += psa.median;
    if (ace.median != null) aceSum += ace.median;
  }
  console.log('-----------------------------------------');
  console.log(`Sum of PSA 10 medians (estimated lot value): £${psaSum.toFixed(2)}`);
  console.log(`Sum of ACE 10 medians (estimated lot value): £${aceSum.toFixed(2)}`);
  console.log('Wrote uk_psa10_comps.json and uk_psa10_comps.md');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
