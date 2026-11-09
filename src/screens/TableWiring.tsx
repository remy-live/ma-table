// Vue « Table » des branchements : la XR18 dessinée en haut, un tiroir en bas.
// Touche une prise : tu règles l'entrée (gain, nom, couleur, 48 V) ou tu la
// relies aux sorties (un curseur par sortie). Touche une sortie : ce qu'elle
// entend. Tout tient sur l'écran, sans défiler.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f, i, s as oscS } from '../osc/osc';
import { HSlider } from '../ui/HSlider';
import { Knob } from '../ui/Knob';
import { Theme } from '../ui/theme';
import { chLevelPath, chNamePath, fToGainDb, headampGainPath, MODEL, phantomPath } from '../xair/addresses';
import { dbToFader, faderToDb } from '../xair/levels';
import { colorOf, TABLE_COLORS } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { meterIndex } from '../xair/addresses';
import { Outlet, Plug } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';

type Sel = { k: 'in'; n: number } | { k: 'out'; id: string } | null;
const W = 1000;
const H = 300;
const xIn = (n: number) => (n <= 16 ? 60 + ((n - 1) % 8) * 72 : n === 17 ? 700 : 760);
const yIn = (n: number) => (n <= 8 ? 70 : 150);
const xOut = (k: number) => (k < 6 ? 60 + k * 100 : 880);
const Y_OUT = 255;
const dbTxt = (v: number) => { const d = faderToDb(v); return !isFinite(d) || v <= 0 ? '—' : `${d > 0 ? '+' : ''}${Math.round(d)} dB`; };

export function TableWiring(props: { client: XAirClient; theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string }) {
  const { client, theme, P, O } = props;
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [sel, setSel] = useState<Sel>({ k: 'in', n: 1 });
  const [mode, setMode] = useState<'in' | 'link'>('in');
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
        {plug && <PlugDrawer client={client} theme={theme} plug={plug} O={O} mode={mode} setMode={setMode} level={level} setLevel={setLevel} toggle={toggle} linked={linked} outColor={props.outColor} color={props.plugColor(plug)} wide={wide} />}
        {out && (
          <>
            <View style={styles.row}>
              <View style={[styles.tag, { borderColor: props.outColor(out) }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{out.label}</Text></View>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{out.name} <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>· ce qu’il entend</Text></Text>
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
                    {on ? <View style={{ flex: 1 }}><HSlider value={level(p, out)} onChange={(v) => setLevel(p, out, v)} label="" valueText={dbTxt(level(p, out))} color={c} theme={theme} /></View> : <Text style={{ color: theme.muted, fontSize: 11, flex: 1 }}>n’entend pas</Text>}
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

function PlugDrawer(p: { client: XAirClient; theme: Theme; plug: Plug; O: Outlet[]; mode: 'in' | 'link'; setMode: (m: 'in' | 'link') => void; level: (a: Plug, o: Outlet) => number; setLevel: (a: Plug, o: Outlet, v: number) => void; toggle: (a: Plug, o: Outlet) => void; linked: (n: number, id: string) => boolean; outColor: (o: Outlet) => string; color: string; wide: boolean }) {
  const { client, theme, plug, mode } = p;
  const ch = plug.chans[0];
  const n2 = ch ? String(ch).padStart(2, '0') : '';
  const gain = ch ? client.get(headampGainPath(ch)) : undefined;
  const p48 = ch ? Number(client.get(phantomPath(ch)) ?? 0) === 1 : false;
  const colIdx = ch ? Number(client.get(`/ch/${n2}/config/color`) ?? 0) & 7 : 0;
  const m = useMeter(client, ch ? [meterIndex.ch(ch)] : [], 120);
  const [name, setName] = useState<string | null>(null);
  const gdb = gain === undefined ? null : fToGainDb(Number(gain));
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.tag, { borderColor: p.color }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{plug.n}</Text></View>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{plug.name || (ch ? `Voie ${ch}` : 'Prise libre')}</Text>
        <View style={[styles.seg, { borderColor: theme.line2 }]}>
          {([['in', '🎚 Régler l’entrée'], ['link', '🔗 Relier aux sorties']] as const).map(([id, l]) => (
            <Pressable key={id} onPress={() => p.setMode(id)} accessibilityState={{ selected: mode === id }} style={[styles.segBtn, mode === id && { backgroundColor: theme.accent }]}>
              <Text style={{ color: mode === id ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {!ch && <Text style={{ color: theme.muted, fontSize: 13 }}>Rien n’écoute cette prise. Donne-lui une voie depuis la Table (Changer l’entrée).</Text>}
      {ch && mode === 'in' && (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flex: 1 }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Knob value={gain === undefined ? 0.5 : Number(gain)} size={p.wide ? 104 : 80} theme={theme} color={p.color} dim={gain === undefined} label="Gain" onChange={gain === undefined ? undefined : (v) => client.set(headampGainPath(ch), f(v))} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{gdb === null ? 'Ligne' : `Gain ${gdb > 0 ? '+' : ''}${gdb.toFixed(0)} dB`}</Text>
            <View style={{ width: 100, height: 8, borderRadius: 4, backgroundColor: theme.meterBg, overflow: 'hidden' }}><View style={{ width: `${m.level * 100}%`, height: 8, backgroundColor: m.clip ? '#EF4444' : m.db > -6 ? '#EAB308' : '#22C55E' }} /></View>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <TextInput value={name ?? plug.name} onChangeText={setName} onBlur={() => { if (name !== null) client.set(chNamePath(ch), oscS(name.trim().slice(0, 12))); setName(null); }} onSubmitEditing={() => { if (name !== null) client.set(chNamePath(ch), oscS(name.trim().slice(0, 12))); setName(null); }} placeholder="Ce qui est branché" placeholderTextColor={theme.muted} maxLength={12} style={[styles.input, { color: theme.text, borderColor: p.color, backgroundColor: theme.deep }]} />
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(TABLE_COLORS).map(Number).map((k) => (
                <Pressable key={k} onPress={() => client.set(`/ch/${n2}/config/color`, i(k))} style={[styles.sw, { backgroundColor: TABLE_COLORS[k], borderColor: colIdx === k ? '#FFFFFF' : 'transparent' }]} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {gain !== undefined && (
                <Pressable onPress={() => (p48 ? client.set(phantomPath(ch), i(0)) : Alert.alert('Activer le 48 V ?', 'Seulement pour un micro statique ou une DI active. Baisse le volume avant.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Activer', onPress: () => client.set(phantomPath(ch), i(1)) }]))} style={[styles.tg, { backgroundColor: p48 ? '#DC2626' : theme.deep, borderColor: p48 ? '#DC2626' : theme.line2 }]}>
                  <Text style={{ color: p48 ? '#FFFFFF' : theme.text, fontWeight: '800' }}>48 V {p48 ? 'allumé' : 'éteint'}</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => p.setMode('link')} style={[styles.tg, { borderColor: theme.accent }]}><Text style={{ color: theme.accent, fontWeight: '800' }}>Relier ›</Text></Pressable>
            </View>
          </View>
        </View>
      )}
      {ch && mode === 'link' && (
        <ScrollView contentContainerStyle={styles.wrap}>
          {p.O.map((o) => {
            const on = p.linked(plug.n, o.id);
            const c = p.outColor(o);
            return (
              <View key={o.id} style={[styles.dest, { width: p.wide ? '32.5%' : '100%', borderColor: on ? c : theme.line, borderStyle: on ? 'solid' : 'dashed', backgroundColor: theme.deep }]}>
                <Pressable onPress={() => p.toggle(plug, o)} style={[styles.pill, { backgroundColor: on ? c : theme.panel, borderColor: c }]}>
                  <Text numberOfLines={1} style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 12 }}>{on ? '✓ ' : '+ '}{o.name}</Text>
                </Pressable>
                {on ? <View style={{ flex: 1 }}><HSlider value={p.level(plug, o)} onChange={(v) => p.setLevel(plug, o, v)} label="" valueText={dbTxt(p.level(plug, o))} color={c} theme={theme} /></View> : <Text style={{ color: theme.muted, fontSize: 11, flex: 1 }}>pas relié</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, borderWidth: 2, borderRadius: 18, padding: 10, gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag: { minWidth: 40, height: 40, borderRadius: 12, borderWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segBtn: { height: 40, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 6 },
  pill: { height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, justifyContent: 'center', minWidth: 110, maxWidth: 150 },
  input: { height: 44, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, fontSize: 16, fontWeight: '800' },
  sw: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  tg: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});
