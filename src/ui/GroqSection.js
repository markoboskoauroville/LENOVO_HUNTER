import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { C, S } from '../theme';
import { Button, Rule } from './atoms';
import {
  ringStatus, importKeys, removeKey, reviveKey, parseKeys,
} from '../core/groq/keyring';
import { testOneKey } from '../core/groq/client';
import { modelFor, candidates, pinModel, Role, refreshCatalogue } from '../core/groq/models';

/**
 * The key ring, on screen.
 *
 * Everything here follows keyring.md §6 — see every key masked, see its state,
 * test ONE deliberately, delete, revive, import from a file. The one thing this
 * screen will never do is print a key. Not in a log line, not in an error, not
 * "just the middle bit". First six and last four, and that is all there is.
 */
export function GroqSection() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('no Groq key — vision is off, the hunt falls back to reading markup');
  const [vision, setVision] = useState(null);
  const [models, setModels] = useState([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const r = await ringStatus();
    setRows(r);
    setVision(await modelFor(Role.VISION));
    if (!r.length) setMsg('no Groq key — vision is off, the hunt falls back to reading markup');
    else setMsg(`${r.length} key${r.length === 1 ? '' : 's'} on the ring · ${r.filter((k) => k.state === 'dead').length} dead`);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** Import from a file. The file is read, the keys are taken by shape, and the
   *  file itself is never copied anywhere — secrets.md §2c. */
  const pickFile = useCallback(async () => {
    try {
      setBusy('file');
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || !res.assets.length) { setBusy(null); return; }
      const asset = res.assets[0];
      const blob = await FileSystem.readAsStringAsync(asset.uri);
      const r = await importKeys(blob);
      // By name and count, never by value. If he sent more than he meant to,
      // this is the moment he needs to hear it.
      setMsg(`${asset.name}: ${r.found} key-shaped strings found, ${r.added} new, ${r.total} on the ring`);
      // The cached copy the picker made is a file full of keys. Remove it.
      try { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); } catch {}
      await refresh();
    } catch (e) {
      setMsg(`could not read that file: ${String((e && e.message) || e).slice(0, 90)}`);
    } finally { setBusy(null); }
  }, [refresh]);

  const test = useCallback(async (row) => {
    setBusy(row.fp);
    const r = await testOneKey(row.key);
    const word =
      r.status >= 200 && r.status < 300 ? `works · ${r.models} models`
      : r.status === 429 ? `throttled${r.retryAfter ? `, ${r.retryAfter}s` : ''} — valid, just busy`
      : r.status === 401 || r.status === 403 ? 'rejected'
      : r.status === 0 ? 'no connection'
      : `HTTP ${r.status}`;
    setMsg(`${row.masked}: ${word}${r.message ? ` · ${r.message}` : ''}`);
    setBusy(null);
    await refresh();
  }, [refresh]);

  const loadModels = useCallback(async () => {
    setBusy('models');
    await refreshCatalogue(true);
    setModels(await candidates(Role.VISION));
    setOpen(true);
    setBusy(null);
  }, []);

  return (
    <View>
      <View style={st.head}>
        <Text style={st.title}>Groq · vision</Text>
        <Text style={st.model} numberOfLines={1}>{vision || '—'}</Text>
      </View>
      <Text style={st.msg} numberOfLines={3}>{msg}</Text>

      <View style={st.actions}>
        <Button label={busy === 'file' ? 'READING…' : 'IMPORT FROM FILE'} compact onPress={pickFile} disabled={!!busy} />
        <Button label="MODELS" tone="ghost" compact onPress={loadModels} disabled={!!busy} />
      </View>

      {open ? (
        <ScrollView style={st.models} nestedScrollEnabled>
          {models.map((m) => (
            <Text
              key={m}
              onPress={async () => { await pinModel(Role.VISION, m); setVision(m); setOpen(false); }}
              style={[st.modelRow, m === vision && { color: C.amber, fontWeight: '800' }]}
            >
              {m === vision ? '●' : '○'}  {m}
            </Text>
          ))}
          {!models.length ? <Text style={st.modelRow}>no catalogue — every key dead, throttled, or offline</Text> : null}
        </ScrollView>
      ) : null}

      <Rule />
      {rows.map((r) => (
        <View key={r.fp} style={st.keyRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.masked}>{r.masked}</Text>
            <Text style={[st.state, stateColour(r)]}>
              {r.state === 'dead' ? `✗ rejected${r.deadCode ? ` (${r.deadCode})` : ''}`
                : r.state === 'throttled' ? `◐ resting ${r.restSeconds}s`
                : '○ untested'}
            </Text>
          </View>
          <Button label="TEST" tone="ghost" compact onPress={() => test(r)} disabled={!!busy} />
          {r.state === 'dead'
            ? <Button label="REVIVE" tone="slate" compact onPress={async () => { await reviveKey(r.key); await refresh(); }} />
            : null}
          <Button label="✕" tone="ghost" compact onPress={async () => { await removeKey(r.key); await refresh(); }} />
        </View>
      ))}
      {!rows.length ? (
        <Text style={st.empty}>
          Pick a file of keys. They are found by shape — gsk_… — so a working note full of
          account names, dates and links is fine and nothing else in it is read.
        </Text>
      ) : null}
    </View>
  );
}

const stateColour = (r) =>
  r.state === 'dead' ? { color: C.red } : r.state === 'throttled' ? { color: C.amber } : { color: C.inkDim };

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.ink, fontSize: 15, fontWeight: '800' },
  model: { color: C.amber, fontSize: 11, fontWeight: '700', flexShrink: 1, marginLeft: S.gap },
  msg: { color: C.inkDim, fontSize: 11, lineHeight: 16, marginTop: 4, minHeight: 32 },
  actions: { flexDirection: 'row', gap: S.gap, marginVertical: S.gap },
  models: { maxHeight: 150, backgroundColor: C.surface, borderRadius: 8, padding: 8, marginBottom: S.gap },
  modelRow: { color: C.ink, fontSize: 12, paddingVertical: 5 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  masked: { color: C.ink, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  state: { fontSize: 11, marginTop: 2 },
  empty: { color: C.inkDim, fontSize: 11, lineHeight: 16, paddingVertical: S.gap },
});
