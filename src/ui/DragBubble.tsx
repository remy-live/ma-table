// Une case avec une bulle (grosse = fort). Geste unique dans toute l'appli :
//  - glisser vers la DROITE = plus fort, vers la GAUCHE = moins fort (jusqu'à « rien »)
//  - un simple appui appelle onTap (choisir la case, ou un réglage rapide)
// Pendant le geste, la valeur s'affiche en gros au-dessus du doigt, rien n'est caché.
import React, { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { Theme } from './theme';

const DB_PER_DP = 0.35; // 100 dp de glissement ≈ 35 dB
const MIN = -40;

export function DragBubble(props: {
  theme: Theme;
  db: number; // -Infinity = rien
  max?: number; // plafond en dB (+10 pour un envoi, 0 pour un effet)
  color: string;
  w: number;
  h: number;
  picked?: boolean;
  a11y: string;
  onTap?: () => void;
  onStart?: () => void;
  onSet: (db: number | null) => void; // null = rien
}) {
  const { theme, w, h } = props;
  const max = props.max ?? 10;
  const latest = useRef(props);
  latest.current = props;
  const start = useRef({ db: MIN, moved: false });
  const [live, setLive] = useState<number | null>(null);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const d = latest.current.db;
        start.current = { db: isFinite(d) && d > MIN ? d : MIN - 1, moved: false };
        latest.current.onStart?.();
      },
      onPanResponderMove: (_e, g) => {
        if (!start.current.moved && Math.abs(g.dx) < 6) return;
        start.current.moved = true;
        const m = latest.current.max ?? 10;
        const n = Math.max(MIN - 1, Math.min(m, start.current.db + g.dx * DB_PER_DP));
        setLive(n);
        latest.current.onSet(n < MIN ? null : n);
      },
      onPanResponderRelease: () => {
        if (!start.current.moved) latest.current.onTap?.();
        setLive(null);
      },
      onPanResponderTerminate: () => setLive(null),
    }),
  ).current;

  const shown = live ?? props.db;
  const on = isFinite(shown) && shown >= MIN;
  const big = Math.min(w, h) - 8;
  const size = on ? Math.round(10 + ((shown - MIN) / (max - MIN)) * (big - 10)) : 0;
  const txt = on ? `${shown > 0 ? '+' : ''}${Math.round(shown)} dB` : 'rien';
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${props.a11y} : ${txt}`}
      accessibilityState={{ selected: !!props.picked }}
      style={{ width: w, height: h, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: props.picked || live !== null ? theme.line : theme.deep, overflow: 'visible', zIndex: live !== null ? 10 : 0 }}
    >
      {on && <View pointerEvents="none" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: props.color, opacity: 0.55 + Math.max(0, Math.min(1, (shown - MIN) / (max - MIN))) * 0.45, borderWidth: props.picked ? 3 : 0, borderColor: '#FFFFFF' }} />}
      {!on && live !== null && <View pointerEvents="none" style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: 'dashed', borderColor: props.color }} />}
      {live === null && on && <Text pointerEvents="none" style={{ position: 'absolute', bottom: 2, right: 6, color: props.picked ? theme.text : theme.muted, fontSize: 9, fontWeight: '800' }}>{`${shown > 0 ? '+' : ''}${Math.round(shown)}`}</Text>}
      {live !== null && (
        <View pointerEvents="none" style={{ position: 'absolute', top: -44, alignSelf: 'center', minWidth: 84, paddingHorizontal: 10, height: 38, borderRadius: 10, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
          <Text style={{ color: theme.bg, fontSize: 13, fontWeight: '900' }}>◀</Text>
          <Text style={{ color: theme.bg, fontSize: 16, fontWeight: '900' }}>{txt}</Text>
          <Text style={{ color: theme.bg, fontSize: 13, fontWeight: '900' }}>▶</Text>
        </View>
      )}
    </View>
  );
}
