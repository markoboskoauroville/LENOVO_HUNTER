import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar, AppState, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { C, S, DIM } from './src/theme';
import { VERSION_NAME } from './src/version';
import { PRODUCT } from './src/config/product';
import { TARGETS } from './src/config/targets';
import { Stock, REGION_LABEL, REGION_ORDER } from './src/core/types';
import { hunt, bestDeal, sortResults, groupByRegion, newlyInStock, SortMode } from './src/core/hunt';
import { initAlerts, announceMany } from './src/core/notify';
import {
  loadDisabled, saveDisabled, loadOverrides, saveOverrides,
  loadLast, saveLast, loadSort, saveSort, resetArrangement,
} from './src/core/storage';
import { StoreCard } from './src/ui/StoreCard';
import { SettingsSheet } from './src/ui/SettingsSheet';
import { Button, RadioRow, Rule } from './src/ui/atoms';

const AUTO_SWEEP_MS = 5 * 60 * 1000;

/** Every shop exists on screen before the first request is sent. §1 */
const pendingRows = () =>
  TARGETS.map((t) => ({
    id: t.id, store: t.name, region: t.region, url: t.productUrl || t.searchUrl,
    aggregator: !!t.aggregator, status: Stock.PENDING, price: null, note: null, at: 0, ms: 0,
  }));

export default function App() {
  const [rows, setRows] = useState(pendingRows);
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sort, setSort] = useState(SortMode.REGION);
  const [disabled, setDisabled] = useState(new Set());
  const [overrides, setOverrides] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  const previous = useRef({});          // id -> last result, for the change test
  const sweepLock = useRef(false);      // two sweeps at once is thirteen shops twice

  /* ------------------------------------------------------------ first frame */
  useEffect(() => {
    (async () => {
      await initAlerts();
      const [d, o, last, s] = await Promise.all([
        loadDisabled(), loadOverrides(), loadLast(), loadSort(),
      ]);
      setDisabled(d); setOverrides(o); setSort(s);
      if (last && last.rows) {
        setRows(mergeIntoPending(last.rows));
        setLastSweep(last.at);
        previous.current = byId(last.rows);
      }
      setBooted(true);
    })();
  }, []);

  /* A full check the moment the app opens, exactly as asked — but only once the
     saved state is loaded, so the first sweep compares against the last one and
     does not shout about stock that was already there when the app was closed. */
  useEffect(() => { if (booted) runSweep(false); }, [booted]);

  /* Reopening the app after a while is the same event as opening it. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && lastSweep && Date.now() - lastSweep > AUTO_SWEEP_MS) runSweep(false);
    });
    return () => sub.remove();
  }, [lastSweep, disabled, overrides]);

  /* The clock. One tick a second, and it moves a number — not an animation the
     eye has to follow. §8 */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Automatic re-sweep while the app is open. */
  useEffect(() => {
    const t = setInterval(() => {
      if (!sweepLock.current) runSweep(false);
    }, AUTO_SWEEP_MS);
    return () => clearInterval(t);
  }, [disabled, overrides]);

  /* ----------------------------------------------------------------- sweep */
  const runSweep = useCallback(async (manual) => {
    if (sweepLock.current) return;
    sweepLock.current = true;
    setSweeping(true);

    // Dim what is about to be re-asked. The rows stay where they are.
    setRows((cur) => cur.map((r) => (disabled.has(r.id) ? r : { ...r, status: Stock.PENDING, note: null })));

    const collected = [];
    try {
      await hunt({
        overrides,
        disabled,
        onResult: (r) => {
          collected.push(r);
          setRows((cur) => cur.map((x) => (x.id === r.id ? r : x)));
        },
      });

      const changed = newlyInStock(previous.current, collected);
      previous.current = { ...previous.current, ...byId(collected) };

      const at = Date.now();
      setLastSweep(at);
      await saveLast({ at, rows: collected });

      if (changed.length) await announceMany(changed);
    } catch (e) {
      console.warn('[sweep]', e && e.message);
    } finally {
      setSweeping(false);
      sweepLock.current = false;
    }
  }, [disabled, overrides]);

  /* --------------------------------------------------------------- derived */
  const visible = useMemo(() => rows.filter((r) => !disabled.has(r.id)), [rows, disabled]);
  const best = useMemo(() => bestDeal(visible), [visible]);
  const sorted = useMemo(() => sortResults(visible, sort), [visible, sort]);
  const grouped = useMemo(() => groupByRegion(sorted), [sorted]);
  const inStockCount = visible.filter((r) => r.status === Stock.IN_STOCK).length;

  const sinceText = lastSweep ? agoText(now - lastSweep) : 'never';
  const nextIn = lastSweep ? Math.max(0, AUTO_SWEEP_MS - (now - lastSweep)) : 0;

  /* ------------------------------------------------------------------- UI */
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>

        {/* Header: title in the middle of two ends, never piled in one corner. §10 */}
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>LENOVO HUNTER</Text>
            <Text style={st.subtitle} numberOfLines={1}>
              {PRODUCT.label} · {PRODUCT.spec}
            </Text>
          </View>
          <Button label="⚙" tone="ghost" compact onPress={() => setSettingsOpen(true)} />
        </View>

        <View style={st.statusBar}>
          <Text style={st.statusText}>
            {sweeping ? 'Sweeping…' : `Last sweep ${sinceText}`}
          </Text>
          <Text style={[st.statusText, { color: inStockCount ? C.green : C.inkDim }]}>
            {inStockCount} in stock · next {Math.ceil(nextIn / 1000)}s
          </Text>
        </View>

        <View style={st.controls}>
          <Button
            label={sweeping ? 'HUNTING…' : 'HUNT NOW'}
            onPress={() => runSweep(true)}
            disabled={sweeping}
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
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => runSweep(true)} tintColor={C.amber} />
          }
        >
          {sort === SortMode.REGION
            ? grouped.map(({ region, rows: rr }) =>
                rr.length ? (
                  <View key={region}>
                    <Text style={st.section}>{REGION_LABEL[region]}</Text>
                    {rr.map((r) => (
                      <StoreCard
                        key={r.id} r={r} best={best}
                        pending={r.status === Stock.PENDING}
                        onPin={() => setSettingsOpen(true)}
                      />
                    ))}
                  </View>
                ) : null
              )
            : (
              <View>
                <Text style={st.section}>Cheapest first</Text>
                {sorted.map((r) => (
                  <StoreCard
                    key={r.id} r={r} best={best}
                    pending={r.status === Stock.PENDING}
                    onPin={() => setSettingsOpen(true)}
                  />
                ))}
              </View>
            )}

          <Text style={st.footer}>
            {VERSION_NAME} · Mantra Productions · long-press a card to pin its product URL
          </Text>
        </ScrollView>

        <SettingsSheet
          visible={settingsOpen}
          disabled={disabled}
          overrides={overrides}
          onClose={() => setSettingsOpen(false)}
          onSave={async (d, o) => {
            setDisabled(d); setOverrides(o);
            await Promise.all([saveDisabled(d), saveOverrides(o)]);
            setSettingsOpen(false);
            runSweep(true);
          }}
          onReset={() => {
            Alert.alert('Reset', 'Put every shop back the way it shipped?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                onPress: async () => {
                  await resetArrangement();
                  setDisabled(new Set()); setOverrides({});
                  setSettingsOpen(false);
                },
              },
            ]);
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ------------------------------------------------------------------ helpers */

const byId = (list) => list.reduce((a, r) => { a[r.id] = r; return a; }, {});

const mergeIntoPending = (saved) => {
  const map = byId(saved);
  return pendingRows().map((p) => map[p.id] || p);
};

function agoText(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.pad, paddingTop: S.gap, gap: S.gap,
  },
  title: { color: C.amber, fontSize: 22, fontWeight: '900', letterSpacing: 1.2 },
  subtitle: { color: C.inkDim, fontSize: 12, marginTop: 2 },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: S.pad, paddingTop: S.gap,
  },
  statusText: { color: C.inkDim, fontSize: 12, fontWeight: '600' },
  controls: { paddingHorizontal: S.pad, paddingVertical: S.gap },
  section: {
    color: C.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0.8,
    marginTop: S.gap, marginBottom: S.gap,
  },
  footer: { color: C.inkDim, fontSize: 11, textAlign: 'center', marginTop: S.gapLg },
});
