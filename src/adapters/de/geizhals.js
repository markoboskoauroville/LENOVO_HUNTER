import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { parsePriceEUR, visibleText } from '../../core/parse';

/**
 * Geizhals.de — aggregator, and the single most valuable target of the thirteen.
 *
 * Measured 22.8.2026: plain GET, 200, 278 KB of server-rendered HTML with the
 * listing in it. No JSON-LD Product block, so the price comes from their own
 * markup (`gh_price`) with a currency regex behind it.
 *
 * Like Nabava it quotes other shops, so it is excluded from BEST DEAL — but its
 * number is the one worth watching, because when Geizhals shows €N somebody in
 * Germany is selling at €N and the app has just told you where to look.
 */
export class GeizhalsScraper extends StoreScraper {
  parse(html) {
    // Their listing prices sit in spans marked gh_price; the first is the lowest
    // because the default sort is by price.
    const prices = [];
    const re = /gh_price[^>]*>\s*(?:€\s*)?([\d.]+,\d{2})/gi;
    let m;
    while ((m = re.exec(html)) !== null && prices.length < 40) {
      const v = parsePriceEUR(m[1]);
      if (v !== null) prices.push(v);
    }
    if (!prices.length) {
      const text = visibleText(html);
      const t = text.match(/ab\s*€\s*([\d.]+,\d{2})/i) || text.match(/€\s*([\d.]+,\d{2})/);
      if (t) { const v = parsePriceEUR(t[1]); if (v !== null) prices.push(v); }
    }
    if (!prices.length) {
      const none = /keine\s+(?:Produkte|Treffer)|nicht\s+gefunden/i.test(html);
      return {
        status: none ? Stock.OUT_OF_STOCK : Stock.UNKNOWN,
        price: null,
        note: none ? 'no listing for this model' : 'listing markup changed — check the selector',
      };
    }
    const low = Math.min(...prices);
    return {
      status: Stock.IN_STOCK,
      price: low,
      note: `lowest of ${prices.length} German offers`,
    };
  }
}
