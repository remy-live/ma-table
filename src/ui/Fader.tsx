// Fader vertical façon table de mixage : capuchon rainuré, échelle en dB.
// Glisser verticalement = réglage normal. Rester appuyé ~0,4 s sans bouger puis glisser = réglage fin (×4 plus précis).
// Glisser horizontalement = faire défiler les voies.
// Double-tap = retour à 0 dB.
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { dbToFader } from '../xair/levels';
import { Theme } from './theme';
import { tick } from './haptics';

interface Props {
  value: number; // 0..1
  onChange: (v: number) => void;
  color: string;
  theme: Theme;
  height?: number;
  label: string; // pour l'accessibilité
  onStart?: () => void; // début d'un geste (sert aux groupes)
  onEnd?: () => void;
  meter?: number; // vumètre 0..1, dessiné à droite du fader
  clip?: boolean;
}

const CAP_H = 30;
const ZERO = 0.75; // position du 0 dB
const MARKS: [number, string][] = [
  [1, '+10'],
  [0.75, '0'],
  [0.5, '-10'],
  [0.25, '-30'],
  [0, '-∞'],
];

export function Fader({ value, onChange, color, theme, height = 340, label, onStart, onEnd, meter, clip }: Props) {
  const track = height - CAP_H;
  const v = Math.max(0, Math.min(1, value));
  const [fine, setFine] = useState(false);

  // Le fader ne prend la main que pour un geste VERTICAL : un glissement
  // horizontal reste à la liste des voies, qui peut donc défiler.
  const ref = useRef({ start: 0, dy0: 0, fine: false, touchAt: 0, lastTap: 0, dragged: false });
  const latest = useRef({ value: v, onChange, track, onStart, onEnd });
  latest.current = { value: v, onChange, track, onStart, onEnd };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e, g) => {
        const r = ref.current;
        r.dragged = true;
        r.start = latest.current.value;
        r.dy0 = g.dy;
        // Doigt resté immobile ~0,4 s avant de bouger = réglage fin.
        r.fine = Date.now() - r.touchAt > 400;
        setFine(r.fine);
        latest.current.onStart?.();
      },
      onPanResponderMove: (_e, g) => {
        const r = ref.current;
        const k = r.fine ? 0.25 : 1;
        const nv = r.start - ((g.dy - r.dy0) / latest.current.track) * k;
        const old = latest.current.value;
        if ((old < ZERO && nv >= ZERO) || (old > ZERO && nv <= ZERO)) tick();
        latest.current.onChange(nv);
      },
      onPanResponderRelease: () => {
        setFine(false);
        latest.current.onEnd?.();
      },
      onPanResponderTerminate: () => {
        setFine(false);
        latest.current.onEnd?.();
      },
    }),
  ).current;

  // Toucher simple (sans glisser) : sert au double-tap -> 0 dB.
  const onTouchStart = () => {
    ref.current.touchAt = Date.now();
    ref.current.dragged = false;
  };
  const onTouchEnd = () => {
    const r = ref.current;
    const now = Date.now();
    if (r.dragged || now - r.touchAt > 250) return;
    if (now - r.lastTap < 350) {
      latest.current.onStart?.();
      latest.current.onChange(dbToFader(0));
      latest.current.onEnd?.();
      r.lastTap = 0;
    } else r.lastTap = now;
  };

  const capBottom = v * track;

  return (
    <View
      style={{ width: 72, height }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(v + (e.nativeEvent.actionName === 'increment' ? 0.02 : -0.02))}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      {...pan.panHandlers}
    >
      {MARKS.map(([p, t]) => (
        <View key={t} style={[styles.mark, { bottom: CAP_H / 2 + p * track - 6 }]}>
          <Text style={[styles.markText, { color: theme.muted }]}>{t}</Text>
          <View style={[styles.tick, { backgroundColor: theme.line2 }]} />
        </View>
      ))}
      {meter !== undefined && <Meter level={meter} clip={!!clip} height={track} theme={theme} />}
      <View style={[styles.track, { top: CAP_H / 2, bottom: CAP_H / 2, backgroundColor: theme.track }]} />
      <View style={[styles.track, { bottom: CAP_H / 2, height: capBottom, backgroundColor: color }]} />
      <Cap bottom={capBottom} fine={fine} color={color} theme={theme} />
    </View>
  );
}

/** Capuchon de fader, dessiné selon le design. */
function Cap({ bottom, fine, color, theme }: { bottom: number; fine: boolean; color: string; theme: Theme }) {
  const border = fine ? theme.accent : 'transparent';
  if (theme.look === 'real' || theme.look === 'vintage') {
    const v = theme.look === 'vintage';
    return (
      <View style={[styles.cap, { bottom, width: 40, left: 16, backgroundColor: theme.cap, borderColor: border, borderRadius: v ? 4 : 5, borderTopWidth: 3, borderTopColor: fine ? theme.accent : v ? '#FFF6E2' : '#F4F6F8', borderBottomWidth: 3, borderBottomColor: v ? '#6E5A3E' : '#5F666E', gap: 2 }]}>
        {[0, 1, 2].map((k) => <View key={'a' + k} style={{ width: 30, height: 1, backgroundColor: theme.capGroove }} />)}
        <View style={[styles.line, { width: 32, height: 3, backgroundColor: v ? '#1B1410' : '#111' }]} />
        {[0, 1, 2].map((k) => <View key={'b' + k} style={{ width: 30, height: 1, backgroundColor: theme.capGroove }} />)}
      </View>
    );
  }
  if (theme.look === 'neon') {
    return (
      <View style={[styles.cap, { bottom, backgroundColor: theme.bg, borderColor: fine ? theme.accent : color, borderWidth: 2, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}>
        <View style={[styles.line, { backgroundColor: color }]} />
      </View>
    );
  }
  if (theme.look === 'minimal') {
    return (
      <View style={[styles.cap, { bottom: bottom + CAP_H / 2 - 4, height: 8, borderRadius: 4, backgroundColor: theme.cap, borderColor: border, elevation: 0, shadowOpacity: 0 }]} />
    );
  }
  return (
    <View style={[styles.cap, { bottom, backgroundColor: theme.cap, borderColor: border }]}>
      <View style={[styles.groove, { backgroundColor: theme.capGroove }]} />
      <View style={[styles.line, { backgroundColor: color }]} />
      <View style={[styles.groove, { backgroundColor: theme.capGroove }]} />
    </View>
  );
}

/** Vumètre à LED : vert, puis jaune vers -12 dB, rouge près de 0 dB. Témoin rouge en haut si saturation. */
const SEGMENTS = 24;
function Meter({ level, clip, height, theme }: { level: number; clip: boolean; height: number; theme: Theme }) {
  const lit = Math.round(level * SEGMENTS);
  const seg = (height - 10) / SEGMENTS;
  return (
    <View pointerEvents="none" style={[styles.meter, { bottom: CAP_H / 2, height }]}>
      <View style={[styles.clip, { backgroundColor: clip ? '#EF4444' : theme.meterBg }]} />
      {Array.from({ length: SEGMENTS }, (_, k) => {
        const on = k < lit;
        const c = k >= SEGMENTS - 2 ? '#EF4444' : k >= SEGMENTS - 6 ? '#EAB308' : '#22C55E';
        return <View key={k} style={{ position: 'absolute', bottom: k * seg, left: 0, right: 0, height: seg - 1.5, backgroundColor: on ? c : theme.meterBg }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { position: 'absolute', right: 1, width: 8 },
  clip: { position: 'absolute', top: -10, left: 0, right: 0, height: 6, borderRadius: 2 },
  mark: { position: 'absolute', left: 0, width: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
  markText: { fontSize: 9, width: 16, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tick: { width: 6, height: 1 },
  track: { position: 'absolute', left: 33, width: 6, borderRadius: 3 },
  cap: {
    position: 'absolute',
    left: 18,
    width: 36,
    height: CAP_H,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  groove: { width: 22, height: 1 },
  line: { width: 26, height: 3, borderRadius: 2 },
});
