// TEST 1 — the mechanism, alone. No network, no React, no app.
// Run: npm run test:parse
//
// Every case here is one that would make the app confidently WRONG, not one
// that would make it crash. A crash is visible; a wrong price is not.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// parse.js and types.js are written for Metro, which resolves ESM in .js.
// Node does not, so the two are rewritten into one temporary .mjs sitting in
// the project (where node_modules resolves) and imported from there.
const types = readFileSync(path.join(here, '..', 'src', 'core', 'types.js'), 'utf8');
const parse = readFileSync(path.join(here, '..', 'src', 'core', 'parse.js'), 'utf8')
  .replace("import { Stock } from './types';", types);

const tmp = path.join(here, '_parse.generated.mjs');
writeFileSync(tmp, parse);
const mod = await import('file://' + tmp);
const { parsePriceEUR, offerFromJsonLd, stockFromText, extractJsonLd, formatEUR, Stock } = mod;
process.on('exit', () => { try { unlinkSync(tmp); } catch {} });

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`  FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

console.log('\n— prices, the case it is FOR —');
eq('plain euros',        parsePriceEUR('399,00 €'), 399);
eq('thousands, german',  parsePriceEUR('1.299,00 €'), 1299);
eq('thousands, english', parsePriceEUR('€1,299.00'), 1299);
eq('symbol first',       parsePriceEUR('€ 429,99'), 429.99);
eq('EUR word',           parsePriceEUR('429,99 EUR'), 429.99);
eq('german shorthand',   parsePriceEUR('429,-'), 429);
eq('nbsp separator',     parsePriceEUR('1\u00A0299,00 €'), 1299);
eq('already a number',   parsePriceEUR(549.9), 549.9);
eq('bare integer',       parsePriceEUR('599'), 599);
eq('dot thousands only', parsePriceEUR('1.299'), 1299);

console.log('— prices, the case it must REFUSE —');
eq('null in',        parsePriceEUR(null), null);
eq('empty',          parsePriceEUR(''), null);
eq('no digits',      parsePriceEUR('Nema na zalihi'), null);
eq('review count',   parsePriceEUR('4,5 (231 recenzija)'), null);   // 4.5 is below the floor
eq('absurdly high',  parsePriceEUR('99.999,00 €'), null);
eq('postcode',       parsePriceEUR('10000 Zagreb'), null);          // above ceiling
eq('shipping cost',  parsePriceEUR('4,99 €'), null);                // below floor

console.log('— boundaries —');
eq('at the floor',        parsePriceEUR('50,00'), 50);
eq('just under floor',    parsePriceEUR('49,99'), null);
eq('at the ceiling',      parsePriceEUR('9000,00'), 9000);
eq('just over ceiling',   parsePriceEUR('9000,01'), null);

console.log('— stock wording, and the collision that matters —');
// "Nema na zalihi" CONTAINS "na zalihi". A positive-first scan calls every
// sold-out Croatian page in stock. This is the single most important case here.
eq('hr sold out',      stockFromText('Nema na zalihi'), Stock.OUT_OF_STOCK);
eq('hr in stock',      stockFromText('Na zalihi - isporuka 1-2 dana'), Stock.IN_STOCK);
eq('hr unavailable',   stockFromText('Proizvod trenutno nedostupno'), Stock.OUT_OF_STOCK);
eq('de in stock',      stockFromText('Auf Lager, sofort lieferbar'), Stock.IN_STOCK);
eq('de not available', stockFromText('Derzeit nicht lieferbar'), Stock.OUT_OF_STOCK);
// "nicht lieferbar" contains "lieferbar" — the same collision in German.
eq('de collision',     stockFromText('Artikel nicht lieferbar'), Stock.OUT_OF_STOCK);
eq('preorder hr',      stockFromText('Predbilježba za rujan'), Stock.PREORDER);
eq('preorder de',      stockFromText('Jetzt vorbestellen'), Stock.PREORDER);
eq('nothing to say',   stockFromText('Lenovo Legion Tab Y700'), null);
eq('empty text',       stockFromText(''), null);

console.log('— JSON-LD —');
const ld = (body) => `<html><head><script type="application/ld+json">${body}</script></head><body></body></html>`;

eq('simple product', offerFromJsonLd(ld(JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Product', name: 'Lenovo Legion Tab Y700',
  offers: { '@type': 'Offer', price: '429.00', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
}))), { price: 429, availability: Stock.IN_STOCK, name: 'Lenovo Legion Tab Y700' });

eq('out of stock', offerFromJsonLd(ld(JSON.stringify({
  '@type': 'Product', name: 'Y700',
  offers: { price: '399,00', availability: 'OutOfStock' },
}))), { price: 399, availability: Stock.OUT_OF_STOCK, name: 'Y700' });

eq('inside @graph', offerFromJsonLd(ld(JSON.stringify({
  '@graph': [
    { '@type': 'WebSite', url: 'https://x.hr' },
    { '@type': 'Product', name: 'Y700', offers: { price: 459.5, availability: 'https://schema.org/InStock' } },
  ],
}))), { price: 459.5, availability: Stock.IN_STOCK, name: 'Y700' });

eq('aggregate offer lowPrice', offerFromJsonLd(ld(JSON.stringify({
  '@type': 'Product', name: 'Y700',
  offers: { '@type': 'AggregateOffer', lowPrice: '412,00', highPrice: '499,00', offerCount: 7 },
}))), { price: 412, availability: null, name: 'Y700' });

eq('malformed json is survived', offerFromJsonLd(ld('{ this is not json ')), null);
eq('website-only ld, no offer', offerFromJsonLd(ld(JSON.stringify({ '@type': 'WebSite', url: 'https://hgspot.hr' }))), null);
eq('no ld at all', offerFromJsonLd('<html><body>nothing</body></html>'), null);

console.log('— two blocks, product must win over the breadcrumb —');
const two = `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [] })}</script>` +
            `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Y700', offers: { price: '389,00', availability: 'InStock' } })}</script></html>`;
eq('picks the product', offerFromJsonLd(two), { price: 389, availability: Stock.IN_STOCK, name: 'Y700' });
eq('found both blocks', extractJsonLd(two).length, 2);

console.log('— formatting —');
eq('format', formatEUR(429), '€429,00');
eq('format null', formatEUR(null), '—');

console.log(`\nTEST 1: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
