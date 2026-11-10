// Vue « Table » des branchements : la XR18 dessinée en haut, un tiroir en bas.
// Touche une prise : tu règles l'entrée (gain, nom, couleur, 48 V) ou tu la
// relies aux sorties (un curseur par sortie). Touche une sortie : ce qu'elle
// entend. Tout tient sur l'écran, sans défiler.
import { useMono } from '../ui/useMono';
import { GroupBar } from '../ui/GroupBar';
import { showTip } from '../ui/tip';
import { linkSide, onSide, unlinkSide } from '../xair/wiring';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f } from '../osc/osc';
import { MonoSwitch } from '../ui/MonoSwitch';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import { chLevelPath, FX_COUNT, meterIndex, MODEL, Target, targetId } from '../xair/addresses';
import { useLevels } from '../xair/useMeter';
import { fxType, fxTypePath } from '../xair/effects';
import { SLOT_COLORS } from '../xair/fxSlots';
import { readGroups } from '../xair/groups';
import { Btn } from '../ui/kit';
import { GROUP_COLORS } from './GroupsSheet';
import { dbToFader, faderToDb } from '../xair/levels';
import { colorOf } from '../xair/smartName';
import { Outlet, outlets, Plug, plugs, wires, wiringPaths, plugColor as plugColorOf } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { ChannelDrawer, DrawerActions, LevelKnob } from './ChannelDrawer';
import { MIX_COLORS } from './MixPicker';

type Sel = { k: 'in'; n: number } | { k: 'out'; id: string } | { k: 'many'; ns: number[]; g?: number } | null;
type End = { kind: 'plug'; n: number } | { kind: 'out'; id: string } | { kind: 'group'; k: number } | { kind: 'fold'; k: number };
const W = 1000;
const H = 300;
const xIn = (n: number) => (n <= 16 ? 60 + ((n - 1) % 8) * 72 : n === 17 ? 700 : 760);
const yIn = (n: number) => (n <= 8 ? 66 : 158);
const xOut = (k: number) => (k < 6 ? 60 + k * 100 : k === 6 ? 860 : 920); // 2 enceintes : MAIN L puis MAIN R
const Y_OUT = 262;
// bouton « Plusieurs », dans le coin libre à droite de la 2e rangée (repère du dessin)
const MULTI = { x: 812, y: 126, w: 170, h: 46 };

export function TableWiring(props: { client: XAirClient; theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string; actions?: DrawerActions; multiCtl?: { on: boolean; set: (v: boolean) => void } }) {
  const { client, theme, P, O } = props;
  const mono = useMono(client);
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [sel, setSel] = useState<Sel>({ k: 'in', n: 1 });
  const [multiL, setMultiL] = useState(false);
  // « ☑ Sélectionner » peut venir de la barre du haut de la Table (même bouton dans toutes les vues)
  const multi = props.multiCtl ? props.multiCtl.on : multiL;
  const setMulti = (v: boolean) => (props.multiCtl ? props.multiCtl.set(v) : setMultiL(v));
  const [open, setOpen] = useState<number[]>([]);
  const [size, setSize] = useState({ w: 0 });
  const scale = size.w ? size.w / W : 0;
  const linked = (n: number, id: string) => props.W.some((w) => w.plug === n && w.out === id);
  const plug = sel?.k === 'in' ? P[sel.n - 1] : null;
  const out = sel?.k === 'out' ? O.find((o) => o.id === sel.id) ?? null : null;
  const many = sel?.k === 'many' ? sel : null;
  // MAIN L / MAIN R : la voie n'est « reliée » à ce côté que si son panoramique l'y envoie
  const level = (p: Plug, o: Outlet) => (!p.chans.length || (o.side && !onSide(client, p.chans, o.side)) ? 0 : Number(client.get(chLevelPath(p.chans[0], o.t)) ?? 0));
  const setLevel = (p: Plug, o: Outlet, v: number) => {
    if (o.side && v > 0 && !onSide(client, p.chans, o.side)) linkSide(client, p.chans, o.side, -10);
    p.chans.forEach((c) => client.set(chLevelPath(c, o.t), f(v)));
  };
  const toggle = (p: Plug, o: Outlet) => {
    if (!p.chans.length) { Alert.alert('Prise libre', `Rien n’écoute la prise ${p.n}. Donne-lui une voie depuis la Table (Changer l’entrée).`); return; }
    if (o.side) { if (linked(p.n, o.id)) unlinkSide(client, p.chans, o.side); else linkSide(client, p.chans, o.side, -10); return; }
    setLevel(p, o, linked(p.n, o.id) ? 0 : dbToFader(-10));
  };
  const panelH = Math.min(H * (scale || 1), height * (wide ? 0.42 : 0.3));
  const effScale = size.w ? Math.min(scale, panelH / H) : 0;
  const pw = W * effScale;
  const ph = H * effScale;

  // Groupes (DCA) : repliés en une capsule, comme dans Câbles ; un appui sur « déplier » les ouvre.
  const plugOfCh = (c: number) => P.find((p) => p.chans.includes(c))?.n ?? null;
  const gInfo = readGroups(client).filter((g) => g.members.length > 1).map((g) => {
    const ps = g.members.map(plugOfCh).filter((n): n is number => n !== null).sort((a, b) => a - b);
    return { k: g.k, name: g.name, plugs: ps, anchor: ps[0], folded: !open.includes(g.k) && ps.length > 1 };
  }).filter((g) => g.plugs.length > 1);
  const groupOf = (n: number) => gInfo.find((g) => g.plugs.includes(n));
  const folded = (n: number) => { const g = groupOf(n); return g && g.folded ? g : null; };
  const anchorOf = (n: number) => folded(n)?.anchor ?? n;
  // les prises s'allument quand un son arrive
  const lv = useLevels(client, P.flatMap((p) => p.chans), meterIndex.ch);
  const live = (n: number) => Math.max(0, ...(P[n - 1]?.chans ?? []).map((c) => lv[c] ?? 0));
  const glow = (x: number, y: number, n: number, c: string, r: number) => {
    const l = live(n);
    if (l < 0.15) return null;
    return <Circle cx={x} cy={y} r={r + 3 + l * 9} fill="none" stroke={c} strokeWidth={2 + l * 6} opacity={0.15 + l * 0.65} />;
  };
  const selected = (n: number) => (sel?.k === 'in' && sel.n === n) || (!!many && many.ns.includes(n));

  // Qu'y a-t-il sous le doigt ? (repère du dessin)
  const hit = (x: number, y: number): End | null => {
    for (const g of gInfo) {
      const ax = xIn(g.anchor), ay = yIn(g.anchor);
      if (Math.abs(x - ax) < 48 && y > ay - 56 && y < ay - 28) return { kind: 'fold', k: g.k };
      if (g.folded && Math.abs(x - ax) < 48 && Math.abs(y - ay) < 28) return { kind: 'group', k: g.k };
    }
    for (const p of P) {
      if (Math.hypot(x - xIn(p.n), y - yIn(p.n)) >= 36) continue;
      const g = folded(p.n);
      return g ? { kind: 'group', k: g.k } : { kind: 'plug', n: p.n };
    }
    for (let k = 0; k < O.length; k++) if (x > xOut(k) - (O[k].side ? 28 : 30) && x < xOut(k) + (O[k].side ? 28 : 80) && Math.abs(y - Y_OUT) < 30) return { kind: 'out', id: O[k].id };
    return null;
  };
  const [drag, setDrag] = useState<{ from: End; x: number; y: number; moved: boolean } | null>(null);
  // Les prises emmenées par un glissement : le groupe, ou toute la sélection si on part d'une prise choisie.
  const carried = (e: End): number[] => {
    if (e.kind === 'group') return gInfo.find((g) => g.k === e.k)?.plugs ?? [];
    if (e.kind === 'plug') return many && many.ns.includes(e.n) ? many.ns : [e.n];
    return [];
  };
  useEffect(() => {
    if (!props.multiCtl) return;
    if (multi && sel?.k === 'in') setSel({ k: 'many', ns: [sel.n] });
    if (!multi && sel?.k === 'many' && sel.g === undefined) setSel(null);
  }, [multi]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef({ effScale, P, O, linked, hit, carried, sel, multi, gInfo });
  latest.current = { effScale, P, O, linked, hit, carried, sel, multi, gInfo };
  const linkAll = (ns: number[], o: Outlet) => {
    const L = latest.current;
    const free = ns.filter((n) => !L.P[n - 1]?.chans.length);
    ns.forEach((n) => { const p = L.P[n - 1]; if (p?.chans.length && !L.linked(n, o.id)) { if (o.side) linkSide(client, p.chans, o.side, -10); else setLevel(p, o, dbToFader(-10)); } });
    if (free.length === ns.length) Alert.alert('Prise libre', `Rien n’écoute la prise ${free[0]}. Donne-lui une voie depuis la Table (Changer l’entrée).`);
  };
  const tapEnd = (e: End) => {
    const L = latest.current;
    if (e.kind === 'fold') { setOpen((o) => (o.includes(e.k) ? o.filter((k) => k !== e.k) : [...o, e.k])); return; }
    if (e.kind === 'out') { setSel({ k: 'out', id: e.id }); return; }
    const cur = L.sel?.k === 'many' && (L.multi || L.sel.g === undefined) ? L.sel.ns : L.sel?.k === 'in' ? [L.sel.n] : [];
    if (e.kind === 'group') {
      const g = L.gInfo.find((x) => x.k === e.k);
      if (!g) return;
      if (!L.multi) { setSel({ k: 'many', ns: g.plugs, g: g.k }); return; }
      // « Plusieurs » : le groupe entier entre (ou sort) de la sélection
      const all = g.plugs.every((n) => cur.includes(n));
      const ns = all ? cur.filter((n) => !g.plugs.includes(n)) : [...new Set([...cur, ...g.plugs])].sort((a, b) => a - b);
      setSel(ns.length ? { k: 'many', ns } : null);
      return;
    }
    if (L.multi) {
      const ns = cur.includes(e.n) ? cur.filter((x) => x !== e.n) : [...cur, e.n].sort((a, b) => a - b);
      setSel(ns.length ? { k: 'many', ns } : null);
    } else setSel({ k: 'in', n: e.n });
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const sc = latest.current.effScale || 1;
        const t = latest.current.hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
        setDrag(t ? { from: t, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, moved: false } : null);
      },
      onPanResponderMove: (e, g) => {
        const moved = Math.abs(g.dx) + Math.abs(g.dy) > 8;
        setDrag((d) => (d && d.from.kind !== 'fold' ? { ...d, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, moved: d.moved || moved } : d));
      },
      onPanResponderRelease: (e) => {
        const L = latest.current;
        const sc = L.effScale || 1;
        const t = L.hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
        setDrag((d) => {
          if (!d) return null;
          if (!d.moved || !t) { setTimeout(() => tapEnd(d.from), 0); return null; }
          const o = d.from.kind === 'out' ? L.O.find((x) => x.id === (d.from as { id: string }).id) : t.kind === 'out' ? L.O.find((x) => x.id === t.id) : null;
          const ns = d.from.kind === 'out' ? L.carried(t) : t.kind === 'out' ? L.carried(d.from) : [];
          if (o && ns.length) {
            setTimeout(() => {
              linkAll(ns, o);
              const g = d.from.kind === 'group' ? d.from.k : t.kind === 'group' ? t.k : undefined;
              setSel(ns.length > 1 ? { k: 'many', ns, g } : { k: 'in', n: ns[0] });
            }, 0);
          } else setTimeout(() => tapEnd(t), 0);
          return null;
        });
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;
  const sc0 = effScale || 1;
  const hov = drag && drag.moved ? hit(drag.x / sc0, drag.y / sc0) : null;
  const xyOf = (e: End) => (e.kind === 'out' ? { x: xOut(O.findIndex((o) => o.id === e.id)), y: Y_OUT } : e.kind === 'plug' ? { x: xIn(e.n), y: yIn(e.n) } : (() => { const g = gInfo.find((x) => x.k === e.k)!; return { x: xIn(g.anchor), y: yIn(g.anchor) }; })());
  const hovOk = !!hov && !!drag && hov.kind !== 'fold' && (hov.kind === 'out') !== (drag.from.kind === 'out');
  const dragColor = (e: End) => (e.kind === 'out' ? props.outColor(O.find((o) => o.id === e.id)!) : e.kind === 'plug' ? props.plugColor(P[e.n - 1]) : GROUP_COLORS[e.k - 1]);
  const manyPlugs = many ? many.ns.map((n) => P[n - 1]).filter(Boolean) : [];
  const manyGroup = many?.g !== undefined ? gInfo.find((g) => g.k === many.g) ?? null : null;
  const drawerColor = plug ? props.plugColor(plug) : out ? props.outColor(out) : manyGroup ? GROUP_COLORS[manyGroup.k - 1] : many ? '#FFFFFF' : theme.line;

  return (
    <View style={{ flex: 1, paddingHorizontal: 10, gap: 8 }}>
      {/* la table */}
      <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width })} style={{ alignItems: 'center' }}>
        {size.w > 0 && (
          <View style={{ width: pw, height: ph }}>
          <Svg width={pw} height={ph} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
            <Rect x={4} y={4} width={W - 8} height={H - 8} rx={16} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
            <SvgText x={W - 30} y={36} textAnchor="end" fontSize={20} fontWeight="800" fill="#E8EAED">{MODEL.name}</SvgText>
            <SvgText x={W - 30} y={70} textAnchor="end" fontSize={11} fontFamily="System" fill="#9AA3AD">ENTRÉES · touche une prise</SvgText>
            <SvgText x={W - 30} y={86} textAnchor="end" fontSize={11} fontFamily="System" fill="#9AA3AD">glisse-la vers une sortie pour la relier</SvgText>
            <SvgText x={W / 2} y={Y_OUT - 36} textAnchor="middle" fontSize={11} fontFamily="System" fill="#9AA3AD">SORTIES · touche qui écoute</SvgText>
            {/* fils */}
            {props.W.map((w) => {
              const oi = O.findIndex((o) => o.id === w.out);
              if (oi < 0) return null;
              const show = !sel || selected(w.plug) || (sel.k === 'out' && sel.id === w.out);
              const n0 = anchorOf(w.plug);
              const a = { x: xIn(n0), y: yIn(n0) };
              const b = { x: xOut(oi), y: Y_OUT - 20 };
              return <Path key={w.plug + w.out} d={`M${a.x} ${a.y + 20} C ${a.x} ${a.y + 70}, ${b.x} ${b.y - 60}, ${b.x} ${b.y}`} fill="none" stroke={props.plugColor(P[w.plug - 1])} strokeWidth={3 + Math.max(0, (w.db + 40) / 10)} strokeLinecap="round" opacity={show ? 0.9 : 0.07} />;
            })}
            {/* prises */}
            {P.map((p) => {
              const x = xIn(p.n), y = yIn(p.n);
              const g = groupOf(p.n);
              const gc = g ? GROUP_COLORS[g.k - 1] : '';
              if (g && g.folded && g.anchor !== p.n) return <G key={p.n} opacity={0.2}><Circle cx={x} cy={y} r={20} fill="#1E2227" stroke={gc} strokeWidth={2} /></G>;
              if (g && g.folded) {
                const on = many?.g === g.k;
                const gl = Math.max(...g.plugs.map(live));
                return (
                  <G key={p.n}>
                    {gl >= 0.15 && <Rect x={x - 50 - gl * 6} y={y - 30 - gl * 6} width={100 + gl * 12} height={60 + gl * 12} rx={30 + gl * 6} fill="none" stroke={gc} strokeWidth={2 + gl * 5} opacity={0.15 + gl * 0.65} />}
                    <Rect x={x - 46} y={y - 26} width={92} height={52} rx={26} fill={on ? gc : '#1E2227'} stroke={on ? '#FFFFFF' : gc} strokeWidth={on ? 4 : 3} />
                    <SvgText x={x} y={y - 3} textAnchor="middle" fontSize={13} fontWeight="800" fill={on ? '#0B0D10' : gc}>{g.name.slice(0, 11)}</SvgText>
                    <SvgText x={x} y={y + 13} textAnchor="middle" fontSize={10} fill={on ? '#0B0D10' : '#E8EAED'}>{`${g.plugs.length} prises`}</SvgText>
                    <Rect x={x - 44} y={y - 54} width={88} height={22} rx={11} fill="#15181C" stroke={gc} strokeWidth={1.5} />
                    <SvgText x={x} y={y - 39} textAnchor="middle" fontSize={10} fontWeight="800" fill={gc}>▸ déplier</SvgText>
                  </G>
                );
              }
              const on = selected(p.n);
              const hitOut = out ? linked(p.n, out.id) : false;
              const c = props.plugColor(p);
              return (
                <G key={p.n}>
                  {g && g.anchor === p.n ? (
                    <G>
                      <Rect x={x - 44} y={y - 54} width={88} height={22} rx={11} fill={gc} />
                      <SvgText x={x} y={y - 39} textAnchor="middle" fontSize={10} fontWeight="800" fill="#0B0D10">{`▾ ${p.n} · replier`}</SvgText>
                    </G>
                  ) : (
                    <SvgText x={x} y={y - 30} textAnchor="middle" fontSize={13} fontWeight="800" fill="#E8EAED">{String(p.n)}</SvgText>
                  )}
                  {glow(x, y, p.n, c, p.usb ? 16 : 24)}
                  <Circle cx={x} cy={y} r={p.usb ? 16 : 24} fill="#1E2227" stroke={on || hitOut ? '#FFFFFF' : p.chans.length ? c : '#3A414B'} strokeWidth={on || hitOut ? 5 : 3} />
                  <Circle cx={x} cy={y} r={p.usb ? 6 : 12} fill={hitOut || (many && on) ? c : '#0B0D10'} />
                  {g && <Circle cx={x} cy={y} r={29} fill="none" stroke={gc} strokeWidth={1.5} strokeDasharray="4 4" />}
                  <Rect x={x - 34} y={y + 28} width={68} height={16} rx={5} fill={p.name ? c : 'transparent'} />
                  <SvgText x={x} y={y + 40} textAnchor="middle" fontSize={10} fontWeight="800" fill={p.name ? '#0B0D10' : '#5B636D'}>{(p.name || (p.chans.length ? `voie ${p.chans[0]}` : 'libre')).slice(0, 11)}</SvgText>
                </G>
              );
            })}
            {/* sorties */}
            {O.map((o, k) => {
              const on = sel?.k === 'out' && sel.id === o.id;
              const ins = plug ? [plug.n] : many ? many.ns : [];
              const nIn = ins.filter((n) => linked(n, o.id)).length;
              const hitIn = ins.length > 0 && nIn === ins.length;
              const part = nIn > 0 && !hitIn;
              const c = props.outColor(o);
              return (
                <G key={o.id}>
                  {(o.id === 'main' ? [-20, 20] : [0]).map((dx) => o.side ? (
                    <G key={dx}>
                      <Circle cx={xOut(k)} cy={Y_OUT} r={20} fill="#1E2227" stroke={on || hitIn ? '#FFFFFF' : c} strokeWidth={on || hitIn ? 5 : 3} strokeDasharray={part ? '6 4' : undefined} />
                      <SvgText x={xOut(k)} y={Y_OUT + 5} textAnchor="middle" fontSize={14} fontWeight="900" fill={hitIn || part ? c : '#E8EAED'}>{o.side}</SvgText>
                    </G>
                  ) : (
                    <G key={dx}>
                      <Circle cx={xOut(k) + dx} cy={Y_OUT} r={o.id === 'main' ? 17 : 20} fill="#1E2227" stroke={on || hitIn ? '#FFFFFF' : c} strokeWidth={on || hitIn ? 5 : 3} strokeDasharray={part ? '6 4' : undefined} />
                      <Circle cx={xOut(k) + dx} cy={Y_OUT} r={o.id === 'main' ? 7 : 9} fill={hitIn || part ? c : '#0B0D10'} />
                      {o.id === 'main' && <SvgText x={xOut(k) + dx} y={Y_OUT - 21} textAnchor="middle" fontSize={10} fontWeight="900" fill={c}>{dx < 0 ? 'L' : 'R'}</SvgText>}
                    </G>
                  ))}
                  {o.side ? (o.side === 'R' && (
                    <>
                      <SvgText x={xOut(k) + 26} y={Y_OUT - 2} fontSize={11} fontWeight="800" fill={c}>MAIN</SvgText>
                      <SvgText x={xOut(k) + 26} y={Y_OUT + 12} fontSize={10} fill="#E8EAED">Le public</SvgText>
                    </>
                  )) : (
                    <>
                      <SvgText x={xOut(k) + (o.id === 'main' ? 44 : 28)} y={Y_OUT - 2} fontSize={12} fontWeight="800" fill={c}>{o.id === 'main' ? (mono ? 'MAIN mono' : 'MAIN L·R') : o.label}</SvgText>
                      <SvgText x={xOut(k) + (o.id === 'main' ? 44 : 28)} y={Y_OUT + 13} fontSize={11} fill="#E8EAED">{o.name.slice(0, 12)}</SvgText>
                    </>
                  )}
                </G>
              );
            })}
            {/* câble tiré au doigt */}
            {drag && drag.moved && (() => {
              const a = xyOf(drag.from);
              const fx = drag.x / sc0;
              const fy = drag.y / sc0;
              const c = dragColor(drag.from);
              const h = hov && hov.kind !== 'fold' ? xyOf(hov) : null;
              const extra = carried(drag.from).filter((n) => n !== (drag.from.kind === 'plug' ? drag.from.n : -1) && !folded(n));
              return (
                <G>
                  {h && <Circle cx={h.x} cy={h.y} r={32} fill={hovOk ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.10)'} stroke={hovOk ? '#34D399' : '#9AA3AD'} strokeWidth={4} />}
                  {extra.map((n) => <Path key={'x' + n} d={`M${xIn(n)} ${yIn(n)} Q ${(xIn(n) + fx) / 2} ${Math.max(yIn(n), fy) + 30}, ${fx} ${fy}`} fill="none" stroke={props.plugColor(P[n - 1])} strokeWidth={4} strokeLinecap="round" strokeDasharray="8 8" opacity={0.8} />)}
                  <Path d={`M${a.x} ${a.y} Q ${(a.x + fx) / 2} ${Math.max(a.y, fy) + 30}, ${fx} ${fy}`} fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeDasharray={hovOk ? undefined : '10 8'} />
                  <Circle cx={fx} cy={fy} r={10} fill={c} />
                </G>
              );
            })()}
          </Svg>
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
          {!props.multiCtl && <Pressable
            onPress={() => {
              if (multi) { setMulti(false); if (many && many.g === undefined) setSel(many.ns.length ? { k: 'in', n: many.ns[0] } : null); }
              else { setMulti(true); if (plug) setSel({ k: 'many', ns: [plug.n] }); }
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: multi }}
            style={{ position: 'absolute', left: MULTI.x * sc0, top: MULTI.y * sc0, width: MULTI.w * sc0, height: Math.max(36, MULTI.h * sc0), borderRadius: 12, borderWidth: 2, borderColor: multi ? theme.accent : theme.line2, backgroundColor: multi ? theme.accent : theme.deep, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: multi ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{multi ? `✓ Terminé${many && many.g === undefined ? ` · ${many.ns.length}` : ''}` : '☑ Sélectionner'}</Text>
          </Pressable>}
          </View>
        )}
      </View>

      {/* le tiroir */}
      <View style={[styles.drawer, { backgroundColor: theme.panel, borderColor: drawerColor }]}>
        {plug && (plug.chans.length
          ? <ChannelDrawer client={client} theme={theme} ch={plug.chans[0]} actions={props.actions} />
          : <Text style={{ color: theme.muted, fontSize: 14, padding: 12 }}>Prise {plug.n} : rien ne l’écoute. Donne-lui une voie depuis la Table (touche une tranche › Branchée sur › Changer).</Text>)}
        {many && (
          <ManyDrawer
            client={client}
            theme={theme}
            wide={wide}
            plugs={manyPlugs}
            O={O}
            outColor={props.outColor}
            title={manyGroup ? manyGroup.name : `${manyPlugs.length} prise${manyPlugs.length > 1 ? 's' : ''} choisie${manyPlugs.length > 1 ? 's' : ''}`}
            color={manyGroup ? GROUP_COLORS[manyGroup.k - 1] : theme.text}
            extra={manyGroup
              ? <Btn theme={theme} small kind="outline" label="▸ Déplier les prises" onPress={() => setOpen((o) => [...o, manyGroup.k])} />
              : <Btn theme={theme} small kind="ghost" label="Vider" onPress={() => setSel(null)} />}
          />
        )}
        {many && !manyGroup && (
          <GroupBar client={client} theme={theme} chans={manyPlugs.flatMap((p) => p.chans)} onDone={(m) => { showTip(m); setSel(null); setMulti(false); }} onCancel={() => { setSel(null); setMulti(false); }} />
        )}
        {out && (
          <>
            <View style={styles.row}>
              <View style={[styles.tag, { borderColor: props.outColor(out) }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{out.label}</Text></View>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{out.name} <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>· ce qu’il entend</Text></Text>
              {out.t.kind === 'main' && <MonoSwitch client={client} theme={theme} />}
            </View>
            <ScrollView contentContainerStyle={[styles.wrap, wide && { justifyContent: 'space-between' }]}>
              {P.filter((p) => p.chans.length).map((p) => (
                <View key={p.n} style={{ width: wide ? '12%' : 92 }}>
                  <LevelKnob size={46} theme={theme} value={level(p, out)} label={p.name || `voie ${p.chans[0]}`} kicker={`PRISE ${p.n}`} color={props.plugColor(p)} wide={wide} off="n’entend pas" onToggle={() => toggle(p, out)} onSet={(v) => setLevel(p, out, v)} />
                </View>
              ))}
            </ScrollView>
          </>
        )}
        {!sel && <Text style={{ color: theme.muted, textAlign: 'center', padding: 20 }}>{multi ? 'Touche les prises à prendre ensemble, puis relie-les en bas ou glisse-les vers une sortie.' : 'Touche une prise ou une sortie sur la table.'}</Text>}
      </View>
    </View>
  );
}

/** Plusieurs prises à la fois (sélection ou groupe) : un bouton rond par sortie et par effet.
 *  Appui sur le nom : relier toutes (ou les délier si toutes y sont). Tourner : monte ou baisse
 *  toutes les prises reliées du même nombre de dB, l'équilibre entre elles est gardé. */
export function ManyDrawer({ client, theme, wide, plugs: ps, O, outColor, title, color, extra }: { client: XAirClient; theme: Theme; wide: boolean; plugs: Plug[]; O: Outlet[]; outColor: (o: Outlet) => string; title: string; color: string; extra?: React.ReactNode }) {
  const chans = ps.flatMap((p) => p.chans);
  const targets: { t: Target; label: string; kicker?: string; color: string }[] = [
    ...O.map((o) => ({ t: o.t, label: o.name, color: outColor(o) })),
    ...Array.from({ length: FX_COUNT }, (_, k) => ({ t: { kind: 'fx', n: k + 1 } as Target, label: fxType(Number(client.get(fxTypePath(k + 1)) ?? 0)).fr, kicker: `FX${k + 1}`, color: SLOT_COLORS[k] })),
  ];
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={styles.row}>
        <View style={[styles.tag, { borderColor: color }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{ps.length}</Text></View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 19, fontWeight: '800' }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12 }}>{ps.map((p) => p.name || `prise ${p.n}`).join(' · ')}</Text>
        </View>
        {extra}
      </View>
      <ScrollView contentContainerStyle={{ gap: 6 }}>
        <View style={[styles.knobs, !wide && { flexWrap: 'wrap' }]}>
          {targets.map(({ t, label, kicker, color: c }, idx) => {
            const vals = chans.map((ch) => Number(client.get(chLevelPath(ch, t)) ?? 0));
            const nOn = vals.filter((v) => v > 0).length;
            const top = Math.max(0, ...vals);
            const all = chans.length > 0 && nOn === chans.length;
            return (
              <React.Fragment key={targetId(t)}>
                {wide && idx === O.length && <View style={[styles.sep, { backgroundColor: theme.line2 }]} />}
                <LevelKnob
                  theme={theme}
                  wide={wide}
                  value={top}
                  label={label}
                  kicker={kicker ?? (nOn > 0 && !all ? `${nOn}/${chans.length}` : undefined)}
                  color={c}
                  onToggle={() => chans.forEach((ch, k) => { if (all) client.set(chLevelPath(ch, t), f(0)); else if (vals[k] <= 0) client.set(chLevelPath(ch, t), f(dbToFader(kicker ? -14 : -10))); })}
                  onSet={(v) => {
                    if (nOn === 0) { chans.forEach((ch) => client.set(chLevelPath(ch, t), f(v))); return; }
                    if (v <= 0) { chans.forEach((ch) => client.set(chLevelPath(ch, t), f(0))); return; }
                    const delta = faderToDb(v) - faderToDb(top);
                    chans.forEach((ch, k) => { if (vals[k] > 0) client.set(chLevelPath(ch, t), f(dbToFader(Math.min(10, faderToDb(vals[k]) + delta)))); });
                  }}
                />
              </React.Fragment>
            );
          })}
        </View>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Touche un nom pour relier ou délier toutes ces prises · tourne pour les monter ou baisser ensemble (l’équilibre entre elles est gardé)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, borderWidth: 2, borderRadius: 18, padding: 10, gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag: { minWidth: 40, height: 40, borderRadius: 12, borderWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segBtn: { height: 40, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 10 },
  input: { height: 44, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, fontSize: 16, fontWeight: '800' },
  sw: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  knobs: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  sep: { width: 2, borderRadius: 1, marginHorizontal: 2 },
  tg: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});

/** Même vue, autonome : utilisée comme 4e vue de l'écran Table. */
export function TableWiringStandalone({ client, theme, actions, multiCtl }: { client: XAirClient; theme: Theme; actions?: DrawerActions; multiCtl?: { on: boolean; set: (v: boolean) => void } }) {
  useAnyTick(client);
  useMono(client); // 1 ou 2 enceintes : les sorties de façade changent
  useEffect(() => { client.loadPaths(wiringPaths()); }, [client]);
  const P = plugs(client);
  const O = outlets(client);
  const W = wires(client);
  const plugColor = (p: Plug) => plugColorOf(client, p, colorOf);
  const outColor = (o: Outlet) => (o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD');
  return <TableWiring client={client} theme={theme} P={P} O={O} W={W} plugColor={plugColor} outColor={outColor} actions={actions} multiCtl={multiCtl} />;
}
