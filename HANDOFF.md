# HANDOFF — Tablet Hunter v2

**Written 23.8.2026. Everything below was measured against the live web and the live Groq API, not
assumed.**

---

## What v2 is, and why v1 had to be replaced

v1 read the HTML a server sends and guessed. It reported **Alternate.de: IN STOCK, €219,90** for a
Legion Tab. There is no Legion Tab at €219,90 — that was a **HYTE Y70 PC tower case** that happened
to match a search for "Y700". It reported Proshop in stock too; that was a **Wozinsky tempered glass
screen protector at €10,03**. The app would have said both out loud.

v2 does three things in order, and only the third may say IN STOCK.

| Tier | What it is | What it may claim |
|---|---|---|
| **FETCH** | plain HTTP, JSON-LD and markup | IN STOCK only from a **pinned product page** with a real schema.org offer |
| **BROWSER** | the page rendered in a real WebView with a Chrome user agent, read after its scripts ran | never IN STOCK — it reports and defers |
| **VISION** | the rendered page photographed while scrolling, judged by a Groq vision model | IN STOCK, with a price, if it can see the product |

The escalation can only ever **reduce** a claim. Nothing promotes a guess.

## The three tablets

| | Legion Y700 Gen 3 | iPlay 70 mini Ultra | Ultra Pad 13 |
|---|---|---|---|
| screen | 8.8" 2560×1600 144Hz | 8.8" 2560×1600 144Hz | 12.95" 2880×1840 144Hz |
| chip | Snapdragon 8s Gen 3 | Snapdragon 7+ Gen 3 | Snapdragon 7+ Gen 3 |
| RAM | 12 GB | 12 GB (20 GB version) | 24 GB (12 physical + 12 virtual) |
| battery | 6550 mAh, 68 W | 7300 mAh, 20 W | 15000 mAh, 33 W |
| seen at | €400–600 | €270–350 | €270–330 |

**The naming trap, written into the Ultra Pad's prompt on purpose:** ALLDOCUBE sell it as *Ultra Pad*
but Google Play and the certification papers call it *iPlay 70 Ultra*. Same tablet. A judge that does
not know that calls one of the two names a wrong_variant.

## The finding that reshaped the target lists

A real Chromium rendered the Croatian chains with a Chrome user agent and waited for their JavaScript
to finish. **Neither tablet is stocked by any of them.** Links.hr's search matched 31 tablets and not
one was a Y700 — the vision model read the page and named a Lenovo Tab K11 Plus and some Samsungs.
Mikronis and Nabava returned 404 for every search path tried.

These are China-market devices that reach Europe through importers and Amazon marketplace sellers. So
the target lists are now **per product** and led by Amazon.de/it/es, Giztop, AliExpress, Trading
Shenzhen and the ALLDOCUBE store, with the Croatian chains kept as a long shot.

## Groq: three traps, all measured on 23.8.2026

**1. The vision models everyone's example uses are gone.** `meta-llama/llama-4-scout-17b-16e-instruct`
and `llama-4-maverick` both return **404, does not exist**. The catalogue on these keys is thirteen
models and the one that can see is **`qwen/qwen3.6-27b`**. `openai/gpt-oss-120b` refuses an image
outright: *"messages[0].content must be a string"*.

**2. `reasoning_effort: 'none'` is not a tidiness preference.** On one shop screenshot qwen spent
**1900 completion tokens** reasoning its way to a one-line verdict. With reasoning off it spent
**53** and gave the same answer. The free tier's limit is **8000 tokens per minute**, so the thinking
version exhausts it after two images and every key looks throttled. Deciding what is in a photograph
is perception, not deduction.

**3. `json_validate_failed` arrives as HTTP 400** — which reads like a malformed request and is
nothing of the kind. It means the model was still reasoning when `max_completion_tokens` ran out, so
no JSON was ever emitted and `failed_generation` comes back empty. The fix is a **higher ceiling**,
not a corrected prompt. `client.js` retries once at 3× before giving up.

**The ring works.** Five keys, all 200 on `/models`. A live run hit a 429 with `retry-after: 14`, and
the ring rested that key and rolled forward to the next **invisibly** — the caller saw one answer,
slightly later. 429 never condemns. 401/403 does.

## TEST 2 — the whole pipeline, live

Real Chromium, Chrome UA, cookie wall dismissed, DOM read after scripts, screenshots while scrolling,
each one judged by the shipped prompt at temperature 0.

```
Lenovo Legion Tab Y700 Gen 3
  Alternate.de   wrong_product  saw: HYTE V70 Snow White, Tower-Gehäuse      12.9s
  Proshop        accessory      saw: Wozinsky Tab Tempered Glass ... €10,03   6.5s
  HGSPOT         not_found      "no products found"                          9.0s
  Links.hr       wrong_product  saw: Lenovo Tab K11 Plus, Samsung Galaxy     16.4s
  Giztop         blocked_page   Cloudflare CAPTCHA                            6.1s

ALLDOCUBE iPlay 70 mini Ultra
  Giztop         MATCH  €349.00  IN STOCK  saw: ALLDOCUBE iPLAY 70 MINI ULTRA  5.5s
  Alternate.de   wrong_product  saw: Alphacool Core 70 Tube Reservoir        12.8s
  Proshop        unclear        every key throttled at that moment            6.1s
  Links.hr       not_found      "Nisu pronađeni proizvodi"                   10.8s
```

**Every single one of v1's false positives is now correctly rejected, and the first true match in the
project's life is on the board.** Note the second row of the ALLDOCUBE block: a search for
"Alldocube iPlay 70" on Alternate returned an **Alphacool water cooling reservoir**. That is the trap
this app exists to survive.

## The verifier caught itself

`npm run verify` PASS 2 used to match target definitions with a regex. When the targets moved into a
helper function the regex stopped matching and the pass printed **"3 shops, 0 regions, all known"** —
a green tick for a check that examined nothing. It now imports the real modules through
`scripts/_nodebuild.js` (with Node shims for expo-crypto, AsyncStorage and react-native) and counts
real objects: **3 products, 37 shops, 7 verdicts, 15 spec rows × 3, 0 gaps.**

It then produced a false hit of its own, complaining that verdict "match" mapped to UNKNOWN. It does,
because the sample fed it had `in_stock: null`, and a match with no readable availability is not
stock. The check was wrong, not the code. Both are recorded in `verify.js` where they happened.

## The four tests

1. **The mechanism** — `npm run test:parse`, **42 passed, 0 failed**, including the collision that
   earns its keep: *"Nema na zalihi"* contains *"na zalihi"*, and *"nicht lieferbar"* contains
   *"lieferbar"*. Deliberately reversed to watch it go red at 38/4.
2. **The real thing** — the table above, plus five real keys against `/models` and two real vision
   calls on the screenshots that caught v1.
3. **The ugly cases** — supplied by the web: 403, 404, 503, a 15-second hang, a Cloudflare challenge,
   an Akamai proof-of-work page, a 429 mid-run, a 400 that was a truncation.
4. **The upgrade** — v1 → v2 **not run**. The storage keys moved from `lh.*.v1` to `lh.*.v2` because
   their shape changed from one product to three; the v1 keys are left in place and ignored rather
   than migrated, so a v1 install loses its pinned URLs and its OFF list. That is a deliberate,
   one-time cost and it is the thing to check first on a device that had v1.

## What is still untested

- **The WebView screenshot path has never run on a device.** `react-native-view-shot` capturing a
  `WebView` is the single riskiest thing in this build. The pipeline is proven — the same steps in
  Playwright produce the verdicts above — but Playwright's screenshot and Android's `captureRef` are
  not the same code. If the shots come back null the cards will say so and fall back to BROWSER tier
  rather than lying.
- **The notification, tone and spoken line still have never fired on a device.**
- **Background sweeping while the app is closed** is still not implemented, deliberately.
- **Amazon** remains fetch-blocked by Akamai and is left as OPEN-in-browser. Keepa or the Product
  Advertising API is the supported path and drops in behind the same adapter interface.
