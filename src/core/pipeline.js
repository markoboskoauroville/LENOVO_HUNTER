import { Stock, Tier } from './types';
import { Verdict, verifyScreenshot, bestVerdict } from './groq/verify';
import { offerFromJsonLd, parsePriceEUR, stockFromText, visibleText } from './parse';

// ---------------------------------------------------------------------------
// Three tiers, and a result carries the tier it earned.
// ---------------------------------------------------------------------------
//
//   1  FETCH    cheap, instant, and enough for a shop that publishes JSON-LD.
//   2  BROWSER  the page rendered by a real browser, read after its scripts ran.
//   3  VISION   the rendered page photographed and judged by a model that can
//               tell a tablet from a PC tower case.
//
// The escalation is not "try harder until something says yes". Each tier can
// only ever REDUCE a claim or leave it alone — never promote a guess into a
// certainty. Vision is the only thing allowed to say IN STOCK, because it is
// the only thing that has ever looked at the product.

export const Confidence = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

/**
 * Does the fetch result settle it on its own? Only for a pinned product page
 * that published a proper schema.org offer — the one case where the shop has
 * told us, in machine-readable form, what it is selling and whether it has it.
 */
export function fetchIsSufficient(scraper, html) {
  if (!scraper.productUrl) return null;             // a search page never settles it
  const ld = offerFromJsonLd(html);
  if (!ld || ld.price === null || !ld.availability) return null;
  return { price: ld.price, status: ld.availability, title: ld.name || null };
}

/** Read a rendered page's DOM the same way, but after the scripts have run. */
export function readRenderedPage(data, product) {
  if (!data) return null;
  const out = { price: null, status: null, title: data.title || null, candidates: [] };

  const fakeHtml = (data.jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('');
  const ld = offerFromJsonLd(fakeHtml);
  if (ld) { out.price = ld.price; out.status = ld.availability; out.title = ld.name || out.title; }

  if (!out.status && data.text) out.status = stockFromText(data.text);
  if (out.price === null && data.text) {
    const m = data.text.match(/(\d[\d .]{1,7}[.,]\d{2})\s*(?:€|EUR)|(?:€|EUR)\s*(\d[\d .]{1,7}[.,]\d{2})/);
    if (m) out.price = parsePriceEUR(m[1] || m[2]);
  }

  // Links whose text mentions the model are the pages worth pinning. This is
  // how the app answers "where IS it" rather than only "is it here".
  const re = new RegExp(product.hints.map(esc).join('|'), 'i');
  out.candidates = (data.links || [])
    .filter((l) => re.test(l.text + ' ' + l.href))
    .filter((l) => !/\/(login|register|cart|wishlist|compare)\b/i.test(l.href))
    .slice(0, 8);

  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn a vision verdict into the app's own vocabulary.
 *
 * Only `match` can become IN_STOCK, and only with a price. Everything else
 * lands somewhere honest and quiet. This mapping is the gate between a
 * screenshot and the phone shouting at three in the morning.
 */
export function verdictToStock(v) {
  if (!v) return { status: Stock.UNKNOWN, price: null, note: 'no verdict' };
  switch (v.verdict) {
    case Verdict.MATCH:
      if (v.in_stock === true && v.price_eur !== null) {
        return { status: Stock.IN_STOCK, price: v.price_eur, note: v.stock_text || v.why };
      }
      if (v.in_stock === true && v.price_eur === null) {
        return { status: Stock.UNKNOWN, price: null, note: 'listed as available but no readable price' };
      }
      if (v.in_stock === false) {
        return { status: Stock.OUT_OF_STOCK, price: v.price_eur, note: v.stock_text || 'listed, not available' };
      }
      return { status: Stock.UNKNOWN, price: v.price_eur, note: 'found, availability not readable' };
    case Verdict.WRONG_VARIANT:
      return { status: Stock.OUT_OF_STOCK, price: null, note: `different variant: ${v.product_title || v.why}` };
    case Verdict.ACCESSORY:
      return { status: Stock.OUT_OF_STOCK, price: null, note: `only an accessory: ${v.product_title || ''}`.trim() };
    case Verdict.WRONG_PRODUCT:
      return { status: Stock.OUT_OF_STOCK, price: null, note: `not this product: ${v.product_title || v.why}` };
    case Verdict.NOT_FOUND:
      return { status: Stock.OUT_OF_STOCK, price: null, note: 'not listed at this shop' };
    case Verdict.BLOCKED_PAGE:
      return { status: Stock.BLOCKED, price: null, note: v.why || 'a bot check was on the page' };
    default:
      return { status: Stock.UNKNOWN, price: null, note: v.why || 'could not be read confidently' };
  }
}

/**
 * The whole escalation for one shop.
 *
 * @param scraper   a StoreScraper
 * @param product   from config/products
 * @param browser   the BrowserAgent handle, or null when there is none
 * @param opts      { visionEnabled, onStage }
 */
export async function huntStore(scraper, product, browser, opts = {}) {
  const { visionEnabled = true, onStage = () => {} } = opts;
  const started = Date.now();
  const base = {
    id: scraper.id, store: scraper.name, region: scraper.region,
    url: scraper.buyUrl, aggregator: scraper.aggregator, at: started,
    tier: Tier.FETCH, confidence: Confidence.LOW, candidates: [], verdict: null,
  };

  /* ---- tier 1: the cheap question ------------------------------------- */
  onStage('fetch');
  const fetched = await scraper.run();

  if (fetched.status === Stock.IN_STOCK && scraper.productUrl) {
    // A pinned product page with a proper offer. The shop said it in machine
    // readable form; there is nothing for a camera to add.
    return { ...base, ...fetched, tier: Tier.FETCH, confidence: Confidence.HIGH, ms: Date.now() - started };
  }

  const canRender = !!browser;
  if (!canRender) {
    return { ...base, ...fetched, tier: Tier.FETCH, ms: Date.now() - started,
             note: fetched.note ? `${fetched.note} · no browser` : 'no browser' };
  }

  /* ---- tier 2: render it properly -------------------------------------- */
  onStage('render');
  const page = await browser.visit(scraper.targetUrl(), { hints: product.hints });

  if (!page.ok) {
    return { ...base, status: Stock.ERROR, price: null, tier: Tier.BROWSER,
             ms: Date.now() - started, note: page.note || 'the browser could not read the page' };
  }
  if (page.challenged) {
    return { ...base, status: Stock.BLOCKED, price: null, tier: Tier.BROWSER,
             ms: Date.now() - started,
             note: 'bot challenge in a real browser too — open it yourself' };
  }

  const read = readRenderedPage(page.data, product);
  const candidates = read ? read.candidates : [];

  /* ---- tier 3: look at it ---------------------------------------------- */
  if (!visionEnabled || !page.shots.length) {
    // Without vision this is exactly v1's problem again, so it is never allowed
    // to claim stock — it reports what it saw and says why it is not trusted.
    const note = !visionEnabled
      ? 'rendered, but vision is off — add a Groq key to get a verdict'
      : 'rendered, but no screenshot could be taken';
    return { ...base, status: read && read.status === Stock.IN_STOCK ? Stock.UNKNOWN : (read && read.status) || Stock.UNKNOWN,
             price: read ? read.price : null, tier: Tier.BROWSER, candidates,
             ms: Date.now() - started, note };
  }

  onStage('vision');
  const verdicts = [];
  for (let i = 0; i < page.shots.length; i++) {
    const r = await verifyScreenshot(page.shots[i], product,
      i === 0 ? 'Decide. JSON only.' : 'Same page, scrolled further down. Decide. JSON only.');
    if (r.ok) verdicts.push(r.verdict);
    else if (r.reason === 'NO_KEYS' || r.reason === 'ALL_DEAD' || r.reason === 'ALL_THROTTLED') {
      return { ...base, status: (read && read.status) || Stock.UNKNOWN, price: read ? read.price : null,
               tier: Tier.BROWSER, candidates, ms: Date.now() - started,
               note: groqReason(r.reason) };
    }
    // A match found on the first screen makes the rest of the page irrelevant.
    if (verdicts.length && verdicts[verdicts.length - 1].verdict === Verdict.MATCH) break;
  }

  const best = bestVerdict(verdicts);
  const mapped = verdictToStock(best);
  return {
    ...base,
    ...mapped,
    tier: Tier.VISION,
    verdict: best,
    candidates,
    confidence: best && best.verdict === Verdict.MATCH ? Confidence.HIGH
              : best && best.verdict === Verdict.UNCLEAR ? Confidence.LOW : Confidence.MEDIUM,
    shotsTaken: page.shots.length,
    ms: Date.now() - started,
  };
}

const groqReason = (r) =>
  r === 'NO_KEYS' ? 'no Groq key — import one in settings to switch vision on'
  : r === 'ALL_DEAD' ? 'every Groq key came back 401 — they need replacing'
  : 'every Groq key is throttled right now, resting them';
