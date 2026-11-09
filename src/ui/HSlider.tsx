// Curseur horizontal (EQ, effets). Ne prend la main que pour un geste
// horizontal, pour laisser défiler l'écran verticalement.
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Theme } from './theme';

interface Props {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  valueText: string;
  color: string;
  theme: Theme;
  center?: boolean; // remplissage depuis le milieu (gain EQ)
}

export function HSlider({ value, onChange, label, valueText, color, theme, center }: Props) {
  const [w, setW] = useState(1);
  const v = Math.max(0, Math.min(1, value));
  const latest = useRef({ v, w, onChange });
  latest.current = { v, w, onChange };
  const start = useRef({ v: 0, dx0: 0 });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e, g) => {
        start.current = { v: latest.current.v, dx0: g.dx };
      },
      onPanResponderMove: (_e, g) => {
        const nv = start.current.v + (g.dx - start.current.dx0) / latest.current.w;
        latest.current.onChange(Math.max(0, Math.min(1, nv)));
      },
    }),
  ).current;

  const fillLeft = center ? Math.min(v, 0.5) : 0;
  const fillW = center ? Math.abs(v - 0.5) : v;

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={styles.area}
        onLayout={(e: LayoutChangeEvent) => setW(Math.max(1, e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(1, v + (e.nativeEvent.actionName === 'increment' ? 0.02 : -0.02))))}
        {...pan.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: theme.track }]} />
        {center && <View style={[styles.mid, { backgroundColor: theme.line2 }]} />}
        <View style={[styles.fill, { left: `${fillLeft * 100}%`, width: `${fillW * 100}%`, backgroundColor: color }]} />
        <View style={[styles.knob, { left: v * w - 11, backgroundColor: theme.cap }]} />
      </View>
      <Text style={[styles.val, { color: theme.muted }]}>{valueText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  label: { width: 96, fontSize: 13 },
  area: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3 },
  mid: { position: 'absolute', left: '50%', width: 2, height: 14, marginLeft: -1 },
  fill: { position: 'absolute', height: 6, borderRadius: 3 },
  knob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, elevation: 3, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3 },
  val: { width: 64, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
});
