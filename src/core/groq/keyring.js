import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// ---------------------------------------------------------------------------
// The Groq key ring. MANTRA_MANIFEST/modules/keyring.md, followed to the letter,
// because every rule in it was paid for by a ring that got one of them wrong.
// ---------------------------------------------------------------------------
//
// The two that matter most, and both are MEASURED against Groq on 23.8.2026:
//
//   * 429 is a VALID key having a busy minute. It is rested, never condemned.
//     A live run hit one on the second image in a row and Groq answered with
//     `retry-after: 14`. A ring that condemns on 429 eats a five-key ring in an
//     afternoon and then reports that every key is finished.
//   * The User-Agent is not optional. api.groq.com is behind Cloudflare and a
//     request with no UA gets `403, error code: 1010` on every endpoint —
//     which looks exactly like five dead keys and is nothing to do with keys.

const K = {
  keys:  'lh.groq.keys.v1',    // the ring, in order
  dead:  'lh.groq.dead.v1',    // SHA-256 fingerprints ONLY, never keys
  state: 'lh.groq.state.v1',   // active index, last error, chosen models
};

/* ------------------------------------------------------------- the parser */

// Keys live inside handwritten notes: dates, account names, the word CANCELLED,
// URLs with tracking parameters. Find them by SHAPE and leave the prose alone.
// A whitespace split on a real note has genuinely produced an attempt to
// authenticate with the word "cafeteria".
const GROQ_SHAPE = /gsk_[A-Za-z0-9]{20,}/g;

export function parseKeys(blob) {
  if (!blob) return [];
  const found = String(blob).match(GROQ_SHAPE) || [];
  return Array.from(new Set(found));          // de-duplicate on import
}

/** first six and last four, never the middle. */
export const mask = (k) =>
  !k ? '' : k.length <= 12 ? '••••' : `${k.slice(0, 6)}…${k.slice(-4)}`;

export async function fingerprint(k) {
  const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, k);
  return h.slice(0, 16);
}

/* -------------------------------------------------------------- the store */

const read = async (k, f) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = async (k, v) => { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const loadKeys = () => read(K.keys, []);
export const saveKeys = (a) => write(K.keys, a);
export const loadDead = () => read(K.dead, {});      // { fingerprint: { at, code } }
export const saveDead = (d) => write(K.dead, d);
export const loadState = () => read(K.state, { activeIndex: 0, lastError: null, visionModel: null, textModel: null });
export const saveState = (s) => write(K.state, s);

export async function importKeys(blob) {
  const found = parseKeys(blob);
  const existing = await loadKeys();
  const merged = Array.from(new Set([...existing, ...found]));
  await saveKeys(merged);
  return { found: found.length, added: merged.length - existing.length, total: merged.length };
}

export async function removeKey(key) {
  const keys = (await loadKeys()).filter((k) => k !== key);
  await saveKeys(keys);
  return keys;
}

/** Credit gets topped up. A condemnation that cannot be undone is a bug. */
export async function reviveKey(key) {
  const fp = await fingerprint(key);
  const dead = await loadDead();
  delete dead[fp];
  await saveDead(dead);
}

/* --------------------------------------------------------------- the ring */

export const RingStatus = {
  OK: 'OK', DEAD: 'DEAD', THROTTLED: 'THROTTLED', WRONG_PATH: 'WRONG_PATH', OTHER: 'OTHER',
};

/**
 * The status mapping, as a pure function so TEST 1 can hold it to account
 * without a network. This is the piece reinvented rings get wrong.
 */
export function classify(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return RingStatus.OK;
  if (httpStatus === 401 || httpStatus === 403) return RingStatus.DEAD;
  if (httpStatus === 429) return RingStatus.THROTTLED;
  if (httpStatus === 404) return RingStatus.WRONG_PATH;
  return RingStatus.OTHER;
}

const restedUntil = new Map();   // fingerprint -> epoch ms. In memory only:
                                 // a throttle is a minute long, not a fact.

/**
 * Run `attempt(key)` against the first key not known dead and not resting.
 * Rolling forward is INVISIBLE — the caller sees one slightly slower answer,
 * never a failure.
 *
 * `attempt` must resolve to { status, body } and must not throw on HTTP errors.
 */
export async function withKey(attempt) {
  const keys = await loadKeys();
  if (!keys.length) return { ok: false, reason: 'NO_KEYS' };

  const dead = await loadDead();
  const now = Date.now();
  let sawThrottle = false;
  let lastOther = null;

  for (const key of keys) {
    const fp = await fingerprint(key);
    if (dead[fp]) continue;
    const rest = restedUntil.get(fp) || 0;
    if (rest > now) { sawThrottle = true; continue; }

    let res;
    try {
      res = await attempt(key);
    } catch (e) {
      lastOther = { reason: 'NETWORK', detail: String((e && e.message) || e).slice(0, 120) };
      continue;
    }

    const cls = classify(res.status);
    if (cls === RingStatus.OK) return { ok: true, body: res.body, keyFp: fp };

    if (cls === RingStatus.DEAD) {
      // Condemn permanently, roll forward, and retry the SAME request.
      dead[fp] = { at: Date.now(), code: res.status };
      await saveDead(dead);
      continue;
    }
    if (cls === RingStatus.THROTTLED) {
      const secs = Number(res.retryAfter) || 30;
      restedUntil.set(fp, Date.now() + secs * 1000);
      sawThrottle = true;
      continue;                      // rest it — NEVER condemn it
    }
    if (cls === RingStatus.WRONG_PATH) {
      // 404 is our URL, not the key. Blaming the ring here burns keys for a typo.
      return { ok: false, reason: 'WRONG_PATH', detail: 'the endpoint path is wrong, not the key' };
    }
    lastOther = { reason: 'OTHER', detail: `HTTP ${res.status}`, status: res.status, body: res.body };
    break;                           // a real error — stop, do not spend twice
  }

  if (sawThrottle) return { ok: false, reason: 'ALL_THROTTLED' };
  if (lastOther) return { ok: false, ...lastOther };
  return { ok: false, reason: 'ALL_DEAD' };
}

/** For the settings list: every key, masked, with its state. */
export async function ringStatus() {
  const [keys, dead] = await Promise.all([loadKeys(), loadDead()]);
  const now = Date.now();
  return Promise.all(keys.map(async (k) => {
    const fp = await fingerprint(k);
    const rest = restedUntil.get(fp) || 0;
    return {
      key: k,
      masked: mask(k),
      fp,
      state: dead[fp] ? 'dead' : rest > now ? 'throttled' : 'untested',
      deadAt: dead[fp] ? dead[fp].at : null,
      deadCode: dead[fp] ? dead[fp].code : null,
      restSeconds: rest > now ? Math.ceil((rest - now) / 1000) : 0,
    };
  }));
}
