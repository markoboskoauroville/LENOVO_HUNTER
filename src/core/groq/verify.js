import { chat, visionContent } from './client';
import { modelFor, Role } from './models';

// ---------------------------------------------------------------------------
// The judge. A screenshot goes in, a verdict comes out, and IN STOCK is only
// ever spoken aloud because this said so.
// ---------------------------------------------------------------------------
//
// This prompt is not a draft. It was run against the two screenshots that
// caught v1 lying — the Alternate.de search page showing a HYTE Y70 PC tower
// case at €221,90, and the Proshop page showing a Wozinsky tempered glass at
// €10,03 — and it returned, at temperature 0, in under two seconds each:
//
//   wrong_product · "HYTE Y70 Snow White, Tower Case" · 221.9 · confidence 1.0
//   accessory     · "Wozinsky Tab Tempered Glass for Lenovo Legion Y700" · 10.03
//
// Both were the exact false positives v1 would have announced out loud. The
// accessory and wrong_product rules are first in the list because those two
// cases are the whole reason this file exists.

export const Verdict = {
  MATCH: 'match',
  WRONG_VARIANT: 'wrong_variant',
  WRONG_PRODUCT: 'wrong_product',
  ACCESSORY: 'accessory',
  NOT_FOUND: 'not_found',
  UNCLEAR: 'unclear',
  BLOCKED_PAGE: 'blocked_page',
};

const systemPrompt = (product) => `You inspect a screenshot of an online shop page and decide ONE thing:
is the ${product.label.toUpperCase()} being sold on this page, and is it in stock?

The product: ${product.description}

Rules that matter more than being helpful:
- A case, cover, screen protector, tempered glass, stylus, charger, dock or any ACCESSORY for it is NOT the tablet. verdict "accessory".
- Any other product that merely appeared in a search — a PC tower case, a monitor, another brand — is NOT it. verdict "wrong_product".
- A different generation, or a different RAM or storage size, is verdict "wrong_variant". Say which in "why".
- A search page listing nothing relevant is verdict "not_found".
- A cookie wall, a bot check, a CAPTCHA, "Just a moment", or an otherwise empty page is verdict "blocked_page".
- If you cannot see the product clearly enough to be sure, verdict "unclear". NEVER guess. A wrong "match" is far worse than an "unclear".

Read the price only if it belongs to the product you matched. Read the availability wording exactly as printed, in whatever language it is in.

Return ONLY JSON:
{"verdict":"match|wrong_variant|wrong_product|accessory|not_found|unclear|blocked_page",
 "product_title": string or null,
 "price_eur": number or null,
 "in_stock": true or false or null,
 "stock_text": string or null,
 "confidence": number between 0 and 1,
 "why": one short sentence}`;

/** Models that reason out loud wrap the answer; take the JSON out regardless. */
export function extractJson(text) {
  if (!text) return null;
  let s = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* give up honestly */ } }
  return null;
}

/**
 * Everything the model says is then held to the app's own arithmetic. A model
 * that reads a price correctly can still be reading the wrong product's price,
 * and a price outside the band for this product is evidence of exactly that.
 */
export function sanitise(v, product) {
  if (!v || typeof v !== 'object') {
    return { verdict: Verdict.UNCLEAR, why: 'the model did not answer in JSON', confidence: 0, price_eur: null, in_stock: null };
  }
  const out = {
    verdict: Object.values(Verdict).includes(v.verdict) ? v.verdict : Verdict.UNCLEAR,
    product_title: typeof v.product_title === 'string' ? v.product_title.slice(0, 160) : null,
    price_eur: typeof v.price_eur === 'number' && isFinite(v.price_eur) ? Math.round(v.price_eur * 100) / 100 : null,
    in_stock: typeof v.in_stock === 'boolean' ? v.in_stock : null,
    stock_text: typeof v.stock_text === 'string' ? v.stock_text.slice(0, 120) : null,
    confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : 0,
    why: typeof v.why === 'string' ? v.why.slice(0, 200) : null,
  };

  const [lo, hi] = product.sanePriceRange;
  if (out.price_eur !== null && (out.price_eur < lo || out.price_eur > hi)) {
    // Do not silently drop it — say what happened, because a price far outside
    // the band usually means the match itself is wrong.
    out.why = `price €${out.price_eur} is outside €${lo}–€${hi} for this model; ${out.why || ''}`.slice(0, 200);
    if (out.verdict === Verdict.MATCH) out.verdict = Verdict.UNCLEAR;
    out.price_eur = null;
  }

  // Low confidence is not a match. The threshold is deliberately high: this is
  // the only gate between a screenshot and the phone shouting at 3am.
  if (out.verdict === Verdict.MATCH && out.confidence < 0.7) {
    out.verdict = Verdict.UNCLEAR;
    out.why = `confidence ${out.confidence} too low to call it a match; ${out.why || ''}`.slice(0, 200);
  }
  return out;
}

/**
 * Judge one screenshot.
 * @param {string} base64Jpeg
 * @param {object} product
 * @returns {{ok:boolean, verdict?:object, reason?:string, model?:string, ms?:number}}
 */
export async function verifyScreenshot(base64Jpeg, product, hint) {
  const model = await modelFor(Role.VISION);
  const t0 = Date.now();
  const r = await chat({
    model,
    system: systemPrompt(product),
    content: visionContent(hint || 'Decide. JSON only.', base64Jpeg),
    maxTokens: 900,
  });
  const ms = Date.now() - t0;
  if (!r.ok) return { ok: false, reason: r.reason || 'GROQ_FAILED', detail: r.detail, model, ms };
  const verdict = sanitise(extractJson(r.text), product);
  return { ok: true, verdict, model, ms, usage: r.usage };
}

/**
 * Several screenshots of one page — the top of it, then further down. The best
 * answer wins, and "best" is not "most confident": a match found halfway down a
 * long listing is worth more than an "unclear" from the header, but an
 * "accessory" seen anywhere is a warning that outranks a hopeful "unclear".
 */
export const RANK = {
  [Verdict.MATCH]: 0,
  [Verdict.WRONG_VARIANT]: 1,
  [Verdict.ACCESSORY]: 2,
  [Verdict.WRONG_PRODUCT]: 3,
  [Verdict.NOT_FOUND]: 4,
  [Verdict.BLOCKED_PAGE]: 5,
  [Verdict.UNCLEAR]: 6,
};

export function bestVerdict(list) {
  const good = list.filter(Boolean);
  if (!good.length) return null;
  return good.sort((a, b) => {
    const r = (RANK[a.verdict] ?? 9) - (RANK[b.verdict] ?? 9);
    if (r !== 0) return r;
    return (b.confidence || 0) - (a.confidence || 0);
  })[0];
}
