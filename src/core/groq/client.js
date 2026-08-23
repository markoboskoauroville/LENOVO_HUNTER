import { withKey } from './keyring';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';

// A descriptive User-Agent, always, on every call. Not cosmetic:
// api.groq.com is behind Cloudflare and answers a UA-less request with
// `403, error code: 1010` on every endpoint including /models — which reads as
// five dead keys and is nothing to do with the keys.
// A descriptive string is enough; there is no reason to impersonate Chrome to
// an API we authenticate to honestly.
export const GROQ_UA = 'LenovoHunter/2 (+https://github.com/markoboskoauroville/LENOVO_HUNTER)';

async function call(path, key, init = {}) {
  const res = await fetch(GROQ_BASE + path, {
    ...init,
    headers: {
      'Authorization': `Bearer ${key}`,
      'User-Agent': GROQ_UA,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* an empty body on a block */ }
  return { status: res.status, body, retryAfter: res.headers.get('retry-after') };
}

/** GET /models — the cheap probe, and the one that works once the UA is set. */
export async function listModels() {
  const r = await withKey((key) => call('/models', key, { method: 'GET' }));
  if (!r.ok) return r;
  return { ok: true, models: (r.body && r.body.data) || [], keyFp: r.keyFp };
}

/**
 * Test one key deliberately. This is the exception to "never test
 * speculatively" — a person pressing a button is not the app guessing.
 * It bypasses the ring so the answer is about THAT key and no other.
 */
export async function testOneKey(key) {
  try {
    const r = await call('/models', key, { method: 'GET' });
    return {
      status: r.status,
      models: r.body && r.body.data ? r.body.data.length : 0,
      message: r.body && r.body.error ? String(r.body.error.message).slice(0, 140) : null,
      retryAfter: r.retryAfter,
    };
  } catch (e) {
    return { status: 0, models: 0, message: String((e && e.message) || e).slice(0, 140) };
  }
}

/**
 * Chat completion. `content` may be a string or an OpenAI content array.
 *
 * TWO MEASURED TRAPS, both found on 23.8.2026 and both of which read as
 * something other than what they are:
 *
 * 1. `reasoning_effort: 'none'`. qwen/qwen3.6-27b thinks out loud by default.
 *    On one shop screenshot it spent **1900 completion tokens** reasoning its
 *    way to a one-line answer; with reasoning off it spent **53** and gave the
 *    same verdict. That is not a tidiness preference — the free tier's limit is
 *    8000 tokens per minute, so the thinking version exhausts it after two
 *    images and every key looks throttled. Deciding what is in a photograph is
 *    perception, not deduction.
 *
 * 2. `json_validate_failed` arrives as **HTTP 400**, which reads like a
 *    malformed request and is nothing of the kind. It means the model was still
 *    reasoning when `max_completion_tokens` ran out, so no JSON was ever
 *    emitted — `failed_generation` comes back empty. The fix is a HIGHER
 *    ceiling, not a corrected prompt, and the retry below does exactly that
 *    once before giving up.
 */
export async function chat({ model, system, content, maxTokens = 1200, json = true,
                             temperature = 0, reasoning = 'none' }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content });

  const build = (tokens) => JSON.stringify({
    model,
    temperature,
    max_completion_tokens: tokens,
    ...(reasoning ? { reasoning_effort: reasoning } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages,
  });

  let r = await withKey((key) => call('/chat/completions', key, { method: 'POST', body: build(maxTokens) }));

  // The one retry worth having, and only for the one error it fixes.
  if (!r.ok && r.status === 400 && looksTruncated(r)) {
    r = await withKey((key) => call('/chat/completions', key, { method: 'POST', body: build(Math.max(3000, maxTokens * 3)) }));
  }

  if (!r.ok) return r;
  const choice = r.body && r.body.choices && r.body.choices[0];
  return {
    ok: true,
    text: choice ? choice.message.content : '',
    usage: (r.body && r.body.usage) || null,
    keyFp: r.keyFp,
  };
}

const looksTruncated = (r) =>
  !!(r.body && r.body.error && /json_validate_failed/i.test(String(r.body.error.code || r.body.error.message || '')));

/** The content array for a vision call: one instruction, one image. */
export const visionContent = (text, base64Jpeg) => ([
  { type: 'text', text },
  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
]);
