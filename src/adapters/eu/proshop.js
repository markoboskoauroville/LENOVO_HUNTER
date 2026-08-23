import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { parsePriceEUR, visibleText, stockFromText, offerFromJsonLd } from '../../core/parse';

/**
 * Proshop — measured 22.8.2026: 200, but Cloudflare sits in front of it and the
 * response carried Cloudflare markers. It answered today. It may serve a
 * challenge tomorrow, at which point http.js tags it BLOCKED and the sweep
 * carries on. That is not a bug being tolerated, it is the designed behaviour.
 *
 * Proshop quotes prices ex-VAT beside inc-VAT on the same page. The inc-VAT one
 * is the one a person pays, so it is the one taken — and taking the wrong one
 * silently is how a comparison engine confidently reports a deal that is not.
 */
export class ProshopScraper extends StoreScraper {
  parse(html) {
    const ld = offerFromJsonLd(html);
    if (ld && ld.price !== null) {
      return { status: ld.availability || Stock.UNKNOWN, price: ld.price, note: 'incl. VAT per JSON-LD' };
    }
    const inc = html.match(/site-currency-attention[^>]*>\s*([\d.,]+)/i)
             || html.match(/class="[^"]*price-inc[^"]*"[^>]*>\s*([\d.,]+)/i);
    const price = inc ? parsePriceEUR(inc[1]) : null;
    const status = stockFromText(visibleText(html));
    return {
      status: status || Stock.UNKNOWN,
      price,
      note: price !== null ? 'incl. VAT' : null,
    };
  }
}
