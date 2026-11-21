// Petit dessin de l'arrière de la table : les prises (et les sorties AUX), pour
// montrer « c'est celle-là » pendant un guidage. Une prise peut clignoter,
// porter un nom, une couleur et un badge (ce qui a changé).
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import { MODEL } from '../xair/addresses';

export interface MiniPlug { label?: string; color?: string; badge?: string; dim?: boolean }
export interface MiniOut { n: number; label?: string; color?: string; badge?: string }

const COLS = 8;
const CW = 62; // largeur d'une colonne
const RH = 74; // hauteur d'une rangée

export function MiniTable(props: {
  plugs: Record<number, MiniPlug>;
  blink?: number[]; // prises qui clignotent
  outs?: MiniOut[]; // sorties AUX à montrer
  blinkOuts?: number[];
  onPlug?: (n: number) => void;
  onOut?: (n: number) => void;
  arrows?: [number, number][]; // échanges de prises (9 ⇄ 12)
  maxWidth?: number;
}) {
  const n = Math.min(MODEL.inputs, 32);
  const rows = Math.ceil(n / COLS);
  const outRow = props.outs?.length ? 1 : 0;
  const W = COLS * CW + 16;
  const H = rows * RH + outRow * (RH + 6) + 14;
  const [on, setOn] = useState(true);
  const blinking = !!(props.blink?.length || props.blinkOuts?.length);
  useEffect(() => {
    if (!blinking) return;
    const t = setInterval(() => setOn((v) => !v), 450);
    return () => clearInterval(t);
  }, [blinking]);
  const xy = (p: number) => ({ x: 8 + ((p - 1) % COLS) * CW + CW / 2, y: 22 + Math.floor((p - 1) / COLS) * RH });
  const oxy = (k: number, count: number) => ({ x: 8 + (k + 0.5) * (W - 16) / Math.max(count, 6), y: rows * RH + 22 + 10 });
  const hl = new Set(props.blink ?? []);
  const hlo = new Set(props.blinkOuts ?? []);
  const outs = props.outs ?? [];

  const plugG = (p: number, lit: boolean) => {
    const { x, y } = xy(p);
    const d = props.plugs[p] ?? {};
    const c = d.color ?? '#5B636D';
    return (
      <G key={p} opacity={d.dim ? 0.35 : 1}>
        <SvgText x={x} y={y - 4} textAnchor="middle" fontSize={11} fontWeight="800" fill="#9AA3AD">{String(p)}</SvgText>
        <Circle cx={x} cy={y + 16} r={lit ? 17 : 14} fill="#15181C" stroke={lit ? '#FFFFFF' : c} strokeWidth={lit ? 4 : 2.5} />
        <Circle cx={x} cy={y + 16} r={5} fill={d.label ? c : '#2A2F36'} />
        {!!d.label && <SvgText x={x} y={y + 46} textAnchor="middle" fontSize={10} fontWeight="700" fill="#E8EAED">{d.label.slice(0, 10)}</SvgText>}
        {!!d.badge && (
          <G>
            <Rect x={x + 4} y={y - 2} width={Math.min(54, 8 + d.badge.length * 5.6)} height={15} rx={7.5} fill="#F59E0B" />
            <SvgText x={x + 8} y={y + 9} fontSize={9} fontWeight="900" fill="#0B0D10">{d.badge.slice(0, 9)}</SvgText>
          </G>
        )}
      </G>
    );
  };

  const outG = (o: MiniOut, k: number, lit: boolean) => {
    const { x, y } = oxy(k, outs.length);
    const c = o.color ?? '#9AA3AD';
    return (
      <G key={`o${o.n}`}>
        <Circle cx={x} cy={y + 14} r={lit ? 17 : 14} fill="#15181C" stroke={lit ? '#FFFFFF' : c} strokeWidth={lit ? 4 : 2.5} />
        <SvgText x={x} y={y + 18} textAnchor="middle" fontSize={9} fontWeight="900" fill={c}>{`AUX${o.n}`}</SvgText>
        {!!o.label && <SvgText x={x} y={y + 44} textAnchor="middle" fontSize={10} fontWeight="700" fill="#E8EAED">{o.label.slice(0, 10)}</SvgText>}
        {!!o.badge && <SvgText x={x} y={y - 6} textAnchor="middle" fontSize={9} fontWeight="900" fill="#F59E0B">{o.badge.slice(0, 10)}</SvgText>}
      </G>
    );
  };

  const all = Array.from({ length: n }, (_, k) => k + 1);
  return (
    <View style={{ width: '100%', maxWidth: props.maxWidth ?? 560, alignSelf: 'center', aspectRatio: W / H }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect x={1} y={1} width={W - 2} height={H - 2} rx={14} fill="#0E1114" stroke="#2A2F36" strokeWidth={1.5} />
        {all.filter((p) => !hl.has(p)).map((p) => plugG(p, false))}
        {outs.map((o, k) => (hlo.has(o.n) ? null : outG(o, k, false)))}
        {(props.arrows ?? []).map(([a, b]) => {
          const A = xy(a), B = xy(b);
          return (
            <G key={`${a}-${b}`}>
              <Rect x={Math.min(A.x, B.x) - 2} y={Math.min(A.y, B.y) + 14} width={Math.abs(A.x - B.x) + 4} height={Math.abs(A.y - B.y) + 4} fill="none" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" rx={4} />
              <SvgText x={(A.x + B.x) / 2} y={Math.min(A.y, B.y) + 12} textAnchor="middle" fontSize={11} fontWeight="900" fill="#F59E0B">{`${a} ⇄ ${b}`}</SvgText>
            </G>
          );
        })}
        <G opacity={on ? 1 : 0.3}>
          {all.filter((p) => hl.has(p)).map((p) => plugG(p, true))}
          {outs.map((o, k) => (hlo.has(o.n) ? outG(o, k, true) : null))}
        </G>
      </Svg>
      {/* zones à toucher */}
      {(props.onPlug || props.onOut) && (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
          {props.onPlug && all.map((p) => {
            const { x, y } = xy(p);
            return <Pressable key={p} accessibilityLabel={`Prise ${p}`} onPress={() => props.onPlug!(p)} style={{ position: 'absolute', left: `${((x - CW / 2) / W) * 100}%`, top: `${((y - 6) / H) * 100}%`, width: `${(CW / W) * 100}%`, height: `${(RH / H) * 100}%` }} />;
          })}
          {props.onOut && outs.map((o, k) => {
            const { x, y } = oxy(k, outs.length);
            return <Pressable key={o.n} accessibilityLabel={`AUX ${o.n}`} onPress={() => props.onOut!(o.n)} style={{ position: 'absolute', left: `${((x - CW / 2) / W) * 100}%`, top: `${((y - 8) / H) * 100}%`, width: `${(CW / W) * 100}%`, height: `${(RH / H) * 100}%` }} />;
          })}
        </View>
      )}
    </View>
  );
}
