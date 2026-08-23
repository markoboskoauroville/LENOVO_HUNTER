import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { C, S, DIM } from '../theme';
import { Stock } from '../core/types';
import { formatEUR } from '../core/parse';
import { Badge, Button, STATUS_FACE } from './atoms';

/**
 * One shop.
 *
 * Every element is rendered from the first frame and stays rendered. A card
 * waiting for its answer is the SAME card at reduced opacity — the price line
 * is there, the badge is there, the button is there. Nothing arrives, nothing
 * leaves, and the list never reflows mid-sweep.
 * design-language.md §1.
 */
export function StoreCard({ r, best, pending, onPin }) {
  const face = STATUS_FACE[r.status] || STATUS_FACE[Stock.UNKNOWN];
  const buyable = r.status === Stock.IN_STOCK;
  const isBest = best && best.id === r.id;

  return (
    <Pressable
      onLongPress={() => onPin && onPin(r)}
      delayLongPress={500}
      style={[
        st.card,
        isBest && { borderColor: C.amber, backgroundColor: C.surfaceHi },
        { opacity: pending ? DIM : 1 },
      ]}
    >
      {/* Row one: name on the left, state on the right. Two ends and a middle. §10 */}
      <View style={st.row}>
        <Text style={st.store} numberOfLines={1}>{r.store}</Text>
        <Badge text={face.label} colour={face.colour} filled={buyable} />
      </View>

      {/* Row two: the number on the left, the action on the right. */}
      <View style={[st.row, { marginTop: S.gap }]}>
        <View style={st.priceWrap}>
          <Text style={[st.price, buyable ? { color: C.ink } : { color: C.inkDim }]}>
            {formatEUR(r.price)}
          </Text>
          {isBest ? (
            <View style={st.bestBadge}>
              <Text style={st.bestText}>BEST DEAL</Text>
            </View>
          ) : null}
          {r.aggregator ? <Text style={st.agg}>usporednik</Text> : null}
        </View>

        <Button
          label={r.status === Stock.BLOCKED ? 'OPEN' : 'BUY NOW'}
          compact
          tone={buyable ? 'amber' : 'ghost'}
          onPress={() => Linking.openURL(r.url).catch(() => {})}
        />
      </View>

      {/* Row three: the one honest line about what happened. Always present so
          its absence never changes the card's height. */}
      <Text style={st.note} numberOfLines={2}>
        {pending ? 'waiting…' : (r.note || (r.ms ? `answered in ${(r.ms / 1000).toFixed(1)}s` : ' '))}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.slate,
    padding: S.pad,
    marginBottom: S.gap,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  store: { color: C.ink, fontSize: 16, fontWeight: '700', flexShrink: 1, marginRight: S.gap },
  priceWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  price: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  bestBadge: { backgroundColor: C.amber, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestText: { color: '#12161E', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  agg: { color: C.inkDim, fontSize: 10, fontStyle: 'italic' },
  note: { color: C.inkDim, fontSize: 11, marginTop: 10, minHeight: 28 },
});
