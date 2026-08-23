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
    if (!version.includes(`${n}-lenovo-hunter-v${n}`) && !version.includes('${VERSION}-lenovo-hunter-v${VERSION}')) {
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
  const types = read('src/core/types.js');
  const atoms = read('src/ui/atoms.js');
  const hunt = read('src/core/hunt.js');

  // Scope to the Stock block only. The first version of this check matched
  // every two-space UPPER key in the file and reported Region.HR/DE/EU as
  // statuses with no card face — six hits, all false. Most sweep hits are
  // false; confirm each one against the source before believing it.
  const stockBlock = (types.match(/export const Stock = \{([\s\S]*?)\};/) || [, ''])[1];
  const statuses = [...stockBlock.matchAll(/^\s{2}([A-Z_]+):\s+'/gm)].map((m) => m[1]);
  if (statuses.length === 0) bad('found 0 statuses in types.js — the check did not run');
  else {
    let missingFace = 0, missingRank = 0;
    statuses.forEach((s) => {
      if (!atoms.includes(`[Stock.${s}]`)) { bad(`Stock.${s} has no entry in STATUS_FACE — its card would draw nothing`); missingFace++; }
      if (!hunt.includes(`[Stock.${s}]`)) { bad(`Stock.${s} has no rank in STATUS_RANK — it would sort last silently`); missingRank++; }
    });
    ok(`statuses: ${statuses.length} checked, ${statuses.length - missingFace} have a face, ${statuses.length - missingRank} have a rank`);
  }

  // Every target must carry the fields the runner reads.
  const targets = read('src/config/targets.js');
  const ids = [...targets.matchAll(/id:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  if (ids.length === 0) bad('found 0 targets — the check did not run');
  else {
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    if (dupes.length) bad(`duplicate target ids: ${dupes.join(', ')} — one would overwrite the other in every by-id map`);
    const kinds = [...targets.matchAll(/kind:\s*'([a-z]+)'/g)].map((m) => m[1]);
    const unknown = kinds.filter((k) => !['generic', 'challenged'].includes(k));
    if (unknown.length) bad(`unknown target kind: ${unknown.join(', ')}`);
    ok(`targets: ${ids.length} shops, ${new Set(ids).size} unique ids, ${kinds.length} kinds all known`);
  }

  const regions = [...targets.matchAll(/region:\s*Region\.([A-Z]+)/g)].map((m) => m[1]);
  const known = ['HR', 'DE', 'EU'];
  const strays = regions.filter((r) => !known.includes(r));
  if (strays.length) bad(`region with no section on screen: ${strays.join(', ')}`);
  ok(`regions: ${regions.length} assignments, all in REGION_ORDER`);
}

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
