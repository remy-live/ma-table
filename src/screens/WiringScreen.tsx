// Branchements : trois vues du même routage.
//  1. Face arrière (la XR18 vue de derrière, prises numérotées, fils)
//  2. Deux colonnes (prises à gauche, personnes à droite — pour le téléphone)
//  3. Bulles (le tableau « Qui entend quoi »)
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Theme } from '../ui/theme';
import { MODEL, Target } from '../xair/addresses';
import { colorOf } from '../xair/smartName';
import { connect, disconnect, likeMain, nudge, Outlet, outlets, outletXY, PANEL_H, PANEL_W, Plug, plugs, plugXY, toAllReturns, wireD, wirePaths, wires, wireWidth, wiringPaths } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { MIX_COLORS, initials } from './MixPicker';
import { WhoHearsScreen } from './WhoHearsScreen';

type View3 = 'arriere' | 'colonnes' | 'bulles';
type Sel = { kind: 'plug'; n: number } | { kind: 'out'; id: string } | null;

const dbText = (db: number) => (!isFinite(db) || db < -40 ? 'rien' : (db > 0 ? '+' : '') + Math.round(db) + ' dB');

function useTick(client: XAirClient) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let p: ReturnType<typeof setTimeout> | null = null;
    const off = client.on('*', () => {
      if (p) return;
      p = setTimeout(() => { p = null; setT((x) => x + 1); }, 80);
    });
    return () => { off(); if (p) clearTimeout(p); };
  }, [client]);
  return t;
}

export function WiringScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const { client, theme } = props;
  const { width } = useWindowDimensions();
  const tick = useTick(client);
  const [view, setView] = useState<View3>(width > 700 ? 'arriere' : 'colonnes');
  const [sel, setSel] = useState<Sel>(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => { if (props.visible) client.loadPaths(wiringPaths()); }, [client, props.visible]);

  const P = useMemo(() => plugs(client), [client, tick]);
  const O = useMemo(() => outlets(client), [client, tick]);
  const W = useMemo(() => wires(client), [client, tick]);
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 1600); };

  const plugColor = (p: Plug) => (p.chans.length ? colorOf(Number(client.get(`/ch/${String(p.chans[0]).padStart(2, '0')}/config/color`) ?? 0)) : '#5B636D');
  const outColor = (o: Outlet) => (o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD');
  const touches = (w: { plug: number; out: string }) => !!sel && ((sel.kind === 'plug' && sel.n === w.plug) || (sel.kind === 'out' && sel.id === w.out));
  const visibleWires = W.filter((w) => (sel ? touches(w) : showAll));

  const tapPlug = (p: Plug) => {
    if (sel && sel.kind === 'out') {
      const o = O.find((x) => x.id === sel.id)!;
      if (!p.chans.length) { say(`Rien n’écoute la prise ${p.n} : donne-lui une voie (Changer l’entrée)`); return; }
      if (W.some((w) => w.plug === p.n && w.out === o.id)) { say('Déjà relié : règle le niveau en bas'); return; }
      connect(client, p, o.t);
      say(`Prise ${p.n} → ${o.label} (${o.name}) · −6 dB`);
      return;
    }
    setSel(sel && sel.kind === 'plug' && sel.n === p.n ? null : { kind: 'plug', n: p.n });
  };
  const tapOut = (o: Outlet) => {
    if (sel && sel.kind === 'plug') {
      const p = P[sel.n - 1];
      if (!p.chans.length) { say(`Rien n’écoute la prise ${p.n}`); return; }
      if (W.some((w) => w.plug === p.n && w.out === o.id)) { say('Déjà relié : règle le niveau en bas'); return; }
      connect(client, p, o.t);
      say(`Prise ${p.n} → ${o.label} (${o.name}) · −6 dB`);
      return;
    }
    setSel(sel && sel.kind === 'out' && sel.id === o.id ? null : { kind: 'out', id: o.id });
  };

  const selPlug = sel?.kind === 'plug' ? P[sel.n - 1] : null;
  const selOut = sel?.kind === 'out' ? O.find((x) => x.id === sel.id) ?? null : null;
  const selWires = W.filter(touches);

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Branchements</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {view === 'bulles' ? 'Une bulle = un son dans une oreille' : 'Touche une prise, puis une sortie : un fil se crée'}
            </Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>
        <View style={[styles.seg, { borderColor: theme.line2 }]}>
          {([['arriere', 'Face arrière'], ['colonnes', 'Colonnes'], ['bulles', 'Bulles']] as const).map(([v, l]) => (
            <Pressable key={v} onPress={() => { setView(v); setSel(null); }} style={[styles.segBtn, view === v && { backgroundColor: theme.accent }]}>
              <Text style={{ color: view === v ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{l}</Text>
            </Pressable>
          ))}
        </View>

        {view === 'bulles' ? (
          <WhoHearsScreen client={client} theme={theme} visible embedded onClose={props.onClose} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {view === 'arriere' ? (
                <RearPanel client={client} theme={theme} P={P} O={O} W={visibleWires} sel={sel} plugColor={plugColor} outColor={outColor} onPlug={tapPlug} onOut={tapOut} />
              ) : (
                <Columns theme={theme} P={P} O={O} W={visibleWires} sel={sel} plugColor={plugColor} outColor={outColor} onPlug={tapPlug} onOut={tapOut} />
              )}
            </View>

            {/* BAS : sélection */}
            <View style={[styles.bottom, { borderColor: selPlug ? plugColor(selPlug) : selOut ? outColor(selOut) : theme.line, backgroundColor: theme.panel }]}>
              {!sel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Step n="1" c="#F59E0B" t="Touche une PRISE (1 à 18)" theme={theme} />
                  <Step n="2" c="#60A5FA" t="Touche une SORTIE (AUX, MAIN)" theme={theme} />
                  <Step n="3" c="#34D399" t="Le fil se crée · règle-le en bas" theme={theme} />
                  <Pressable onPress={() => setShowAll((x) => !x)} style={[styles.small, { borderColor: showAll ? '#FBBF24' : theme.line2 }]}>
                    <Text style={{ color: showAll ? '#FBBF24' : theme.text, fontSize: 12, fontWeight: '800' }}>{showAll ? 'Tous les fils : oui' : 'Tous les fils'}</Text>
                  </Pressable>
                </View>
              )}
              {selPlug && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.num, { borderColor: plugColor(selPlug) }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{selPlug.n}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Prise {selPlug.n} · {selPlug.name || (selPlug.chans.length ? `voie ${selPlug.chans[0]}` : 'rien ne l’écoute')}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>{selPlug.usb ? 'ordinateur (USB)' : selPlug.n <= MODEL.preamps ? 'micro / ligne' : 'ligne'} · touche une sortie pour ajouter un fil</Text>
                    </View>
                    <Pressable onPress={() => { const n = toAllReturns(client, selPlug); say(n ? `Envoyée dans ${n} retour${n > 1 ? 's' : ''} à −8 dB` : 'Déjà dans tous les retours nommés'); }} style={[styles.small, { borderColor: theme.accent }]}>
                      <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '800' }}>Vers tous les retours</Text>
                    </Pressable>
                    <Pressable onPress={() => setSel(null)} accessibilityLabel="Fermer" style={styles.close}><Text style={{ color: theme.muted, fontSize: 22 }}>×</Text></Pressable>
                  </View>
                  <WireList theme={theme} items={selWires.map((w) => { const o = O.find((x) => x.id === w.out)!; return { key: w.out, short: o.label.replace('MAIN L/R', 'MAIN').replace('AUX ', 'A'), name: o.name, plug: o.label, color: outColor(o), db: w.db, paths: w.paths, cut: () => disconnect(client, selPlug, o.t) }; })} client={client} empty="Personne n’entend cette prise. Touche AUX 1-6 ou MAIN." />
                </>
              )}
              {selOut && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.num, { borderColor: outColor(selOut), width: 'auto', paddingHorizontal: 10, borderRadius: 12 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{selOut.label}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{selOut.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>touche une prise pour l’ajouter à ce qu’il entend</Text>
                    </View>
                    {selOut.t.kind !== 'main' && (
                      <Pressable onPress={() => { likeMain(client, selOut.t); say(`${selOut.name} entend comme le public (−2 dB)`); }} style={[styles.small, { borderColor: theme.accent }]}>
                        <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '800' }}>Comme le public</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => setSel(null)} accessibilityLabel="Fermer" style={styles.close}><Text style={{ color: theme.muted, fontSize: 22 }}>×</Text></Pressable>
                  </View>
                  <WireList theme={theme} items={selWires.map((w) => { const p = P[w.plug - 1]; return { key: String(w.plug), short: String(w.plug), name: p.name || `Voie ${p.chans[0]}`, plug: `prise ${w.plug}`, color: plugColor(p), db: w.db, paths: w.paths, cut: () => disconnect(client, p, selOut.t) }; })} client={client} empty="N’entend rien pour l’instant. Touche une prise en haut." />
                </>
              )}
            </View>
          </>
        )}
        {!!toast && (
          <View pointerEvents="none" style={styles.toast}><Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text></View>
        )}
      </View>
    </Modal>
  );
}

function Step({ n, c, t, theme }: { n: string; c: string; t: string; theme: Theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: c, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{n}</Text></View>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{t}</Text>
    </View>
  );
}

function WireList(props: { theme: Theme; client: XAirClient; empty: string; items: { key: string; short: string; name: string; plug: string; color: string; db: number; paths: string[]; cut: () => void }[] }) {
  const { theme, client } = props;
  if (!props.items.length) return <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 8 }}>{props.empty}</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {props.items.map((w) => (
        <View key={w.key} style={[styles.wire, { backgroundColor: theme.deep, borderColor: theme.line }]}>
          <View style={[styles.num, { width: 34, height: 34, borderColor: w.color }]}><Text style={{ color: theme.text, fontSize: 10, fontWeight: '800' }}>{w.short}</Text></View>
          <View style={{ width: 86 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{w.name}</Text>
            <Text style={{ color: theme.muted, fontSize: 10 }}>{w.plug}</Text>
          </View>
          <Pressable onPress={() => nudge(client, w.paths, -2)} accessibilityLabel="Moins" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>−</Text></Pressable>
          <Text style={{ width: 46, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{dbText(w.db)}</Text>
          <Pressable onPress={() => nudge(client, w.paths, 2)} accessibilityLabel="Plus" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>+</Text></Pressable>
          <Pressable onPress={w.cut} accessibilityLabel="Enlever ce fil" style={[styles.pm, { borderColor: theme.mute }]}><Text style={{ color: '#FCA5A5', fontSize: 14, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------- VUE 1 : FACE ARRIÈRE ----------
function RearPanel(props: { client: XAirClient; theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; sel: Sel; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string; onPlug: (p: Plug) => void; onOut: (o: Outlet) => void }) {
  const { theme, P, O, sel } = props;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const scale = size.w ? size.w / PANEL_W : 0;
  const h = PANEL_H * scale;
  const isSelPlug = (n: number) => sel?.kind === 'plug' && sel.n === n;
  const isSelOut = (id: string) => sel?.kind === 'out' && sel.id === id;
  const linkedPlug = (n: number) => sel?.kind === 'out' && props.W.some((w) => w.plug === n && w.out === sel.id);
  const linkedOut = (id: string) => sel?.kind === 'plug' && props.W.some((w) => w.out === id && w.plug === sel.n);
  return (
    <View style={{ flex: 1, paddingHorizontal: 10 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <View style={{ width: size.w, height: h, alignSelf: 'center' }}>
          <Svg width={size.w} height={h} viewBox={`0 0 ${PANEL_W} ${PANEL_H}`}>
            <Rect x={8} y={8} width={984} height={284} rx={18} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
            <Rect x={20} y={20} width={960} height={260} rx={10} fill="#1A1D22" stroke="#232830" />
            <Rect x={36} y={30} width={60} height={26} rx={3} fill="#0B0D10" stroke="#3A414B" />
            <SvgText x={66} y={68} textAnchor="middle" fontSize={7} fill="#9AA3AD">REMOTE · ETHERNET</SvgText>
            <Rect x={108} y={30} width={54} height={26} rx={3} fill="#0E1013" stroke="#3A414B" />
            <SvgText x={135} y={47} textAnchor="middle" fontSize={7} fontWeight="700" fill="#FBBF24">WIFI CLIENT</SvgText>
            <SvgText x={300} y={40} textAnchor="middle" fontSize={8} fill="#9AA3AD">MIDI</SvgText>
            <Circle cx={285} cy={52} r={7} fill="#0B0D10" stroke="#3A414B" /><Circle cx={315} cy={52} r={7} fill="#0B0D10" stroke="#3A414B" />
            <SvgText x={400} y={40} textAnchor="middle" fontSize={8} fill="#9AA3AD">USB</SvgText>
            <Rect x={392} y={46} width={16} height={12} rx={2} fill="#0B0D10" stroke="#3A414B" />
            <SvgText x={920} y={52} textAnchor="end" fontSize={20} fontWeight="800" fill="#E8EAED">{MODEL.name}</SvgText>
            <Rect x={930} y={24} width={6} height={60} rx={3} fill="#2A3038" />
            <Line x1={36} y1={215} x2={640} y2={215} stroke="#2A3038" />
            <SvgText x={728} y={150} textAnchor="middle" fontSize={8} fontWeight="700" fill="#9AA3AD">LINE 17/18 · ORDI</SvgText>
            {/* prises */}
            {P.map((p) => {
              const { x, y } = plugXY(p.n);
              const named = !!p.chans.length;
              return (
                <G key={p.n}>
                  <Circle cx={x} cy={y} r={p.usb ? 15 : 21} fill="#1E2227" stroke="#3A414B" strokeWidth={2} />
                  <Circle cx={x} cy={y} r={p.usb ? 6 : 13} fill="#0B0D10" stroke="#4A525C" strokeWidth={1.5} />
                  <SvgText x={x + 24} y={y - 14} fontSize={12} fontWeight="800" fill="#E8EAED">{p.n}</SvgText>
                  {named && (
                    <>
                      <Rect x={x - 34} y={y + 24} width={68} height={14} rx={5} fill={props.plugColor(p)} />
                      <SvgText x={x} y={y + 34} textAnchor="middle" fontSize={9} fontWeight="800" fill="#0B0D10">{(p.name || `voie ${p.chans[0]}`).slice(0, 12)}</SvgText>
                    </>
                  )}
                </G>
              );
            })}
            {/* sorties */}
            {O.map((o) => {
              const { x, y } = outletXY(o.id);
              return (
                <G key={o.id}>
                  <SvgText x={x} y={y - 26} textAnchor="middle" fontSize={10} fontWeight="800" fill="#E8EAED">{o.label}</SvgText>
                  <Circle cx={x} cy={y} r={19} fill="#1E2227" stroke="#3A414B" strokeWidth={2} />
                  <Circle cx={x} cy={y} r={12} fill="#0B0D10" stroke="#4A525C" strokeWidth={1.5} />
                  <Rect x={x - 34} y={y + 22} width={68} height={14} rx={5} fill={props.outColor(o)} />
                  <SvgText x={x} y={y + 32} textAnchor="middle" fontSize={9} fontWeight="800" fill="#0B0D10">{o.name.slice(0, 12)}</SvgText>
                </G>
              );
            })}
            {/* fils */}
            {props.W.map((w) => (
              <Path key={w.plug + w.out} d={wireD(w.plug, w.out)} fill="none" stroke={props.plugColor(P[w.plug - 1])} strokeWidth={wireWidth(w.db)} strokeLinecap="round" opacity={sel ? 0.95 : 0.55} />
            ))}
            {/* halos de sélection */}
            {P.filter((p) => isSelPlug(p.n) || linkedPlug(p.n)).map((p) => { const { x, y } = plugXY(p.n); return <Circle key={'h' + p.n} cx={x} cy={y} r={27} fill="none" stroke={isSelPlug(p.n) ? '#FFFFFF' : props.plugColor(p)} strokeWidth={3} />; })}
            {O.filter((o) => isSelOut(o.id) || linkedOut(o.id)).map((o) => { const { x, y } = outletXY(o.id); return <Circle key={'h' + o.id} cx={x} cy={y} r={25} fill="none" stroke={isSelOut(o.id) ? '#FFFFFF' : props.outColor(o)} strokeWidth={3} />; })}
          </Svg>
          {/* zones tactiles (plus grandes que les prises) */}
          {P.map((p) => { const { x, y } = plugXY(p.n); return <Pressable key={p.n} onPress={() => props.onPlug(p)} accessibilityLabel={`Prise ${p.n}${p.name ? ' · ' + p.name : ''}`} accessibilityState={{ selected: isSelPlug(p.n) }} style={{ position: 'absolute', left: x * scale - 28, top: y * scale - 28, width: 56, height: 56, borderRadius: 28 }} />; })}
          {O.map((o) => { const { x, y } = outletXY(o.id); return <Pressable key={o.id} onPress={() => props.onOut(o)} accessibilityLabel={`${o.label} · ${o.name}`} accessibilityState={{ selected: isSelOut(o.id) }} style={{ position: 'absolute', left: x * scale - 28, top: y * scale - 28, width: 56, height: 56, borderRadius: 28 }} />; })}
        </View>
      )}
      <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>Vue de l’arrière de la table. Un fil = ce que cette prise envoie dans cette sortie ; son épaisseur = le niveau.</Text>
    </View>
  );
}

// ---------- VUE 2 : DEUX COLONNES ----------
function Columns(props: { theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; sel: Sel; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string; onPlug: (p: Plug) => void; onOut: (o: Outlet) => void }) {
  const { theme, P, O, sel } = props;
  const used = P.filter((p) => p.chans.length);
  const ROW = 46;
  const leftH = used.length * ROW;
  const rightRow = Math.max(ROW, leftH / O.length);
  const H = Math.max(leftH, O.length * rightRow);
  const [w, setW] = useState(0);
  const yPlug = (n: number) => used.findIndex((p) => p.n === n) * ROW + ROW / 2;
  const yOut = (id: string) => O.findIndex((o) => o.id === id) * rightRow + rightRow / 2;
  const isSelPlug = (n: number) => sel?.kind === 'plug' && sel.n === n;
  const isSelOut = (id: string) => sel?.kind === 'out' && sel.id === id;
  const L = 120;
  const R = 120;
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
      <View style={{ height: H, flexDirection: 'row' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={{ width: L }}>
          {used.map((p) => (
            <Pressable key={p.n} onPress={() => props.onPlug(p)} accessibilityState={{ selected: isSelPlug(p.n) }} style={[styles.colItem, { height: ROW - 6, borderColor: isSelPlug(p.n) ? '#FFFFFF' : props.plugColor(p), backgroundColor: isSelPlug(p.n) ? theme.deep : theme.panel }]}>
              <View style={[styles.num, { width: 26, height: 26, borderWidth: 2, borderColor: props.plugColor(p) }]}><Text style={{ color: theme.text, fontSize: 10, fontWeight: '800' }}>{p.n}</Text></View>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '800', flex: 1 }}>{p.name || `Voie ${p.chans[0]}`}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          {w > 0 && (
            <Svg width={w - L - R} height={H}>
              {props.W.filter((wr) => used.some((p) => p.n === wr.plug)).map((wr) => {
                const x1 = 0; const x2 = w - L - R; const y1 = yPlug(wr.plug); const y2 = yOut(wr.out);
                return <Path key={wr.plug + wr.out} d={`M${x1} ${y1} C ${x2 * 0.5} ${y1}, ${x2 * 0.5} ${y2}, ${x2} ${y2}`} fill="none" stroke={props.plugColor(P[wr.plug - 1])} strokeWidth={wireWidth(wr.db)} strokeLinecap="round" opacity={sel ? 0.95 : 0.55} />;
              })}
            </Svg>
          )}
        </View>
        <View style={{ width: R }}>
          {O.map((o) => (
            <Pressable key={o.id} onPress={() => props.onOut(o)} accessibilityState={{ selected: isSelOut(o.id) }} style={[styles.colItem, { height: rightRow - 6, marginBottom: 6, borderColor: isSelOut(o.id) ? '#FFFFFF' : props.outColor(o), backgroundColor: isSelOut(o.id) ? theme.deep : theme.panel, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }]}>
              <Text style={{ color: props.outColor(o), fontSize: 10, fontWeight: '800' }}>{o.label}</Text>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{o.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {used.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Aucune voie nommée. Nomme ce qui est branché (Outils › Mode guidé).</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, marginHorizontal: 14, marginBottom: 8 },
  segBtn: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bottom: { margin: 10, borderWidth: 2, borderRadius: 18, padding: 10, gap: 8, minHeight: 78 },
  small: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  num: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  wire: { borderWidth: 1, borderRadius: 14, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pm: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colItem: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toast: { position: 'absolute', left: 24, right: 24, top: 100, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
