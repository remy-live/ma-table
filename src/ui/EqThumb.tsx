// Vignette d'un préréglage : la courbe d'EQ en petit, plus des pastilles
// pour le coupe-bas, la gate, le compresseur et la réverbe.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { curvePath, curvePoints } from '../xair/eqCurve';
import { EQ_TYPES } from '../xair/addresses';
import { Preset } from '../xair/presets';
import { Theme } from './theme';

const TYPES = [EQ_TYPES.lshv, EQ_TYPES.peq, EQ_TYPES.peq, EQ_TYPES.hshv];

export function EqThumb({ p, width, height, color, theme }: { p: Preset; width: number; height: number; color: string; theme: Theme }) {
  const bands = p.eq.map(([hz, db, q], k) => ({ type: TYPES[k], hz, db, q }));
  const pts = curvePoints(bands, true, p.lowCut, 40);
  const d = curvePath(pts, width, height);
  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={theme.line} strokeWidth={1} />
      <Path d={`${d} L${width} ${height / 2} L0 ${height / 2} Z`} fill={color} opacity={0.18} />
      <Path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
    </Svg>
  );
}

export function PresetDots({ p, theme }: { p: Preset; theme: Theme }) {
  const items: [string, boolean, string][] = [
    ['Coupe-bas', !!p.lowCut, '#60A5FA'],
    ['Gate', p.gate !== null && p.gate !== undefined, '#9AA3AD'],
    ['Comp', p.comp !== null && p.comp !== undefined, '#34D399'],
    ['Réverbe', typeof p.fx[0] === 'number' && isFinite(p.fx[0]) && p.fx[0] > -90, '#C084FC'],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([l, on, c]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: on ? 1 : 0.35 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c : theme.line2 }} />
          <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '700' }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
