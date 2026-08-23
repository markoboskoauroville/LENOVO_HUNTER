import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  disabled:  'lh.disabled.v1',     // ids switched OFF — never the ones switched on
  overrides: 'lh.overrides.v1',    // pinned product URLs
  last:      'lh.last.v1',         // last sweep, so the app opens showing something
  sort:      'lh.sort.v1',
};

const read = async (k, fallback) => {
  try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const write = async (k, v) => {
  try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {}
};

export const loadDisabled  = async () => new Set(await read(K.disabled, []));
export const saveDisabled  = (set) => write(K.disabled, Array.from(set));
export const loadOverrides = () => read(K.overrides, {});
export const saveOverrides = (o) => write(K.overrides, o);
export const loadLast      = () => read(K.last, null);
export const saveLast      = (payload) => write(K.last, payload);
export const loadSort      = () => read(K.sort, 'REGION');
export const saveSort      = (m) => write(K.sort, m);

export async function resetArrangement() {
  await saveDisabled(new Set());
  await saveOverrides({});
}
