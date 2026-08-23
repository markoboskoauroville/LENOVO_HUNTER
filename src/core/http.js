import { Stock } from './types';

// ---------------------------------------------------------------------------
// One place that builds every request, so no adapter can forget a header.
// ---------------------------------------------------------------------------
//
// On the User-Agent, honestly: MANTRA_MANIFEST/apis/README.md says a descriptive
// UA is enough and impersonating Chrome ages badly. That rule was written for
// APIs we authenticate to. These are public retail pages with no key, and
// several of them serve a different (or empty) page to a non-browser UA. So we
// send a real desktop UA here — and we do NOT do anything else: no cookie
// replay, no challenge solving, no proxy rotation. When a shop says no, we
// record that it said no. See BLOCKED handling below.

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 20000;

// Politeness. One request per host at a time, and a floor between them, so the
// app can never behave like a load test against a shop that did nothing wrong.
const MIN_INTERVAL_PER_HOST_MS = 1500;
const lastHitByHost = new Map();

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHost(url) {
  const host = hostOf(url);
  const last = lastHitByHost.get(host) || 0;
  const wait = last + MIN_INTERVAL_PER_HOST_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHitByHost.set(host, Date.now());
}

// Markers measured against the live sites on 22.8.2026. See HANDOFF.md.
const CHALLENGE_MARKERS = [
  'cf_chl_opt',                 // Cloudflare challenge platform
  'Just a moment...',
  '/cdn-cgi/challenge-platform',
  'bm-verify',                  // Akamai Bot Manager interstitial (Amazon)
  '_sec/verify?provider=interstitial',
  'Enter the characters you see below',
  'Robot Check',
  'Zugriff verweigert',
  'Access Denied',
  'px-captcha',                 // PerimeterX
  'DataDome',
];

export function looksChallenged(html) {
  if (!html) return false;
  const head = html.slice(0, 60000);
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

/**
 * A single GET. Never throws — it resolves to a shape the caller can switch on,
 * because one shop failing must not end the sweep.
 *
 * @returns {{ok:boolean, status:number, html:string, blocked:boolean, note:string|null, ms:number}}
 */
export async function get(url, { timeoutMs = DEFAULT_TIMEOUT_MS, referer } = {}) {
  await waitForHost(url);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'hr-HR,hr;q=0.9,de-DE;q=0.8,de;q=0.7,en;q=0.6',
        'Referer': referer || new URL(url).origin + '/',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    const status = res.status;
    let html = '';
    try { html = await res.text(); } catch { /* body may be empty on a block */ }
    const ms = Date.now() - started;

    // 403 / 429 / 503 are the shop refusing, not a bug here. 429 in particular
    // means "you are welcome but slow down" — it is never treated as dead.
    // MANTRA_MANIFEST/modules/secrets.md §6, same mapping.
    if (status === 403 || status === 429 || status === 503 || status === 401) {
      const retryAfter = res.headers.get('retry-after');
      return {
        ok: false, status, html, blocked: true, ms,
        note: `HTTP ${status}${retryAfter ? ` · retry after ${retryAfter}s` : ''}`,
      };
    }
    if (looksChallenged(html)) {
      return { ok: false, status, html, blocked: true, ms, note: 'bot challenge served instead of the page' };
    }
    if (status >= 400) {
      return { ok: false, status, html, blocked: false, ms, note: `HTTP ${status}` };
    }
    return { ok: true, status, html, blocked: false, ms, note: null };
  } catch (e) {
    const ms = Date.now() - started;
    const aborted = e && (e.name === 'AbortError' || String(e).includes('Abort'));
    return {
      ok: false, status: 0, html: '', blocked: false, ms,
      // "Never answers" is its own failure and it has its own deadline.
      // four-tests.md, TEST 3.
      note: aborted ? `no answer within ${Math.round(timeoutMs / 1000)}s` : `network: ${String(e && e.message || e).slice(0, 80)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET with backoff. Two retries, exponential with jitter, and a hard stop —
 * a blocked shop is reported blocked, it is not hammered until it relents.
 */
export async function getWithRetry(url, opts = {}) {
  const attempts = opts.attempts ?? 3;
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await get(url, opts);
    if (last.ok) return last;
    // A hard block does not get retried inside one sweep. Trying again in
    // four seconds is what turns one refusal into three.
    if (last.blocked) return last;
    if (i < attempts - 1) {
      const backoff = 800 * Math.pow(2, i) + Math.random() * 600; // jitter
      await sleep(backoff);
    }
  }
  return last;
}

export const HTTP_STATUS_TO_STOCK = (r) =>
  r.blocked ? Stock.BLOCKED : r.ok ? null : Stock.ERROR;
