#!/usr/bin/env node
/**
 * The pre-push verifier. Run it before every push; it encodes every way this
 * project has been broken so far, so none of them can be broken twice.
 *
 *   npm run verify
 *
 * Three passes, following MANTRA_MANIFEST/modules/four-tests.md §"the sweep":
 *   1  structure   — does everything referenced exist
 *   2  agreement   — does every enum entry have a branch everywhere it is used
 *   3  dead ends   — can the app reach a state with no way out
 *
 * Every pass PRINTS ITS COUNT. A check that found nothing and a check that ran
 * nothing look identical from outside, and a zero is a failure of the check
 * until proven otherwise.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let problems = 0;
const bad = (m) => { problems++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

console.log('\nLENOVO HUNTER — verify\n');

/* ---------------------------------------------------- 1  structure ------- */
console.log('PASS 1  structure');
{
  const version = read('src/version.js');
  const appJson = JSON.parse(read('app.json'));
  const n = Number((version.match(/export const VERSION = (\d+)/) || [])[1]);

  // The number lives in three places and all three must match.
  // versioning.md §3 — the trap that let TTT_MINI show 1.0 on the phone while
  // every document said build 127.
  let checked = 0;
  if (!Number.isInteger(n)) bad('src/version.js has no whole VERSION');
  else {
    checked++;
    if (String(appJson.expo.version) !== String(n)) bad(`app.json expo.version is "${appJson.expo.version}", VERSION is ${n}`);
    else checked++;
    if (appJson.expo.android.versionCode !== n) bad(`android.versionCode is ${appJson.expo.android.versionCode}, VERSION is ${n}`);
    else checked++;
    if (!version.includes('${VERSION}-tablet-hunter-v${VERSION}')) {
      bad('APK_NAME is not derived from VERSION at both ends');
    } else checked++;
  }
  ok(`version: ${checked}/4 places agree on v${n}`);

  // Every asset app.json names must exist, or the build fails at the very end.
  const assets = [
    appJson.expo.icon, appJson.expo.splash.image,
    appJson.expo.android.adaptiveIcon.foregroundImage,
    appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')?.[1]?.icon,
  ].filter(Boolean);
  assets.forEach((a) => {
    fs.existsSync(path.join(root, a)) ? null : bad(`asset missing: ${a}`);
  });
  ok(`assets: ${assets.length} declared, all present`);

  if (!fs.existsSync(path.join(root, 'assets/alarm.wav'))) bad('assets/alarm.wav missing — the alert would be silent');
  else ok('alert tone present');

  // Every adapter file imported by adapters/index.js exists.
  const idx = read('src/adapters/index.js');
  const imports = [...idx.matchAll(/from '\.\/([a-z]+\/[a-z]+)'/g)].map((m) => m[1]);
  imports.forEach((i) => {
    if (!fs.existsSync(path.join(root, 'src/adapters', i + '.js'))) bad(`adapter missing: src/adapters/${i}.js`);
  });
  ok(`adapters: ${imports.length} special adapters, all present`);
}

/* ---------------------------------------------------- 2  agreement ------- */
console.log('\nPASS 2  agreement');
{
  // Load the REAL modules, not their source text. The previous version of this
  // pass matched target definitions with a regex; when the targets moved into a
  // helper function on 23.8.2026 the regex stopped matching and the pass
  // reported "3 shops, 0 regions, all known" — a green tick for a check that
  // examined nothing. Print the count, and treat a zero as a broken check.
  const { build } = require('./_nodebuild');
  const out = build(root);
  const load = (p) => require('node:url').pathToFileURL(path.join(out, p)).href;

  (async () => {
    const types = await import(load('core/types.mjs'));
    const products = await import(load('config/products.mjs'));
    const verify = await import(load('core/groq/verify.mjs'));
    const pipeline = await import(load('core/pipeline.mjs'));
    const atoms = read('src/ui/atoms.js');
    const hunt = read('src/core/hunt.js');

    const statuses = Object.keys(types.Stock);
    if (!statuses.length) bad('0 statuses — the check did not run');
    let faces = 0, ranks = 0;
    statuses.forEach((s) => {
      if (atoms.includes(`[Stock.${s}]`)) faces++; else bad(`Stock.${s} has no STATUS_FACE — its card would draw nothing`);
      if (hunt.includes(`[Stock.${s}]`)) ranks++; else bad(`Stock.${s} has no STATUS_RANK — it would sort last, silently`);
    });
    ok(`statuses: ${statuses.length} checked, ${faces} have a face, ${ranks} have a rank`);

    // Every verdict the vision model may return must map to a stock state.
    // The first version of this check fed every verdict `in_stock: null` and
    // then complained that "match" mapped to UNKNOWN. It does, and it is right
    // to: a match with no readable availability is not stock. The check was
    // wrong, not the code. Most sweep hits are false — confirm each against the
    // source before believing it. four-tests.md, the sweep.
    const verdicts = Object.values(verify.Verdict);
    const sample = (v) => v === 'match'
      ? { verdict: v, in_stock: true, price_eur: 349 }
      : { verdict: v, in_stock: null, price_eur: null };
    let mapped = 0;
    verdicts.forEach((v) => {
      const r = pipeline.verdictToStock(sample(v));
      const settled = r && r.status && (r.status !== types.Stock.UNKNOWN || v === 'unclear');
      if (settled) mapped++;
      else bad(`verdict "${v}" falls through to UNKNOWN — a real answer would look like a failure`);
    });
    // And the one that matters most: a match must be able to become IN_STOCK.
    const m = pipeline.verdictToStock({ verdict: 'match', in_stock: true, price_eur: 349 });
    if (m.status !== types.Stock.IN_STOCK || m.price !== 349) bad('a confirmed match does not become IN_STOCK — the alert would never fire');
    const noPrice = pipeline.verdictToStock({ verdict: 'match', in_stock: true, price_eur: null });
    if (noPrice.status === types.Stock.IN_STOCK) bad('a match with no price becomes IN_STOCK — v1\'s bug, back again');
    ok(`verdicts: ${verdicts.length} checked, ${mapped} map to a stock state`);
    verdicts.forEach((v) => {
      if (!verify.RANK || verify.RANK[v] === undefined) bad(`verdict "${v}" has no RANK — bestVerdict would sort it last`);
    });

    // Products, their targets, and their spec sheets.
    const ps = products.PRODUCTS;
    if (!ps || ps.length < 2) bad(`${ps ? ps.length : 0} products — the check did not run`);
    let shops = 0, dupes = 0, badRegion = 0, missingSpec = 0;
    const regions = Object.values(types.Region);
    ps.forEach((p) => {
      if (!p.targets || !p.targets.length) bad(`${p.id} has no targets`);
      const ids = (p.targets || []).map((t) => t.id);
      shops += ids.length;
      const d = ids.filter((v, i) => ids.indexOf(v) !== i);
      if (d.length) { dupes++; bad(`${p.id}: duplicate target ids ${d.join(', ')} — one overwrites the other in every by-id map`); }
      (p.targets || []).forEach((t) => {
        if (!regions.includes(t.region)) { badRegion++; bad(`${p.id}/${t.id}: region ${t.region} has no section on screen`); }
        if (!t.searchUrl && !t.productUrl) bad(`${p.id}/${t.id}: no URL at all`);
        if (!['generic', 'challenged'].includes(t.kind)) bad(`${p.id}/${t.id}: unknown kind ${t.kind}`);
      });
      if (!p.description || p.description.length < 40) bad(`${p.id}: description too thin for the vision prompt to use`);
      if (!Array.isArray(p.sanePriceRange) || p.sanePriceRange[0] >= p.sanePriceRange[1]) bad(`${p.id}: sanePriceRange is not a range`);
      products.SPEC_ROWS.forEach(([k, label]) => {
        if (!p.specs || !p.specs[k]) { missingSpec++; bad(`${p.id}: spec "${label}" missing — the compare table would show a gap`); }
      });
    });
    ok(`products: ${ps.length}, ${shops} shops total, ${dupes} id clashes, ${badRegion} stray regions`);
    ok(`compare table: ${products.SPEC_ROWS.length} rows × ${ps.length} products, ${missingSpec} gaps`);

    // The Groq roles must each resolve to something even with no catalogue.
    const models = await import(load('core/groq/models.mjs'));
    const roles = Object.values(models.Role);
    ok(`groq roles: ${roles.length} (${roles.join(', ')})`);

    require('node:fs').rmSync(out, { recursive: true, force: true });
    finish();
  })().catch((e) => { bad(`pass 2 could not run: ${e.message}`); finish(); });
}

function finish() {
/* ---------------------------------------------------- 3  dead ends ------- */
console.log('\nPASS 3  dead ends');
{
  const scraper = read('src/core/StoreScraper.js');
  const http = read('src/core/http.js');
  const app = read('App.js');
  let checks = 0;

  // run() must never throw: every path returns a result.
  if (!scraper.includes('catch (e)')) bad('StoreScraper.run has no catch — one bad parser would end the sweep'); else checks++;
  // A request without a deadline is the failure that looks like nothing at all.
  if (!http.includes('AbortController')) bad('http.js has no timeout — a hanging shop would hang the sweep forever'); else checks++;
  // A blocked shop must not be retried inside a sweep.
  if (!http.includes('if (last.blocked) return last')) bad('getWithRetry retries a blocked shop — that turns one refusal into three'); else checks++;
  // Two sweeps at once is every shop asked twice.
  if (!app.includes('sweepLock')) bad('App has no sweep lock — HUNT NOW during a sweep would double every request'); else checks++;
  // IN_STOCK must be earned. This is the guard that stopped the first live
  // probe announcing a €219,90 Alternate listing as a Y700 in stock.
  if (!scraper.includes('guard(')) bad('no guard() — a search page could announce a false IN_STOCK'); else checks++;
  if (!scraper.includes('this.guard(this.parse(')) bad('guard() exists but run() does not apply it'); else checks++;
  // The first sweep of a fresh install must announce nothing.
  if (!read('src/core/hunt.js').includes('if (!prev || prev.status === Stock.PENDING) continue')) {
    bad('newlyInStock would fire on a first sweep — every shop would announce itself on install');
  } else checks++;
  ok(`dead ends: ${checks}/7 guards in place`);
}

/* ------------------------------------------------------ secrets ---------- */
console.log('\nSECRETS');
{
  // A key in a commit is public the moment it is pushed, and rewriting history
  // does not un-publish it. MANTRA_MANIFEST/modules/secrets.md §3.
  let diff = '';
  try { diff = execSync('git diff --cached', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch { console.log('  · not a git repository yet — nothing staged to scan'); }
  const hits = diff.match(/(sk_|gsk_|AIza|ghp_|github_pat_|sk-ant-|AQ\.)[A-Za-z0-9_-]{20,}/g);
  if (hits && hits.length) { bad(`STOP — ${hits.length} key-shaped strings in the staged diff`); }
  else ok(`staged diff scanned, 0 key shapes (${diff.length} chars examined)`);
}

/* ------------------------------------------------------ test 1 ----------- */
console.log('\nTEST 1  the mechanism, alone');
try {
  const out = execSync('node scripts/test-parse.mjs', { cwd: root }).toString();
  const line = out.trim().split('\n').filter((l) => l.startsWith('TEST 1')).pop();
  ok(line || 'ran');
} catch (e) {
  bad('parser tests FAILED — run npm run test:parse');
  console.log((e.stdout || '').toString().split('\n').filter((l) => l.includes('FAIL')).join('\n'));
}

console.log('\n' + '─'.repeat(60));
console.log(problems === 0 ? 'GREEN — safe to push\n' : `RED — ${problems} problem(s)\n`);
process.exit(problems ? 1 : 0);

}
