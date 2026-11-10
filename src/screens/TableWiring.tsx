// Vue « Table » des branchements : la XR18 dessinée en haut, un tiroir en bas.
// Touche une prise : tu règles l'entrée (gain, nom, couleur, 48 V) ou tu la
// relies aux sorties (un curseur par sortie). Touche une sortie : ce qu'elle
// entend. Tout tient sur l'écran, sans défiler.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f } from '../osc/osc';
import { MonoSwitch } from '../ui/MonoSwitch';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import { chLevelPath, MODEL } from '../xair/addresses';
import { dbToFader } from '../xair/levels';
import { colorOf } from '../xair/smartName';
import { Outlet, outlets, Plug, plugs, wires, wiringPaths, plugColor as plugColorOf } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { ChannelDrawer, DrawerActions, LevelKnob } from './ChannelDrawer';
import { MIX_COLORS } from './MixPicker';

type Sel = { k: 'in'; n: number } | { k: 'out'; id: string } | null;
const W = 1000;
const H = 300;
const xIn = (n: number) => (n <= 16 ? 60 + ((n - 1) % 8) * 72 : n === 17 ? 700 : 760);
const yIn = (n: number) => (n <= 8 ? 66 : 158);
const xOut = (k: number) => (k < 6 ? 60 + k * 100 : 880);
const Y_OUT = 262;

export function TableWiring(props: { client: XAirClient; theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string; actions?: DrawerActions }) {
  const { client, theme, P, O } = props;
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [sel, setSel] = useState<Sel>({ k: 'in', n: 1 });
  const [size, setSize] = useState({ w: 0 });
  const scale = size.w ? size.w / W : 0;
  const linked = (n: number, id: string) => props.W.some((w) => w.plug === n && w.out === id);
  const plug = sel?.k === 'in' ? P[sel.n - 1] : null;
  const out = sel?.k === 'out' ? O.find((o) => o.id === sel.id) ?? null : null;
  const level = (p: Plug, o: Outlet) => (p.chans.length ? Number(client.get(chLevelPath(p.chans[0], o.t)) ?? 0) : 0);
  const setLevel = (p: Plug, o: Outlet, v: number) => p.chans.forEach((c) => client.set(chLevelPath(c, o.t), f(v)));
  const toggle = (p: Plug, o: Outlet) => {
    if (!p.chans.length) { Alert.alert('Prise libre', `Rien n’écoute la prise ${p.n}. Donne-lui une voie depuis la Table (Changer l’entrée).`); return; }
    setLevel(p, o, linked(p.n, o.id) ? 0 : dbToFader(-10));
  };
  const panelH = Math.min(H * (scale || 1), height * (wide ? 0.42 : 0.3));
  const effScale = size.w ? Math.min(scale, panelH / H) : 0;
  const pw = W * effScale;
  const ph = H * effScale;

  // Glisser d'une prise vers une sortie (ou l'inverse) = relier, comme dans Branchements.
  type End = { kind: 'plug'; n: number } | { kind: 'out'; id: string };
  const hit = (x: number, y: number): End | null => {
    for (const p of P) if (Math.hypot(x - xIn(p.n), y - yIn(p.n)) < 36) return { kind: 'plug', n: p.n };
    for (let k = 0; k < O.length; k++) if (x > xOut(k) - 30 && x < xOut(k) + 80 && Math.abs(y - Y_OUT) < 30) return { kind: 'out', id: O[k].id };
    return null;
  };
  const [drag, setDrag] = useState<{ from: End; x: number; y: number; moved: boolean } | null>(null);
  const latest = useRef({ effScale, P, O, toggle: (_p: Plug, _o: Outlet) => {}, linked });
  latest.current = { effScale, P, O, toggle: (p: Plug, o: Outlet) => setLevel(p, o, dbToFader(-10)), linked };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const sc = latest.current.effScale || 1;
        const t = hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
        setDrag(t ? { from: t, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, moved: false } : null);
      },
      onPanResponderMove: (e, g) => {
        const moved = Math.abs(g.dx) + Math.abs(g.dy) > 8;
        setDrag((d) => (d ? { ...d, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, moved: d.moved || moved } : d));
      },
      onPanResponderRelease: (e) => {
        const sc = latest.current.effScale || 1;
        const t = hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
        setDrag((d) => {
          if (!d) return null;
          const L = latest.current;
          if (!d.moved || !t) {
            setSel(d.from.kind === 'plug' ? { k: 'in', n: d.from.n } : { k: 'out', id: d.from.id });
            return null;
          }
          const pair = d.from.kind === 'plug' && t.kind === 'out' ? { n: d.from.n, id: t.id } : d.from.kind === 'out' && t.kind === 'plug' ? { n: t.n, id: d.from.id } : null;
          if (pair) {
            const p = L.P[pair.n - 1];
            const o = L.O.find((x) => x.id === pair.id);
            if (p && o) {
              if (!p.chans.length) Alert.alert('Prise libre', `Rien n’écoute la prise ${p.n}. Donne-lui une voie depuis la Table (Changer l’entrée).`);
              else if (!L.linked(p.n, o.id)) L.toggle(p, o);
              setSel({ k: 'in', n: p.n });
            }
          } else setSel(t.kind === 'plug' ? { k: 'in', n: t.n } : { k: 'out', id: t.id });
          return null;
        });
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;
  const sc0 = effScale || 1;
  const hov = drag && drag.moved ? hit(drag.x / sc0, drag.y / sc0) : null;
  const xyOf = (e: End) => (e.kind === 'plug' ? { x: xIn(e.n), y: yIn(e.n) } : { x: xOut(O.findIndex((o) => o.id === e.id)), y: Y_OUT });
  const hovOk = !!hov && !!drag && hov.kind !== drag.from.kind;

  return (
    <View style={{ flex: 1, paddingHorizontal: 10, gap: 8 }}>
      {/* la table */}
      <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width })} style={{ alignItems: 'center' }}>
        {size.w > 0 && (
          <View style={{ width: pw, height: ph }}>
          <Svg width={pw} height={ph} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
            <Rect x={4} y={4} width={W - 8} height={H - 8} rx={16} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
            <SvgText x={W - 30} y={36} textAnchor="end" fontSize={20} fontWeight="800" fill="#E8EAED">{MODEL.name}</SvgText>
            <SvgText x={W / 2} y={22} textAnchor="middle" fontSize={11} fontFamily="System" fill="#9AA3AD">ENTRÉES · touche une prise, glisse-la vers une sortie pour la relier</SvgText>
            <SvgText x={W / 2} y={Y_OUT - 36} textAnchor="middle" fontSize={11} fontFamily="System" fill="#9AA3AD">SORTIES · touche qui écoute</SvgText>
            {/* fils */}
            {props.W.map((w) => {
              const p = P[w.plug - 1];
              const oi = O.findIndex((o) => o.id === w.out);
              if (oi < 0) return null;
              const show = !sel || (sel.k === 'in' && sel.n === w.plug) || (sel.k === 'out' && sel.id === w.out);
              const a = { x: xIn(w.plug), y: yIn(w.plug) };
              const b = { x: xOut(oi), y: Y_OUT - 20 };
              return <Path key={w.plug + w.out} d={`M${a.x} ${a.y + 20} C ${a.x} ${a.y + 70}, ${b.x} ${b.y - 60}, ${b.x} ${b.y}`} fill="none" stroke={props.plugColor(p)} strokeWidth={3 + Math.max(0, (w.db + 40) / 10)} strokeLinecap="round" opacity={show ? 0.9 : 0.07} />;
            })}
            {/* prises */}
            {P.map((p) => {
              const on = sel?.k === 'in' && sel.n === p.n;
              const hit = out ? linked(p.n, out.id) : false;
              const c = props.plugColor(p);
              return (
                <G key={p.n}>
                  <Circle cx={xIn(p.n)} cy={yIn(p.n)} r={p.usb ? 16 : 24} fill="#1E2227" stroke={on ? '#FFFFFF' : hit ? '#FFFFFF' : p.chans.length ? c : '#3A414B'} strokeWidth={on || hit ? 5 : 3} />
                  <Circle cx={xIn(p.n)} cy={yIn(p.n)} r={p.usb ? 6 : 12} fill={hit ? c : '#0B0D10'} />
                  <SvgText x={xIn(p.n)} y={yIn(p.n) - 30} textAnchor="middle" fontSize={13} fontWeight="800" fill="#E8EAED">{p.n}</SvgText>
                  <Rect x={xIn(p.n) - 34} y={yIn(p.n) + 28} width={68} height={16} rx={5} fill={p.name ? c : 'transparent'} />
                  <SvgText x={xIn(p.n)} y={yIn(p.n) + 40} textAnchor="middle" fontSize={10} fontWeight="800" fill={p.name ? '#0B0D10' : '#5B636D'}>{(p.name || (p.chans.length ? `voie ${p.chans[0]}` : 'libre')).slice(0, 11)}</SvgText>
                </G>
              );
            })}
            {/* sorties */}
            {O.map((o, k) => {
              const on = sel?.k === 'out' && sel.id === o.id;
              const hit = plug ? linked(plug.n, o.id) : false;
              const c = props.outColor(o);
              return (
                <G key={o.id}>
                  <Circle cx={xOut(k)} cy={Y_OUT} r={20} fill="#1E2227" stroke={on || hit ? '#FFFFFF' : c} strokeWidth={on || hit ? 5 : 3} />
                  <Circle cx={xOut(k)} cy={Y_OUT} r={9} fill={hit ? c : '#0B0D10'} />
                  <SvgText x={xOut(k) + 28} y={Y_OUT - 2} fontSize={12} fontWeight="800" fill={c}>{o.label.replace('MAIN L/R', 'MAIN')}</SvgText>
                  <SvgText x={xOut(k) + 28} y={Y_OUT + 13} fontSize={11} fill="#E8EAED">{o.name.slice(0, 12)}</SvgText>
                </G>
              );
            })}
            {/* câble tiré au doigt */}
            {drag && drag.moved && (() => {
              const a = xyOf(drag.from);
              const fx = drag.x / sc0;
              const fy = drag.y / sc0;
              const c = drag.from.kind === 'plug' ? props.plugColor(P[drag.from.n - 1]) : props.outColor(O.find((o) => o.id === (drag.from as { id: string }).id)!);
              const h = hov ? xyOf(hov) : null;
              return (
                <G>
                  {h && <Circle cx={h.x} cy={h.y} r={32} fill={hovOk ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.10)'} stroke={hovOk ? '#34D399' : '#9AA3AD'} strokeWidth={4} />}
                  <Path d={`M${a.x} ${a.y} Q ${(a.x + fx) / 2} ${Math.max(a.y, fy) + 30}, ${fx} ${fy}`} fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeDasharray={hovOk ? undefined : '10 8'} />
                  <Circle cx={fx} cy={fy} r={10} fill={c} />
                </G>
              );
            })()}
          </Svg>
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
          </View>
        )}
      </View>

      {/* le tiroir */}
      <View style={[styles.drawer, { backgroundColor: theme.panel, borderColor: plug ? props.plugColor(plug) : out ? props.outColor(out) : theme.line }]}>
        {plug && (plug.chans.length
          ? <ChannelDrawer client={client} theme={theme} ch={plug.chans[0]} actions={props.actions} />
          : <Text style={{ color: theme.muted, fontSize: 14, padding: 12 }}>Prise {plug.n} : rien ne l’écoute. Donne-lui une voie depuis la Table (touche une tranche › Branchée sur › Changer).</Text>)}
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
        {!sel && <Text style={{ color: theme.muted, textAlign: 'center', padding: 20 }}>Touche une prise ou une sortie sur la table.</Text>}
      </View>
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
  tg: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});

/** Même vue, autonome : utilisée comme 4e vue de l'écran Table. */
export function TableWiringStandalone({ client, theme, actions }: { client: XAirClient; theme: Theme; actions?: DrawerActions }) {
  useAnyTick(client);
  useEffect(() => { client.loadPaths(wiringPaths()); }, [client]);
  const P = plugs(client);
  const O = outlets(client);
  const W = wires(client);
  const plugColor = (p: Plug) => plugColorOf(client, p, colorOf);
  const outColor = (o: Outlet) => (o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD');
  return <TableWiring client={client} theme={theme} P={P} O={O} W={W} plugColor={plugColor} outColor={outColor} actions={actions} />;
}
