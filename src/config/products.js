import { Region } from '../core/types';

// ---------------------------------------------------------------------------
// TWO hunts, one app. Everything below is per product — the targets are not
// shared, because the two are sold in different places.
// ---------------------------------------------------------------------------
//
// MEASURED 22–23.8.2026, and it is the finding that reshaped this list:
// **neither tablet is stocked by the Croatian retail chains.** A real Chromium
// rendered HGSPOT, Links.hr, Mikronis and Nabava with a Chrome user agent and
// waited for the JavaScript to finish. Links.hr's search matched 31 tablets and
// not one of them was a Y700. Mikronis and Nabava returned 404 for every search
// path tried. These are China-market devices that reach Europe through
// importers and Amazon marketplace sellers, so those are the shops that matter
// and the local chains are kept only as a long shot.

export const PRODUCTS = [
  {
    id: 'legion',
    short: 'Legion Y700',
    label: 'Lenovo Legion Tab Y700 Gen 3',
    model: 'TB321FU',
    spec: '8.8" · 12 GB · 256 GB',
    accent: '#F59E0B',
    // What the vision model is told to look for. Written as a person would
    // describe it to another person, because that is what it is read by.
    // The naming around this tablet is a mess and it has already produced one
    // wrong verdict. Measured 23.8.2026: Giztop's page titled "Lenovo Legion
    // Y700 2025" is the Gen 4, and the vision model caught it — wrong_variant,
    // "the page lists the Y700 Gen 4, not the requested Gen 3". Meanwhile
    // GSMArena files the Gen 3 itself under "Y700 (2025)". So the year is
    // useless as a discriminator and the CHIP is the thing that separates them.
    description:
      'Lenovo Legion Tab Y700 Gen 3, model TB321FU, also sold as "Legion Tab ' +
      'Gen 3" and listed by some sites as "Legion Y700 (2025)". An 8.8 inch ' +
      'Android gaming tablet, 1600x2560 IPS at 165Hz, Snapdragon 8 Gen 3, ' +
      '12 GB RAM, 256 GB UFS 4.0, 6550 mAh, 68W, no microSD slot, 350 g. ' +
      'IMPORTANT: the Legion Y700 Gen 4 is a DIFFERENT tablet — it has a ' +
      'Snapdragon 8 Elite, a 7600 mAh battery and a microSD slot. If the page ' +
      'shows Gen 4, or Snapdragon 8 Elite, or a microSD slot, that is ' +
      'verdict "wrong_variant", not a match.',
    hints: ['Y700', 'TB321FU', 'TB321', 'Legion Tab'],
    // Anything outside this is a different configuration, a bundle, or a parse
    // that grabbed the wrong number.
    sanePriceRange: [280, 900],
    targets: legionTargets(),
    specs: {
      screen: '8.8" IPS LCD',
      resolution: '1600 × 2560',
      refresh: '165 Hz',
      brightness: '500 nits (900 HBM)',
      chip: 'Snapdragon 8 Gen 3',
      ram: '12 GB LPDDR5X',
      storage: '256 GB UFS 4.0',
      sdCard: 'no',
      battery: '6550 mAh',
      charging: '68 W',
      speakers: '2 · JBL · Dolby Vision',
      weight: '350 g',
      os: 'Android 14 / ZUI',
      extras: 'stylus, best build of the three · Gen 4 exists, is not this',
      priceSeen: '~€550 (import)',
    },
  },
  {
    id: 'alldocube',
    short: 'iPlay 70 mini',
    label: 'ALLDOCUBE iPlay 70 mini Ultra',
    model: 'iPlay 70 mini Ultra',
    spec: '8.8" · 12 GB · 256 GB · SD 7+ Gen 3',
    accent: '#4DD6E8',
    description:
      'ALLDOCUBE iPlay 70 mini Ultra, an 8.8 inch Android tablet with a ' +
      '2560x1600 144Hz display, Snapdragon 7+ Gen 3, 12 GB RAM and 256 GB ' +
      'storage. A 20 GB RAM version of the same tablet also exists.',
    hints: ['iPlay 70 mini', 'iPlay70', 'ALLDOCUBE', 'Alldocube'],
    sanePriceRange: [180, 600],
    targets: alldocubeTargets(),
    specs: {
      screen: '8.8" IPS',
      resolution: '2560 × 1600',
      refresh: '144 Hz',
      brightness: '~500 nits',
      chip: 'Snapdragon 7+ Gen 3',
      ram: '12 GB (20 GB version exists)',
      storage: '256 GB UFS 3.1',
      sdCard: 'yes, to 2 TB',
      battery: '7300 mAh',
      charging: '20 W PD',
      speakers: '2 · DTS',
      weight: '335 g',
      os: 'Android 14',
      extras: 'no stylus, no biometrics, no cellular',
      priceSeen: '€270 – €350',
    },
  },

  {
    id: 'ultrapad',
    short: 'Ultra Pad 13',
    label: 'ALLDOCUBE Ultra Pad 13"',
    model: 'Ultra Pad (internally iPlay 70 Ultra)',
    spec: '12.95" · 24 GB · 256 GB · 15000 mAh',
    accent: '#A78BFA',
    // The naming matters and it has already caused one wrong verdict elsewhere:
    // ALLDOCUBE sell this as "Ultra Pad" but Google Play and the certification
    // documents call it "iPlay 70 Ultra". Same tablet, no difference in
    // function. A judge that does not know this calls one of the two names a
    // wrong_variant, so it is written into the description on purpose.
    description:
      'ALLDOCUBE Ultra Pad, a 13 inch (12.95") Android 15 tablet with a ' +
      '2880x1840 IPS display at 144Hz, Snapdragon 7+ Gen 3, 24 GB RAM ' +
      '(12 GB physical plus 12 GB virtual), 256 GB storage, a 15000 mAh ' +
      'battery and 8 DTS speakers. It is also sold and certified under the ' +
      'internal name "iPlay 70 Ultra" — that is the SAME tablet, not a ' +
      'different variant. Some listings bundle a magnetic keyboard and a ' +
      '4096-level stylus; that is still this tablet.',
    hints: ['Ultra Pad', 'UltraPad', 'iPlay 70 Ultra', 'ALLDOCUBE', 'Alldocube'],
    sanePriceRange: [180, 650],
    targets: ultrapadTargets(),
    specs: {
      screen: '12.95" IPS',
      resolution: '2880 × 1840 (2.8K)',
      refresh: '144 Hz',
      brightness: '700 nits',
      chip: 'Snapdragon 7+ Gen 3',
      ram: '24 GB (12 physical + 12 virtual)',
      storage: '256 GB, to 1 TB by card',
      sdCard: 'yes, to 1 TB',
      battery: '15000 mAh',
      charging: '33 W PD',
      speakers: '8 · DTS',
      weight: '~700 g (13" class)',
      os: 'Android 15 · ALLDOCUBE OS 4.1',
      extras: 'keyboard + 4096-level pen in some bundles, Widevine L1',
      priceSeen: '€270 – €330',
    },
  },
];

// The rows of the comparison table, in the order they are worth reading. Kept
// here rather than in the view, so adding a fourth tablet is one object and not
// an edit in two places.
export const SPEC_ROWS = [
  ['screen', 'Zaslon'],
  ['resolution', 'Rezolucija'],
  ['refresh', 'Osvježavanje'],
  ['brightness', 'Svjetlina'],
  ['chip', 'Procesor'],
  ['ram', 'RAM'],
  ['storage', 'Pohrana'],
  ['sdCard', 'SD kartica'],
  ['battery', 'Baterija'],
  ['charging', 'Punjenje'],
  ['speakers', 'Zvučnici'],
  ['weight', 'Težina'],
  ['os', 'Sustav'],
  ['extras', 'Ostalo'],
  ['priceSeen', 'Viđena cijena'],
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id) || PRODUCTS[0];

/* ------------------------------------------------------------------ Legion */

function legionTargets() {
  return [
    // 🇭🇷 the long shot. Kept because if one of them ever lists it, that is the
    // one worth buying from — but measured empty on 23.8.2026.
    t('hgspot', 'HGSPOT', Region.HR, 'https://www.hgspot.hr/pretraga?q=Legion%20Tab%20Y700'),
    t('links', 'Links.hr', Region.HR, 'https://www.links.hr/hr/search?q=Legion+Tab+Y700'),
    t('instar', 'Instar Informatika', Region.HR, 'https://www.instar-informatika.hr/pretraga/?q=Legion+Tab+Y700'),
    t('nabava', 'Nabava.net', Region.HR, 'https://www.nabava.net/rezultati-pretrage?trazi=lenovo+legion+tab+y700', { aggregator: true }),
    t('sancta', 'Sancta Domenica', Region.HR, 'https://www.sancta-domenica.hr/', { challenged: 'Cloudflare challenge, measured 22.8.2026' }),

    // 🇩🇪 where it is actually sold.
    t('amazonde', 'Amazon.de', Region.DE, 'https://www.amazon.de/s?k=Lenovo+Legion+Tab+Y700+Gen+3', { challenged: 'Akamai proof-of-work interstitial' }),
    t('geizhals', 'Geizhals.de', Region.DE, 'https://geizhals.de/?fs=legion+tab+y700&hloc=de', { aggregator: true, challenged: 'Cloudflare, even in a real browser' }),
    t('alternate', 'Alternate.de', Region.DE, 'https://www.alternate.de/listing.xhtml?q=Legion+Tab+Y700'),
    t('cyberport', 'Cyberport', Region.DE, 'https://www.cyberport.de/suche/?q=Legion%20Tab%20Y700'),

    // 🇪🇺 / importers — the ones that reliably have it.
    t('amazonit', 'Amazon.it', Region.EU, 'https://www.amazon.it/s?k=Lenovo+Legion+Tab+Y700', { challenged: 'same bot manager as Amazon.de' }),
    t('amazones', 'Amazon.es', Region.EU, 'https://www.amazon.es/s?k=Lenovo+Legion+Tab+Y700', { challenged: 'same bot manager as Amazon.de' }),
    t('proshop', 'Proshop', Region.EU, 'https://www.proshop.de/?s=legion+tab+y700'),
    t('giztop', 'Giztop', Region.EU, 'https://www.giztop.com/catalogsearch/result/?q=legion+tab+y700'),
    t('tradingshenzhen', 'Trading Shenzhen', Region.EU, 'https://www.tradingshenzhen.com/en/search?controller=search&s=legion+tab+y700'),
    t('aliexpress', 'AliExpress', Region.EU, 'https://www.aliexpress.com/w/wholesale-lenovo-legion-tab-y700-gen-3.html', { challenged: 'heavy bot protection' }),
  ];
}

/* --------------------------------------------------------------- ALLDOCUBE */

function alldocubeTargets() {
  return [
    t('hgspot', 'HGSPOT', Region.HR, 'https://www.hgspot.hr/pretraga?q=Alldocube'),
    t('links', 'Links.hr', Region.HR, 'https://www.links.hr/hr/search?q=Alldocube'),
    t('nabava', 'Nabava.net', Region.HR, 'https://www.nabava.net/rezultati-pretrage?trazi=alldocube+iplay+70+mini', { aggregator: true }),

    t('amazonde', 'Amazon.de', Region.DE, 'https://www.amazon.de/s?k=ALLDOCUBE+iPlay+70+mini+Ultra', { challenged: 'Akamai proof-of-work interstitial' }),
    t('geizhals', 'Geizhals.de', Region.DE, 'https://geizhals.de/?fs=alldocube+iplay+70+mini&hloc=de', { aggregator: true, challenged: 'Cloudflare, even in a real browser' }),
    t('alternate', 'Alternate.de', Region.DE, 'https://www.alternate.de/listing.xhtml?q=Alldocube+iPlay+70'),

    t('amazonit', 'Amazon.it', Region.EU, 'https://www.amazon.it/s?k=ALLDOCUBE+iPlay+70+mini+Ultra', { challenged: 'same bot manager as Amazon.de' }),
    t('amazones', 'Amazon.es', Region.EU, 'https://www.amazon.es/s?k=ALLDOCUBE+iPlay+70+mini+Ultra', { challenged: 'same bot manager as Amazon.de' }),
    // The manufacturer's own shop and the importers. For this tablet these are
    // not a fallback, they are the main road.
    t('alldocube', 'ALLDOCUBE Store', Region.EU, 'https://www.alldocube.com/search?q=iPlay+70+mini+Ultra'),
    // VERIFIED 23.8.2026: rendered, photographed, and read as a match —
    // "ALLDOCUBE iPLAY 70 MINI ULTRA", €349, in stock, in 5.5 seconds.
    t('giztop', 'Giztop', Region.EU, 'https://www.giztop.com/alldocube-iplay-70-mini-ultra.html', { pinned: true }),
    t('proshop', 'Proshop', Region.EU, 'https://www.proshop.de/?s=alldocube+iplay+70'),
    t('aliexpress', 'AliExpress', Region.EU, 'https://www.aliexpress.com/w/wholesale-alldocube-iplay-70-mini-ultra.html', { challenged: 'heavy bot protection' }),
  ];
}

/* --------------------------------------------------------------- Ultra Pad */

function ultrapadTargets() {
  return [
    t('links', 'Links.hr', Region.HR, 'https://www.links.hr/hr/search?q=Alldocube'),
    t('nabava', 'Nabava.net', Region.HR, 'https://www.nabava.net/rezultati-pretrage?trazi=alldocube+ultra+pad', { aggregator: true }),

    // ALLDOCUBE launched this one ON Amazon Europe, so the Amazons are the
    // main road here rather than the long shot they are for the Legion.
    t('amazonde', 'Amazon.de', Region.DE, 'https://www.amazon.de/s?k=ALLDOCUBE+Ultra+Pad+13', { challenged: 'Akamai proof-of-work interstitial' }),
    t('geizhals', 'Geizhals.de', Region.DE, 'https://geizhals.de/?fs=alldocube+ultra+pad&hloc=de', { aggregator: true, challenged: 'Cloudflare, even in a real browser' }),
    t('alternate', 'Alternate.de', Region.DE, 'https://www.alternate.de/listing.xhtml?q=Alldocube+Ultra+Pad'),

    t('amazonit', 'Amazon.it', Region.EU, 'https://www.amazon.it/s?k=ALLDOCUBE+Ultra+Pad+13', { challenged: 'same bot manager as Amazon.de' }),
    t('amazones', 'Amazon.es', Region.EU, 'https://www.amazon.es/s?k=ALLDOCUBE+Ultra+Pad+13', { challenged: 'same bot manager as Amazon.de' }),
    t('alldocube', 'ALLDOCUBE Store', Region.EU, 'https://www.alldocube.com/en/products/ultrapad/'),
    t('giztop', 'Giztop', Region.EU, 'https://www.giztop.com/catalogsearch/result/?q=alldocube+ultra+pad'),
    t('aliexpress', 'AliExpress', Region.EU, 'https://www.aliexpress.com/w/wholesale-alldocube-ultra-pad-13.html', { challenged: 'heavy bot protection' }),
  ];
}

/* ------------------------------------------------------------------ helper */

function t(id, name, region, searchUrl, opts = {}) {
  return {
    id, name, region, searchUrl,
    // `pinned` means this URL IS the product page, verified by eye, so the
    // fetch tier is allowed to settle it without the browser and the camera.
    productUrl: opts.pinned ? searchUrl : null,
    aggregator: !!opts.aggregator,
    kind: opts.challenged ? 'challenged' : 'generic',
    knownHard: opts.challenged || null,
    selectors: opts.selectors || { price: [], stock: [] },
  };
}
