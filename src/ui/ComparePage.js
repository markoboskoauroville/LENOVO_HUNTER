import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { C, S } from '../theme';
import { PRODUCTS, SPEC_ROWS } from '../config/products';
import { Stock } from '../core/types';
import { formatEUR } from '../core/parse';
import { bestDeal } from '../core/hunt';

/**
 * The three side by side.
 *
 * Two halves, and they answer different questions. The top half is the live
 * hunt — what is actually in stock right now and for how much, which changes
 * every sweep. The bottom half is the specification sheet, which does not
 * change at all and is the reason one of them is worth waiting for.
 *
 * The table scrolls sideways rather than shrinking the columns, because a
 * column sized to a fraction of the screen turns "Snapdragon 7+ Gen 3" into
 * "Snapd…" and a spec you cannot read is not a comparison.
 * design-language.md §10, the last paragraph.
 */
export function ComparePage({ resultsByProduct, onPick }) {
  const cols = PRODUCTS;

  const live = useMemo(() => cols.map((p) => {
    const rows = resultsByProduct[p.id] || [];
    const best = bestDeal(rows);
    const inStock = rows.filter((r) => r.status === Stock.IN_STOCK).length;
    const asked = rows.filter((r) => r.status !== Stock.PENDING).length;
    return { best, inStock, asked, total: rows.length };
  }), [resultsByProduct, cols]);

  return (
    <ScrollView contentContainerStyle={{ padding: S.pad, paddingBottom: 48 }}>
      <Text style={st.h}>Stanje lova</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={st.row}>
          {cols.map((p, i) => (
            <Pressable key={p.id} style={[st.card, { borderColor: p.accent }]} onPress={() => onPick && onPick(p.id)}>
              <Text style={[st.name, { color: p.accent }]} numberOfLines={2}>{p.short}</Text>
              <Text style={st.sub} numberOfLines={2}>{p.spec}</Text>

              <Text style={[st.big, live[i].best ? { color: C.ink } : { color: C.inkDim }]}>
                {live[i].best ? formatEUR(live[i].best.price) : '—'}
              </Text>
              <Text style={st.where} numberOfLines={1}>
                {live[i].best ? live[i].best.store : 'nema na zalihi'}
              </Text>

              <View style={st.divider} />
              <Text style={[st.count, live[i].inStock ? { color: C.green } : null]}>
                {live[i].inStock} na zalihi
              </Text>
              <Text style={st.count}>{live[i].asked} / {live[i].total} trgovina provjereno</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={[st.h, { marginTop: S.gapLg }]}>Specifikacije</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[st.tr, st.trHead]}>
            <Text style={[st.th, st.cLabel]} />
            {cols.map((p) => (
              <Text key={p.id} style={[st.th, st.cVal, { color: p.accent }]} numberOfLines={2}>{p.short}</Text>
            ))}
          </View>
          {SPEC_ROWS.map(([key, label], n) => (
            <View key={key} style={[st.tr, n % 2 ? st.trAlt : null]}>
              <Text style={[st.td, st.cLabel, { color: C.inkDim }]}>{label}</Text>
              {cols.map((p) => (
                <Text key={p.id} style={[st.td, st.cVal]}>{(p.specs && p.specs[key]) || '—'}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={st.note}>
        Cijene u tablici su zadnje viđene na tržištu, ne rezultat lova. Broj iznad je ono što je
        lov stvarno našao i vizualno potvrdio.
      </Text>
    </ScrollView>
  );
}

const COL = 190;
const LABEL = 118;

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.6, marginBottom: S.gap },
  row: { flexDirection: 'row', gap: S.gap },
  card: {
    width: COL, backgroundColor: C.surface, borderRadius: S.radius,
    borderWidth: 1, padding: S.pad,
  },
  name: { fontSize: 15, fontWeight: '800' },
  sub: { color: C.inkDim, fontSize: 11, marginTop: 2, minHeight: 28 },
  big: { fontSize: 24, fontWeight: '800', marginTop: S.gap },
  where: { color: C.inkDim, fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.slate, marginVertical: S.gap },
  count: { color: C.inkDim, fontSize: 11, marginTop: 2 },

  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
  trHead: { borderBottomWidth: 1, borderBottomColor: C.slate },
  trAlt: { backgroundColor: C.surface },
  th: { fontSize: 12, fontWeight: '800' },
  td: { color: C.ink, fontSize: 12, lineHeight: 17 },
  cLabel: { width: LABEL, paddingRight: S.gap },
  cVal: { width: COL, paddingRight: S.gap },
  note: { color: C.inkDim, fontSize: 11, lineHeight: 16, marginTop: S.gapLg },
});
