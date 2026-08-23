import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet, TextInput } from 'react-native';
import { C, S } from '../theme';
import { TARGETS } from '../config/targets';
import { Button, TickBox, Rule } from './atoms';
import { VERSION_NAME } from '../version';

/**
 * A flat list he arranged himself. Not a tree. design-language.md §9.
 * Several shops can be on at once, so these are tick-boxes and not radios. §6
 * What is stored is what is switched OFF, so a shop added in a later build
 * arrives live rather than invisible. §7
 */
export function SettingsSheet({ visible, disabled, overrides, onClose, onSave, onReset }) {
  const [local, setLocal] = useState(new Set(disabled));
  const [urls, setUrls] = useState({ ...overrides });

  React.useEffect(() => {
    if (visible) { setLocal(new Set(disabled)); setUrls({ ...overrides }); }
  }, [visible]);

  const toggle = (id) => {
    const n = new Set(local);
    n.has(id) ? n.delete(id) : n.add(id);
    setLocal(n);
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.header}>
            <Text style={st.title}>Shops</Text>
            <Text style={st.version}>{VERSION_NAME}</Text>
          </View>
          <Text style={st.hint}>
            Paste a direct product URL to pin a shop. A pinned URL is read instead of the
            search page and is the only way most of these give a reliable answer.
          </Text>
          <Rule />
          <ScrollView style={{ maxHeight: 420 }}>
            {TARGETS.map((t) => (
              <View key={t.id}>
                <TickBox
                  on={!local.has(t.id)}
                  label={t.name}
                  sub={t.region + (t.aggregator ? ' · usporednik' : '')}
                  onToggle={() => toggle(t.id)}
                />
                <TextInput
                  value={(urls[t.id] && urls[t.id].productUrl) || ''}
                  onChangeText={(v) =>
                    setUrls({ ...urls, [t.id]: { ...(urls[t.id] || {}), productUrl: v.trim() || undefined } })
                  }
                  placeholder="pinned product URL"
                  placeholderTextColor={C.inkDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={st.input}
                />
              </View>
            ))}
          </ScrollView>
          <Rule />
          <View style={st.footer}>
            <Button label="Reset" tone="ghost" compact onPress={onReset} />
            <Button label="Close" tone="slate" compact onPress={onClose} />
            <Button label="Save" compact onPress={() => onSave(local, prune(urls))} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const prune = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v && v.productUrl) out[k] = { productUrl: v.productUrl };
  return out;
};

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: S.pad, paddingBottom: 28, gap: S.gap,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.ink, fontSize: 20, fontWeight: '800' },
  version: { color: C.inkDim, fontSize: 12, fontWeight: '700' },
  hint: { color: C.inkDim, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.slate,
    color: C.ink, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, marginBottom: 6,
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: S.gap },
});
