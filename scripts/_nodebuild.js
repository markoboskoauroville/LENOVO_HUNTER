// Copy src/**/*.js to .node-build/**/*.mjs so Node can import the app's own
// modules. Used by verify.js and probe.mjs — they check the real objects rather
// than regexing the source, because a regex that stops matching reports zero
// problems and looks exactly like a pass.
const fs = require('fs');
const path = require('path');

function build(root) {
  const src = path.join(root, 'src');
  const out = path.join(root, '.node-build');
  fs.rmSync(out, { recursive: true, force: true });

  (function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full, path.join(rel, name)); continue; }
      if (!name.endsWith('.js')) continue;
      let code = fs.readFileSync(full, 'utf8')
        .replace(/from '(\.[^']*)'/g, (m, spec) => `from '${spec}.mjs'`);
      // React Native only modules cannot be imported by Node. They are replaced
      // by shims that keep the shape and do nothing, so the app's own logic —
      // which is what these checks are about — can be loaded and inspected.
      const depth = rel ? rel.split(path.sep).length : 0;
      const up = depth ? '../'.repeat(depth) : './';
      code = code
        .replace(/from 'expo-crypto'/g, `from '${up}__shims/expo-crypto.mjs'`)
        .replace(/from '@react-native-async-storage\/async-storage'/g, `from '${up}__shims/async-storage.mjs'`)
        .replace(/from 'react-native'/g, `from '${up}__shims/react-native.mjs'`);
      const dest = path.join(out, rel, name.replace(/\.js$/, '.mjs'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, code);
    }
  })(src);

  fs.mkdirSync(path.join(out, '__shims'), { recursive: true });
  fs.writeFileSync(path.join(out, '__shims', 'expo-crypto.mjs'),
    `import { createHash } from 'node:crypto';
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const digestStringAsync = async (_alg, s) => createHash('sha256').update(s).digest('hex');
`);
  const store = new Map();
  fs.writeFileSync(path.join(out, '__shims', 'async-storage.mjs'),
    `const m = new Map();
export default { getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
`);
  fs.writeFileSync(path.join(out, '__shims', 'react-native.mjs'),
    `export const Platform = { OS: 'android' };
export const Vibration = { vibrate() {} };
export const Linking = { openURL: async () => {} };
`);

  // A directory import needs its index file named.
  (function fix(dir) {
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      if (fs.statSync(f).isDirectory()) { fix(f); continue; }
      let c = fs.readFileSync(f, 'utf8');
      c = c.replace(/from '(\.[^']*)\.mjs'/g, (m, spec) => {
        const abs = path.resolve(path.dirname(f), spec);
        try { if (fs.statSync(abs).isDirectory()) return `from '${spec}/index.mjs'`; } catch {}
        return m;
      });
      fs.writeFileSync(f, c);
    }
  })(out);

  return out;
}

module.exports = { build };
