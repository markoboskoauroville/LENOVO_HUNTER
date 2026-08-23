import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { C, S } from '../../theme';
import { EXTRACTOR, SCROLL_STEP, ACCEPT_COOKIES } from './extractor';

// ---------------------------------------------------------------------------
// A real browser, doing what a real browser does.
// ---------------------------------------------------------------------------
//
// This is the answer to what broke v1: a plain fetch sees the HTML the server
// sends, and half these shops send a shell and fill it in with JavaScript. A
// real Chromium was used to confirm exactly that — Links.hr's search page
// arrives with the furniture and no products, and only after its scripts run
// does the grid exist. So the page is RENDERED, then read, then photographed.
//
// What this does NOT do, deliberately:
//   * It does not answer a bot challenge. When one appears it says so, stops,
//     and the card offers OPEN so Marko can look at the page himself. A shop
//     that installed a challenge has said what it wants.
//   * It clicks nothing except a plainly-labelled cookie accept button, because
//     a cookie wall hides the content and there is nothing behind it to consent
//     to except being able to read the page.
//   * It runs one page at a time, with the same politeness floor as the fetch
//     path. Fourteen page views every few minutes is a person with a browser.
//
// The desktop Chrome user agent is sent because these shops serve a different
// (and sometimes empty) page to something that does not look like a browser,
// and the page being read here IS being rendered by a browser.

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const DEFAULTS = {
  settleMs: 3500,        // let the shop's own scripts finish
  afterCookieMs: 1500,
  shots: 3,              // the top of the page, then two screens down
  perShotMs: 900,
  timeoutMs: 45000,
};

/**
 * Imperative handle:
 *   visit(url, { hints, shots }) -> { ok, url, title, challenged, data, shots: [base64…] }
 *
 * Never throws. A page that will not load is a result, not an exception.
 */
export const BrowserAgent = forwardRef(function BrowserAgent({ visible, onStatus }, ref) {
  const webRef = useRef(null);
  const shotRef = useRef(null);
  const pending = useRef(null);          // { resolve, buffer }
  const [uri, setUri] = useState('about:blank');
  const [label, setLabel] = useState('idle');

  const say = useCallback((s) => { setLabel(s); if (onStatus) onStatus(s); }, [onStatus]);

  // Injected scripts answer through this channel.
  const runJs = useCallback((js, tag) => new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2, 8);
    pending.current = pending.current || {};
    pending.current[id] = resolve;
    const wrapped = `
      (function(){
        try {
          var r = (function(){ ${js.replace(/\btrue;\s*$/, '')} })();
          window.ReactNativeWebView.postMessage(JSON.stringify({__id:'${id}', tag:'${tag}', payload:r}));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({__id:'${id}', tag:'${tag}', error:String(e)}));
        }
      })(); true;`;
    if (webRef.current) webRef.current.injectJavaScript(wrapped);
    setTimeout(() => {
      if (pending.current && pending.current[id]) {
        const f = pending.current[id]; delete pending.current[id]; f(null);
      }
    }, 12000);
  }), []);

  const onMessage = useCallback((e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.__id && pending.current && pending.current[msg.__id]) {
      const f = pending.current[msg.__id];
      delete pending.current[msg.__id];
      f(msg.error ? null : msg.payload);
    }
  }, []);

  const loaded = useRef(null);
  const onLoadEnd = useCallback(() => { if (loaded.current) { const f = loaded.current; loaded.current = null; f(true); } }, []);
  const onError = useCallback(() => { if (loaded.current) { const f = loaded.current; loaded.current = null; f(false); } }, []);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const snap = useCallback(async () => {
    try {
      // JPEG, small, because it is going over the wire to a vision model and
      // 760px wide is measured to be plenty for reading a shop page.
      return await captureRef(shotRef, { format: 'jpg', quality: 0.7, result: 'base64', width: 760 });
    } catch (e) {
      return null;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    async visit(url, opts = {}) {
      const cfg = { ...DEFAULTS, ...opts };
      const hints = JSON.stringify(opts.hints || []);
      const out = { ok: false, url, title: null, challenged: false, data: null, shots: [], note: null };

      try {
        say(`loading ${hostOf(url)}`);
        const ok = await Promise.race([
          new Promise((res) => { loaded.current = res; setUri(url); }),
          sleep(cfg.timeoutMs).then(() => 'timeout'),
        ]);
        if (ok === 'timeout') { out.note = `no answer within ${Math.round(cfg.timeoutMs / 1000)}s`; return out; }
        if (ok === false) { out.note = 'the page failed to load'; return out; }

        await sleep(cfg.settleMs);

        say('cookie wall');
        const ck = await runJs(ACCEPT_COOKIES, 'cookies');
        if (ck) { try { if (JSON.parse(ck).clicked) await sleep(cfg.afterCookieMs); } catch {} }

        say('reading the page');
        const raw = await runJs(EXTRACTOR(hints), 'extract');
        if (raw) { try { out.data = JSON.parse(raw); } catch {} }
        out.title = out.data ? out.data.title : null;
        out.challenged = !!(out.data && out.data.challenged);

        if (out.challenged) {
          // Stop here. No screenshots, no retries, no cleverness.
          out.note = 'the shop served a bot challenge instead of the page';
          out.ok = true;
          return out;
        }

        for (let i = 0; i < cfg.shots; i++) {
          say(`screenshot ${i + 1} of ${cfg.shots}`);
          const b64 = await snap();
          if (b64) out.shots.push(b64);
          if (i < cfg.shots - 1) {
            const s = await runJs(SCROLL_STEP, 'scroll');
            await sleep(cfg.perShotMs);
            if (s) {
              try {
                const j = JSON.parse(s);
                if (j.after <= j.before) break;      // the page ended
              } catch {}
            }
          }
        }
        out.ok = true;
        return out;
      } catch (e) {
        out.note = `browser: ${String((e && e.message) || e).slice(0, 120)}`;
        return out;
      } finally {
        say('idle');
        setUri('about:blank');
      }
    },
  }), [runJs, snap, say]);

  // The browser panel is always mounted and always occupies its space. It dims
  // when idle rather than disappearing, so nothing on this screen ever moves.
  return (
    <View style={[st.wrap, !visible && st.hidden]} pointerEvents="none">
      <View ref={shotRef} collapsable={false} style={st.frame}>
        <WebView
          ref={webRef}
          source={{ uri }}
          userAgent={CHROME_UA}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onError={onError}
          onHttpError={onError}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          startInLoadingState={false}
          style={st.web}
        />
      </View>
      {visible ? <Text style={st.label} numberOfLines={1}>{label}</Text> : null}
    </View>
  );
});

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

const st = StyleSheet.create({
  wrap: { height: 300, backgroundColor: C.surface, borderRadius: S.radius, overflow: 'hidden', marginBottom: S.gap },
  // Off-screen rather than unmounted: a WebView that is not laid out cannot be
  // photographed, and one that is unmounted has to reload from nothing.
  hidden: { position: 'absolute', left: -10000, top: 0, width: 760, height: 1100, opacity: 0 },
  frame: { flex: 1, backgroundColor: '#FFFFFF' },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  label: { color: C.inkDim, fontSize: 11, padding: 6 },
});
