// TEST 2 — the real thing, once. Every adapter, against the live web.
//
// Run: npm run probe
//
// This is not a mock and it is not the app's UI. It loads the SAME adapter
// classes the app loads, copies them into .mjs so Node can resolve them, and
// asks each shop the same question the phone will ask. What it prints is what
// the app would have shown.
//
// Run it whenever a shop's card starts saying something odd. It is the fastest
// way to tell "the shop changed" from "the parser is wrong".

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = path.join(root, 'src');
const out = path.join(root, '.node-build');

/* Copy src/**\/*.js to .node-build/**\/*.mjs, giving relative imports their
   extension so Node's resolver accepts them. Nothing else is changed. */
function transpile(dir, rel = '') {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { transpile(full, path.join(rel, name)); continue; }
    if (!name.endsWith('.js')) continue;
    const code = readFileSync(full, 'utf8').replace(
      /from '(\.[^']*)'/g,
      (m, spec) => `from '${spec}${spec.endsWith('.js') || spec.endsWith('.mjs') ? '' : (spec.endsWith('/index') ? '.mjs' : '.mjs')}'`
    ).replace(/from '(\.\.?\/[^']*?)\/?'/g, (m, s) => m);
    const dest = path.join(out, rel, name.replace(/\.js$/, '.mjs'));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, code);
  }
}

// adapters/index.js imports '../adapters' style paths — normalise directory
// imports to their index file.
function fixDirImports() {
  const walk = (d) => readdirSync(d).forEach((n) => {
    const f = path.join(d, n);
    if (statSync(f).isDirectory()) return walk(f);
    let c = readFileSync(f, 'utf8');
    c = c.replace(/from '(\.[^']*)\.mjs'/g, (m, spec) => {
      const abs = path.resolve(path.dirname(f), spec);
      try { if (statSync(abs).isDirectory()) return `from '${spec}/index.mjs'`; } catch {}
      return m;
    });
    writeFileSync(f, c);
  });
  walk(out);
}

rmSync(out, { recursive: true, force: true });
transpile(src);
fixDirImports();

const { buildScrapers } = await import('file://' + path.join(out, 'adapters', 'index.mjs'));
const { TARGETS } = await import('file://' + path.join(out, 'config', 'targets.mjs'));
const { formatEUR } = await import('file://' + path.join(out, 'core', 'parse.mjs'));

const only = process.argv[2];
const scrapers = buildScrapers({}).filter((s) => !only || s.id === only);

console.log(`\nLENOVO HUNTER — live probe · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`);
console.log('shop                 region  status         price      ms     note');
console.log('─'.repeat(104));

const counts = {};
for (const s of scrapers) {
  const r = await s.run();
  counts[r.status] = (counts[r.status] || 0) + 1;
  console.log(
    r.store.padEnd(21) +
    r.region.padEnd(8) +
    r.status.padEnd(15) +
    String(formatEUR(r.price)).padEnd(11) +
    String(r.ms).padEnd(7) +
    (r.note || '')
  );
}

console.log('─'.repeat(104));
// Print the count, always. A check that found nothing and a check that ran
// nothing look identical from outside. four-tests.md, the sweep.
console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '));
console.log(`${scrapers.length} shops asked\n`);
rmSync(out, { recursive: true, force: true });
