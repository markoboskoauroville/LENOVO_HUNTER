# LENOVO HUNTER

**v1** · Mantra Productions · Zagreb

A stock hunter for one object: the **Lenovo Legion Tab Y700 Gen 3** (TB321FU, 8.8", 12 GB / 256 GB).
Fourteen shops across Croatia, Germany and the wider EU, asked concurrently, sorted either by region
or by price, with a spoken alert the moment one of them crosses from out of stock to in stock.

Expo / React Native, so `eas build -p android --profile preview` produces an installable APK.

---

## Run it

```bash
npm install
npx expo install --fix       # aligns every expo-* package to your installed SDK
npm run verify               # must print GREEN before anything else
npx expo start               # dev
eas build -p android --profile preview   # the APK
```

`npm run probe` asks all fourteen shops from your laptop and prints what each one answered. Run it
whenever a card starts saying something odd — it separates *the shop changed* from *the parser is
wrong* in about twenty seconds.

## Pin the product URLs — this is the first thing to do

Ship state is a search URL per shop, and **a search URL is a guess.** Half these shops render their
results in JavaScript, so a plain fetch returns a page with no products in it at all; the other half
return a page with the wrong products on it.

Open the app, tap ⚙, and paste a direct product-page URL into each shop you care about. Until a shop
has one, the app will not report it IN STOCK no matter what the page says — see `guard()` in
`src/core/StoreScraper.js` and the reason it exists.

## Structure

```
App.js                       one screen, all of it
src/
  version.js                 the whole number, in one place
  theme.js                   the palette
  config/product.js          the thing being hunted
  config/targets.js          the fourteen shops, with measured notes
  core/
    types.js                 Stock / Region — the only vocabulary
    http.js                  headers, timeout, backoff, block detection
    parse.js                 JSON-LD → meta → selectors → regex
    StoreScraper.js          the adapter interface, and guard()
    hunt.js                  concurrent sweep, ranking, BEST DEAL
    notify.js                notification, tone, spoken line
    storage.js               what is switched OFF, and pinned URLs
  adapters/hr|de|eu/         one file per shop that needs more than the default
  ui/                        atoms, StoreCard, SettingsSheet
scripts/
  verify.js                  pre-push: structure, agreement, dead ends, secrets
  test-parse.mjs             TEST 1, 42 cases
  probe.mjs                  TEST 2, live, every adapter
assets/                      icon (measured 0.587), alarm.wav
```

## The architecture, in one paragraph

Every shop is a `StoreScraper`. It fetches one URL through `core/http.js` — which attaches the
desktop headers, gives the request a deadline, backs off with jitter, and recognises a bot challenge
— and hands the HTML to `parse()`. The default `parse()` is a four-layer cascade: **JSON-LD first**
(the shop's own machine-readable answer, published for Google and therefore maintained), then
microdata, then per-shop CSS selectors, then regex over the raw text. A redesign breaks layer three
and leaves one and four standing. `run()` never throws and always resolves, so one shop failing can
never end a sweep; `guard()` then has the last word on whether IN STOCK was actually earned.

## Extraction, not evasion

Shops that answer a plain request are read. Shops that serve a Cloudflare or Akamai challenge are
marked ⚠️ **BLOCKED** and their card offers **OPEN**, which puts the page in the real browser where
you are a real person. Nothing here solves a challenge, replays a token, or rotates an address. A
shop that installed bot protection has said what it wants.

That is also the pragmatic answer: Amazon's interstitial is a proof-of-work challenge that a fetch
cannot answer, and anything that could would break on their next deploy. For Amazon prices, use
**Keepa** or the **Product Advertising API** — both are supported paths meant for exactly this, and
an adapter for either drops straight into `src/adapters/` behind the same interface.

Requests are also polite by construction: one at a time per host, a floor of 1.5 s between them, five
shops in flight at once, no retry after a refusal, and a five-minute sweep. Fourteen page views every
five minutes is a person with a browser, and that is the load this app should ever produce.

## Design

Follows `MANTRA_MANIFEST/modules/design-language.md`. Every card is on screen from the first frame
and dims rather than disappearing (§1). Colour is the state channel and red is a fault only — a
blocked shop is amber, not red (§3). The sort switch is a radio because exactly one is in force (§6).
The shop list stores what is switched **off**, so a shop added in v2 arrives live (§7). Nothing
animates (§8). Rows have two ends and a middle (§10).

## Not covered

- Background sweeping while the app is closed. Android throttles background work hard and Expo's
  background task minimum is around 15 minutes with no guarantee. For a hunt that matters, keep the
  app open, or run the sweep on a small server and let it push.
- iOS. It will probably run; nothing has been tried.
