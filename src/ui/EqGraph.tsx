// Égaliseur à manipuler au doigt : on attrape un point et on le déplace
// (gauche-droite = fréquence, haut-bas = gain). La courbe se redessine.
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Band, curvePath, curvePoints, hzAt, xOf, yOfDb } from '../xair/eqCurve';
import { Theme } from './theme';

export const BAND_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F472B6'];
const H = 190;
const PAD = 14; // marge pour que les points du bord restent attrapables

interface Props {
  bands: Band[];
  on: boolean;
  hpfHz: number | null;
  selected: number;
  theme: Theme;
  onSelect: (k: number) => void;
  onChange: (k: number, hz: number, db: number) => void; // appelé pendant le glissement
  onActivate?: () => void; // on a touché la courbe alors que l'EQ est coupé
  /** spectre en direct (100 bandes, en dB) : ce qui sort vraiment de la voie */
  rta?: Float32Array | null;
}

export function EqGraph(props: Props) {
  const { theme, bands, on } = props;
  const [w, setW] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<{ k: number; hz0: number; db0: number } | null>(null);
  const width = useRef(0);
  width.current = w;

  const gx = (hz: number) => PAD + xOf(hz) * (w - 2 * PAD);
  const gy = (db: number) => yOfDb(db, H);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const p = latest.current;
        const W = width.current;
        const x = e.nativeEvent.locationX;
        const y = e.nativeEvent.locationY;
        // point le plus proche (en priorité), sinon la bande sélectionnée
        let best = p.selected;
        let bd = 1e9;
        p.bands.forEach((b, k) => {
          const px = PAD + xOf(b.hz) * (W - 2 * PAD);
          const py = yOfDb(p.on ? b.db : 0, H);
          const d = Math.hypot(px - x, py - y);
          if (d < bd) { bd = d; best = k; }
        });
        if (bd > 60) best = p.selected;
        p.onSelect(best);
        if (!p.on) p.onActivate?.();
        drag.current = { k: best, hz0: p.bands[best].hz, db0: p.bands[best].db };
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current;
        if (!d) return;
        const W = width.current;
        const x0 = PAD + xOf(d.hz0) * (W - 2 * PAD);
        const nx = Math.max(PAD, Math.min(W - PAD, x0 + g.dx));
        const hz = hzAt((nx - PAD) / (W - 2 * PAD));
        const db = Math.max(-15, Math.min(15, d.db0 - (g.dy / (H / 2)) * 18));
        latest.current.onChange(d.k, hz, Math.round(db * 2) / 2);
      },
      onPanResponderRelease: () => { drag.current = null; },
      onPanResponderTerminate: () => { drag.current = null; },
    }),
  ).current;

  const pts = curvePoints(bands, true, props.hpfHz);
  const path = w ? curvePath(pts.map(([x, g]) => [(PAD + x * (w - 2 * PAD)) / w, g]), w, H) : '';
  const area = path ? `${path} L${w - PAD} ${H / 2} L${PAD} ${H / 2} Z` : '';
  const sel = bands[props.selected];
  // spectre : bande k = 20 Hz × 1000^(k/99) ; -80 dB en bas, 0 dB tout en haut
  const rta = props.rta;
  const hasRta = !!rta && w > 0 && Math.max(...Array.from(rta)) > -85;
  const ry = (db: number) => H - Math.max(0, Math.min(1, (db + 80) / 80)) * (H - 16);
  const rpts = hasRta ? Array.from(rta!, (db, k) => [gx(20 * Math.pow(1000, k / 99)), ry(db)] as const) : [];
  const spectrumLine = hasRta ? rpts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') : '';
  const spectrum = hasRta ? `${spectrumLine} L${rpts[rpts.length - 1][0].toFixed(1)} ${H} L${rpts[0][0].toFixed(1)} ${H} Z` : '';

  return (
    <View style={[styles.box, { backgroundColor: theme.meterBg }]} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} accessible accessibilityLabel="Égaliseur : glisse un point pour régler" >
      {w > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={on ? '#FBBF24' : '#6B7280'} stopOpacity={0.35} />
              <Stop offset="1" stopColor={on ? '#FBBF24' : '#6B7280'} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {[-12, -6, 6, 12].map((g) => <Line key={g} x1={PAD} y1={gy(g)} x2={w - PAD} y2={gy(g)} stroke={theme.line} strokeWidth={0.5} />)}
          <Line x1={PAD} y1={H / 2} x2={w - PAD} y2={H / 2} stroke={theme.line2} strokeWidth={1} />
          {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((hz) => (
            <React.Fragment key={hz}>
              <Line x1={gx(hz)} y1={0} x2={gx(hz)} y2={H} stroke={theme.line} strokeWidth={0.5} />
              <SvgText x={gx(hz)} y={H - 4} textAnchor="middle" fontSize={9} fill={theme.muted}>{hz >= 1000 ? `${hz / 1000}k` : String(hz)}</SvgText>
            </React.Fragment>
          ))}
          <SvgText x={PAD + 2} y={gy(12) - 3} fontSize={9} fill={theme.muted}>+12</SvgText>
          <SvgText x={PAD + 2} y={gy(-12) + 10} fontSize={9} fill={theme.muted}>−12</SvgText>
          {spectrum && <Path d={spectrum} fill="#38BDF8" opacity={0.28} />}
          {spectrum && <Path d={spectrumLine} fill="none" stroke="#7DD3FC" strokeWidth={1.5} opacity={0.8} />}
          <Path d={area} fill="url(#eqfill)" />
          <Path d={path} fill="none" stroke={on ? '#FBBF24' : '#6B7280'} strokeWidth={3} strokeLinejoin="round" strokeDasharray={on ? undefined : '6 5'} />
          {props.hpfHz && <Line x1={gx(props.hpfHz)} y1={0} x2={gx(props.hpfHz)} y2={H} stroke="#60A5FA" strokeWidth={2} strokeDasharray="4 4" />}
          {bands.map((b, k) => {
            const isSel = k === props.selected;
            return (
              <React.Fragment key={k}>
                {isSel && <Circle cx={gx(b.hz)} cy={gy(b.db)} r={22} fill={BAND_COLORS[k]} opacity={0.18} />}
                <Circle cx={gx(b.hz)} cy={gy(b.db)} r={isSel ? 14 : 11} fill={BAND_COLORS[k]} stroke={isSel ? '#FFFFFF' : theme.meterBg} strokeWidth={3} opacity={on ? 1 : 0.6} />
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      <View pointerEvents="none" style={styles.badge}>
        <Text style={{ color: BAND_COLORS[props.selected], fontSize: 12, fontWeight: '800' }}>
          {sel ? `${sel.hz >= 1000 ? (sel.hz / 1000).toFixed(1).replace('.0', '') + ' kHz' : Math.round(sel.hz) + ' Hz'} · ${sel.db > 0 ? '+' : ''}${sel.db.toFixed(1)} dB` : ''}
        </Text>
      </View>
      {!on && (
        <View pointerEvents="none" style={styles.off}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>EQ coupé · touche la courbe pour l’activer</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: H, borderRadius: 14, overflow: 'hidden' },
  badge: { position: 'absolute', top: 8, right: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  off: { position: 'absolute', top: 8, left: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
