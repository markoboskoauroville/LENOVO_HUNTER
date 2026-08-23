import { Stock, REGION_ORDER, Tier } from './types';
import { buildScrapers } from '../adapters';
import { huntStore, Confidence } from './pipeline';

// One page at a time in the browser, because there is one browser. The fetch
// tier is concurrent; the render tier cannot be, and that is fine — the fetch
// tier settles the shops that can be settled cheaply.
const FETCH_POOL = 5;

/**
 * Sweep every enabled shop for ONE product, reporting each result as it lands.
 */
export async function hunt({ product, overrides = {}, disabled = new Set(), browser = null,
                             visionEnabled = true, onResult, onStage } = {}) {
  const scrapers = buildScrapers(product, overrides).filter((s) => !disabled.has(s.id));
  const results = [];

  // Shops that need the browser are run in order; the rest go in a pool. The
  // split is decided by asking the cheap question first, inside huntStore.
  let cursor = 0;
  const queue = [];

  async function worker() {
    while (cursor < scrapers.length) {
      const s = scrapers[cursor++];
      const r = await huntStore(s, product, null, { visionEnabled: false, onStage: () => {} });
      if (r.tier === Tier.FETCH && r.confidence === Confidence.HIGH) {
        results.push(r);
        if (onResult) safely(onResult, r);
      } else {
        queue.push(s);                     // needs the real browser
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_POOL, scrapers.length) }, worker));

  for (const s of queue) {
    const r = await huntStore(s, product, browser, {
      visionEnabled,
      onStage: (stage) => onStage && onStage(s.id, stage),
    });
    results.push(r);
    if (onResult) safely(onResult, r);
  }

  return results;
}

const safely = (f, r) => { try { f(r); } catch { /* the UI is not allowed to break a sweep */ } };

/* ------------------------------------------------------------- the ranking */

export const isBuyable = (r) => r.status === Stock.IN_STOCK && typeof r.price === 'number';

/**
 * BEST DEAL. Aggregators are excluded: they quote the cheapest of several
 * shops, so their number is by construction lower than the shop it came from,
 * and leaving them in parks the badge permanently on a site that sells nothing.
 */
export function bestDeal(results) {
  const buyable = results.filter((r) => isBuyable(r) && !r.aggregator);
  if (!buyable.length) return null;
  return buyable.reduce((a, b) => (b.price < a.price ? b : a));
}

export const SortMode = { REGION: 'REGION', CHEAPEST: 'CHEAPEST' };

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
  return REGION_ORDER.map((region) => ({ region, rows: results.filter((r) => r.region === region) }));
}

/**
 * Which shops just crossed into stock, per product.
 *
 * Compared against that shop's PREVIOUS status for THAT product, so a shop in
 * stock all week does not re-announce itself, and a fresh install announces
 * nothing at all — there was no previous state, so nothing changed, and a
 * notification on launch would be a lie about news.
 */
export function newlyInStock(previousById, results) {
  const out = [];
  for (const r of results) {
    if (r.status !== Stock.IN_STOCK) continue;
    const prev = previousById[r.id];
    if (!prev || prev.status === Stock.PENDING) continue;
    if (prev.status !== Stock.IN_STOCK) out.push(r);
  }
  return out;
}
