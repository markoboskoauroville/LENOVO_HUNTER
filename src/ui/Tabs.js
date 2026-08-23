import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { C, S } from '../theme';

/**
 * Exactly one tab is in force, so the mark moves rather than accumulating —
 * the same reason the sort control is a radio. design-language.md §6.
 *
 * Each product carries its own accent, and that accent is the ONLY thing that
 * changes between tabs. The layout, the controls and their order are identical,
 * because these are views of one application and not four applications sharing
 * a window (§2).
 */
export function Tabs({ tabs, value, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.row}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} style={st.item}>
            <Text style={[st.label, on && { color: t.accent || C.amber, fontWeight: '800' }]} numberOfLines={1}>
              {t.label}
            </Text>
            {/* The underline is always drawn. On an inactive tab it is the
                background colour, so the row's height never changes when the
                selection moves. */}
            <View style={[st.bar, { backgroundColor: on ? (t.accent || C.amber) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { paddingHorizontal: S.pad, gap: S.gapLg, alignItems: 'flex-end' },
  item: { paddingTop: S.gap },
  label: { color: C.inkDim, fontSize: 14, fontWeight: '600' },
  bar: { height: 3, borderRadius: 2, marginTop: 6 },
});
