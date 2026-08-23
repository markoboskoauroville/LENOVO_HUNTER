// The one vocabulary every adapter speaks. Nothing else is a valid result.
export const Stock = {
  IN_STOCK:     'IN_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PREORDER:     'PREORDER',
  BLOCKED:      'BLOCKED',   // CAPTCHA, 403, 429, 503 — the shop said no, not the code
  ERROR:        'ERROR',     // our fault or the network's
  UNKNOWN:      'UNKNOWN',   // page fetched, nothing recognisable in it
  PENDING:      'PENDING',   // not asked yet this sweep
};

// How a result was arrived at. Shown on the card, because "a fetch guessed" and
// "a browser rendered it and a vision model read it" are not the same claim and
// must never look the same on screen.
export const Tier = {
  FETCH:   'FETCH',    // plain HTTP, JSON-LD or markup
  BROWSER: 'BROWSER',  // rendered in a real browser, DOM read after scripts ran
  VISION:  'VISION',   // rendered, photographed, and judged by a vision model
};

export const Region = {
  HR: 'HR',
  DE: 'DE',
  EU: 'EU',
};

export const REGION_LABEL = {
  HR: '🇭🇷  Hrvatska',
  DE: '🇩🇪  Njemačka',
  EU: '🇪🇺  Šira EU',
};

// The order regions are hunted and shown in "Region priority" mode.
export const REGION_ORDER = [Region.HR, Region.DE, Region.EU];

/**
 * @typedef {Object} StoreResult
 * @property {string}  id
 * @property {string}  store
 * @property {string}  region
 * @property {string}  status      one of Stock
 * @property {number|null} price   EUR, numeric, null when unknown
 * @property {string}  url         where BUY NOW goes
 * @property {string|null} note    one short human line: why blocked, what was odd
 * @property {number}  at          epoch ms of this result
 * @property {number}  ms          how long the request took
 * @property {boolean} aggregator  true for Nabava / Geizhals — they quote other shops
 */
