# HANDOFF — Lenovo Hunter v1

**Written 22.8.2026, at the end of the session that built it. Everything below was measured, not
assumed. Where it says measured, somebody made the request and read the answer.**

---

## What was measured, and what each shop actually did

Two runs against the live web on 22.8.2026 — first with `curl` and desktop headers, then with the
real adapter classes through `npm run probe`. Both agreed.

| Shop | Region | Answered | What it means |
|---|---|---|---|
| HGSPOT | HR | **200**, server-rendered, JSON-LD present | the friendliest of the fourteen |
| Links.hr | HR | **200**, 558 KB, **no products in it** | nopCommerce, results rendered client-side |
| Sancta Domenica | HR | **403**, Cloudflare `cf_chl_opt` | also redirects to bigbang.hr |
| Mikronis | HR | **404** | the shipped search path is a guess and it is wrong |
| Instar Informatika | HR | **503 after 15.3 s** | slow or refusing; either way it times out |
| Nabava.net | HR | **404** / **503** on two runs | the shipped search path is a guess |
| Amazon.de / .it / .es | DE, EU | **Akamai interstitial**, `bm-verify` proof-of-work | not fetchable, by design |
| Cyberport | DE | **403** | first run was blocked by the build machine's own egress, second was a real 403 |
| Alternate.de | DE | **200**, 172 KB server-rendered | works |
| Computeruniverse | DE | **403** | as Cyberport |
| Geizhals.de | DE | **200** on the first run, **403** on the second | rate-limited after a handful of requests |
| Proshop | EU | **200**, but Cloudflare is in front of it | works today; may not tomorrow |

**The headline: nine of fourteen refuse a plain request.** That is not a defect in this app and no
amount of cleverness changes it. It is why BLOCKED is a first-class state with its own colour and its
own button rather than an error, and why the shops that do answer are worth pinning properly.

## The bug the live run found, and the guard that came out of it

The first probe reported **HGSPOT: IN_STOCK, no price** and **Alternate.de: IN_STOCK, €219,90**.

Both were false. A Y700 Gen 3 is not €219,90 — that was some other tablet on a search page that also
happened to mention "Y700" somewhere and contained stock wording. The app would have played the tone
and spoken *"LENOVO IN STOCK - Alternate.de - €219,90"* out loud.

So `StoreScraper.guard()` now has the last word on every result, and IN_STOCK must be earned:

- **a price, always** — stock wording with no number is not a purchase
- **a pinned product URL**, unless the shop is an aggregator whose whole page is a list of offers

Everything else downgrades to UNKNOWN with the reason on the card. A missed alert costs one refresh.
A false one at three in the morning costs trust in every alert after it.

## The four tests

**TEST 1 — the mechanism, alone.** `npm run test:parse`. **42 passed, 0 failed.** Prices in five
formats, the German `429,-` shorthand, both thousands conventions, the floor and ceiling and one
either side of each, malformed JSON-LD, `@graph` nesting, `AggregateOffer`, and a breadcrumb block
that must not win over the product block.

The case that earns its keep: **"Nema na zalihi" contains "na zalihi"**, and "nicht lieferbar"
contains "lieferbar". A positive-first scan calls every sold-out page in Croatia and Germany in
stock. Negatives are therefore tested first, and **that ordering was deliberately reversed to confirm
the suite goes red: 38 passed, 4 failed, exactly the four collision cases.** A test never seen to
fail is a rumour.

**TEST 2 — the real thing.** `npm run probe`, all fourteen adapters, live. Results in the table
above. After the guard: `UNKNOWN: 3 · BLOCKED: 9 · ERROR: 2`, and no false IN_STOCK.

**TEST 3 — the ugly cases.** Exercised for real rather than simulated, because the web supplied them:
403 (four shops), 404 (two), 503 (two), a 15-second hang ended by the deadline, a Cloudflare
challenge page, an Akamai proof-of-work page, and malformed JSON-LD. In every one the sweep completed
and the other shops were unaffected.

**TEST 4 — the upgrade.** *Not run. There is no previous version.* When v2 ships, the things that
will already be on the device are the AsyncStorage keys `lh.disabled.v1`, `lh.overrides.v1`,
`lh.last.v1`, `lh.sort.v1` — bump the suffix only if a meaning changes, and remember Android reports
a forgotten `versionCode` bump as *app not installed*, which mentions nothing about versions.

## The icon

Reticle, one shape, gold `#E8B15C` on near-black `#12161E` — contrast 9.38. Measured against
`app-icon.md` §3: **symbol ÷ visible circle = 0.587**, inside the 0.55–0.60 band and beside Google
Cloud's 0.579. Source in `assets/icon-source.svg`; the generator prints the ratio and the verdict.

## Version

v1. `src/version.js` is the only place the number is written; `app.json` carries `version: "1"` and
`versionCode: 1`, and `npm run verify` fails if the three ever disagree. APK name derives from the
constant: `1-lenovo-hunter-v1.apk`.

## What to do first, in order

1. `npm install && npx expo install --fix`
2. `npm run verify` — expect GREEN
3. `npm run probe` — see for yourself which shops answer today
4. **Pin product URLs** in ⚙ for HGSPOT, Links.hr and Alternate.de at minimum. Until then the app is
   honest but nearly silent, which is the correct behaviour and not a bug.
5. Fix the two guessed search paths — Mikronis and Nabava.net both 404. Find the real ones in a
   browser and put them in `src/config/targets.js`.

## What is not tested and not built

- **Background sweeping while the app is closed.** Not implemented. `expo-background-task` is in
  package.json and nothing registers a task, deliberately: Android's minimum is about 15 minutes and
  it is not honoured under Doze. Written down rather than half-built, because a half-built background
  sweep looks like a working one until the day it matters.
- **iOS.** Nothing tried.
- **The notification, the tone and the spoken line have never fired on a device**, because no shop
  reported real stock during the build. The path is wired and `announceMany` is called from the
  sweep, but *this is the single largest untested thing in the project.* Test it by hand: set a
  shop's previous status to OUT_OF_STOCK in storage, pin a URL to something in stock, and sweep.
- **Cyberport and Computeruniverse** were unreachable from the build machine on the first run for a
  reason that had nothing to do with them — the sandbox's own egress policy. Their second-run 403 is
  real, but they deserve one honest attempt from the phone before you believe it.
- **Geizhals rate-limits.** It answered 200 and then 403 within ten minutes. It is the most valuable
  target of the fourteen — when it lists the product it lists every German shop's price — so it is
  worth pinning a direct product URL and sweeping it gently rather than often.
