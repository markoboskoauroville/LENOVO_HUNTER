import { StoreScraper } from '../../core/StoreScraper';
import { Stock } from '../../core/types';
import { offerFromJsonLd, parsePriceEUR, visibleText, stockFromText } from '../../core/parse';

/**
 * Links.hr — nopCommerce.
 *
 * Measured 22.8.2026: the search URL returns 200 and 558 KB of HTML containing
 * the page furniture and no products — the result grid is fetched by JavaScript
 * after load. So a search sweep here is not slow or blocked, it is EMPTY, which
 * is the failure that looks most like "the shop has none in stock".
 *
 * Product pages are server-rendered with proper microdata. Pin one.
 */
export class LinksScraper extends StoreScraper {
  parse(html) {
    const isSearchShell = /class="[^"]*search-results/i.test(html)
      && !/itemprop=["']offers["']/i.test(html);
    if (isSearchShell && !this.productUrl) {
      return {
        status: Stock.UNKNOWN,
        price: null,
        note: 'search results are loaded by JavaScript — pin the product URL',
      };
    }
    const ld = offerFromJsonLd(html);
    if (ld && ld.price !== null) {
      return { status: ld.availability || stockFromText(visibleText(html)) || Stock.UNKNOWN, price: ld.price, note: null };
    }
    const m = html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i);
    const price = m ? parsePriceEUR(m[1]) : null;
    const status = stockFromText(visibleText(html));
    return { status: status || Stock.UNKNOWN, price, note: null };
  }
}
