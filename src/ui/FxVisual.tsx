// Visualisation d'un effet, selon sa famille et ses réglages :
//  réverbe = queue qui s'éteint (longueur, taille, brillance)
//  écho = répétitions espacées (temps, nombre, mélange)
//  modulation = onde (vitesse, profondeur)
import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { FxKind } from '../xair/effects';

export function FxVisual(props: { kind: FxKind; color: string; a: number; b: number; c: number; width: number; height: number; bg?: string }) {
  const { kind, color, width: W, height: H } = props;
  const a = Math.max(0, Math.min(1, props.a));
  const b = Math.max(0, Math.min(1, props.b));
  const c = Math.max(0, Math.min(1, props.c));
  const id = `g${kind}${Math.round(a * 100)}${Math.round(b * 100)}`;
  let body: React.ReactNode = null;
  if (kind === 'reverb') {
    // a = longueur, b = taille, c = brillance : barres qui décroissent
    const n = 28;
    const decay = 0.6 + a * 2.2;
    const bars = Array.from({ length: n }, (_, k) => {
      const t = k / (n - 1);
      const h = (H - 16) * Math.exp(-t * (4 - decay)) * (0.3 + b * 0.7);
      return <Rect key={k} x={10 + (t * (W - 20))} y={H - 8 - h} width={(W - 20) / n - 2} height={h} rx={2} fill={color} opacity={0.25 + (1 - t) * 0.7 * (0.5 + c * 0.5)} />;
    });
    body = <>{bars}</>;
  } else if (kind === 'delay') {
    // a = temps, b = répétitions, c = mélange : impulsions espacées qui diminuent
    const gap = 18 + a * 70;
    const count = Math.max(1, Math.round(1 + b * 7));
    const pulses = [] as React.ReactNode[];
    for (let k = 0; k <= count; k++) {
      const x = 14 + k * gap;
      if (x > W - 10) break;
      const h = (H - 16) * (k === 0 ? 1 : Math.pow(0.55 + b * 0.35, k) * (0.3 + c * 0.7));
      pulses.push(<Rect key={k} x={x} y={H - 8 - h} width={8} height={h} rx={3} fill={color} opacity={k === 0 ? 1 : 0.85} />);
    }
    body = <>{pulses}</>;
  } else if (kind === 'mod') {
    // a = vitesse, b = profondeur : onde
    const cycles = 1 + a * 5;
    const amp = (H / 2 - 10) * (0.2 + b * 0.8);
    const pts: string[] = [];
    for (let x = 0; x <= W; x += 3) {
      const y = H / 2 + Math.sin((x / W) * Math.PI * 2 * cycles) * amp;
      pts.push(`${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`);
    }
    body = <Path d={pts.join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />;
  } else {
    body = <>{[0.25, 0.5, 0.75].map((t, k) => <Circle key={k} cx={W * t} cy={H / 2} r={6 + k * 4 * (0.3 + a)} fill="none" stroke={color} strokeWidth={2} opacity={0.5 + (1 - k * 0.2) * 0.5} />)}</>;
  }
  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.12} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} rx={12} fill={props.bg ?? '#0B0D10'} />
      <Rect x={0} y={0} width={W} height={H} rx={12} fill={`url(#${id})`} />
      {body}
    </Svg>
  );
}
