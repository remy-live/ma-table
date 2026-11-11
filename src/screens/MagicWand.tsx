// Baguette magique : « qui joue quoi, qui veut un retour » → où brancher,
// quel retour pour qui, et un premier mélange dans chaque retour.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { MODEL } from '../xair/addresses';
import { applyPlan, Kind, KINDS, makePlan, Musician, Plan } from '../xair/magicPlan';
import { XAirClient } from '../xair/XAirClient';

const NEED_TXT = { fort: 'fort', moyen: 'bien', bas: 'un peu', rien: '' } as const;
const blank = (k: number): Musician => ({ name: k === 0 ? 'Moi' : `Musicien ${k + 1}`, kinds: [], retour: true });

export function MagicWand({ client, theme, visible, onClose, onSeeWiring }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onSeeWiring?: () => void }) {
  const [band, setBand] = useState<Musician[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [done, setDone] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const close = () => { setPlan(null); setDone(false); onClose(); };
  const setCount = (n: number) => setBand((b) => Array.from({ length: n }, (_, k) => b[k] ?? blank(k)));
  const edit = (k: number, p: Partial<Musician>) => setBand((b) => b.map((m, j) => (j === k ? { ...m, ...p } : m)));
  const toggle = (k: number, kind: Kind) => edit(k, { kinds: band[k].kinds.includes(kind) ? band[k].kinds.filter((x) => x !== kind) : [...band[k].kinds, kind] });
  const ready = band.length > 0 && band.some((m) => m.kinds.length);
  const chip = (on: boolean) => [styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line, maxWidth: wide ? 980 : 640 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26 }}>🪄</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Qui branche quoi</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{plan ? `La proposition pour ta ${MODEL.name}` : 'Dis qui joue quoi : l’appli range les prises et les retours'}</Text>
            </View>
            <CloseX theme={theme} onPress={close} />
          </View>

          {!plan ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>Vous êtes combien ?</Text>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <Pressable key={n} accessibilityLabel={`${n} musiciens`} onPress={() => setCount(n)} style={[...chip(band.length === n), { width: 40, alignItems: 'center' }]}>
                    <Text style={{ color: band.length === n ? theme.onAccent : theme.text, fontWeight: '900' }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <ScrollView style={{ flexGrow: 0, maxHeight: 520 }} contentContainerStyle={{ gap: 8, flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap' }}>
                {band.map((m, k) => (
                  <View key={k} style={[styles.card, { borderColor: theme.line, backgroundColor: theme.deep, width: wide ? '49%' : '100%' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput value={m.name} onChangeText={(t) => edit(k, { name: t })} maxLength={12} selectTextOnFocus
                        style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: 15, borderBottomWidth: 1, borderColor: theme.line2, paddingVertical: 4 }} />
                      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>un retour</Text>
                      <Switch value={m.retour} onValueChange={(v) => edit(k, { retour: v })} />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {KINDS.map((x) => {
                        const on = m.kinds.includes(x.id);
                        return (
                          <Pressable key={x.id} onPress={() => toggle(k, x.id)} style={chip(on)}>
                            <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '800' }}>{x.icon} {x.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
              {band.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Touche le nombre de musiciens pour commencer.</Text>}
              <Pressable disabled={!ready} onPress={() => setPlan(makePlan(band))} style={[styles.go, { backgroundColor: theme.accent, opacity: ready ? 1 : 0.4 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 16 }}>🪄 Proposer les branchements</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ScrollView style={{ flexGrow: 0, maxHeight: 520 }} contentContainerStyle={{ gap: 10, flexDirection: wide ? 'row' : 'column' }}>
                <View style={{ flex: wide ? 1 : undefined, gap: 4 }}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>BRANCHE ICI, À L’ARRIÈRE DE LA TABLE</Text>
                  {plan.plugs.map((p) => (
                    <View key={p.plug} style={[styles.row, { borderColor: theme.line }]}>
                      <View style={[styles.num, { borderColor: p.mic ? theme.accent : theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '900' }}>{p.plug}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{p.label} <Text style={{ color: theme.muted, fontWeight: '600', fontSize: 12 }}>· {band[p.who]?.name}</Text></Text>
                        <Text style={{ color: theme.muted, fontSize: 11 }}>{p.mic ? 'micro (XLR)' : 'jack ou boîte DI'}{p.phantom ? ' · micro statique : 48 V à allumer' : ''}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={{ flex: wide ? 1 : undefined, gap: 4 }}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>LES RETOURS</Text>
                  {plan.retours.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Personne n’a demandé de retour.</Text>}
                  {plan.retours.map((r) => (
                    <View key={r.bus} style={[styles.row, { borderColor: theme.line, alignItems: 'flex-start' }]}>
                      <View style={[styles.num, { borderColor: theme.ok, width: 52 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 11 }}>AUX {r.bus}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{r.name}</Text>
                        <Text style={{ color: theme.muted, fontSize: 11 }}>
                          entend {r.mix.map((x) => `${plan.plugs.find((p) => p.plug === x.plug)?.label} ${NEED_TXT[x.need]}`).join(', ') || 'rien pour l’instant'}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {plan.warnings.map((w) => (
                    <Text key={w} style={{ color: '#FCD34D', fontSize: 12, fontWeight: '700' }}>⚠ {w}</Text>
                  ))}
                  <Text style={{ color: theme.muted, fontSize: 11 }}>Le 48 V n’est jamais allumé tout seul. Les mélanges sont un point de départ : affine-les dans « Qui entend quoi ».</Text>
                </View>
              </ScrollView>
              {done ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={[styles.go, { flex: 1, backgroundColor: theme.deep, borderWidth: 1, borderColor: theme.ok }]}>
                    <Text style={{ color: theme.ok, fontWeight: '900', fontSize: 15 }}>✓ C’est réglé · ↶ pour tout annuler</Text>
                  </View>
                  {onSeeWiring && (
                    <Pressable onPress={() => { close(); onSeeWiring(); }} style={[styles.go, { flex: 1, backgroundColor: theme.accent }]}>
                      <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>Voir les branchements ›</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setPlan(null)} style={[styles.go, { flex: 1, borderWidth: 1, borderColor: theme.line2 }]}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>‹ Modifier</Text>
                  </Pressable>
                  <Pressable onPress={() => { applyPlan(client, plan); setDone(true); }} style={[styles.go, { flex: 2, backgroundColor: theme.accent }]}>
                    <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>🪄 Tout régler sur la table</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 14 },
  sheet: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 12, width: '100%', alignSelf: 'center', maxHeight: '100%' },
  chip: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1.5, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  go: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, paddingVertical: 5 },
  num: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
