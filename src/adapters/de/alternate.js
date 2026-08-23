import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { parsePriceEUR, visibleText, stockFromText, offerFromJsonLd } from '../../core/parse';

/**
 * Alternate.de — measured 22.8.2026: plain GET, 200, 172 KB server-rendered.
 * Prices carry the German shorthand "429,-" as often as "429,00", which is
 * exactly the case parsePriceEUR was written to survive.
 */
export class AlternateScraper extends StoreScraper {
  parse(html) {
    const ld = offerFromJsonLd(html);
    if (ld && ld.price !== null) {
      return { status: ld.availability || Stock.UNKNOWN, price: ld.price, note: null };
    }
    const text = visibleText(html);
    const m = html.match(/data-price=["']([\d.,]+)["']/i)
           || text.match(/([\d.]+,(?:\d{2}|-))\s*€/)
           || text.match(/€\s*([\d.]+,(?:\d{2}|-))/);
    const price = m ? parsePriceEUR(m[1]) : null;
    let status = stockFromText(text);
    // Alternate says "Lieferung: 1-3 Werktage" rather than "auf Lager" on some
    // listings, and a delivery estimate is a stock statement.
    if (!status && /lieferung:\s*\d+/i.test(text)) status = Stock.IN_STOCK;
    return { status: status || Stock.UNKNOWN, price, note: null };
  }
}
