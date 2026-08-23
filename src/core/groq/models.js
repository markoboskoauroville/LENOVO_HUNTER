import { listModels } from './client';
import { loadState, saveState } from './keyring';

// ---------------------------------------------------------------------------
// Ask for a ROLE, never for a provider or a model by name.
// MANTRA_MANIFEST/modules/keyring.md §6, the router.
// ---------------------------------------------------------------------------
//
// MEASURED against the live catalogue on 23.8.2026 with real keys. What came
// back was thirteen models, and the important part is what was NOT in them:
//
//   meta-llama/llama-4-scout-17b-16e-instruct      -> 404, does not exist
//   meta-llama/llama-4-maverick-17b-128e-instruct  -> 404, does not exist
//
// Those are the two everybody's Groq vision example still uses. They are gone.
// The one that works today:
//
//   qwen/qwen3.6-27b   -> 200, and it read a shop screenshot correctly,
//                         naming "HYTE Y70 Snow White, Tower Case" off the page
//
// It emits a <think> block before its answer, so responses are parsed with
// `response_format: json_object` and the reasoning is stripped defensively.
// openai/gpt-oss-120b rejects an image outright: "content must be a string".

export const Role = { VISION: 'vision', TEXT: 'text' };

// Ordered preference. First one present in the live catalogue wins.
const PREFERENCE = {
  [Role.VISION]: [
    'qwen/qwen3.6-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llava-v1.5-7b-4096-preview',
  ],
  [Role.TEXT]: [
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'groq/compound-mini',
    'openai/gpt-oss-20b',
  ],
};

// Used when the catalogue cannot be fetched — offline, or every key throttled.
const FALLBACK = { [Role.VISION]: 'qwen/qwen3.6-27b', [Role.TEXT]: 'openai/gpt-oss-120b' };

// Models that cannot take an image, whatever their name suggests. Measured.
const TEXT_ONLY = /whisper|orpheus|prompt-guard|allam|gpt-oss/i;

let catalogue = null;         // { ids: Set, at: epoch }
const CATALOGUE_TTL = 30 * 60 * 1000;

export async function refreshCatalogue(force = false) {
  if (!force && catalogue && Date.now() - catalogue.at < CATALOGUE_TTL) return catalogue;
  const r = await listModels();
  if (!r.ok) return catalogue;                       // keep the last good one
  catalogue = { ids: new Set(r.models.map((m) => m.id)), at: Date.now(), raw: r.models };
  return catalogue;
}

/**
 * The model for a role. A model Marko chose by hand always wins, but only if
 * the catalogue still has it — a pinned model that has been retired is a 404
 * that reads like a bad request body, and that is a bad afternoon.
 */
export async function modelFor(role) {
  const [state, cat] = await Promise.all([loadState(), refreshCatalogue()]);
  const pinned = role === Role.VISION ? state.visionModel : state.textModel;
  if (pinned && (!cat || cat.ids.has(pinned))) return pinned;

  if (cat) {
    for (const id of PREFERENCE[role]) {
      if (!cat.ids.has(id)) continue;
      if (role === Role.VISION && TEXT_ONLY.test(id)) continue;
      return id;
    }
  }
  return FALLBACK[role];
}

export async function pinModel(role, id) {
  const s = await loadState();
  await saveState({ ...s, [role === Role.VISION ? 'visionModel' : 'textModel']: id });
}

/** Candidates to offer in settings: everything plausibly usable for the role. */
export async function candidates(role) {
  const cat = await refreshCatalogue();
  if (!cat) return PREFERENCE[role];
  const ids = Array.from(cat.ids).sort();
  return role === Role.VISION ? ids.filter((i) => !TEXT_ONLY.test(i)) : ids;
}
