import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S } from '../theme';
import { Stock } from '../core/types';

/* Colour carries state, and it is the only channel that does.
   design-language.md §3. Red is reserved for a real fault. */
export const STATUS_FACE = {
  [Stock.IN_STOCK]:     { label: 'IN STOCK',     colour: C.green },
  [Stock.PREORDER]:     { label: 'PRE-ORDER',    colour: C.blue },
  [Stock.OUT_OF_STOCK]: { label: 'OUT OF STOCK', colour: C.inkDim },
  [Stock.BLOCKED]:      { label: '⚠ BLOCKED',    colour: C.amber },
  [Stock.ERROR]:        { label: 'ERROR',        colour: C.red },
  [Stock.UNKNOWN]:      { label: 'UNCLEAR',      colour: C.inkDim },
  [Stock.PENDING]:      { label: 'WAITING',      colour: C.slate },
};

export function Badge({ text, colour, filled }) {
  return (
    <View style={[
      st.badge,
      filled ? { backgroundColor: colour } : { backgroundColor: 'transparent' },
    ]}>
      <Text style={[st.badgeText, { color: filled ? C.bg : colour }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** A press target that says what the next press does, never what is happening. */
export function Button({ label, onPress, tone = 'amber', disabled, compact }) {
  const bg = tone === 'amber' ? C.amber : tone === 'slate' ? C.slate : 'transparent';
  const fg = tone === 'amber' ? '#12161E' : C.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        st.btn,
        compact && st.btnCompact,
        { backgroundColor: bg, opacity: disabled ? 0.38 : pressed ? 0.8 : 1 },
        tone === 'ghost' && { borderWidth: 1, borderColor: C.slate },
      ]}
    >
      <Text style={[st.btnText, { color: fg }, compact && { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

/** Exactly one in force — so it is a radio, not a row of tick-boxes. §6 */
export function RadioRow({ options, value, onChange }) {
  return (
    <View style={st.radioRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={st.radioItem}>
            <View style={[st.radioDot, on && { borderColor: C.amber }]}>
              {on ? <View style={st.radioFill} /> : null}
            </View>
            <Text style={[st.radioLabel, on && { color: C.ink }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TickBox({ on, label, sub, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={st.tickRow}>
      <View style={[st.tick, on && { backgroundColor: C.amber, borderColor: C.amber }]}>
        {on ? <Text style={st.tickMark}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.tickLabel, !on && { color: C.inkDim }]}>{label}</Text>
        {sub ? <Text style={st.tickSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export const Rule = () => <View style={st.rule} />;

const st = StyleSheet.create({
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    minWidth: 96, alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  btn: {
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCompact: { paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { fontWeight: '800', fontSize: 15, letterSpacing: 0.4 },
  radioRow: { flexDirection: 'row', gap: S.gap },
  radioItem: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  radioDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.slate,
    alignItems: 'center', justifyContent: 'center',
  },
  radioFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },
  radioLabel: { color: C.inkDim, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: S.gap, paddingVertical: 10 },
  tick: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: C.slate,
    alignItems: 'center', justifyContent: 'center',
  },
  tickMark: { color: '#12161E', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  tickLabel: { color: C.ink, fontSize: 15, fontWeight: '600' },
  tickSub: { color: C.inkDim, fontSize: 11, marginTop: 2 },
  rule: { height: 1, backgroundColor: C.slate, opacity: 0.5 },
});
