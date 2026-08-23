// The script injected into the page. It runs inside the shop's own document,
// after its JavaScript has finished, which is the entire reason the browser
// layer exists: half these shops render their product grid client-side and a
// plain fetch sees a page with no products in it at all.
//
// It returns data only. It clicks nothing, submits nothing, and answers no
// challenge — if a bot check is on screen it says so and stops.

export const EXTRACTOR = (hintsJson) => `
(function () {
  try {
    var HINTS = ${hintsJson};
    var out = { ok: true, url: location.href, title: document.title, jsonld: [], links: [], text: '', challenged: false, scrollHeight: 0, scrollY: 0 };

    var bodyText = (document.body ? document.body.innerText : '') || '';
    out.text = bodyText.replace(/\\s+/g, ' ').slice(0, 8000);
    out.scrollHeight = document.documentElement.scrollHeight;
    out.scrollY = window.scrollY;

    // A challenge is a fact about the page, not an obstacle to work around.
    out.challenged = /just a moment|checking your browser|sichere verbindung wird|verify you are human|enter the characters you see|captcha|cf-chl|bm-verify/i.test(bodyText)
      || !!document.querySelector('#challenge-form, #cf-challenge-running, [id*="captcha" i]');

    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try { out.jsonld.push(JSON.parse(s.textContent)); } catch (e) {}
    });

    var seen = {}, re = new RegExp(HINTS.join('|'), 'i');
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length && out.links.length < 40; i++) {
      var a = anchors[i];
      var t = (a.innerText || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
      var img = a.querySelector('img');
      var alt = img ? (img.getAttribute('alt') || '') : '';
      var h = a.href;
      if (!h || seen[h]) continue;
      if (!re.test(t + ' ' + alt + ' ' + h)) continue;
      seen[h] = 1;
      out.links.push({ text: (t || alt).slice(0, 140), href: h });
    }
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e).slice(0, 200) });
  }
})();
true;`;

/** Scroll one screen and report where we ended up. */
export const SCROLL_STEP = `
(function () {
  var before = window.scrollY;
  window.scrollBy(0, Math.round(window.innerHeight * 0.85));
  return JSON.stringify({ before: before, after: window.scrollY, height: document.documentElement.scrollHeight });
})();
true;`;

/** Cookie walls hide the content behind them, so the page is unreadable until
 *  one is dismissed. This clicks ONLY buttons whose visible text is a plain
 *  accept, and it clicks nothing else on any page, ever. */
export const ACCEPT_COOKIES = `
(function () {
  var WORDS = ['alle akzeptieren','akzeptieren','zustimmen','alle zulassen','einverstanden',
               'prihvaćam sve','prihvati sve','prihvaćam','prihvati','slažem se',
               'accept all','accept','allow all','i agree','got it','ok'];
  var els = document.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"], div[role="button"]');
  for (var i = 0; i < els.length; i++) {
    var e = els[i];
    var t = ((e.innerText || e.value || '') + '').trim().toLowerCase();
    if (!t || t.length > 24) continue;
    if (WORDS.indexOf(t) === -1) continue;
    var r = e.getBoundingClientRect();
    if (r.width < 20 || r.height < 12) continue;
    e.click();
    return JSON.stringify({ clicked: t });
  }
  return JSON.stringify({ clicked: null });
})();
true;`;
