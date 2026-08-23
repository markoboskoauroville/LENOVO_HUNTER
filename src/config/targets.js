import { Region } from '../core/types';

// ---------------------------------------------------------------------------
// The thirteen. Measured against the live web on 22.8.2026 — see HANDOFF.md
// for exactly what each one answered.
// ---------------------------------------------------------------------------
//
// productUrl is null until you have pinned one by hand. PIN THEM. A direct
// product page is the difference between this app working and this app
// guessing: search pages on half these shops are rendered by JavaScript, so a
// plain GET returns a shell with no products in it at all, whatever the price
// on the screen says when you visit in a browser.
//
// To pin: open the shop, find the Y700 Gen 3 12/256, copy the URL, paste it in
// below (or long-press the card in the app and paste it there — it persists).

export const TARGETS = [
  /* ------------------------------------------------ 🇭🇷 Priority 1 — Croatia */
  {
    id: 'hgspot', name: 'HGSPOT', region: Region.HR, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.hgspot.hr/pretraga?q=Legion%20Tab%20Y700',
    selectors: {
      price: ['.product-price', '.price-value', '[data-price]', '.cijena'],
      stock: ['.stock-status', '.availability', '.product-availability'],
    },
    // measured: 200 OK, plain GET, server-rendered. The friendliest of the six.
  },
  {
    id: 'links', name: 'Links.hr', region: Region.HR, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.links.hr/hr/search?q=Legion+Tab+Y700',
    selectors: {
      price: ['.product-price span', '.prices .actual-price', '.price'],
      stock: ['.stock', '.availability', '.add-to-cart-panel'],
    },
    // measured: 200 OK. nopCommerce. Search results are client-rendered, so the
    // search URL finds nothing — this one especially wants a pinned productUrl.
  },
  {
    id: 'sancta', name: 'Sancta Domenica', region: Region.HR, kind: 'challenged',
    productUrl: null,
    searchUrl: 'https://www.sancta-domenica.hr/',
    knownHard: 'Cloudflare challenge (measured 22.8.2026) · redirects to bigbang.hr',
  },
  {
    id: 'mikronis', name: 'Mikronis', region: Region.HR, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.mikronis.hr/search?q=Legion+Tab+Y700',
    selectors: { price: ['.price', '.product-price'], stock: ['.availability', '.stock'] },
    // measured: my first guessed search path returned 404. Confirm the real one.
  },
  {
    id: 'instar', name: 'Instar Informatika', region: Region.HR, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.instar-informatika.hr/pretraga/?q=Legion+Tab+Y700',
    selectors: { price: ['.price', '.cijena'], stock: ['.stock', '.dostupnost'] },
    // measured: 503 after 15s. Either slow or refusing. Retries, then BLOCKED.
  },
  {
    id: 'nabava', name: 'Nabava.net', region: Region.HR, kind: 'generic', aggregator: true,
    productUrl: null,
    searchUrl: 'https://www.nabava.net/trazilica?trazi=legion+tab+y700',
    selectors: { price: ['.price', '.product-price-value'], stock: ['.availability'] },
    // An aggregator: its price is the cheapest of several shops, so it is shown
    // but never allowed to win BEST DEAL. See hunt.js.
  },

  /* ----------------------------------------------- 🇩🇪 Priority 2 — Germany */
  {
    id: 'amazonde', name: 'Amazon.de', region: Region.DE, kind: 'challenged',
    productUrl: null,
    searchUrl: 'https://www.amazon.de/s?k=Lenovo+Legion+Tab+Y700+Gen+3',
    knownHard: 'Akamai bot manager, proof-of-work interstitial (measured 22.8.2026) · use Keepa',
  },
  {
    id: 'cyberport', name: 'Cyberport', region: Region.DE, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.cyberport.de/suche/?q=Legion%20Tab%20Y700',
    selectors: { price: ['.price', '[data-qa="price"]'], stock: ['.availability', '.delivery-status'] },
    // not reachable from the machine this was written on — untested, see HANDOFF
  },
  {
    id: 'alternate', name: 'Alternate.de', region: Region.DE, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.alternate.de/listing.xhtml?q=Legion+Tab+Y700',
    selectors: { price: ['.price', 'span[data-price]'], stock: ['.stockStatus', '.delivery'] },
    // measured: 200 OK, plain GET.
  },
  {
    id: 'computeruniverse', name: 'Computeruniverse', region: Region.DE, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.computeruniverse.net/de/search?q=legion%20tab%20y700',
    selectors: { price: ['.price', '.product-price'], stock: ['.availability'] },
    // not reachable from the machine this was written on — untested
  },
  {
    id: 'geizhals', name: 'Geizhals.de', region: Region.DE, kind: 'generic', aggregator: true,
    productUrl: null,
    searchUrl: 'https://geizhals.de/?fs=legion+tab+y700&hloc=de',
    selectors: { price: ['.gh_price', '.price', 'span.gh_price'], stock: ['.availability'] },
    // measured: 200 OK, 50 KB of server-rendered HTML. The most useful of all
    // thirteen, because when it has the product it has every German shop's price.
  },

  /* ------------------------------------------- 🇪🇺 Priority 3 — Broader EU */
  {
    id: 'amazonit', name: 'Amazon.it', region: Region.EU, kind: 'challenged',
    productUrl: null,
    searchUrl: 'https://www.amazon.it/s?k=Lenovo+Legion+Tab+Y700',
    knownHard: 'same bot manager as Amazon.de',
  },
  {
    id: 'amazones', name: 'Amazon.es', region: Region.EU, kind: 'challenged',
    productUrl: null,
    searchUrl: 'https://www.amazon.es/s?k=Lenovo+Legion+Tab+Y700',
    knownHard: 'same bot manager as Amazon.de',
  },
  {
    id: 'proshop', name: 'Proshop', region: Region.EU, kind: 'generic',
    productUrl: null,
    searchUrl: 'https://www.proshop.de/?s=legion+tab+y700',
    selectors: { price: ['.site-currency-attention', '.price'], stock: ['.stock-status', '.delivery'] },
    // measured: 200 OK but Cloudflare is in front of it. Works today, may not
    // tomorrow — which is why BLOCKED is a normal state and not an error.
  },
];
