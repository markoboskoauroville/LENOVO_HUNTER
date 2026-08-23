import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, AppState, RefreshControl, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { C, S } from './src/theme';
import { VERSION_NAME } from './src/version';
import { PRODUCTS, productById } from './src/config/products';
import { Stock, REGION_LABEL } from './src/core/types';
import { hunt, bestDeal, sortResults, groupByRegion, newlyInStock, SortMode } from './src/core/hunt';
import { initAlerts, announceMany } from './src/core/notify';
import { loadKeys } from './src/core/groq/keyring';
import {
  loadDisabled, saveDisabled, loadOverrides, saveOverrides,
  loadLast, saveLast, loadSort, saveSort, loadTab, saveTab, resetArrangement,
} from './src/core/storage';
import { BrowserAgent } from './src/core/browser/BrowserAgent';
import { StoreCard } from './src/ui/StoreCard';
import { SettingsSheet } from './src/ui/SettingsSheet';
import { ComparePage } from './src/ui/ComparePage';
import { Tabs } from './src/ui/Tabs';
import { Button, RadioRow, Rule } from './src/ui/atoms';

const COMPARE = 'compare';
const AUTO_SWEEP_MS = 8 * 60 * 1000;   // the browser tier is slower than a fetch

const pendingRows = (product) =>
  product.targets.map((t) => ({
    id: t.id, store: t.name, region: t.region, url: t.productUrl || t.searchUrl,
    aggregator: !!t.aggregator, status: Stock.PENDING, price: null, note: null,
    at: 0, ms: 0, tier: 'FETCH', candidates: [], verdict: null,
  }));

const allPending = () => {
  const o = {};
  PRODUCTS.forEach((p) => { o[p.id] = pendingRows(p); });
  return o;
};

export default function App() {
  const [tab, setTab] = useState('legion');
  const [rowsBy, setRowsBy] = useState(allPending);
  const [sweeping, setSweeping] = useState(null);      // productId or null
  const [stages, setStages] = useState({});            // storeId -> 'render' | 'vision'
  const [lastBy, setLastBy] = useState({});
  const [now, setNow] = useState(Date.now());
  const [sort, setSort] = useState(SortMode.REGION);
  const [disabledBy, setDisabledBy] = useState({});
  const [overrides, setOverrides] = useState({});
  const [hasKeys, setHasKeys] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [browserVisible, setBrowserVisible] = useState(false);

  const browserRef = useRef(null);
  const previous = useRef({});          // productId -> { storeId: result }
  const sweepLock = useRef(false);

  /* ------------------------------------------------------------ first frame */
  useEffect(() => {
    (async () => {
      await initAlerts();
      const [d, o, last, s, t, keys] = await Promise.all([
        loadDisabled(), loadOverrides(), loadLast(), loadSort(), loadTab(), loadKeys(),
      ]);
      setDisabledBy(d); setOverrides(o); setSort(s); setTab(t); setHasKeys(keys.length > 0);
      if (last && Object.keys(last).length) {
        const merged = allPending();
        const stamps = {};
        for (const p of PRODUCTS) {
          const saved = last[p.id];
          if (!saved) continue;
          const byId = index(saved.rows);
          merged[p.id] = merged[p.id].map((r) => byId[r.id] || r);
          stamps[p.id] = saved.at;
          previous.current[p.id] = byId;
        }
        setRowsBy(merged); setLastBy(stamps);
      }
      setBooted(true);
    })();
  }, []);

  useEffect(() => { if (booted && tab !== COMPARE) runSweep(tab); }, [booted]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || tab === COMPARE) return;
      const at = lastBy[tab];
      if (at && Date.now() - at > AUTO_SWEEP_MS) runSweep(tab);
    });
    return () => sub.remove();
  }, [tab, lastBy, disabledBy, overrides, hasKeys]);

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  /* ----------------------------------------------------------------- sweep */
  const runSweep = useCallback(async (productId) => {
    if (sweepLock.current || productId === COMPARE) return;
    sweepLock.current = true;
    setSweeping(productId);
    setStages({});

    const product = productById(productId);
    const disabled = disabledBy[productId] || new Set();

    setRowsBy((cur) => ({
      ...cur,
      [productId]: cur[productId].map((r) => (disabled.has(r.id) ? r : { ...r, status: Stock.PENDING, note: null, verdict: null })),
    }));

    const collected = [];
    try {
      await hunt({
        product,
        overrides,
        disabled,
        browser: browserRef.current,
        visionEnabled: hasKeys,
        onStage: (storeId, stage) => setStages((s) => ({ ...s, [storeId]: stage })),
        onResult: (r) => {
          collected.push(r);
          setRowsBy((cur) => ({ ...cur, [productId]: cur[productId].map((x) => (x.id === r.id ? r : x)) }));
        },
      });

      const prev = previous.current[productId] || {};
      const changed = newlyInStock(prev, collected);
      previous.current[productId] = { ...prev, ...index(collected) };

      const at = Date.now();
      setLastBy((m) => ({ ...m, [productId]: at }));
      const saved = await loadLast();
      await saveLast({ ...saved, [productId]: { at, rows: collected } });

      if (changed.length) await announceMany(changed.map((c) => ({ ...c, store: `${product.short} · ${c.store}` })));
    } catch (e) {
      console.warn('[sweep]', e && e.message);
    } finally {
      setSweeping(null);
      sweepLock.current = false;
      setStages({});
    }
  }, [disabledBy, overrides, hasKeys]);

  /* --------------------------------------------------------------- derived */
  const product = tab === COMPARE ? null : productById(tab);
  const rows = tab === COMPARE ? [] : (rowsBy[tab] || []);
  const disabled = disabledBy[tab] || new Set();
  const visible = useMemo(() => rows.filter((r) => !disabled.has(r.id)), [rows, disabled]);
  const best = useMemo(() => bestDeal(visible), [visible]);
  const sorted = useMemo(() => sortResults(visible, sort), [visible, sort]);
  const grouped = useMemo(() => groupByRegion(sorted), [sorted]);
  const inStock = visible.filter((r) => r.status === Stock.IN_STOCK).length;
  const busy = sweeping === tab;
  const at = lastBy[tab];

  const tabs = [
    ...PRODUCTS.map((p) => ({ id: p.id, label: p.short, accent: p.accent })),
    { id: COMPARE, label: 'Usporedi', accent: C.ink },
  ];

  /* ------------------------------------------------------------------- UI */
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>

        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>TABLET HUNTER</Text>
            <Text style={st.subtitle} numberOfLines={1}>
              {product ? product.label : 'tri tableta, jedan lov'}
            </Text>
          </View>
          <Button label="⚙" tone="ghost" compact onPress={() => setSettingsOpen(true)} />
        </View>

        <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); saveTab(t); }} />
        <Rule />

        {tab === COMPARE ? (
          <ComparePage resultsByProduct={rowsBy} onPick={(id) => { setTab(id); saveTab(id); }} />
        ) : (
          <>
            <View style={st.statusBar}>
              <Text style={st.statusText}>
                {busy ? 'Sweeping…' : at ? `Last sweep ${agoText(now - at)}` : 'not swept yet'}
              </Text>
              <Text style={[st.statusText, inStock ? { color: C.green } : null]}>
                {inStock} in stock · {hasKeys ? '👁 vision on' : 'vision off'}
              </Text>
            </View>

            <View style={st.controls}>
              <Button
                label={busy ? 'HUNTING…' : 'HUNT NOW'}
                onPress={() => runSweep(tab)}
                disabled={!!sweeping}
              />
              <View style={{ height: S.gap }} />
              <RadioRow
                value={sort}
                onChange={(v) => { setSort(v); saveSort(v); }}
                options={[
                  { value: SortMode.REGION, label: 'Region priority' },
                  { value: SortMode.CHEAPEST, label: 'Cheapest first' },
                ]}
              />
            </View>
            <Rule />

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: S.pad, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={false} onRefresh={() => runSweep(tab)} tintColor={C.amber} />}
            >
              {/* The browser is part of the screen, not a hidden trick. It is
                  always mounted — a WebView that is not laid out cannot be
                  photographed — and it is shown when Marko taps to watch it. */}
              <Text style={st.watch} onPress={() => setBrowserVisible((v) => !v)}>
                {browserVisible ? '▾ hide the browser' : '▸ watch the browser work'}
              </Text>
              <BrowserAgent ref={browserRef} visible={browserVisible} />

              {sort === SortMode.REGION
                ? grouped.map(({ region, rows: rr }) => rr.length ? (
                    <View key={region}>
                      <Text style={st.section}>{REGION_LABEL[region]}</Text>
                      {rr.map((r) => (
                        <StoreCard key={r.id} r={r} best={best} stage={stages[r.id]}
                          pending={r.status === Stock.PENDING} onPin={() => setSettingsOpen(true)} />
                      ))}
                    </View>
                  ) : null)
                : (
                  <View>
                    <Text style={st.section}>Cheapest first</Text>
                    {sorted.map((r) => (
                      <StoreCard key={r.id} r={r} best={best} stage={stages[r.id]}
                        pending={r.status === Stock.PENDING} onPin={() => setSettingsOpen(true)} />
                    ))}
                  </View>
                )}

              <Text style={st.footer}>
                {VERSION_NAME} · Mantra Productions · long-press a card to pin its product URL
              </Text>
            </ScrollView>
          </>
        )}

        <SettingsSheet
          visible={settingsOpen}
          productId={tab === COMPARE ? PRODUCTS[0].id : tab}
          disabled={disabled}
          overrides={overrides}
          onClose={async () => { setSettingsOpen(false); setHasKeys((await loadKeys()).length > 0); }}
          onSave={async (pid, d, o) => {
            const nd = { ...disabledBy, [pid]: d };
            const no = { ...overrides, [pid]: o };
            setDisabledBy(nd); setOverrides(no);
            await Promise.all([saveDisabled(nd), saveOverrides(no)]);
            setHasKeys((await loadKeys()).length > 0);
            setSettingsOpen(false);
            runSweep(pid);
          }}
          onReset={() => {
            Alert.alert('Reset', 'Put every shop back the way it shipped?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                onPress: async () => {
                  await resetArrangement();
                  setDisabledBy({}); setOverrides({}); setSettingsOpen(false);
                },
              },
            ]);
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const index = (list) => list.reduce((a, r) => { a[r.id] = r; return a; }, {});

function agoText(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.pad, paddingTop: S.gap, gap: S.gap },
  title: { color: C.amber, fontSize: 22, fontWeight: '900', letterSpacing: 1.2 },
  subtitle: { color: C.inkDim, fontSize: 12, marginTop: 2 },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.pad, paddingTop: S.gap },
  statusText: { color: C.inkDim, fontSize: 12, fontWeight: '600' },
  controls: { paddingHorizontal: S.pad, paddingVertical: S.gap },
  watch: { color: C.inkDim, fontSize: 11, marginBottom: S.gap },
  section: { color: C.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0.8, marginTop: S.gap, marginBottom: S.gap },
  footer: { color: C.inkDim, fontSize: 11, textAlign: 'center', marginTop: S.gapLg },
});
