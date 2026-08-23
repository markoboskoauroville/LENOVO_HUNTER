import { StoreScraper, ChallengedStore } from '../core/StoreScraper';
import { TARGETS } from '../config/targets';
import { PRODUCT } from '../config/product';
import { HgspotScraper } from './hr/hgspot';
import { LinksScraper } from './hr/links';
import { NabavaScraper } from './hr/nabava';
import { GeizhalsScraper } from './de/geizhals';
import { AlternateScraper } from './de/alternate';
import { ProshopScraper } from './eu/proshop';

// Adapters that need more than the default cascade. Everything not named here
// gets the base class, which is the point of the base class.
const SPECIAL = {
  hgspot: HgspotScraper,
  links: LinksScraper,
  nabava: NabavaScraper,
  geizhals: GeizhalsScraper,
  alternate: AlternateScraper,
  proshop: ProshopScraper,
};

/**
 * Build the live adapter list.
 * @param {Object} overrides  { [storeId]: { productUrl } } — pinned by Marko,
 *                            persisted, and always beating the shipped default.
 */
export function buildScrapers(overrides = {}) {
  return TARGETS.map((t) => {
    const cfg = { ...t, modelHints: PRODUCT.hints, ...(overrides[t.id] || {}) };
    if (cfg.productUrl) cfg.buyUrl = cfg.productUrl;
    // A pinned product URL beats a known challenge: if he found the page in a
    // browser, it is worth one honest attempt before giving up on the shop.
    if (t.kind === 'challenged' && !cfg.productUrl) return new ChallengedStore(cfg);
    if (t.kind === 'challenged') return new ChallengedStore({ ...cfg, probe: true });
    const Cls = SPECIAL[t.id] || StoreScraper;
    return new Cls(cfg);
  });
}

export { StoreScraper, ChallengedStore };
