import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { parsePriceEUR, visibleText } from '../../core/parse';

/**
 * Nabava.net — an aggregator. It does not sell anything; it quotes the shops
 * that do. So its number is the LOWEST offer among several, and treating it as
 * one shop's price would let it win BEST DEAL against the shop it is quoting.
 *
 * It is shown because it finds shops this app does not know about. It is
 * flagged `aggregator` so the ranking excludes it. See core/hunt.js.
 */
export class NabavaScraper extends StoreScraper {
  parse(html) {
    const text = visibleText(html);
    // Nabava prints "od 399,00 €" — "from", which is the whole point of it.
    const m = text.match(/od\s*([\d.\s]+,\d{2})\s*€/i) || text.match(/([\d.\s]+,\d{2})\s*€/);
    const price = m ? parsePriceEUR(m[1]) : null;
    const offers = text.match(/(\d+)\s*(?:ponuda|trgovin)/i);
    if (price === null) {
      return { status: Stock.OUT_OF_STOCK, price: null, note: 'no offers listed' };
    }
    return {
      status: Stock.IN_STOCK,
      price,
      note: offers ? `cheapest of ${offers[1]} offers` : 'cheapest listed offer',
    };
  }
}
