import { StoreScraper, ChallengedStore } from '../core/StoreScraper';
import { HgspotScraper } from './hr/hgspot';
import { LinksScraper } from './hr/links';
import { NabavaScraper } from './hr/nabava';
import { GeizhalsScraper } from './de/geizhals';
import { AlternateScraper } from './de/alternate';
import { ProshopScraper } from './eu/proshop';

// Adapters that need more than the default cascade. Everything not named here
// gets the base class, which is the point of having a base class.
const SPECIAL = {
  hgspot: HgspotScraper,
  links: LinksScraper,
  nabava: NabavaScraper,
  geizhals: GeizhalsScraper,
  alternate: AlternateScraper,
  proshop: ProshopScraper,
};

/**
 * Build the adapters for ONE product. The target list belongs to the product,
 * not to the app — the two tablets are sold in different places, and pretending
 * otherwise is how you end up asking a Croatian PC chain for a Chinese tablet
 * fourteen times a day.
 *
 * @param product    from config/products
 * @param overrides  { [storeId]: { productUrl } } — pinned, persisted, and
 *                   always beating the shipped default
 */
export function buildScrapers(product, overrides = {}) {
  const ov = overrides[product.id] || {};
  return product.targets.map((t) => {
    const cfg = { ...t, modelHints: product.hints, ...(ov[t.id] || {}) };
    if (cfg.productUrl) cfg.buyUrl = cfg.productUrl;
    else cfg.buyUrl = t.searchUrl;

    // A challenged shop with a pinned URL still gets one honest attempt: if he
    // found the page in a browser, it is worth asking once before giving up.
    if (t.kind === 'challenged') return new ChallengedStore({ ...cfg, probe: !!cfg.productUrl });
    const Cls = SPECIAL[t.id] || StoreScraper;
    return new Cls(cfg);
  });
}

export { StoreScraper, ChallengedStore };
