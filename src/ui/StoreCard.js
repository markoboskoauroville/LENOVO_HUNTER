import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { C, S, DIM } from '../theme';
import { Stock, Tier } from '../core/types';
import { formatEUR } from '../core/parse';
import { Badge, Button, STATUS_FACE } from './atoms';

/**
 * One shop, for one product.
 *
 * Every element renders from the first frame and stays. A card waiting for its
 * answer is the SAME card at reduced opacity — the price line is there, the
 * badge is there, the button is there. Nothing arrives, nothing leaves, and the
 * list never reflows mid-sweep. design-language.md §1.
 *
 * The tier mark is small and it matters: "a fetch read some markup" and "a
 * browser rendered the page and a vision model looked at the photograph" are
 * not the same claim, and after v1 they must never look the same on screen.
 */
export function StoreCard({ r, best, pending, stage, onPin }) {
  const face = STATUS_FACE[r.status] || STATUS_FACE[Stock.UNKNOWN];
  const buyable = r.status === Stock.IN_STOCK;
  const isBest = best && best.id === r.id;
  const v = r.verdict;

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
      <View style={st.row}>
        <View style={st.nameWrap}>
          <Text style={st.store} numberOfLines={1}>{r.store}</Text>
          <Text style={st.tier}>{tierMark(r.tier)}</Text>
        </View>
        <Badge text={face.label} colour={face.colour} filled={buyable} />
      </View>

      <View style={[st.row, { marginTop: S.gap }]}>
        <View style={st.priceWrap}>
          <Text style={[st.price, buyable ? { color: C.ink } : { color: C.inkDim }]}>
            {formatEUR(r.price)}
          </Text>
          {isBest ? <View style={st.bestBadge}><Text style={st.bestText}>BEST DEAL</Text></View> : null}
          {r.aggregator ? <Text style={st.agg}>usporednik</Text> : null}
        </View>
        <Button
          label={r.status === Stock.BLOCKED ? 'OPEN' : 'BUY NOW'}
          compact
          tone={buyable ? 'amber' : 'ghost'}
          onPress={() => Linking.openURL(r.url).catch(() => {})}
        />
      </View>

      {/* What the eye that looked at the page actually saw. Present even when
          empty so its absence never changes the card's height. */}
      <Text style={st.seen} numberOfLines={1}>
        {v && v.product_title ? `saw: ${v.product_title}` : ' '}
      </Text>

      <Text style={st.note} numberOfLines={2}>
        {pending ? (stage ? `${stage}…` : 'waiting…') : (r.note || (r.ms ? `${(r.ms / 1000).toFixed(1)}s` : ' '))}
      </Text>

      {/* Pages this shop has that mention the model. This is how the app answers
          "where IS it" rather than only "is it here". */}
      {!pending && r.candidates && r.candidates.length ? (
        <Text
          style={st.candidate}
          numberOfLines={1}
          onPress={() => Linking.openURL(r.candidates[0].href).catch(() => {})}
        >
          ↳ {r.candidates.length} matching page{r.candidates.length > 1 ? 's' : ''} on this shop — open the first
        </Text>
      ) : null}
    </Pressable>
  );
}

const tierMark = (t) =>
  t === Tier.VISION ? '👁 vision' : t === Tier.BROWSER ? '🌐 browser' : '↓ fetch';

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: S.radius, borderWidth: 1,
    borderColor: C.slate, padding: S.pad, marginBottom: S.gap,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameWrap: { flexShrink: 1, marginRight: S.gap },
  store: { color: C.ink, fontSize: 16, fontWeight: '700' },
  tier: { color: C.inkDim, fontSize: 10, marginTop: 2 },
  priceWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  price: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  bestBadge: { backgroundColor: C.amber, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestText: { color: '#12161E', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  agg: { color: C.inkDim, fontSize: 10, fontStyle: 'italic' },
  seen: { color: C.inkDim, fontSize: 11, marginTop: 10, minHeight: 15, fontStyle: 'italic' },
  note: { color: C.inkDim, fontSize: 11, marginTop: 3, minHeight: 28 },
  candidate: { color: C.amber, fontSize: 11, marginTop: 2 },
});
