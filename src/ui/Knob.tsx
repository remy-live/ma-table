// Bouton rotatif dessiné selon le design (plat, réaliste moleté, vintage
// bakélite, anneau de LED, néon, minimal). On le tourne en glissant le doigt
// vers le haut ou vers le bas ; un simple appui appelle `onPress`.
import React, { useRef } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Look, Theme } from './theme';

const A0 = -135;
const A1 = 135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const t = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
}
export function arc(cx: number, cy: number, r: number, a: number, b: number) {
  if (b - a < 0.5) return '';
  const p = polar(cx, cy, r, a);
  const q = polar(cx, cy, r, b);
  return `M${p.x.toFixed(2)} ${p.y.toFixed(2)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
}

interface Props {
  value: number; // 0..1
  size: number;
  theme: Theme;
  color: string; // couleur de la voie / de l'effet
  look?: Look;
  dim?: boolean;
  center?: boolean; // arc depuis le milieu (pan, gain EQ)
  onChange?: (v: number) => void;
  onPress?: () => void;
  onStart?: () => void;
  label?: string;
}

export function Knob(props: Props) {
  const { size: S, theme } = props;
  const look = props.look ?? theme.look;
  const v = Math.max(0, Math.min(1, props.value));
  const deg = A0 + v * (A1 - A0);
  const c = S / 2;
  const latest = useRef(props);
  latest.current = props;
  const start = useRef({ v: 0, moved: false });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => !!latest.current.onChange,
      onMoveShouldSetPanResponder: () => !!latest.current.onChange,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { v: latest.current.value, moved: false };
        latest.current.onStart?.();
      },
      onPanResponderMove: (_e, g) => {
        const d = -g.dy + g.dx * 0.5; // vers le haut (ou la droite) = plus
        if (Math.abs(d) > 4) start.current.moved = true;
        if (!start.current.moved || !latest.current.onChange) return;
        latest.current.onChange(Math.max(0, Math.min(1, start.current.v + d / 160)));
      },
      onPanResponderRelease: () => {
        if (!start.current.moved) latest.current.onPress?.();
      },
    }),
  ).current;

  const ring = arc(c, c, c - 3, A0, A1);
  const valArc = props.center ? (v >= 0.5 ? arc(c, c, c - 3, 0, deg) : arc(c, c, c - 3, deg, 0)) : arc(c, c, c - 3, A0, deg);
  const tip = polar(c, c, c * 0.62, deg);
  const tip0 = polar(c, c, c * 0.22, deg);
  const id = `k${look}${S}`;

  let body: React.ReactNode;
  if (look === 'real' || look === 'vintage') {
    const vint = look === 'vintage';
    const r = c * 0.72;
    const ticks = Array.from({ length: 11 }, (_, k) => {
      const a = A0 + (k / 10) * (A1 - A0);
      const p = polar(c, c, c - 1, a);
      const q = polar(c, c, c - 5, a);
      return <Line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={theme.muted} strokeWidth={1.2} opacity={0.8} />;
    });
    const knurl = Array.from({ length: 28 }, (_, k) => {
      const a = (k / 28) * 360;
      const p = polar(c, c, r, a);
      const q = polar(c, c, r - c * 0.08, a);
      return <Line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#000" strokeWidth={1} opacity={0.35} />;
    });
    body = (
      <>
        <Defs>
          <RadialGradient id={id + 'b'} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor={vint ? '#4A3A2C' : '#9CA3AB'} />
            <Stop offset="0.55" stopColor={vint ? '#241A12' : theme.knobBody} />
            <Stop offset="1" stopColor={vint ? '#0E0906' : '#15171A'} />
          </RadialGradient>
          <LinearGradient id={id + 'c'} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={vint ? '#F3E6CF' : '#EEF1F4'} />
            <Stop offset="1" stopColor={vint ? '#B89A6A' : '#7C838B'} />
          </LinearGradient>
        </Defs>
        {ticks}
        <Path d={valArc} stroke={props.color} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.9} />
        <Circle cx={c + 1} cy={c + 2} r={r} fill="#000" opacity={0.45} />
        <Circle cx={c} cy={c} r={r} fill={`url(#${id}b)`} stroke={theme.knobEdge} strokeWidth={1} />
        {knurl}
        <Circle cx={c} cy={c} r={r * 0.62} fill={`url(#${id}c)`} opacity={vint ? 0.95 : 0.9} />
        <Line x1={tip0.x} y1={tip0.y} x2={tip.x} y2={tip.y} stroke={vint ? '#1B1410' : '#111'} strokeWidth={Math.max(2, S * 0.05)} strokeLinecap="round" />
      </>
    );
  } else if (look === 'led') {
    const n = 15;
    const leds = Array.from({ length: n }, (_, k) => {
      const a = A0 + (k / (n - 1)) * (A1 - A0);
      const p = polar(c, c, c - 3.5, a);
      const on = props.center ? (v >= 0.5 ? a >= 0 && a <= deg : a <= 0 && a >= deg) : a <= deg + 0.1;
      return <Circle key={k} cx={p.x} cy={p.y} r={Math.max(1.6, S * 0.035)} fill={on ? props.color : theme.line2} opacity={on ? 1 : 0.5} />;
    });
    body = (
      <>
        {leds}
        <Circle cx={c} cy={c} r={c * 0.62} fill={theme.knobBody} stroke={theme.knobEdge} strokeWidth={1.5} />
        <Line x1={tip0.x} y1={tip0.y} x2={polar(c, c, c * 0.55, deg).x} y2={polar(c, c, c * 0.55, deg).y} stroke={theme.knobMark} strokeWidth={2.5} strokeLinecap="round" />
      </>
    );
  } else if (look === 'neon') {
    body = (
      <>
        <Path d={ring} stroke={theme.line2} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d={valArc} stroke={props.color} strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.25} />
        <Path d={valArc} stroke={props.color} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <Circle cx={c} cy={c} r={c * 0.5} fill={theme.knobBody} stroke={props.color} strokeWidth={1} opacity={0.9} />
        <Circle cx={tip.x} cy={tip.y} r={Math.max(2.5, S * 0.06)} fill={theme.knobMark} />
      </>
    );
  } else if (look === 'minimal') {
    body = (
      <>
        <Path d={ring} stroke={theme.line2} strokeWidth={1.5} fill="none" />
        <Path d={valArc} stroke={props.color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Line x1={c} y1={c} x2={tip.x} y2={tip.y} stroke={theme.knobMark} strokeWidth={1.5} strokeLinecap="round" />
      </>
    );
  } else {
    body = (
      <>
        <Path d={ring} stroke={theme.track} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d={valArc} stroke={props.color} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Circle cx={c} cy={c} r={c * 0.66} fill={theme.knobBody} stroke={theme.knobEdge} strokeWidth={2} />
        <Line x1={tip0.x} y1={tip0.y} x2={tip.x} y2={tip.y} stroke={props.color} strokeWidth={3} strokeLinecap="round" />
      </>
    );
  }

  return (
    <View
      style={{ width: S, height: S, opacity: props.dim ? 0.4 : 1 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') props.onPress?.();
        else props.onChange?.(Math.max(0, Math.min(1, v + (e.nativeEvent.actionName === 'increment' ? 0.02 : -0.02))));
      }}
      {...pan.panHandlers}
    >
      <Svg width={S} height={S}>
        <G>{body}</G>
      </Svg>
    </View>
  );
}
