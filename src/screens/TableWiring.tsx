// Vue « Table » des branchements : la XR18 dessinée en haut, un tiroir en bas.
// Touche une prise : tu règles l'entrée (gain, nom, couleur, 48 V) ou tu la
// relies aux sorties (un curseur par sortie). Touche une sortie : ce qu'elle
// entend. Tout tient sur l'écran, sans défiler.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f } from '../osc/osc';
import { dbLabel } from '../ui/format';
import { HSlider } from '../ui/HSlider';
import { MonoSwitch } from '../ui/MonoSwitch';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import { chLevelPath, MODEL } from '../xair/addresses';
import { dbToFader } from '../xair/levels';
import { colorOf } from '../xair/smartName';
import { Outlet, outlets, Plug, plugs, wires, wiringPaths } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { ChannelDrawer, DrawerActions } from './ChannelDrawer';
import { MIX_COLORS } from './MixPicker';

type Sel = { k: 'in'; n: number } | { k: 'out'; id: string } | null;
const W = 1000;
const H = 300;
const xIn = (n: number) => (n <= 16 ? 60 + ((n - 1) % 8) * 72 : n === 17 ? 700 : 760);
const yIn = (n: number) => (n <= 8 ? 70 : 150);
const xOut = (k: number) => (k < 6 ? 60 + k * 100 : 880);
const Y_OUT = 255;

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

  return (
    <View style={{ flex: 1, paddingHorizontal: 10, gap: 8 }}>
      {/* la table */}
      <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width })} style={{ alignItems: 'center' }}>
        {size.w > 0 && (
          <Svg width={pw} height={ph} viewBox={`0 0 ${W} ${H}`}>
            <Rect x={4} y={4} width={W - 8} height={H - 8} rx={16} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
            <SvgText x={W - 30} y={36} textAnchor="end" fontSize={20} fontWeight="800" fill="#E8EAED">{MODEL.name}</SvgText>
            <SvgText x={24} y={30} fontSize={11} fill="#9AA3AD">ENTRÉES · touche une prise</SvgText>
            <SvgText x={24} y={214} fontSize={11} fill="#9AA3AD">SORTIES · touche qui écoute</SvgText>
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
                <G key={p.n} onPress={() => { setSel({ k: 'in', n: p.n }); }}>
                  <Circle cx={xIn(p.n)} cy={yIn(p.n)} r={p.usb ? 16 : 24} fill="#1E2227" stroke={on ? '#FFFFFF' : hit ? '#FFFFFF' : p.chans.length ? c : '#3A414B'} strokeWidth={on || hit ? 5 : 3} />
                  <Circle cx={xIn(p.n)} cy={yIn(p.n)} r={p.usb ? 6 : 12} fill={hit ? c : '#0B0D10'} />
                  <SvgText x={xIn(p.n)} y={yIn(p.n) - 32} textAnchor="middle" fontSize={13} fontWeight="800" fill="#E8EAED">{p.n}</SvgText>
                  <Rect x={xIn(p.n) - 34} y={yIn(p.n) + 28} width={68} height={16} rx={5} fill={p.name ? c : 'transparent'} />
                  <SvgText x={xIn(p.n)} y={yIn(p.n) + 40} textAnchor="middle" fontSize={10} fontWeight="800" fill={p.name ? '#0B0D10' : '#5B636D'}>{(p.name || (p.chans.length ? `voie ${p.chans[0]}` : 'libre')).slice(0, 11)}</SvgText>
                  <Rect x={xIn(p.n) - 40} y={yIn(p.n) - 46} width={80} height={94} fill="transparent" />
                </G>
              );
            })}
            {/* sorties */}
            {O.map((o, k) => {
              const on = sel?.k === 'out' && sel.id === o.id;
              const hit = plug ? linked(plug.n, o.id) : false;
              const c = props.outColor(o);
              return (
                <G key={o.id} onPress={() => setSel({ k: 'out', id: o.id })}>
                  <Circle cx={xOut(k)} cy={Y_OUT} r={20} fill="#1E2227" stroke={on || hit ? '#FFFFFF' : c} strokeWidth={on || hit ? 5 : 3} />
                  <Circle cx={xOut(k)} cy={Y_OUT} r={9} fill={hit ? c : '#0B0D10'} />
                  <SvgText x={xOut(k) + 28} y={Y_OUT - 2} fontSize={12} fontWeight="800" fill={c}>{o.label.replace('MAIN L/R', 'MAIN')}</SvgText>
                  <SvgText x={xOut(k) + 28} y={Y_OUT + 13} fontSize={11} fill="#E8EAED">{o.name.slice(0, 12)}</SvgText>
                  <Rect x={xOut(k) - 26} y={Y_OUT - 28} width={100} height={56} fill="transparent" />
                </G>
              );
            })}
          </Svg>
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
            <ScrollView contentContainerStyle={styles.wrap}>
              {P.filter((p) => p.chans.length).map((p) => {
                const on = linked(p.n, out.id);
                const c = props.plugColor(p);
                return (
                  <View key={p.n} style={[styles.dest, { width: wide ? '32.5%' : '100%', borderColor: on ? c : theme.line, borderStyle: on ? 'solid' : 'dashed', backgroundColor: theme.deep }]}>
                    <Pressable onPress={() => toggle(p, out)} style={[styles.pill, { backgroundColor: on ? c : theme.panel, borderColor: c }]}>
                      <Text numberOfLines={1} style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 12 }}>{on ? '✓ ' : '+ '}{p.n} · {p.name || `voie ${p.chans[0]}`}</Text>
                    </Pressable>
                    {on ? <View style={{ flex: 1 }}><HSlider value={level(p, out)} onChange={(v) => setLevel(p, out, v)} label="" valueText={dbLabel(level(p, out))} color={c} theme={theme} /></View> : <Text style={{ color: theme.muted, fontSize: 11, flex: 1 }}>n’entend pas</Text>}
                  </View>
                );
              })}
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, padding: 4, minHeight: 48 },
  pill: { height: 34, paddingHorizontal: 8, borderRadius: 17, borderWidth: 1, justifyContent: 'center', minWidth: 96, maxWidth: 140 },
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
  const plugColor = (p: Plug) => (p.chans.length ? colorOf(Number(client.get(`/ch/${String(p.chans[0]).padStart(2, '0')}/config/color`) ?? 0)) : '#5B636D');
  const outColor = (o: Outlet) => (o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD');
  return <TableWiring client={client} theme={theme} P={P} O={O} W={W} plugColor={plugColor} outColor={outColor} actions={actions} />;
}
