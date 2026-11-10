// Branchements : trois vues du même routage.
//  1. Face arrière (la XR18 vue de derrière, prises numérotées, fils)
//  2. Deux colonnes (prises à gauche, personnes à droite — pour le téléphone)
//  3. Bulles (le tableau « Qui entend quoi »)
import { useMono } from '../ui/useMono';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { s as oscS } from '../osc/osc';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Theme } from '../ui/theme';
import { Shell } from '../ui/Shell';
import { busNamePath, chNamePath, meterIndex, MODEL } from '../xair/addresses';
import { useLevels } from '../xair/useMeter';
import { colorOf } from '../xair/smartName';
import { connect, disconnect, likeMain, nudge, Outlet, outlets, outletXY, PANEL_H, PANEL_W, Plug, plugs, plugXY, toAllReturns, wireD, wirePaths, wires, wireWidth, wiringPaths, plugColor as plugColorOf } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { MIX_COLORS } from './MixPicker';
import { WhoHearsScreen } from './WhoHearsScreen';
import { Btn, ScreenHeader, Segmented } from '../ui/kit';
import { ManyDrawer } from './TableWiring';
import { StageEditor } from './StageEditor';
import { ChannelDrawer } from './ChannelDrawer';
import { useAnyTick } from '../ui/useTick';
import { MonoSwitch } from '../ui/MonoSwitch';
import { readGroups } from '../xair/groups';
import { GROUP_COLORS } from './GroupsSheet';
import { load, save } from '../store/persist';

type View3 = 'arriere' | 'colonnes' | 'bulles' | 'scene';
type Sel = { kind: 'plug'; n: number } | { kind: 'out'; id: string } | { kind: 'group'; k: number } | { kind: 'many'; ns: number[] } | null;

const dbText = (db: number) => (!isFinite(db) || db < -40 ? 'rien' : (db > 0 ? '+' : '') + Math.round(db) + ' dB');


export function WiringScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; embedded?: boolean }) {
  const { client, theme } = props;
  const { width } = useWindowDimensions();
  const tick = useAnyTick(client);
  const [view, setView] = useState<View3>(width > 700 ? 'arriere' : 'colonnes');
  // 2 vues : les câbles (face arrière sur tablette, colonnes sur téléphone) et les bulles.
  // La table dessinée (régler + relier) est dans Table › Vue Table.
  const cables: View3 = width > 700 ? 'arriere' : 'colonnes';
  const VIEWS: readonly (readonly [View3, string])[] = [[cables, 'Câbles'], ['bulles', 'Bulles'], ['scene', 'Scène']];
  useEffect(() => { load<string>('vueBranchements', 'arriere').then((v) => setView(v === 'bulles' || v === 'scene' ? v : cables)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<Sel>(null);
  const [multi, setMulti] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [toast, setToast] = useState('');
  const [ren, setRen] = useState<{ path: string; v: string } | null>(null);
  const [fold, setFold] = useState(false);
  const doRen = () => { if (ren) { client.set(ren.path, oscS(ren.v.trim().slice(0, 12))); say('Renommé'); } setRen(null); };
  useEffect(() => setRen(null), [sel]);
  useEffect(() => { if (props.visible) client.loadPaths(wiringPaths()); }, [client, props.visible]);

  const P = useMemo(() => plugs(client), [client, tick]);
  const O = useMemo(() => outlets(client), [client, tick]);
  const W = useMemo(() => wires(client), [client, tick]);
  const say = (t: string) => { void t; setToast(''); }; // plus de bandeau vert

  const plugColor = (p: Plug) => plugColorOf(client, p, colorOf);
  const outColor = (o: Outlet) => (o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD');
  const selGroup = sel?.kind === 'group' ? readGroups(client).find((g) => g.k === sel.k) ?? null : null;
  const groupPlugs = selGroup ? P.filter((p) => p.chans.some((c) => selGroup.members.includes(c))) : [];
  const groupLinked = (o: Outlet) => groupPlugs.length > 0 && groupPlugs.every((p) => W.some((w) => w.plug === p.n && w.out === o.id));
  const groupSome = (o: Outlet) => groupPlugs.some((p) => W.some((w) => w.plug === p.n && w.out === o.id));
  const touches = (w: { plug: number; out: string }) => !!sel && ((sel.kind === 'plug' && sel.n === w.plug) || (sel.kind === 'out' && sel.id === w.out) || (sel.kind === 'group' && groupPlugs.some((p) => p.n === w.plug)) || (sel.kind === 'many' && sel.ns.includes(w.plug)));
  const visibleWires = W.filter((w) => (sel ? touches(w) : showAll));

  // Un appui montre les liaisons ; pour relier, on glisse du doigt.
  const tapPlug = (p: Plug) => {
    if (multi) {
      const cur = sel?.kind === 'many' ? sel.ns : sel?.kind === 'plug' ? [sel.n] : [];
      const ns = cur.includes(p.n) ? cur.filter((x) => x !== p.n) : [...cur, p.n].sort((a, b) => a - b);
      setSel(ns.length ? { kind: 'many', ns } : null);
      return;
    }
    setSel(sel && sel.kind === 'plug' && sel.n === p.n ? null : { kind: 'plug', n: p.n });
  };
  const tapOut = (o: Outlet) => setSel(sel && sel.kind === 'out' && sel.id === o.id ? null : { kind: 'out', id: o.id });

  const linkDrag = (plugN: number, outId: string) => {
    // une prise de la sélection emmène toutes les autres
    if (sel?.kind === 'many' && sel.ns.includes(plugN)) {
      const o = O.find((x) => x.id === outId)!;
      sel.ns.forEach((n) => { const q = P[n - 1]; if (q?.chans.length && !W.some((w) => w.plug === n && w.out === o.id)) connect(client, q, o.t); });
      return;
    }
    const p = P[plugN - 1];
    const o = O.find((x) => x.id === outId)!;
    if (!p.chans.length) { say(`Rien n’écoute la prise ${p.n} : donne-lui une voie (Changer l’entrée)`); return; }
    if (W.some((w) => w.plug === p.n && w.out === o.id)) { setSel({ kind: 'plug', n: p.n }); say('Déjà relié : règle le niveau en bas'); return; }
    connect(client, p, o.t);
    setSel({ kind: 'plug', n: p.n });
    say(`Prise ${p.n} → ${o.label} (${o.name}) · −6 dB`);
  };
  const selPlug = sel?.kind === 'plug' ? P[sel.n - 1] : null;
  const selOut = sel?.kind === 'out' ? O.find((x) => x.id === sel.id) ?? null : null;
  const selWires = W.filter(touches);

  return (
    <Shell embedded={props.embedded} visible={props.visible} onClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <ScreenHeader theme={theme} title="Branchements" sub={view === 'scene' ? undefined : view === 'bulles' ? 'Une bulle = un son dans une oreille' : multi ? 'Touche les prises à prendre ensemble, puis glisse-en une vers une sortie' : 'Glisse d’une prise à une sortie · appui = voir'}>
          {view !== 'bulles' && view !== 'scene' && (
            <Pressable onPress={() => { const m = !multi; setMulti(m); if (m && sel?.kind === 'plug') setSel({ kind: 'many', ns: [sel.n] }); if (!m && sel?.kind === 'many') setSel(null); }} accessibilityRole="switch" accessibilityState={{ checked: multi }}
              style={[styles.small, { height: 44, borderWidth: 2, borderColor: multi ? theme.accent : theme.line2, backgroundColor: multi ? theme.accent : 'transparent' }]}>
              <Text style={{ color: multi ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{multi ? `✓ Plusieurs${sel?.kind === 'many' ? ` (${sel.ns.length})` : ''}` : '☐ Plusieurs'}</Text>
            </Pressable>
          )}
          <Segmented theme={theme} value={view} onChange={(v) => { setView(v); setSel(null); save('vueBranchements', v); }} options={VIEWS} />
          {!props.embedded && <Btn theme={theme} kind="primary" label="Terminé" onPress={props.onClose} />}
        </ScreenHeader>

        {view === 'scene' ? (
          <StageEditor client={client} theme={theme} />
        ) : view === 'bulles' ? (
          <WhoHearsScreen client={client} theme={theme} visible embedded onClose={props.onClose} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {view === 'arriere' ? (
                <RearPanel client={client} theme={theme} P={P} O={O} W={showAll || !sel ? W : W.filter(touches)} sel={sel} plugColor={plugColor} outColor={outColor} onPlug={tapPlug} onOut={tapOut} onLink={linkDrag} onEmpty={() => setSel(null)} onGroup={(k) => {
                  if (multi) {
                    // « Plusieurs » : tout le groupe entre (ou sort) de la sélection
                    const g = readGroups(client).find((x) => x.k === k);
                    const gp = g ? P.filter((p) => p.chans.some((c) => g.members.includes(c))).map((p) => p.n) : [];
                    const cur = sel?.kind === 'many' ? sel.ns : sel?.kind === 'plug' ? [sel.n] : [];
                    const all = gp.length > 0 && gp.every((n) => cur.includes(n));
                    const ns = all ? cur.filter((n) => !gp.includes(n)) : [...new Set([...cur, ...gp])].sort((a, b) => a - b);
                    setSel(ns.length ? { kind: 'many', ns } : null);
                    return;
                  }
                  setSel(sel?.kind === 'group' && sel.k === k ? null : { kind: 'group', k });
                }} onCut={(pl, out) => { const o = O.find((x) => x.id === out); if (o) { disconnect(client, P[pl - 1], o.t); say(`Prise ${pl} retirée de ${o.label}`); } }} />
              ) : (
                <Columns theme={theme} P={P} O={O} W={visibleWires} sel={sel} plugColor={plugColor} outColor={outColor} onPlug={tapPlug} onOut={tapOut} />
              )}
            </View>

            {/* BAS : sélection */}
            <View style={[styles.bottom, { borderColor: selPlug ? plugColor(selPlug) : selOut ? outColor(selOut) : selGroup ? GROUP_COLORS[selGroup.k - 1] : sel?.kind === 'many' ? theme.text : theme.line, backgroundColor: theme.panel }]}>
              {!sel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }} numberOfLines={2}>Touche une <Text style={{ color: theme.accent, fontWeight: '800' }}>prise</Text> ou une <Text style={{ color: '#60A5FA', fontWeight: '800' }}>sortie</Text> pour voir ses fils, la renommer et régler les niveaux.</Text>
                  <Pressable onPress={() => setShowAll((x) => !x)} style={[styles.small, { borderColor: theme.line2 }]}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{showAll ? 'Masquer les fils' : 'Montrer les fils'}</Text>
                  </Pressable>
                </View>
              )}
              {ren && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput autoFocus value={ren.v} maxLength={12} onChangeText={(v) => setRen({ ...ren, v })} onSubmitEditing={doRen} placeholder="Nouveau nom" placeholderTextColor={theme.muted} style={{ flex: 1, height: 44, borderWidth: 2, borderColor: theme.accent, borderRadius: 10, paddingHorizontal: 10, color: theme.text, fontSize: 16, fontWeight: '800' }} />
                  <Pressable onPress={doRen} style={[styles.small, { backgroundColor: theme.accent, borderColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>OK</Text></Pressable>
                  <Pressable onPress={() => setRen(null)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Annuler</Text></Pressable>
                </View>
              )}
              {selPlug && (selPlug.chans.length > 0 ? (
                // le même tiroir que partout ailleurs
                <View style={{ height: 232 }}>
                  <ChannelDrawer client={client} theme={theme} ch={selPlug.chans[0]} onClose={() => setSel(null)} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.num, { borderColor: plugColor(selPlug) }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{selPlug.n}</Text></View>
                  <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>Prise {selPlug.n} : rien ne l’écoute. Donne-lui une voie depuis la Table (touche une tranche › Branchée sur › Changer).</Text>
                  <Pressable onPress={() => setSel(null)} accessibilityLabel="Fermer" style={styles.close}><Text style={{ color: theme.muted, fontSize: 22 }}>×</Text></Pressable>
                </View>
              ))}
              {(selGroup || sel?.kind === 'many') && (
                <View style={{ height: 232 }}>
                  <ManyDrawer
                    client={client}
                    theme={theme}
                    wide={width > 700}
                    plugs={selGroup ? groupPlugs : sel?.kind === 'many' ? sel.ns.map((n) => P[n - 1]).filter(Boolean) : []}
                    O={O}
                    outColor={outColor}
                    title={selGroup ? selGroup.name : sel?.kind === 'many' ? `${sel.ns.length} prise${sel.ns.length > 1 ? 's' : ''} choisie${sel.ns.length > 1 ? 's' : ''}` : ''}
                    color={selGroup ? GROUP_COLORS[selGroup.k - 1] : theme.text}
                    extra={<Btn theme={theme} small kind="ghost" label="Fermer" onPress={() => setSel(null)} />}
                  />
                </View>
              )}
              {selOut && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.num, { borderColor: outColor(selOut), width: 'auto', paddingHorizontal: 10, borderRadius: 12 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{selOut.label}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{selOut.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>glisse une prise jusqu’ici pour l’ajouter · {selWires.length} entrée{selWires.length > 1 ? 's' : ''}</Text>
                    </View>
                    {selOut.t.kind === 'bus' && (
                      <Pressable onPress={() => setRen({ path: busNamePath((selOut.t as { n: number }).n), v: selOut.name })} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>✎ Renommer</Text></Pressable>
                    )}
                    {selOut.t.kind === 'main' && <MonoSwitch client={client} theme={theme} compact />}
                    {selOut.t.kind !== 'main' && (
                      <Pressable onPress={() => { likeMain(client, selOut.t); say(`${selOut.name} entend comme le public (−2 dB)`); }} style={[styles.small, { borderColor: theme.accent }]}>
                        <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800' }}>Comme le public</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => setFold((x) => !x)} accessibilityLabel={fold ? 'Déplier' : 'Réduire'} style={styles.close}><Text style={{ color: theme.muted, fontSize: 18 }}>{fold ? '▴' : '▾'}</Text></Pressable>
                    <Pressable onPress={() => setSel(null)} accessibilityLabel="Fermer" style={styles.close}><Text style={{ color: theme.muted, fontSize: 22 }}>×</Text></Pressable>
                  </View>
                  {!fold && <>
                  <AddRow theme={theme} label="Ajouter" items={P.filter((p) => p.chans.length && !selWires.some((w) => w.plug === p.n)).map((p) => ({ key: String(p.n), text: `${p.n} · ${p.name || 'voie ' + p.chans[0]}`, color: plugColor(p), add: () => { connect(client, p, selOut.t); say(`Prise ${p.n} → ${selOut.label} · −6 dB`); } }))} />
                  <WireList theme={theme} items={selWires.map((w) => { const p = P[w.plug - 1]; return { key: String(w.plug), short: String(w.plug), name: p.name || `Voie ${p.chans[0]}`, plug: `prise ${w.plug}`, color: plugColor(p), db: w.db, paths: w.paths, cut: () => disconnect(client, p, selOut.t) }; })} client={client} empty="N’entend rien pour l’instant. Glisse une prise jusqu’à cette sortie." />
                  </>}
                </>
              )}
            </View>
          </>
        )}
        {!!toast && (
          <View pointerEvents="none" style={styles.toast}><Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text></View>
        )}
      </View>
    </Shell>
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

function AddRow(props: { theme: Theme; label: string; items: { key: string; text: string; color: string; add: () => void }[] }) {
  const { theme } = props;
  if (!props.items.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800' }}>{props.label.toUpperCase()}</Text>
      {props.items.map((it) => (
        <Pressable key={it.key} onPress={it.add} style={{ height: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 2, borderStyle: 'dashed', borderColor: it.color, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>+ {it.text}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function WireList(props: { theme: Theme; client: XAirClient; empty: string; items: { key: string; short: string; name: string; plug: string; color: string; db: number; paths: string[]; cut: () => void }[] }) {
  const { theme, client } = props;
  if (!props.items.length) return <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 8 }}>{props.empty}</Text>;
  return (
    <ScrollView style={{ maxHeight: 132 }} contentContainerStyle={{ gap: 6, flexDirection: 'row', flexWrap: 'wrap' }}>
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
// Relier au doigt : on appuie sur une prise, on glisse jusqu'à une sortie (ou l'inverse).
// Les fils qui arrivent sur une même sortie sont écartés pour rester lisibles.
function RearPanel(props: { client: XAirClient; theme: Theme; P: Plug[]; O: Outlet[]; W: { plug: number; out: string; db: number }[]; sel: Sel; plugColor: (p: Plug) => string; outColor: (o: Outlet) => string; onPlug: (p: Plug) => void; onOut: (o: Outlet) => void; onLink: (plug: number, out: string) => void; onCut: (plug: number, out: string) => void; onEmpty: () => void; onGroup: (k: number) => void }) {
  const mono = useMono(props.client);
  const { theme, P, O, sel } = props;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ from: { kind: 'plug'; n: number } | { kind: 'out'; id: string }; x: number; y: number } | null>(null);
  const scale = size.w ? size.w / PANEL_W : 0;
  const h = PANEL_H * scale;
  const latest = useRef({ P, O, scale, onLink: props.onLink, onPlug: props.onPlug, onOut: props.onOut });
  latest.current = { P, O, scale, onLink: props.onLink, onPlug: props.onPlug, onOut: props.onOut };
  const emptyRef = useRef(props.onEmpty);
  emptyRef.current = props.onEmpty;
  const groupCb = useRef(props.onGroup);
  groupCb.current = props.onGroup;
  // Groupes (DCA) repliés : une seule capsule pour toutes les prises du groupe
  const groups = readGroups(props.client).filter((g) => g.members.length > 1);
  const [open, setOpen] = useState<number[]>([]);
  const plugOfCh = (c: number) => P.find((p) => p.chans.includes(c))?.n ?? null;
  const gInfo = groups.map((g) => {
    const plugs = g.members.map(plugOfCh).filter((n): n is number => n !== null).sort((a, b) => a - b);
    return { k: g.k, name: g.name, plugs, anchor: plugs[0], folded: !open.includes(g.k) && plugs.length > 1 };
  });
  const groupOfPlug = (n: number) => gInfo.find((g) => g.plugs.includes(n));
  const hiddenPlug = (n: number) => { const g = groupOfPlug(n); return !!g && g.folded && g.anchor !== n; };
  const anchorOf = (n: number) => { const g = groupOfPlug(n); return g && g.folded ? g.anchor : n; };
  const groupsRef = useRef(gInfo);
  groupsRef.current = gInfo;
  // les prises s'allument quand un son arrive
  const lv = useLevels(props.client, P.flatMap((p) => p.chans), meterIndex.ch);
  const live = (n: number) => Math.max(0, ...(P[n - 1]?.chans ?? []).map((c) => lv[c] ?? 0));
  const isSelPlug = (n: number) => (sel?.kind === 'plug' && sel.n === n) || (sel?.kind === 'many' && sel.ns.includes(n));
  const isSelOut = (id: string) => sel?.kind === 'out' && sel.id === id;
  const linkedPlug = (n: number) => sel?.kind === 'out' && props.W.some((w) => w.plug === n && w.out === sel.id);
  const linkedOut = (id: string) => sel?.kind === 'plug' && props.W.some((w) => w.out === id && w.plug === sel.n);

  // qu'y a-t-il sous le doigt ? (coordonnées du viewBox)
  const hit = (vx: number, vy: number): { kind: 'plug'; n: number } | { kind: 'out'; id: string } | null => {
    for (const g of groupsRef.current) {
      if (!g.anchor) continue;
      const c = plugXY(g.anchor);
      if (!g.folded && Math.abs(c.x - vx) < 44 && vy > c.y - 62 && vy < c.y - 40) { setOpen((o) => o.filter((k) => k !== g.k)); return null; }
      if (g.folded && Math.abs(c.x - vx) < 52 && vy > c.y - 54 && vy < c.y - 28) { setOpen((o) => [...o, g.k]); return null; }
    }
    for (const p of latest.current.P) {
      const c = plugXY(p.n);
      if (Math.hypot(c.x - vx, c.y - vy) < 30) {
        const g = groupsRef.current.find((x) => x.plugs.includes(p.n));
        return { kind: 'plug', n: g && g.folded ? g.anchor : p.n };
      }
    }
    for (const o of latest.current.O) { const c = outletXY(o.id); if (Math.hypot(c.x - vx, c.y - vy) < 30) return { kind: 'out', id: o.id }; }
    return null;
  };
  const moved = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const sc = latest.current.scale || 1;
        const t = hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
        moved.current = false;
        setDrag(t ? { from: t, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY } : null);
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > 8) moved.current = true;
        setDrag((d) => (d ? { ...d, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY } : d));
      },
      onPanResponderRelease: (e) => {
        const sc = latest.current.scale || 1;
        setDrag((d) => {
          if (!d) { if (!moved.current) emptyRef.current(); return null; }
          const t = hit(e.nativeEvent.locationX / sc, e.nativeEvent.locationY / sc);
          if (!moved.current || !t) {
            // simple appui : déplier un groupe replié, sinon sélectionner
            if (d.from.kind === 'plug') {
              const g = groupsRef.current.find((x) => x.folded && x.anchor === (d.from as { n: number }).n);
              if (g) { groupCb.current(g.k); return null; }
              latest.current.onPlug(latest.current.P[d.from.n - 1]);
            }
            else { const o = latest.current.O.find((x) => x.id === (d.from as { id: string }).id); if (o) latest.current.onOut(o); }
            return null;
          }
          const members = (n: number) => { const g = groupsRef.current.find((x) => x.folded && x.anchor === n); return g ? g.plugs : [n]; };
          if (d.from.kind === 'plug' && t.kind === 'out') members(d.from.n).forEach((n) => latest.current.onLink(n, (t as { id: string }).id));
          else if (d.from.kind === 'out' && t.kind === 'plug') members(t.n).forEach((n) => latest.current.onLink(n, (d.from as { id: string }).id));
          else if (d.from.kind === 'plug' && t.kind === 'plug' && t.n === d.from.n) latest.current.onPlug(latest.current.P[t.n - 1]);
          else if (d.from.kind === 'out' && t.kind === 'out' && t.id === d.from.id) { const o = latest.current.O.find((x) => x.id === t.id); if (o) latest.current.onOut(o); }
          return null;
        });
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  // Écarter les câbles : chaque fil arrivant sur une sortie a son propre point d'arrivée.
  const byOut = new Map<string, number[]>();
  props.W.forEach((w) => byOut.set(w.out, [...(byOut.get(w.out) ?? []), w.plug]));
  const endOf = (w: { plug: number; out: string }) => {
    const list = (byOut.get(w.out) ?? []).slice().sort((a, b) => a - b);
    const k = list.indexOf(w.plug);
    const spread = Math.min(34, list.length * 7);
    const off = list.length > 1 ? -spread / 2 + (k / (list.length - 1)) * spread : 0;
    const c = outletXY(w.out);
    return { x: c.x + off, y: c.y - 12 };
  };
  const hover = drag && moved.current ? hit(drag.x / (scale || 1), drag.y / (scale || 1)) : null;
  const hoverOk = !!hover && !!drag && hover.kind !== drag.from.kind;
  const hoverXY = hover ? (hover.kind === 'plug' ? plugXY(hover.n) : outletXY(hover.id)) : null;
  // appui simple sur une sortie : ses entrées s'écartent au-dessus, avec ✕
  const fanOut = sel?.kind === 'out' ? sel.id : null;
  const fanWires = fanOut ? props.W.filter((w) => w.out === fanOut).sort((a, b) => a.plug - b.plug) : [];
  const fanC = fanOut ? outletXY(fanOut) : null;
  const CHIP_W = 132;
  const perRow = Math.max(1, Math.min(6, Math.floor((size.w - 20) / (CHIP_W + 8))));
  const fanPos = (k: number) => {
    const row = Math.floor(k / perRow);
    const inRow = Math.min(perRow, fanWires.length - row * perRow);
    const col = k % perRow;
    const rowW = inRow * CHIP_W + (inRow - 1) * 8;
    const cx = fanC!.x * scale;
    const left0 = Math.max(6, Math.min(size.w - rowW - 6, cx - rowW / 2));
    return { x: left0 + col * (CHIP_W + 8), y: (fanC!.y - 40) * scale - 50 * (row + 1) };
  };
  const dragOrigin = drag ? (drag.from.kind === 'plug' ? plugXY(drag.from.n) : outletXY(drag.from.id)) : null;

  return (
    <View style={{ flex: 1, paddingHorizontal: 10 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <View style={{ width: size.w, height: h, alignSelf: 'center' }} {...pan.panHandlers}>
          <Svg width={size.w} height={h} viewBox={`0 0 ${PANEL_W} ${PANEL_H}`}>
            <Rect x={8} y={8} width={984} height={314} rx={18} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
            <Rect x={20} y={20} width={960} height={290} rx={10} fill="#1A1D22" stroke="#232830" />
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
            <Line x1={36} y1={234} x2={640} y2={234} stroke="#2A3038" />
            <SvgText x={728} y={150} textAnchor="middle" fontSize={8} fontWeight="700" fill="#9AA3AD">LINE 17/18 · ORDI</SvgText>
            {/* prises */}
            {P.map((p) => {
              const { x, y } = plugXY(p.n);
              const named = !!p.chans.length;
              const g = groupOfPlug(p.n);
              if (g && g.folded && g.anchor !== p.n) {
                return <G key={p.n} opacity={0.22}><Circle cx={x} cy={y} r={21} fill="#1E2227" stroke={GROUP_COLORS[g.k - 1]} strokeWidth={2} /><SvgText x={x + 24} y={y - 14} fontSize={12} fontWeight="800" fill="#E8EAED">{p.n}</SvgText></G>;
              }
              if (g && g.folded) {
                const gc = GROUP_COLORS[g.k - 1];
                const gl = Math.max(...g.plugs.map(live));
                return (
                  <G key={p.n}>
                    {gl >= 0.15 && <Rect x={x - 56 - gl * 6} y={y - 30 - gl * 6} width={112 + gl * 12} height={60 + gl * 12} rx={30 + gl * 6} fill="none" stroke={gc} strokeWidth={2 + gl * 5} opacity={0.15 + gl * 0.65} />}
                    <Rect x={x - 52} y={y - 26} width={104} height={52} rx={26} fill="#1E2227" stroke={gc} strokeWidth={3} />
                    <SvgText x={x} y={y - 3} textAnchor="middle" fontSize={13} fontWeight="800" fill={gc}>{g.name.slice(0, 11)}</SvgText>
                    <SvgText x={x} y={y + 13} textAnchor="middle" fontSize={10} fill="#E8EAED">{`${g.plugs.length} prises`}</SvgText>
                    <Rect x={x - 52} y={y - 50} width={104} height={18} rx={9} fill="#15181C" stroke={gc} strokeWidth={1.5} />
                    <SvgText x={x} y={y - 37} textAnchor="middle" fontSize={9} fontWeight="800" fill={gc}>▸ déplier les prises</SvgText>
                  </G>
                );
              }
              return (
                <G key={p.n}>
                  {g && g.anchor === p.n && (
                    <G onPress={() => setOpen((o) => o.filter((k) => k !== g.k))}>
                      <Rect x={x - 44} y={y - 60} width={88} height={18} rx={9} fill={GROUP_COLORS[g.k - 1]} />
                      <SvgText x={x} y={y - 47} textAnchor="middle" fontSize={9} fontWeight="800" fill="#0B0D10">{`▾ replier ${g.name.slice(0, 9)}`}</SvgText>
                    </G>
                  )}
                  {live(p.n) >= 0.15 && <Circle cx={x} cy={y} r={(p.usb ? 15 : 21) + 3 + live(p.n) * 9} fill="none" stroke={props.plugColor(p)} strokeWidth={2 + live(p.n) * 6} opacity={0.15 + live(p.n) * 0.65} />}
                  <Circle cx={x} cy={y} r={p.usb ? 15 : 21} fill="#1E2227" stroke={g ? GROUP_COLORS[g.k - 1] : '#3A414B'} strokeWidth={2} />
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
                  {o.id === 'main' ? (
                    <>
                      {/* la façade a deux sorties : MAIN L et MAIN R (le même mélange en « 1 enceinte ») */}
                      <SvgText x={x} y={y - 26} textAnchor="middle" fontSize={10} fontWeight="800" fill="#E8EAED">{mono ? 'MAIN L + R · mono' : 'MAIN L · R'}</SvgText>
                      {[-23, 23].map((dx) => (
                        <G key={dx}>
                          <Circle cx={x + dx} cy={y} r={17} fill="#1E2227" stroke="#3A414B" strokeWidth={2} />
                          <Circle cx={x + dx} cy={y} r={10} fill="#0B0D10" stroke="#4A525C" strokeWidth={1.5} />
                          <SvgText x={x + dx} y={y + 4} textAnchor="middle" fontSize={9} fontWeight="900" fill="#9AA3AD">{dx < 0 ? 'L' : 'R'}</SvgText>
                        </G>
                      ))}
                      <Rect x={x - 40} y={y + 22} width={80} height={14} rx={5} fill={props.outColor(o)} />
                      <SvgText x={x} y={y + 32} textAnchor="middle" fontSize={9} fontWeight="800" fill="#0B0D10">{o.name.slice(0, 12)}</SvgText>
                    </>
                  ) : (
                    <>
                      <SvgText x={x} y={y - 26} textAnchor="middle" fontSize={10} fontWeight="800" fill="#E8EAED">{o.label}</SvgText>
                      <Circle cx={x} cy={y} r={19} fill="#1E2227" stroke="#3A414B" strokeWidth={2} />
                      <Circle cx={x} cy={y} r={12} fill="#0B0D10" stroke="#4A525C" strokeWidth={1.5} />
                      <Rect x={x - 34} y={y + 22} width={68} height={14} rx={5} fill={props.outColor(o)} />
                      <SvgText x={x} y={y + 32} textAnchor="middle" fontSize={9} fontWeight="800" fill="#0B0D10">{o.name.slice(0, 12)}</SvgText>
                    </>
                  )}
                </G>
              );
            })}
            {/* fils, écartés à l'arrivée */}
            {props.W.map((w) => {
              const a0 = plugXY(anchorOf(w.plug));
              const a = anchorOf(w.plug) !== w.plug || groupOfPlug(w.plug)?.folded ? { x: a0.x, y: a0.y + 26 } : a0; // un groupe replié : les fils partent du bas de la capsule
              const b = endOf(w);
              const c = props.plugColor(P[w.plug - 1]);
              return (
                <G key={w.plug + w.out}>
                  <Path d={`M${a.x} ${a.y} C ${a.x} ${a.y + 70}, ${b.x} ${b.y - 80}, ${b.x} ${b.y}`} fill="none" stroke="#0B0D10" strokeWidth={wireWidth(w.db) + 3} strokeLinecap="round" opacity={!sel || isSelPlug(w.plug) || (sel.kind === 'out' && sel.id === w.out) ? 0.6 : 0} />
                  <Path d={`M${a.x} ${a.y} C ${a.x} ${a.y + 70}, ${b.x} ${b.y - 80}, ${b.x} ${b.y}`} fill="none" stroke={c} strokeWidth={wireWidth(w.db)} strokeLinecap="round" opacity={!sel ? 0.55 : isSelPlug(w.plug) || (sel.kind === 'out' && sel.id === w.out) || (sel.kind === 'group' && !!groupOfPlug(w.plug) && groupOfPlug(w.plug)!.k === sel.k) ? 0.95 : 0.12} />
                  <Circle cx={b.x} cy={b.y} r={4} fill={c} />
                </G>
              );
            })}
            {/* fil en train d'être tiré */}
            {drag && dragOrigin && moved.current && (
              <Path d={`M${dragOrigin.x} ${dragOrigin.y} L${drag.x / (scale || 1)} ${drag.y / (scale || 1)}`} fill="none" stroke="#FFFFFF" strokeWidth={4} strokeDasharray="8 6" strokeLinecap="round" />
            )}
            {/* cible fantôme sous le doigt */}
            {hoverXY && (
              <>
                <Circle cx={hoverXY.x} cy={hoverXY.y} r={34} fill={hoverOk ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.10)'} />
                <Circle cx={hoverXY.x} cy={hoverXY.y} r={30} fill="none" stroke={hoverOk ? '#34D399' : '#9AA3AD'} strokeWidth={4} />
              </>
            )}
            {/* éventail : fils vers les entrées écartées */}
            {fanC && <Rect x={0} y={0} width={PANEL_W} height={PANEL_H} fill="#000000" opacity={0.55} />}
            {fanC && fanWires.map((w, k) => { const q = fanPos(k); return <Line key={'fl' + w.plug} x1={fanC.x} y1={fanC.y - 18} x2={(q.x + CHIP_W / 2) / (scale || 1)} y2={(q.y + 40) / (scale || 1)} stroke={props.plugColor(P[w.plug - 1])} strokeWidth={3} opacity={0.95} />; })}
            {/* halos de sélection */}
            {P.filter((p) => isSelPlug(p.n) || linkedPlug(p.n)).map((p) => { const { x, y } = plugXY(p.n); return <Circle key={'h' + p.n} cx={x} cy={y} r={27} fill="none" stroke={isSelPlug(p.n) ? '#FFFFFF' : props.plugColor(p)} strokeWidth={3} />; })}
            {O.filter((o) => isSelOut(o.id) || linkedOut(o.id)).map((o) => { const { x, y } = outletXY(o.id); return <Circle key={'h' + o.id} cx={x} cy={y} r={25} fill="none" stroke={isSelOut(o.id) ? '#FFFFFF' : props.outColor(o)} strokeWidth={3} />; })}
          </Svg>
          {fanC && fanWires.map((w, k) => {
            const q = fanPos(k);
            const pl = P[w.plug - 1];
            return (
              <View key={'f' + w.plug} style={{ position: 'absolute', left: q.x, top: q.y, width: CHIP_W, height: 40, borderRadius: 20, borderWidth: 3, borderColor: props.plugColor(pl), backgroundColor: '#0B0D10', flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: '#E8EAED', fontSize: 12, fontWeight: '800' }}>{w.plug} · {pl.name || 'voie'}</Text>
                <Pressable onPress={() => props.onCut(w.plug, w.out)} hitSlop={6} accessibilityLabel={`Retirer la prise ${w.plug}`} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', marginRight: 1 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
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
  const isSelPlug = (n: number) => (sel?.kind === 'plug' && sel.n === n) || (sel?.kind === 'many' && sel.ns.includes(n));
  const isSelOut = (id: string) => sel?.kind === 'out' && sel.id === id;
  const L = 120;
  const R = 120;
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}>
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
      {used.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Aucune voie nommée. Nomme ce qui est branché (Aide-moi › Mode guidé).</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, marginHorizontal: 14, marginBottom: 8 },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bottom: { marginHorizontal: 10, marginBottom: 8, borderWidth: 2, borderRadius: 16, padding: 8, gap: 6 },
  small: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  num: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  wire: { borderWidth: 1, borderRadius: 12, padding: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pm: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colItem: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toast: { position: 'absolute', left: 24, right: 24, top: 100, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
