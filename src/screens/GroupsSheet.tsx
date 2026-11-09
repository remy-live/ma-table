// Groupes : 4 cartes colorées (les groupes DCA de la table) et la grille
// des voies. Choisis un groupe, puis touche les voies pour les y mettre.
// Une voie peut être dans plusieurs groupes : ses pastilles le montrent.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { f, i, s } from '../osc/osc';
import { CH_COUNT, chDcaPath, chNamePath, DCA_COUNT, dcaFaderPath, dcaNamePath, dcaOnPath, inDca, toggleDca } from '../xair/addresses';
import { faderToDb } from '../xair/levels';
import { colorOf, findOrCreateGroup, recognize } from '../xair/smartName';
import { HSlider } from '../ui/HSlider';
import { useMeter } from '../xair/useMeter';
import { meterIndex } from '../xair/addresses';
import { useAnyTick } from '../ui/useTick';
import { XAirClient } from '../xair/XAirClient';
import { RenameSheet } from '../ui/Strip';
import { Theme } from '../ui/theme';

const GROUP_NAMES = ['Batterie', 'Guitares', 'Voix', 'Choeurs', 'Claviers', 'Percus', 'Cuivres', 'Retours'];
export const GROUP_COLORS = ['#F59E0B', '#F472B6', '#34D399', '#60A5FA'];
const ALL = Array.from({ length: CH_COUNT }, (_, n) => n + 1);

export function GroupsSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  useAnyTick(client);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [k, setK] = useState(1);
  const [renaming, setRenaming] = useState<number | null>(null);
  const gName = (g: number) => String(client.get(dcaNamePath(g)) ?? '') || `Groupe ${g}`;
  const mask = (ch: number) => Number(client.get(chDcaPath(ch)) ?? 0);
  const members = (g: number) => ALL.filter((ch) => inDca(mask(ch), g));
  const chN = (ch: number) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;
  const chC = (ch: number) => colorOf(Number(client.get(`/ch/${String(ch).padStart(2, '0')}/config/color`) ?? 0));
  const col = GROUP_COLORS[k - 1];
  const cardW = wide ? Math.floor((width - 40 - 3 * 10) / 4) : 230;
  const fam = (ch: number) => recognize(String(client.get(chNamePath(ch)) ?? ''))?.group ?? null;
  // suggestions : familles reconnues dans les noms (Batterie, Voix, Guitares)
  const families = Array.from(new Set(ALL.map(fam).filter(Boolean))) as string[];
  const suggest = (g: number) => {
    const taken = Array.from({ length: DCA_COUNT }, (_, n) => gName(n + 1).toLowerCase());
    return families.filter((fm) => !taken.includes(fm.toLowerCase()) || gName(g).toLowerCase() === fm.toLowerCase());
  };
  const fillWith = (g: number, family: string) => {
    client.set(dcaNamePath(g), s(family.slice(0, 12)));
    ALL.forEach((ch) => { if (fam(ch) === family) client.set(chDcaPath(ch), i(mask(ch) | (1 << (g - 1)))); });
  };
  const autoAll = () => {
    let n = 0;
    ALL.forEach((ch) => {
      const fm = fam(ch);
      if (!fm) return;
      const g = findOrCreateGroup(client, fm);
      if (g && !inDca(mask(ch), g)) { client.set(chDcaPath(ch), i(mask(ch) | (1 << (g - 1)))); n++; }
    });
    return n;
  };
  const [msg, setMsg] = useState('');
  const dbTxt = (v: number) => { const d = faderToDb(v); return !isFinite(d) || v <= 0 ? '−∞' : `${d > 0.05 ? '+' : ''}${Math.abs(d) < 0.05 ? '0' : d.toFixed(1)} dB`; };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Groupes</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Un groupe monte et baisse ses voies d’un bloc · enregistré dans la table</Text>
          </View>
          {families.length > 0 && (
            <Pressable onPress={() => { const n = autoAll(); setMsg(n ? `${n} voie${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} d’après leur nom` : 'Déjà rangé'); }} style={[styles.done, { borderWidth: 1, borderColor: theme.accent }]}>
              <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 14 }}>✨ Ranger d’après les noms</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>

        {!!msg && <Text style={{ color: '#34D399', fontWeight: '800' }}>{msg}</Text>}
        <ScrollView horizontal={!wide} contentContainerStyle={{ flexDirection: 'row', gap: 10 }} style={{ flexGrow: 0 }}>
          {Array.from({ length: DCA_COUNT }, (_, n) => n + 1).map((g) => {
            const c = GROUP_COLORS[g - 1];
            const m = members(g);
            const on = Number(client.get(dcaOnPath(g)) ?? 1) === 1;
            const lv = Number(client.get(dcaFaderPath(g)) ?? 0.75);
            const active = g === k;
            return (
              <Pressable key={g} onPress={() => setK(g)} onLongPress={() => setRenaming(g)} accessibilityState={{ selected: active }} style={[styles.card, { width: cardW, borderColor: active ? c : theme.line, backgroundColor: active ? theme.deep : theme.panel }]}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c, opacity: active ? 1 : 0.6 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 18, fontWeight: '800' }}>{gName(g)}</Text>
                  <Pressable onPress={() => setRenaming(g)} hitSlop={8} accessibilityLabel={`Renommer ${gName(g)}`}><Text style={{ color: theme.muted, fontSize: 16 }}>✎</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: c, fontSize: 12, fontWeight: '800', flex: 1 }}>{m.length ? `${m.length} voie${m.length > 1 ? 's' : ''}` : 'vide'}</Text>
                  <GroupMeter client={client} members={m} />
                </View>
                {m.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {m.map((ch) => (
                      <Pressable key={ch} onPress={() => client.set(chDcaPath(ch), i(toggleDca(mask(ch), g)))} accessibilityLabel={`Retirer ${chN(ch)} du groupe`} style={[styles.ava, { borderColor: chC(ch) }]}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{chN(ch)}</Text>
                        <Text style={{ color: theme.muted, fontSize: 10 }}> ✕</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 4 }}>
                    {suggest(g).slice(0, 3).map((fm) => (
                      <Pressable key={fm} onPress={() => { fillWith(g, fm); setK(g); }} style={[styles.sugg, { borderColor: c }]}>
                        <Text style={{ color: c, fontWeight: '800', fontSize: 12 }}>✨ En faire « {fm} » ({ALL.filter((ch) => fam(ch) === fm).length} voies)</Text>
                      </Pressable>
                    ))}
                    <Text style={{ color: theme.muted, fontSize: 11 }}>ou choisis-le puis touche des voies en dessous</Text>
                  </View>
                )}
                <HSlider value={lv} onChange={(v) => client.set(dcaFaderPath(g), f(v))} label="Niveau" valueText={dbTxt(lv)} color={on ? c : theme.muted} theme={theme} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Pressable onPress={() => client.set(dcaFaderPath(g), f(0.75))} style={[styles.mute, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>0 dB</Text></Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => client.set(dcaOnPath(g), i(on ? 0 : 1))} style={[styles.mute, { backgroundColor: on ? 'transparent' : theme.mute, borderColor: on ? theme.line2 : theme.mute }]}>
                    <Text style={{ color: on ? theme.text : theme.onMute, fontWeight: '800', fontSize: 12 }}>{on ? 'Couper' : 'Coupé'}</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col }} />
          <Text style={[styles.section, { color: theme.text }]}>Touche les voies à mettre dans « {gName(k)} »</Text>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {ALL.map((ch) => {
            const mk = mask(ch);
            const on = inDca(mk, k);
            return (
              <Pressable key={ch} onPress={() => client.set(chDcaPath(ch), i(toggleDca(mk, k)))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.member, { width: wide ? '15.6%' : '31.5%', borderColor: on ? col : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: chC(ch), marginBottom: 4 }} />
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{chN(ch)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10, flex: 1 }}>voie {ch}{GROUP_COLORS.some((_, n) => inDca(mk, n + 1)) ? ' · ' + GROUP_COLORS.map((_, n) => (inDca(mk, n + 1) ? gName(n + 1) : '')).filter(Boolean).join(', ') : ''}</Text>
                  {GROUP_COLORS.map((gc, n) => (
                    <View key={n} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: inDca(mk, n + 1) ? gc : 'transparent', borderWidth: 1, borderColor: inDca(mk, n + 1) ? gc : theme.line2 }} />
                  ))}
                </View>
                {on && <View style={[styles.check, { backgroundColor: col }]}><Text style={{ color: '#0B0B0F', fontWeight: '900', fontSize: 11 }}>✓</Text></View>}
              </Pressable>
            );
          })}
        </ScrollView>

        <RenameSheet
          visible={renaming !== null}
          initial={renaming ? gName(renaming) : ''}
          title={`Nom du groupe ${renaming ?? ''}`}
          theme={theme}
          suggestions={GROUP_NAMES}
          onClose={() => setRenaming(null)}
          onSave={(t) => {
            if (renaming) client.set(dcaNamePath(renaming), s(t.slice(0, 12)));
            setRenaming(null);
          }}
        />
      </View>
    </Modal>
  );
}

function GroupMeter({ client, members }: { client: XAirClient; members: number[] }) {
  const m = useMeter(client, members.slice(0, 16).map((c) => meterIndex.ch(c)), 120);
  return (
    <View style={{ width: 60, height: 8, borderRadius: 4, backgroundColor: '#0B0D10', overflow: 'hidden' }}>
      <View style={{ width: `${m.level * 100}%`, height: 8, backgroundColor: m.clip ? '#EF4444' : '#22C55E' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 40, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  card: { borderWidth: 2, borderRadius: 18, padding: 12, gap: 8 },
  ava: { height: 30, paddingHorizontal: 8, borderRadius: 15, borderWidth: 2, flexDirection: 'row', alignItems: 'center' },
  sugg: { minHeight: 36, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, justifyContent: 'center' },
  pm: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mute: { height: 32, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  section: { fontSize: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 40 },
  member: { minHeight: 70, borderRadius: 14, borderWidth: 2, padding: 8 },
  check: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
