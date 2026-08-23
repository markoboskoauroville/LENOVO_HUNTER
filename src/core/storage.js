import AsyncStorage from '@react-native-async-storage/async-storage';

// Everything the person arranged, kept per product where it belongs. The one
// rule that shapes these keys: store what is switched OFF, never what is on,
// so a shop added in a later build is live by default instead of invisible to
// anyone whose saved list predates it. design-language.md §7.
const K = {
  disabled:  'lh.disabled.v2',     // { productId: [storeId…] } — the OFF list
  overrides: 'lh.overrides.v2',    // { productId: { storeId: {productUrl} } }
  last:      'lh.last.v2',         // { productId: { at, rows } }
  sort:      'lh.sort.v2',
  tab:       'lh.tab.v2',
  vision:    'lh.vision.v2',
};

const read = async (k, f) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = async (k, v) => { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {} };

export async function loadDisabled() {
  const raw = await read(K.disabled, {});
  const out = {};
  for (const [pid, ids] of Object.entries(raw)) out[pid] = new Set(ids);
  return out;
}
export function saveDisabled(map) {
  const plain = {};
  for (const [pid, set] of Object.entries(map)) plain[pid] = Array.from(set);
  return write(K.disabled, plain);
}

export const loadOverrides = () => read(K.overrides, {});
export const saveOverrides = (o) => write(K.overrides, o);
export const loadLast      = () => read(K.last, {});
export const saveLast      = (o) => write(K.last, o);
export const loadSort      = () => read(K.sort, 'REGION');
export const saveSort      = (m) => write(K.sort, m);
export const loadTab       = () => read(K.tab, 'legion');
export const saveTab       = (t) => write(K.tab, t);
export const loadVision    = () => read(K.vision, true);
export const saveVision    = (v) => write(K.vision, v);

export async function resetArrangement() {
  await Promise.all([saveDisabled({}), saveOverrides({})]);
}
