// « Ce qui a changé » : le dessin de la table avec un badge sur chaque prise
// modifiée, le détail avant → après, et « Annuler celle-là » / « Annuler tout ».
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { MiniTable } from '../ui/MiniTable';
import { Theme } from '../ui/theme';
import { busNamePath } from '../xair/addresses';
import { ChangeSet, changeSets, describe, onChangeSets, undoChanges } from '../xair/changeLog';
import { plugColor, plugs } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
};

export function ChangesSheet({ client, theme, visible, onClose, set: initial }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; set?: ChangeSet | null }) {
  const [, setTick] = useState(0);
  const [chosen, setChosen] = useState<ChangeSet | null>(initial ?? null);
  const [focus, setFocus] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  useEffect(() => onChangeSets(() => setTick((t) => t + 1)), []);
  useEffect(() => { if (visible) { setChosen(initial ?? null); setFocus(null); } }, [visible, initial]);
  const all = changeSets();
  const set = chosen && all.includes(chosen) ? chosen : null;
  const d = set ? describe(client, set) : null;
  const P = plugs(client);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line, maxWidth: wide ? 980 : 640 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>👀</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Ce qui a changé</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{set ? `${set.title} · ${ago(set.at)}` : 'Les derniers réglages faits par l’appli'}</Text>
            </View>
            {set && !initial && <Pressable onPress={() => setChosen(null)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>‹ Liste</Text></Pressable>}
            <CloseX theme={theme} onPress={onClose} />
          </View>

          {!set && (
            <ScrollView style={{ flexGrow: 0, maxHeight: 520 }} contentContainerStyle={{ gap: 8 }}>
              {all.length === 0 && <Text style={{ color: theme.muted, fontSize: 14 }}>Rien pour l’instant. Après une balance auto, la baguette, un préréglage ou un échange de prises, tu verras ici ce que l’appli a touché.</Text>}
              {all.map((s) => (
                <Pressable key={s.id} onPress={() => setChosen(s)} style={[styles.row, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{s.title}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{ago(s.at)} · {describe(client, s).plugs.length} prise(s) touchée(s)</Text>
                  </View>
                  <Text style={{ color: theme.accent, fontWeight: '800' }}>Voir ›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {set && d && (
            <>
              <MiniTable
                maxWidth={wide ? 620 : 520}
                plugs={Object.fromEntries(P.map((p) => {
                  const c = d.plugs.find((x) => x.plug === p.n);
                  return [p.n, { label: p.name || undefined, color: p.chans.length ? plugColor(client, p, () => '') : undefined, badge: c ? (c.badges.length > 1 ? `${c.badges[0]}…` : c.badges[0] ?? '•') : undefined, dim: !c && !set.swaps.some((s) => s.includes(p.n)) }];
                }))}
                outs={d.outs.map((o) => ({ n: o.bus, label: String(client.get(busNamePath(o.bus)) ?? '') || undefined, color: theme.ok, badge: o.badges[0] }))}
                blink={focus ? [focus] : []}
                arrows={set.swaps}
                onPlug={(n) => setFocus((f) => (f === n ? null : n))}
              />
              <ScrollView style={{ flexGrow: 0, maxHeight: wide ? 300 : 260 }} contentContainerStyle={{ gap: 6 }}>
                {set.swaps.map(([a, b]) => (
                  <Text key={`${a}-${b}`} style={{ color: '#F59E0B', fontWeight: '800', fontSize: 13 }}>⇄ Voies {a} et {b} échangées (le micro était branché sur l’autre prise)</Text>
                ))}
                {d.other.map((t) => <Text key={t} style={{ color: theme.text, fontSize: 13 }}>• {t}</Text>)}
                {d.plugs.filter((c) => !focus || c.plug === focus).map((c) => (
                  <View key={c.plug} style={[styles.row, { borderColor: focus === c.plug ? theme.accent : theme.line, backgroundColor: theme.deep }]}>
                    <View style={[styles.num, { borderColor: theme.accent }]}><Text style={{ color: theme.text, fontWeight: '900' }}>{c.plug}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{c.name || `Prise ${c.plug}`}</Text>
                      {c.lines.map((l) => <Text key={l} style={{ color: theme.muted, fontSize: 12 }}>{l}</Text>)}
                    </View>
                    <Pressable onPress={() => undoChanges(client, set, c.paths)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>↶ Annuler celle-là</Text></Pressable>
                  </View>
                ))}
                {!focus && d.outs.map((o) => (
                  <View key={`o${o.bus}`} style={[styles.row, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                    <View style={[styles.num, { borderColor: theme.ok, width: 48 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 11 }}>AUX {o.bus}</Text></View>
                    <View style={{ flex: 1 }}>{o.lines.map((l) => <Text key={l} style={{ color: theme.muted, fontSize: 12 }}>{l}</Text>)}</View>
                    <Pressable onPress={() => undoChanges(client, set, o.paths)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>↶ Annuler</Text></Pressable>
                  </View>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => { undoChanges(client, set); onClose(); }} style={[styles.go, { borderWidth: 1.5, borderColor: '#F87171', flex: 1 }]}>
                  <Text style={{ color: '#F87171', fontWeight: '800' }}>↶ Annuler tout</Text>
                </Pressable>
                <Pressable onPress={onClose} style={[styles.go, { backgroundColor: theme.accent, flex: 1 }]}>
                  <Text style={{ color: theme.onAccent, fontWeight: '800' }}>C’est bon</Text>
                </Pressable>
              </View>
              <Text style={{ color: theme.muted, fontSize: 11 }}>Touche une prise sur le dessin pour ne voir qu’elle. Les échanges de voies s’annulent en refaisant l’échange.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 16, gap: 12, maxHeight: '96%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  num: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  small: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  go: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
