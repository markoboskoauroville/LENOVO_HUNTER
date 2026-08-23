import { Stock } from './types';
import { getWithRetry } from './http';
import {
  offerFromJsonLd, priceFromMeta, availabilityFromMeta,
  stockFromText, visibleText, pick, parsePriceEUR, mentionsModel,
} from './parse';

/**
 * The interface every shop implements. A subclass overrides as little as it can
 * get away with — usually nothing but `selectors`, sometimes `parse`.
 *
 * The contract: run() NEVER throws and ALWAYS resolves to a StoreResult.
 * One shop is not allowed to end a sweep. That is the entire architecture.
 */
export class StoreScraper {
  constructor(cfg) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.region = cfg.region;
    this.aggregator = !!cfg.aggregator;
    this.productUrl = cfg.productUrl || null;   // pinned by hand — always preferred
    this.searchUrl = cfg.searchUrl || null;     // fallback discovery
    this.buyUrl = cfg.buyUrl || cfg.productUrl || cfg.searchUrl;
    this.selectors = cfg.selectors || { price: [], stock: [] };
    this.modelHints = cfg.modelHints || ['Y700', 'TB321', 'Legion Tab'];
    this.knownHard = cfg.knownHard || null;     // documented anti-bot, measured
  }

  /** Which URL this sweep will actually ask for. */
  targetUrl() {
    return this.productUrl || this.searchUrl;
  }

  /**
   * Override this, not run(). Given HTML, return {status, price, note}.
   * The default is the four-layer cascade and it is enough for most shops.
   */
  parse(html) {
    let note = null;

    // 1 — JSON-LD. The shop's own machine-readable answer.
    const ld = offerFromJsonLd(html);
    let price = ld ? ld.price : null;
    let status = ld ? ld.availability : null;

    // 2 — meta / microdata.
    if (price === null) price = priceFromMeta(html);
    if (!status) status = availabilityFromMeta(html);

    // 3 — per-shop DOM selectors.
    if (price === null && this.selectors.price.length) {
      const t = pick(html, this.selectors.price);
      if (t) price = parsePriceEUR(t);
    }
    if (!status && this.selectors.stock.length) {
      const t = pick(html, this.selectors.stock);
      if (t) status = stockFromText(t);
    }

    // 4 — the words a person would read.
    const text = visibleText(html);
    if (!status) status = stockFromText(text);
    if (price === null) {
      const m = text.match(/(\d[\d .]{2,7}[.,]\d{2})\s*(?:€|EUR)|(?:€|EUR)\s*(\d[\d .]{2,7}[.,]\d{2})/);
      if (m) price = parsePriceEUR(m[1] || m[2]);
    }

    // Is this page even about the thing we are hunting? A search page that
    // found nothing still returns 200 and still has prices on it — of other
    // tablets. Reporting those as a Y700 deal is worse than reporting nothing.
    if (!this.productUrl && !mentionsModel(html, this.modelHints)) {
      return { status: Stock.OUT_OF_STOCK, price: null, note: 'model not listed on this page' };
    }

    if (!status && price !== null) {
      status = Stock.UNKNOWN;
      note = 'price found, stock wording not recognised';
    }
    if (!status) return { status: Stock.UNKNOWN, price, note: note || 'nothing recognisable in the page' };
    return { status, price, note };
  }

  /**
   * The last word on every result, applied in run() so no adapter can skip it.
   *
   * MEASURED 22.8.2026, and this is why it exists. The first live probe reported
   * HGSPOT as IN_STOCK with no price, and Alternate.de as IN_STOCK at €219,90 —
   * a Y700 Gen 3 is not €219,90. Both were search pages: they mention the model
   * somewhere, they contain stock wording and a price, and neither belongs to
   * this product. The app would have spoken both aloud at full volume.
   *
   * So IN_STOCK has to be earned:
   *   - a price, always. Stock wording with no number is not a purchase.
   *   - a pinned product URL, unless the shop is an aggregator whose whole page
   *     is by definition a listing of offers.
   *
   * Downgrading to UNKNOWN is the right direction to be wrong in. A missed alert
   * costs one refresh; a false one at 03:00 costs trust in every later alert.
   */
  guard(parsed) {
    const { status, price, note } = parsed;
    if (status === Stock.IN_STOCK && price === null) {
      return { status: Stock.UNKNOWN, price, note: 'stock wording but no price — not trusted' };
    }
    if (status === Stock.IN_STOCK && !this.productUrl && !this.aggregator) {
      return {
        status: Stock.UNKNOWN, price,
        note: 'search page — pin the product URL before this counts as stock',
      };
    }
    return { status, price, note };
  }

  async run() {
    const at = Date.now();
    const url = this.targetUrl();
    const base = {
      id: this.id, store: this.name, region: this.region,
      url: this.buyUrl, aggregator: this.aggregator, at,
    };

    if (!url) {
      return { ...base, status: Stock.ERROR, price: null, ms: 0, note: 'no URL configured' };
    }

    const res = await getWithRetry(url, { referer: originOf(url) });

    if (res.blocked) {
      return {
        ...base, status: Stock.BLOCKED, price: null, ms: res.ms,
        note: this.knownHard ? `${res.note} · ${this.knownHard}` : res.note,
      };
    }
    if (!res.ok) {
      return { ...base, status: Stock.ERROR, price: null, ms: res.ms, note: res.note };
    }

    try {
      const parsed = this.guard(this.parse(res.html));
      return { ...base, ...parsed, ms: res.ms };
    } catch (e) {
      // A parser throwing is a bug here, not a fault of the shop. Say which.
      return {
        ...base, status: Stock.ERROR, price: null, ms: res.ms,
        note: `parser: ${String((e && e.message) || e).slice(0, 90)}`,
      };
    }
  }
}

function originOf(url) {
  try { return new URL(url).origin + '/'; } catch { return undefined; }
}

/**
 * A shop that is known to serve a bot challenge to any plain request.
 *
 * It reports BLOCKED without spending a request, and its card offers the one
 * thing that does work: opening the page in the real browser, where Marko is a
 * real person with real cookies and the challenge either does not appear or he
 * taps it once.
 *
 * We do not solve challenges. A shop that has installed one has said what it
 * wants, and the honest thing an app can do is show the door rather than pick
 * the lock. Set `probe: true` to make it try anyway — some of these come and go.
 */
export class ChallengedStore extends StoreScraper {
  constructor(cfg) { super(cfg); this.probe = !!cfg.probe; }
  async run() {
    if (this.probe) return super.run();
    return {
      id: this.id, store: this.name, region: this.region, url: this.buyUrl,
      aggregator: this.aggregator, at: Date.now(), ms: 0,
      status: Stock.BLOCKED, price: null,
      note: this.knownHard || 'bot protection — open in browser',
    };
  }
}
