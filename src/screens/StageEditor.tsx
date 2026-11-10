// « Ma scène » vue de dessus : on pose les instruments, le pédalier, l'ampli,
// les micros, les DI et les retours, puis on tire les câbles (jack ou XLR) entre
// eux et jusqu'aux prises de la table. Plusieurs câbles par objet. En bas : le
// matériel à emporter, calculé tout seul.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Btn, Segmented } from '../ui/kit';
import { Theme } from '../ui/theme';
import { showTip } from '../ui/tip';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath, insrcPath, insrcPlug } from '../xair/addresses';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import {
  addCable, CableType, EMPTY, End, endLabel, family, fromChannels, gear, gearText, Kind, kindLabel, KINDS, newId, removeCable, removeObj,
  sameEnd, setCableType, Stage, StageObj, touching,
} from '../store/stage';
import { MIX_COLORS } from './MixPicker';

const W = 1000;
const H = 572;
const STAGE_H = 452;
const px = (o: { x: number }) => 40 + o.x * 920;
const py = (o: { y: number }) => 34 + o.y * 370;
const R = 26;
const plugX = (n: number) => 40 + (n - 1) * 30;
const OUTS = ['aux1', 'aux2', 'aux3', 'aux4', 'aux5', 'aux6', 'mainL', 'mainR'];
const outX = (id: string) => { const k = OUTS.indexOf(id); return k < 6 ? 625 + k * 44 : 905 + (k - 6) * 44; };
const PORT_Y = 520;

const FAM_COLOR: Record<ReturnType<typeof family>, string> = {
  instrument: '#FBBF24', gear: '#94A3B8', mic: '#F472B6', monitor: '#34D399', person: '#60A5FA',
};
const JACK = '#60A5FA';
const XLR = '#E5E7EB';

/** Petit dessin de chaque objet, centré en (x, y), tient dans un rond de 22 de rayon. */
export function KindIcon({ kind, x, y, c, s = 1 }: { kind: Kind; x: number; y: number; c: string; s?: number }) {
  const st = { stroke: c, strokeWidth: 2.4 / s, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const ci = { ...st, strokeWidth: 2.4 };
  const P = (d: string) => <Path d={d} {...st} transform={`translate(${x} ${y}) scale(${s})`} />;
  switch (kind) {
    case 'voix': return <G>{P('M-5 -12 a5 5 0 0 1 10 0 v8 a5 5 0 0 1 -10 0 z')}{P('M-9 -4 a9 9 0 0 0 18 0 M0 5 v9 M-6 14 h12')}</G>;
    case 'micro': return <G>{P('M-4 -12 a4 4 0 1 1 0.1 0 z')}{P('M0 -4 v18 M-8 14 h16')}</G>;
    case 'guitare': return <G>{P('M-3 2 a8 8 0 1 0 6 0 a6 6 0 1 0 -6 0 z')}{P('M0 -2 l6 -12 M4 -16 l4 2')}</G>;
    case 'acoustique': return <G>{P('M-4 4 a9 9 0 1 0 8 0 a7 7 0 1 0 -8 0 z')}<Circle cx={x} cy={y + 6 * s} r={2.5 * s} {...ci} />{P('M0 -2 v-14')}</G>;
    case 'basse': return <G>{P('M-4 3 a8 9 0 1 0 8 0 a6 7 0 1 0 -8 0 z')}{P('M0 -2 v-15 M-3 -17 h6')}</G>;
    case 'clavier': return <G>{P('M-15 -7 h30 v14 h-30 z')}{P('M-9 -7 v8 M-3 -7 v8 M3 -7 v8 M9 -7 v8')}</G>;
    case 'batterie': return <G>{P('M-9 3 a7 7 0 1 0 0.1 0 z')}{P('M7 -8 a5 5 0 1 0 0.1 0 z')}{P('M9 4 a5 5 0 1 0 0.1 0 z')}</G>;
    case 'pedalboard': return <G>{P('M-15 -8 h30 v16 h-30 z')}<Circle cx={x - 8 * s} cy={y} r={2.5 * s} {...ci} /><Circle cx={x} cy={y} r={2.5 * s} {...ci} /><Circle cx={x + 8 * s} cy={y} r={2.5 * s} {...ci} /></G>;
    case 'ampli': return <G>{P('M-14 -12 h28 v24 h-28 z')}<Circle cx={x} cy={y + 2 * s} r={6 * s} {...ci} />{P('M-9 -8 h4')}</G>;
    case 'di': return <G>{P('M-11 -8 h22 v16 h-22 z')}<SvgText x={x} y={y + 4 * s} textAnchor="middle" fontSize={9 * s} fontWeight="900" fill={c}>DI</SvgText></G>;
    case 'retour': return <G>{P('M-14 6 l5 -14 h18 l5 14 z')}{P('M-4 -2 a4 4 0 1 0 0.1 0 z')}</G>;
    case 'casque': return <G>{P('M-11 4 v-4 a11 11 0 0 1 22 0 v4')}{P('M-14 2 h5 v10 h-5 z M9 2 h5 v10 h-5 z')}</G>;
    case 'enceinte': return <G>{P('M-10 -14 h20 v28 h-20 z')}<Circle cx={x} cy={y + 4 * s} r={5 * s} {...ci} /><Circle cx={x} cy={y - 8 * s} r={2 * s} {...ci} /></G>;
    case 'musicien': return <G><Circle cx={x} cy={y - 6 * s} r={6 * s} {...ci} />{P('M-11 13 a11 11 0 0 1 22 0')}</G>;
  }
}

type Sel = End | null;
type Drag = { from: End; x: number; y: number; moved: boolean; obj0?: { x: number; y: number } } | null;

export function StageEditor({ client, theme }: { client: XAirClient; theme: Theme }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [st, setSt] = useState<Stage>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'move' | 'wire'>('move');
  const [ctype, setCtype] = useState<'auto' | CableType>('auto');
  const [sel, setSel] = useState<Sel>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [packed, setPacked] = useState<Record<string, boolean>>({});

  useEffect(() => { load<Stage>('scene', EMPTY).then((s) => { setSt(s ?? EMPTY); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) save('scene', st); }, [st, loaded]);
  useEffect(() => { client.loadPaths([...Array.from({ length: CH_COUNT }, (_, k) => chNamePath(k + 1)), ...Array.from({ length: CH_COUNT }, (_, k) => insrcPath(k + 1)), ...Array.from({ length: BUS_COUNT }, (_, k) => busNamePath(k + 1))]); }, [client]);

  const busName = (n: number) => String(client.get(busNamePath(n)) ?? '') || `Retour ${n}`;
  const plugName = (n: number) => {
    for (let c = 1; c <= CH_COUNT; c++) if (insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)) === n) return String(client.get(chNamePath(c)) ?? '') || `voie ${c}`;
    return '';
  };

  const sc = size.w && size.h ? Math.min(size.w / W, size.h / H) : 0;
  const posOf = (e: End): { x: number; y: number } => {
    if ('plug' in e) return { x: plugX(e.plug), y: PORT_Y };
    if ('out' in e) return { x: outX(e.out), y: PORT_Y };
    const o = st.objs.find((x) => x.id === e.o);
    return o ? { x: px(o), y: py(o) } : { x: 0, y: 0 };
  };
  const hit = (x: number, y: number): End | null => {
    for (let k = st.objs.length - 1; k >= 0; k--) { const o = st.objs[k]; if (Math.hypot(x - px(o), y - py(o)) < R + 10) return { o: o.id }; }
    if (Math.abs(y - PORT_Y) < 22) {
      for (let n = 1; n <= 18; n++) if (Math.abs(x - plugX(n)) < 15) return { plug: n };
      for (const id of OUTS) if (Math.abs(x - outX(id)) < 20) return { out: id };
    }
    return null;
  };

  const latest = useRef({ sc, st, mode, ctype, hit, sel });
  latest.current = { sc, st, mode, ctype, hit, sel };
  const dref = useRef<Drag>(null);
  const putDrag = (d: Drag) => { dref.current = d; setDrag(d); };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const L = latest.current;
        const sc1 = L.sc || 1;
        const x = e.nativeEvent.locationX / sc1;
        const y = e.nativeEvent.locationY / sc1;
        const t = L.hit(x, y);
        if (!t) { putDrag(null); return; }
        const o = 'o' in t ? L.st.objs.find((q) => q.id === t.o) : undefined;
        putDrag({ from: t, x, y, moved: false, obj0: o ? { x: o.x, y: o.y } : undefined });
      },
      onPanResponderMove: (e, g) => {
        const L = latest.current;
        const d = dref.current;
        if (!d) return;
        const sc1 = L.sc || 1;
        const moved = d.moved || Math.abs(g.dx) + Math.abs(g.dy) > 8;
        if (moved && L.mode === 'move' && 'o' in d.from && d.obj0) {
          const id = d.from.o;
          const nx = Math.max(0, Math.min(1, d.obj0.x + g.dx / sc1 / 920));
          const ny = Math.max(0, Math.min(1, d.obj0.y + g.dy / sc1 / 370));
          setSt((cur) => ({ ...cur, objs: cur.objs.map((q) => (q.id === id ? { ...q, x: nx, y: ny } : q)) }));
        }
        putDrag({ ...d, x: e.nativeEvent.locationX / sc1, y: e.nativeEvent.locationY / sc1, moved });
      },
      onPanResponderRelease: (e) => {
        const L = latest.current;
        const d = dref.current;
        putDrag(null);
        if (!d) { setSel(null); return; }
        const sc1 = L.sc || 1;
        const t = L.hit(e.nativeEvent.locationX / sc1, e.nativeEvent.locationY / sc1);
        if (!d.moved) { setSel(L.sel && sameEnd(L.sel, d.from) ? null : d.from); return; }
        if (L.mode === 'wire' && t && !sameEnd(t, d.from)) {
          const ty = L.ctype === 'auto' ? undefined : L.ctype;
          setSt((cur) => addCable(cur, d.from, t, ty));
          setSel(d.from);
        }
        if (L.mode === 'move' && 'o' in d.from) setSel(d.from);
      },
      onPanResponderTerminate: () => putDrag(null),
    }),
  ).current;

  const addObj = (kind: Kind) => {
    // un peu en décalé pour ne pas empiler les nouveaux objets
    const n = st.objs.length;
    const o: StageObj = { id: newId('o'), kind, name: kindLabel(kind), x: 0.15 + ((n * 0.13) % 0.7), y: 0.3 + ((n * 0.17) % 0.5) };
    setSt({ ...st, objs: [...st.objs, o] });
    setSel({ o: o.id });
  };
  const fill = () => {
    const chans: { plug: number; name: string }[] = [];
    for (let c = 1; c <= CH_COUNT; c++) {
      const nm = String(client.get(chNamePath(c)) ?? '').trim();
      if (nm) chans.push({ plug: insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)), name: nm });
    }
    const buses = Array.from({ length: BUS_COUNT }, (_, k) => ({ n: k + 1, name: String(client.get(busNamePath(k + 1)) ?? '').trim() })).filter((b) => b.name);
    const go = () => { setSt(fromChannels(chans, buses)); setSel(null); };
    if (!chans.length) { Alert.alert('Aucune voie nommée', 'Nomme d’abord tes voies (Table › touche un nom), ou pose les objets à la main.'); return; }
    if (st.objs.length) Alert.alert('Remplacer la scène ?', 'La scène actuelle est remplacée par une scène faite d’après tes voies et tes retours.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Remplacer', onPress: go }]);
    else go();
  };
  const share = () => {
    const lines = ['MA SCÈNE', ''];
    for (const c of st.cables) lines.push(`  ${endLabel(st, c.a, busName)} → ${endLabel(st, c.b, busName)} · ${c.type === 'xlr' ? 'XLR' : 'jack'}`);
    lines.push('', gearText(st), '', 'Fait avec Ma table');
    Share.share({ message: lines.join('\n'), title: 'Ma scène' });
  };

  // câbles : plusieurs entre les mêmes bouts s'écartent un peu
  const pairIdx = useMemo(() => {
    const m = new Map<string, number>();
    const key = (c: { a: End; b: End }) => [JSON.stringify(c.a), JSON.stringify(c.b)].sort().join('|');
    const out: Record<string, number> = {};
    for (const c of st.cables) { const k = key(c); const n = m.get(k) ?? 0; out[c.id] = n; m.set(k, n + 1); }
    return out;
  }, [st.cables]);
  // câbles vers la table : ils descendent tout droit jusqu'au bord de scène, puis rejoignent leur prise
  const toTable = (c: { a: End; b: End }) => ('o' in c.a) !== ('o' in c.b);
  const dropIdx = useMemo(() => {
    const per = new Map<string, number>();
    const out: Record<string, number> = {};
    for (const c of st.cables) {
      if (!toTable(c)) continue;
      const o = 'o' in c.a ? c.a.o : (c.b as { o: string }).o;
      const n = per.get(o) ?? 0;
      out[c.id] = n;
      per.set(o, n + 1);
    }
    return out;
  }, [st.cables]);
  const tablePath = (obj: { x: number; y: number }, port: { x: number; y: number }, k: number) => {
    const x = obj.x + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 7 : 0);
    const y0 = STAGE_H + 4;
    return `M${obj.x} ${obj.y} L${x} ${obj.y + R} L${x} ${y0} C ${x} ${y0 + 26}, ${port.x} ${port.y - 44}, ${port.x} ${port.y - 12}`;
  };
  const cablePath = (a: { x: number; y: number }, b: { x: number; y: number }, off: number) => {
    const my = (a.y + b.y) / 2;
    const ox = off ? (off % 2 ? 1 : -1) * Math.ceil(off / 2) * 18 : 0;
    return `M${a.x} ${a.y} C ${a.x + ox} ${my}, ${b.x + ox} ${my}, ${b.x} ${b.y}`;
  };
  const selCables = sel ? touching(st, sel) : [];
  const isSelCable = (id: string) => selCables.some((c) => c.id === id);
  const hov = drag && drag.moved && mode === 'wire' ? hit(drag.x, drag.y) : null;
  const dragType: CableType = drag && hov && ctype === 'auto' ? addCable(st, drag.from, hov).cables.slice(-1)[0]?.type ?? 'jack' : ctype === 'auto' ? 'jack' : ctype;
  const selObj = sel && 'o' in sel ? st.objs.find((o) => o.id === sel.o) ?? null : null;

  const Cable = ({ d, type, dim, dash }: { d: string; type: CableType; dim?: boolean; dash?: boolean }) => (
    <G opacity={dim ? 0.25 : 1}>
      {type === 'xlr' ? <>
        <Path d={d} fill="none" stroke="#0B0D10" strokeWidth={9} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
        <Path d={d} fill="none" stroke={XLR} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
      </> : <Path d={d} fill="none" stroke={JACK} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={dash ? '12 10' : undefined} />}
    </G>
  );

  return (
    <View style={{ flex: 1, paddingHorizontal: 10, gap: 8 }}>
      {/* barre d'outils */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Segmented theme={theme} value={mode} onChange={(m) => { setMode(m); }} options={[['move', '✋ Placer'], ['wire', '🔌 Câbler']] as const} />
        {mode === 'wire' ? (
          <>
            <Segmented theme={theme} value={ctype} onChange={setCtype} options={[['auto', 'Auto'], ['jack', 'Jack'], ['xlr', 'XLR']] as const} />
            <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }} numberOfLines={2}>Glisse d’un objet à un autre, ou jusqu’à une prise de la table. Auto : XLR pour les micros, DI et retours, jack sinon.</Text>
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
            {KINDS.map(({ kind, label }) => {
              const c = FAM_COLOR[family(kind)];
              return (
                <Pressable key={kind} onPress={() => addObj(kind)} onLongPress={() => showTip(`Ajoute ${label.toLowerCase()} sur la scène, puis fais-le glisser à sa place.`)} style={[styles.add, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                  <Svg width={26} height={26} viewBox="0 0 26 26"><KindIcon kind={kind} x={13} y={13} c={c} s={0.6} /></Svg>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* la scène */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {sc > 0 && (
          <View style={{ width: W * sc, height: H * sc }}>
            <Svg width={W * sc} height={H * sc} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
              <Rect x={4} y={4} width={W - 8} height={STAGE_H} rx={22} fill="#16191E" stroke="#2A3038" strokeWidth={2} />
              {[...Array(9)].map((_, k) => <Line key={k} x1={4 + (k + 1) * 99} y1={6} x2={4 + (k + 1) * 99} y2={STAGE_H + 2} stroke="#1D2127" strokeWidth={2} />)}
              <SvgText x={W - 24} y={STAGE_H - 10} textAnchor="end" fontSize={13} fill="#5B636D" fontWeight="700">▼ PUBLIC</SvgText>
              <SvgText x={20} y={24} fontSize={13} fill="#5B636D" fontWeight="700">FOND DE SCÈNE</SvgText>
              {/* la table */}
              <Rect x={14} y={STAGE_H + 14} width={W - 28} height={H - STAGE_H - 18} rx={14} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
              <SvgText x={W / 2 - 110} y={H - 10} textAnchor="end" fontSize={11} fill="#9AA3AD" fontWeight="800">◀ ENTRÉES</SvgText>
              <SvgText x={603} y={H - 10} fontSize={11} fill="#9AA3AD" fontWeight="800">SORTIES · RETOURS ▶</SvgText>
              {Array.from({ length: 18 }, (_, k) => k + 1).map((n) => {
                const used = touching(st, { plug: n }).length > 0;
                const on = !!sel && 'plug' in sel && sel.plug === n;
                return (
                  <G key={n}>
                    <SvgText x={plugX(n)} y={PORT_Y + 28} textAnchor="middle" fontSize={11} fontWeight="800" fill={used ? '#E8EAED' : '#5B636D'}>{String(n)}</SvgText>
                    <Circle cx={plugX(n)} cy={PORT_Y} r={11} fill="#0B0D10" stroke={on ? '#FFFFFF' : used ? '#E8EAED' : '#3A414B'} strokeWidth={on ? 4 : 2} />
                    <Circle cx={plugX(n)} cy={PORT_Y} r={4} fill={used ? '#E8EAED' : '#2A3038'} />
                  </G>
                );
              })}
              {OUTS.map((id, k) => {
                const used = touching(st, { out: id }).length > 0;
                const on = !!sel && 'out' in sel && sel.out === id;
                const c = k < 6 ? MIX_COLORS[k + 1] : MIX_COLORS[0];
                return (
                  <G key={id}>
                    <SvgText x={outX(id)} y={PORT_Y + 30} textAnchor="middle" fontSize={11} fontWeight="800" fill={c}>{k < 6 ? `AUX${k + 1}` : id === 'mainL' ? 'MAIN L' : 'MAIN R'}</SvgText>
                    <Circle cx={outX(id)} cy={PORT_Y} r={13} fill="#0B0D10" stroke={on ? '#FFFFFF' : c} strokeWidth={on ? 4 : 2.5} />
                    <Circle cx={outX(id)} cy={PORT_Y} r={5} fill={used ? c : '#2A3038'} />
                  </G>
                );
              })}
              
              {/* câbles, sous les objets */}
              {st.cables.map((c) => {
                const a = posOf(c.a);
                const b = posOf(c.b);
                const d = toTable(c) ? ('o' in c.a ? tablePath(a, b, dropIdx[c.id] ?? 0) : tablePath(b, a, dropIdx[c.id] ?? 0)) : cablePath(a, b, pairIdx[c.id] ?? 0);
                return <Cable key={c.id} d={d} type={c.type} dim={!!sel && !isSelCable(c.id)} />;
              })}
              {drag && drag.moved && mode === 'wire' && (() => {
                const a = posOf(drag.from);
                const ok = !!hov && !sameEnd(hov, drag.from);
                const b = ok ? posOf(hov!) : { x: drag.x, y: drag.y };
                return (
                  <G>
                    {ok && <Circle cx={b.x} cy={b.y} r={'o' in hov! ? R + 12 : 22} fill="rgba(52,211,153,0.22)" stroke="#34D399" strokeWidth={4} />}
                    <Cable d={cablePath(a, b, 0)} type={dragType} dash={!ok} />
                  </G>
                );
              })()}
              {/* objets */}
              {st.objs.map((o) => {
                const c = FAM_COLOR[family(o.kind)];
                const on = !!sel && 'o' in sel && sel.o === o.id;
                const n = touching(st, { o: o.id }).length;
                return (
                  <G key={o.id}>
                    {on && <Circle cx={px(o)} cy={py(o)} r={R + 8} fill="none" stroke="#FFFFFF" strokeWidth={3} />}
                    <Circle cx={px(o)} cy={py(o)} r={R} fill="#1E2227" stroke={c} strokeWidth={3} />
                    <KindIcon kind={o.kind} x={px(o)} y={py(o)} c={c} />
                    {n > 0 && <G><Circle cx={px(o) + R - 4} cy={py(o) - R + 4} r={9} fill={c} /><SvgText x={px(o) + R - 4} y={py(o) - R + 8} textAnchor="middle" fontSize={11} fontWeight="900" fill="#0B0D10">{String(n)}</SvgText></G>}
                    {(() => { const t = o.name.slice(0, 14); const lw = Math.min(112, 16 + t.length * 7); return <><Rect x={px(o) - lw / 2} y={py(o) + R + 4} width={lw} height={20} rx={10} fill="#0B0D10" opacity={0.8} /><SvgText x={px(o)} y={py(o) + R + 18} textAnchor="middle" fontSize={12} fontWeight="800" fill="#E8EAED">{t}</SvgText></>; })()}
                  </G>
                );
              })}
              {!st.objs.length && (
                <SvgText x={W / 2} y={STAGE_H / 2} textAnchor="middle" fontSize={20} fill="#5B636D" fontWeight="700">Scène vide · ajoute des objets en haut, ou « Remplir depuis mes voies »</SvgText>
              )}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
          </View>
        )}
      </View>

      {/* le tiroir */}
      <View style={[styles.drawer, { backgroundColor: theme.panel, borderColor: selObj ? FAM_COLOR[family(selObj.kind)] : sel ? theme.text : theme.line }]}>
        {!sel && (
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>À emporter</Text>
              <Btn theme={theme} small kind="outline" label="Remplir depuis mes voies" onPress={fill} />
              <Btn theme={theme} small kind="primary" label="↗ Partager" onPress={share} />
              {st.objs.length > 0 && <Btn theme={theme} small kind="ghost" label="Tout effacer" onPress={() => Alert.alert('Effacer la scène ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Effacer', style: 'destructive', onPress: () => setSt(EMPTY) }])} />}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'stretch' }}>
              {gear(st).map((g) => {
                const ok = !!packed[g.key];
                return (
                  <Pressable key={g.key} onPress={() => setPacked((p) => ({ ...p, [g.key]: !ok }))} style={[styles.gear, { borderColor: ok ? '#34D399' : theme.line, backgroundColor: ok ? 'rgba(52,211,153,0.12)' : theme.deep }]}>
                    <Text style={{ color: ok ? '#34D399' : theme.text, fontSize: 24, fontWeight: '900' }}>{ok ? '✓' : g.n}</Text>
                    <Text style={{ color: ok ? theme.muted : theme.text, fontSize: 12, fontWeight: '700', textDecorationLine: ok ? 'line-through' : 'none' }}>{g.label}</Text>
                  </Pressable>
                );
              })}
              {!gear(st).length && <Text style={{ color: theme.muted }}>Pose des objets et tire des câbles : la liste se remplit toute seule.</Text>}
            </ScrollView>
          </View>
        )}
        {sel && (
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {selObj ? (
                <>
                  <Svg width={44} height={44} viewBox="0 0 44 44"><Circle cx={22} cy={22} r={20} fill="#1E2227" stroke={FAM_COLOR[family(selObj.kind)]} strokeWidth={2.5} /><KindIcon kind={selObj.kind} x={22} y={22} c={FAM_COLOR[family(selObj.kind)]} s={0.75} /></Svg>
                  <TextInput value={selObj.name} maxLength={24} onChangeText={(v) => setSt({ ...st, objs: st.objs.map((o) => (o.id === selObj.id ? { ...o, name: v } : o)) })} style={[styles.name, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{kindLabel(selObj.kind)}</Text>
                  <Btn theme={theme} small kind="danger" label="Retirer" onPress={() => { setSt(removeObj(st, selObj.id)); setSel(null); }} />
                </>
              ) : (
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>
                  {endLabel(st, sel, busName)}{'plug' in sel && plugName(sel.plug) ? <Text style={{ color: theme.muted, fontSize: 13 }}> · {plugName(sel.plug)}</Text> : null}
                </Text>
              )}
              <View style={{ flex: selObj ? 0 : undefined }} />
              <Btn theme={theme} small kind="ghost" label="OK" onPress={() => setSel(null)} />
            </View>
            <ScrollView contentContainerStyle={{ gap: 6 }}>
              {selCables.map((c) => {
                const other = sameEnd(c.a, sel) ? c.b : c.a;
                return (
                  <View key={c.id} style={[styles.row, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                    <View style={{ width: 26, height: c.type === 'xlr' ? 8 : 4, borderRadius: 4, backgroundColor: c.type === 'xlr' ? XLR : JACK }} />
                    <Text style={{ color: theme.text, fontWeight: '800', flex: 1 }} numberOfLines={1}>→ {endLabel(st, other, busName)}{'plug' in other && plugName(other.plug) ? ` · ${plugName(other.plug)}` : ''}</Text>
                    <Segmented theme={theme} value={c.type} onChange={(t) => setSt(setCableType(st, c.id, t))} options={[['jack', 'Jack'], ['xlr', 'XLR']] as const} />
                    <Pressable onPress={() => setSt(removeCable(st, c.id))} accessibilityLabel="Retirer ce câble" style={styles.x}><Text style={{ color: theme.muted, fontSize: 20 }}>✕</Text></Pressable>
                  </View>
                );
              })}
              {!selCables.length && <Text style={{ color: theme.muted }}>Aucun câble. Passe en « 🔌 Câbler » et glisse depuis ici vers un autre objet ou une prise.</Text>}
              {selObj && family(selObj.kind) === 'monitor' && !selCables.some((c) => 'out' in c.a || 'out' in c.b) && (
                <Text style={{ color: '#FCD34D', fontSize: 12 }}>Ce retour n’est relié à aucune sortie : en « 🔌 Câbler », glisse-le jusqu’à une sortie AUX de la table.</Text>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  drawer: { height: 168, borderWidth: 2, borderRadius: 18, padding: 10, marginBottom: 8 },
  gear: { minWidth: 112, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, gap: 0, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minHeight: 50 },
  name: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 17, fontWeight: '800' },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
