// « Qui entend quoi » en bulles : une ligne par source, une colonne par
// personne. Grosse bulle = fort, pas de bulle = rien. Touche une bulle pour
// la régler. Les groupes se déplient. Touche un nom pour isoler.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { f } from '../osc/osc';
import { DragBubble } from '../ui/DragBubble';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import { CH_COUNT, meterIndex, Target } from '../xair/addresses';
import { useLevels } from '../xair/useMeter';
import { dbToFader } from '../xair/levels';
import { shift } from '../xair/monitor';
import { Dest, destinations, levelDb, levelPaths, Src, sources, whoHearsPaths } from '../xair/whoHears';
import { XAirClient } from '../xair/XAirClient';
import { chColor } from '../xair/smartName';
import { SLOT_COLORS } from '../xair/fxSlots';
import { initials, MIX_COLORS } from './MixPicker';

const dbText = (db: number) => (!isFinite(db) || db < -40 ? 'rien' : (db > 0 ? '+' : '') + Math.round(db) + ' dB');
const CELL = 64;
const ALL_CH = Array.from({ length: CH_COUNT }, (_, k) => k + 1);
const LABEL_W = 150;


export function WhoHearsScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; embedded?: boolean }) {
  const { client, theme } = props;
  useAnyTick(client);
  const [isoD, setIsoD] = useState<string | null>(null);
  const [isoS, setIsoS] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<{ s: string; d: string } | null>(null);
  const [areaW, setAreaW] = useState(0);
  // les bulles battent avec le son qui arrive
  const lv = useLevels(client, ALL_CH, meterIndex.ch, 150);
  useEffect(() => { if (props.visible) client.loadPaths(whoHearsPaths()); }, [client, props.visible]);

  const dests = destinations(client).filter((d) => !isoD || d.id === isoD);
  // les colonnes s'élargissent pour remplir l'écran
  const cw = areaW > 0 ? Math.max(CELL, Math.min(130, Math.floor((areaW - 24 - LABEL_W - dests.length * 4) / Math.max(1, dests.length)))) : CELL;
  const allSrc = sources(client);
  // la même couleur que partout ailleurs : la couleur de la voie, de l'effet, du groupe
  const colorOf = (s: Src) => (s.kind === 'fx' ? SLOT_COLORS[(s.fx ?? 1) - 1] : s.kind === 'group' ? '#F59E0B' : chColor(client, s.channels[0]));
  const destColor = (d: Dest) => (d.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(d.t as { n: number }).n] ?? '#9AA3AD');
  const rows: { s: Src; indent: boolean; color: string }[] = [];
  for (const s of allSrc) {
    if (isoS && isoS !== s.id && !(s.kind === 'group' && s.members!.some((m) => m.id === isoS))) continue;
    rows.push({ s, indent: false, color: colorOf(s) });
    if (s.kind === 'group' && open[s.id]) for (const m of s.members!) if (!isoS || isoS === m.id || isoS === s.id) rows.push({ s: m, indent: true, color: colorOf(m) });
  }
  const pickSrc = pick ? [...allSrc, ...allSrc.flatMap((s) => s.members ?? [])].find((s) => s.id === pick.s) : null;
  const pickDest = pick ? destinations(client).find((d) => d.id === pick.d) : null;
  const pickPaths = pickSrc && pickDest ? levelPaths(pickSrc, pickDest.t) : [];
  const pickDb = pickPaths.length ? levelDb(client, pickPaths) : -Infinity;
  const setTo = (paths: string[], db: number | null) => paths.forEach((p) => client.set(p, f(db === null ? 0 : dbToFader(db))));
  const sameAsMain = () => { if (!pickSrc || !pickDest) return; const mainDb = levelDb(client, levelPaths(pickSrc, { kind: 'main' } as Target)); setTo(pickPaths, isFinite(mainDb) ? mainDb : null); };

  const body = (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8 }} onLayout={(e) => setAreaW(e.nativeEvent.layout.width)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* en-tête : les personnes */}
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', marginBottom: 4 }}>
              <View style={{ width: LABEL_W }}>
                <Pressable onPress={() => { setIsoD(null); setIsoS(null); }} style={[styles.small, { borderColor: theme.line2, alignSelf: 'flex-start' }]}><Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>Tout voir</Text></Pressable>
              </View>
              {dests.map((d) => {
                const c = destColor(d);
                const on = isoD === d.id;
                return (
                  <Pressable key={d.id} onPress={() => setIsoD(on ? null : d.id)} accessibilityState={{ selected: on }} style={[styles.person, { width: cw, borderColor: on ? c : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
                    <View style={[styles.avatar, { backgroundColor: c }]}><Text style={{ color: '#0B0D10', fontSize: 10, fontWeight: '800' }}>{initials(d.name)}</Text></View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{d.name}</Text>
                    <Text style={{ color: theme.muted, fontSize: 9 }}>{d.sub.split(' · ').pop()}</Text>
                  </Pressable>
                );
              })}
            </View>
            {/* lignes */}
            {rows.map(({ s, indent, color }) => {
              const isG = s.kind === 'group';
              const u = !!open[s.id];
              const on = isoS === s.id;
              return (
                <View key={s.id} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: LABEL_W, flexDirection: 'row', gap: 4 }}>
                    <Pressable onPress={() => (isG ? setOpen((o) => ({ ...o, [s.id]: !u })) : setIsoS(on ? null : s.id))} onLongPress={() => setIsoS(on ? null : s.id)} accessibilityState={{ selected: on, expanded: isG ? u : undefined }} style={[styles.srcBtn, { height: CELL - 4, borderColor: on ? color : theme.line, backgroundColor: on ? theme.deep : theme.panel, paddingLeft: indent ? 16 : 8 }]}>
                      <View style={{ width: 6, height: 28, borderRadius: 3, backgroundColor: color }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontSize: indent ? 12 : 13, fontWeight: '800' }}>{s.label}</Text>
                        <Text style={{ color: theme.muted, fontSize: 9 }}>{isG ? `${s.channels.length} voies · ${u ? 'replier' : 'déplier'}` : s.kind === 'ch' ? `prise ${s.channels[0]}` : 'effet'}</Text>
                      </View>
                    </Pressable>
                  </View>
                  {dests.map((d) => (
                    <Bubble key={d.id} pulse={Math.max(0, ...s.channels.map((c) => lv[c] ?? 0))} w={cw} client={client} theme={theme} paths={levelPaths(s, d.t)} color={color} picked={pick?.s === s.id && pick?.d === d.id} a11y={`${d.name} entend ${s.label}`} onPick={() => setPick({ s: s.id, d: d.id })} />
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
      <View style={[styles.bottom, { borderColor: pickDest ? destColor(pickDest) : theme.line, backgroundColor: theme.panel }]}>
        {pick && pickSrc && pickDest ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20, backgroundColor: destColor(pickDest) }]}><Text style={{ color: '#0B0D10', fontSize: 11, fontWeight: '800' }}>{initials(pickDest.name)}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{pickDest.name} entend « {pickSrc.label} »</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>{dbText(pickDb)}</Text>
            </View>
            <Pressable onPress={() => setTo(pickPaths, null)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>Rien</Text></Pressable>
            <Pressable onPress={() => shift(client, pickPaths, -2)} accessibilityLabel="Moins" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>−</Text></Pressable>
            <Pressable onPress={() => shift(client, pickPaths, 2, true)} accessibilityLabel="Plus" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>+</Text></Pressable>
            {pickDest.t.kind !== 'main' && (
              <Pressable onPress={sameAsMain} style={[styles.small, { borderColor: theme.accent }]}><Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>Comme le public</Text></Pressable>
            )}
            <Pressable onPress={() => setPick(null)} accessibilityLabel="Fermer" style={{ width: 36, alignItems: 'center' }}><Text style={{ color: theme.muted, fontSize: 20 }}>×</Text></Pressable>
          </View>
        ) : (
          <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>Glisse une bulle vers la droite pour monter, vers la gauche pour baisser · touche une personne ou un nom pour isoler · un groupe se déplie</Text>
        )}
      </View>
    </>
  );

  if (props.embedded) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }, props.embedded && { paddingTop: 0 }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Qui entend quoi</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Une bulle = un son dans une oreille · grosse = fort</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </Modal>
  );
}

/** Une bulle : appui = la choisir ; glisser à droite = plus fort, à gauche = moins fort. */
function Bubble({ w, client, theme, paths, color, picked, a11y, onPick, pulse }: { pulse?: number; w: number; client: XAirClient; theme: Theme; paths: string[]; color: string; picked: boolean; a11y: string; onPick: () => void }) {
  return (
    <DragBubble pulse={pulse} theme={theme} w={w} h={CELL - 4} db={levelDb(client, paths)} color={color} picked={picked} a11y={a11y} onStart={onPick} onTap={onPick}
      onSet={(db) => paths.forEach((p) => client.set(p, f(db === null ? 0 : dbToFader(db))))} />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  person: { width: CELL, height: 76, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 2 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  srcBtn: { flex: 1, borderRadius: 12, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  cell: { width: CELL, height: CELL - 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottom: { margin: 10, borderWidth: 2, borderRadius: 16, padding: 10, minHeight: 60, justifyContent: 'center' },
  small: { height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  pm: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
