import { Stock, REGION_ORDER } from './types';
import { buildScrapers } from '../adapters';

// Concurrency. Thirteen shops at once is thirteen simultaneous TLS handshakes
// on a phone radio and it makes every one of them slower. Five is measured to
// finish a full sweep well inside the time it takes to read the screen.
const POOL = 5;

/**
 * Run every enabled scraper concurrently, reporting each result the moment it
 * lands rather than at the end.
 *
 * @param {Object}   opts.overrides  pinned product URLs
 * @param {Set}      opts.disabled   store ids switched OFF (we store OFF, not ON —
 *                                   design-language.md §7 — so a shop added in a
 *                                   later build is live by default)
 * @param {Function} opts.onResult   called per store as it finishes
 */
export async function hunt({ overrides = {}, disabled = new Set(), onResult } = {}) {
  const scrapers = buildScrapers(overrides).filter((s) => !disabled.has(s.id));
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < scrapers.length) {
      const s = scrapers[cursor++];
      const r = await s.run();
      results.push(r);
      if (onResult) { try { onResult(r); } catch { /* the UI is not allowed to break a sweep */ } }
    }
  }

  await Promise.all(Array.from({ length: Math.min(POOL, scrapers.length) }, worker));
  return results;
}

/* ------------------------------------------------------------- the ranking */

export const isBuyable = (r) => r.status === Stock.IN_STOCK && typeof r.price === 'number';

/**
 * The BEST DEAL.
 *
 * Aggregators are excluded on purpose. Geizhals and Nabava quote the cheapest
 * of several shops, so their number is by construction lower than or equal to
 * the shop it came from — leaving them in means the badge lands permanently on
 * a site that does not sell anything, and the badge stops meaning "buy this".
 */
export function bestDeal(results) {
  const buyable = results.filter((r) => isBuyable(r) && !r.aggregator);
  if (!buyable.length) return null;
  return buyable.reduce((a, b) => (b.price < a.price ? b : a));
}

export const SortMode = {
  REGION: 'REGION',     // Croatia first, then Germany, then the rest
  CHEAPEST: 'CHEAPEST',  // lowest in-stock price anywhere, regardless of flag
};

// Within a region, the order is: buyable and cheap, then pre-order, then
// unknown, then out of stock, then blocked, then broken. A blocked shop sits
// below an out-of-stock one because out-of-stock is an answer and blocked is not.
const STATUS_RANK = {
  [Stock.IN_STOCK]: 0,
  [Stock.PREORDER]: 1,
  [Stock.UNKNOWN]: 2,
  [Stock.OUT_OF_STOCK]: 3,
  [Stock.BLOCKED]: 4,
  [Stock.ERROR]: 5,
  [Stock.PENDING]: 6,
};

export function sortResults(results, mode) {
  const rs = [...results];
  if (mode === SortMode.CHEAPEST) {
    return rs.sort((a, b) => {
      const ab = isBuyable(a), bb = isBuyable(b);
      if (ab && bb) return a.price - b.price;
      if (ab !== bb) return ab ? -1 : 1;
      const sr = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (sr !== 0) return sr;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
  }
  return rs.sort((a, b) => {
    const rr = REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region);
    if (rr !== 0) return rr;
    const sr = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (sr !== 0) return sr;
    return (a.price ?? Infinity) - (b.price ?? Infinity);
  });
}

export function groupByRegion(results) {
  return REGION_ORDER.map((region) => ({
    region,
    rows: results.filter((r) => r.region === region),
  }));
}

/**
 * Which stores just crossed from not-in-stock into in-stock.
 *
 * The comparison is against the PREVIOUS status of that same store, so a shop
 * that has been in stock for a week does not re-announce itself on every sweep,
 * and the first sweep of a fresh install announces nothing at all — there was
 * no previous state, so nothing "changed", and a notification on launch would
 * be a lie about news.
 */
export function newlyInStock(previousById, results) {
  const out = [];
  for (const r of results) {
    if (r.status !== Stock.IN_STOCK) continue;
    const prev = previousById[r.id];
    if (!prev || prev.status === Stock.PENDING) continue;   // nothing to compare
    if (prev.status !== Stock.IN_STOCK) out.push(r);
  }
  return out;
}
