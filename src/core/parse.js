import { parse as parseHtml } from 'node-html-parser';
import { Stock } from './types';

// ---------------------------------------------------------------------------
// Extraction primitives. Pure functions — no network, no React. Everything in
// this file is covered by scripts/test-parse.mjs (TEST 1).
// ---------------------------------------------------------------------------
//
// The order of preference is deliberate and it is the whole reason this app
// is not a pile of brittle CSS selectors:
//
//   1. JSON-LD  (schema.org/Product + Offer)   — a contract the shop publishes
//                                                for Google and therefore keeps
//   2. microdata / meta tags                   — same idea, older syntax
//   3. DOM selectors                           — per shop, breaks on redesign
//   4. regex over raw HTML                     — last resort, but it survives
//                                                markup churn that kills 3
//
// A shop redesign breaks 3 and leaves 1 and 4 standing. That is the point.

/* ------------------------------------------------------------------ prices */

/**
 * Parse a European price string to a number of euros.
 * Handles:  "1.299,00 €"  "€399.00"  "399,00 EUR"  "1 299,99"  "429,-"
 * Returns null rather than guessing when the string is not a price.
 */
export function parsePriceEUR(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? round2(raw) : null;

  let s = String(raw);
  // Strip currency words and symbols, keep digits and separators.
  s = s.replace(/EUR|eur|€|&euro;|&#8364;/g, ' ');
  s = s.replace(/\u00A0|\u202F|\u2009/g, ' ');           // nbsp / thin spaces
  const m = s.match(/-?\d[\d .,]*\d|-?\d/);
  if (!m) return null;
  let n = m[0].trim();

  // "429,-" — the German shorthand for whole euros.
  n = n.replace(/,-$/, '');

  const lastComma = n.lastIndexOf(',');
  const lastDot = n.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal separator.
    if (lastComma > lastDot) n = n.replace(/\./g, '').replace(',', '.');
    else n = n.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only a comma. Two digits after it is a decimal; three is a thousands sep.
    const after = n.length - lastComma - 1;
    n = after === 3 ? n.replace(/,/g, '') : n.replace(',', '.');
  } else if (lastDot > -1) {
    const after = n.length - lastDot - 1;
    if (after === 3) n = n.replace(/\./g, '');            // 1.299 -> 1299
  }
  n = n.replace(/\s/g, '');

  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  // A tablet is not €3 and it is not €90,000. A price outside this band is a
  // parse that grabbed a review count or a postcode.
  if (v < 50 || v > 9000) return null;
  return round2(v);
}

const round2 = (v) => Math.round(v * 100) / 100;

export function formatEUR(v) {
  if (v === null || v === undefined) return '—';
  return '€' + v.toFixed(2).replace('.', ',');
}

/* ----------------------------------------------------------------- JSON-LD */

/** Pull every JSON-LD block out of a page, flattened through @graph. */
export function extractJsonLd(html) {
  const out = [];
  if (!html) return out;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim().replace(/^\/\*[\s\S]*?\*\//, '');
    try {
      const parsed = JSON.parse(raw);
      pushFlat(parsed, out);
    } catch {
      // Malformed JSON-LD is common. It is not a failure of the sweep.
    }
  }
  return out;
}

function pushFlat(node, out) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach((n) => pushFlat(n, out)); return; }
  if (typeof node !== 'object') return;
  if (Array.isArray(node['@graph'])) node['@graph'].forEach((n) => pushFlat(n, out));
  out.push(node);
}

const typeOf = (o) => {
  const t = o && o['@type'];
  if (!t) return '';
  return Array.isArray(t) ? t.join(',') : String(t);
};

/**
 * Find the Product offer in a page's JSON-LD.
 * @returns {{price:number|null, availability:string|null, name:string|null}|null}
 */
export function offerFromJsonLd(html) {
  const nodes = extractJsonLd(html);
  const products = nodes.filter((n) => /Product|IndividualProduct/i.test(typeOf(n)));
  const candidates = products.length ? products : nodes;

  for (const p of candidates) {
    let offers = p.offers || p.Offers;
    if (!offers) continue;
    if (!Array.isArray(offers)) offers = [offers];

    // AggregateOffer quotes a range; lowPrice is the one that matters.
    for (const o of offers) {
      const price = parsePriceEUR(
        o.price ?? o.lowPrice ?? o.highPrice ?? (o.priceSpecification && o.priceSpecification.price)
      );
      const availability = normaliseSchemaAvailability(o.availability || o.availabilityStarts);
      if (price !== null || availability) {
        return { price, availability, name: p.name || null };
      }
    }
  }
  return null;
}

export function normaliseSchemaAvailability(a) {
  if (!a) return null;
  const s = String(a).toLowerCase();
  if (s.includes('instock') || s.includes('limitedavailability') || s.includes('onlineonly')) return Stock.IN_STOCK;
  if (s.includes('preorder') || s.includes('presale')) return Stock.PREORDER;
  if (s.includes('outofstock') || s.includes('soldout') || s.includes('discontinued') || s.includes('backorder')) return Stock.OUT_OF_STOCK;
  return null;
}

/* --------------------------------------------------- meta / microdata tags */

export function priceFromMeta(html) {
  if (!html) return null;
  const pats = [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<[^>]+itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /"price"\s*:\s*"?([0-9][0-9.,]*)"?/i,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) { const v = parsePriceEUR(m[1]); if (v !== null) return v; }
  }
  return null;
}

export function availabilityFromMeta(html) {
  if (!html) return null;
  const m = html.match(/(?:itemprop|property)=["'](?:availability|product:availability)["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<link[^>]+itemprop=["']availability["'][^>]+href=["']([^"']+)["']/i)
        || html.match(/"availability"\s*:\s*"([^"]+)"/i);
  return m ? normaliseSchemaAvailability(m[1]) : null;
}

/* ----------------------------------------------------------- text phrasing */
//
// Last resort, and locale-aware. Croatian and German shops phrase this very
// differently and a single English word list finds nothing in either.

const PHRASES = {
  [Stock.IN_STOCK]: [
    // hr
    'na zalihi', 'dostupno', 'raspoloživo', 'ima na stanju', 'na stanju',
    'dodaj u košaricu', 'kupi odmah', 'isporuka 1-2 dana', 'odmah dostupno',
    // de
    'auf lager', 'sofort lieferbar', 'sofort ab lager', 'in den warenkorb',
    'lieferbar', 'versandfertig', 'verfügbar',
    // en / eu
    'in stock', 'add to cart', 'add to basket', 'buy now',
  ],
  [Stock.PREORDER]: [
    'predbilježba', 'prednarudžba', 'uskoro dostupno',
    'vorbestellen', 'vorbestellung', 'vorverkauf',
    'pre-order', 'preorder', 'coming soon',
  ],
  [Stock.OUT_OF_STOCK]: [
    'nema na zalihi', 'nije dostupno', 'nedostupno', 'rasprodano', 'trenutno nedostupno',
    'obavijesti me', 'artikl nije dostupan',
    'nicht verfügbar', 'nicht auf lager', 'ausverkauft', 'derzeit nicht lieferbar',
    'nicht lieferbar', 'benachrichtigen',
    'out of stock', 'sold out', 'currently unavailable', 'notify me',
  ],
};

/**
 * Decide stock from visible text. Negatives are tested first on purpose:
 * "Nema na zalihi" contains "na zalihi", and a naive positive-first scan calls
 * every sold-out page in Croatia in stock. This exact collision is why the
 * order of these three checks is not an implementation detail.
 */
export function stockFromText(text) {
  if (!text) return null;
  const t = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  for (const p of PHRASES[Stock.OUT_OF_STOCK]) if (t.includes(p)) return Stock.OUT_OF_STOCK;
  for (const p of PHRASES[Stock.PREORDER])     if (t.includes(p)) return Stock.PREORDER;
  for (const p of PHRASES[Stock.IN_STOCK])     if (t.includes(p)) return Stock.IN_STOCK;
  return null;
}

/* ---------------------------------------------------------------- DOM help */

/** Visible text of a page, scripts and styles removed. */
export function visibleText(html, maxChars = 200000) {
  if (!html) return '';
  try {
    const root = parseHtml(html.slice(0, maxChars), {
      blockTextElements: { script: false, noscript: false, style: false },
    });
    return root.text.replace(/\s+/g, ' ').trim();
  } catch {
    return html.slice(0, maxChars).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** First matching selector's text, or null. */
export function pick(html, selectors) {
  try {
    const root = parseHtml(html);
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && el.text && el.text.trim()) return el.text.trim();
    }
  } catch { /* fall through */ }
  return null;
}

/** Does the page contain the model we are actually hunting? */
export function mentionsModel(html, patterns) {
  if (!html) return false;
  const t = html.toLowerCase();
  return patterns.some((p) => t.includes(p.toLowerCase()));
}
