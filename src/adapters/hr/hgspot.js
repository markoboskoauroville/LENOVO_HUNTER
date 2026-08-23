import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { parsePriceEUR, stockFromText, visibleText, offerFromJsonLd } from '../../core/parse';

/**
 * HGSPOT — measured 22.8.2026: plain GET, 200, server-rendered, JSON-LD present
 * at WebSite level on search pages and at Product level on product pages.
 */
export class HgspotScraper extends StoreScraper {
  parse(html) {
    const ld = offerFromJsonLd(html);
    if (ld && (ld.price !== null || ld.availability)) {
      return {
        status: ld.availability || Stock.UNKNOWN,
        price: ld.price,
        note: ld.availability ? null : 'JSON-LD had a price but no availability',
      };
    }
    // HGSPOT writes the price into a data attribute before it writes it into
    // the visible span, and the attribute survives their template changes.
    const attr = html.match(/data-product-price=["']([\d.,]+)["']/i)
              || html.match(/class="[^"]*product-price[^"]*"[^>]*>\s*([^<]{3,20})</i);
    const price = attr ? parsePriceEUR(attr[1]) : null;
    const status = stockFromText(visibleText(html));
    if (!status && price === null) return super.parse(html);
    return { status: status || Stock.UNKNOWN, price, note: null };
  }
}
