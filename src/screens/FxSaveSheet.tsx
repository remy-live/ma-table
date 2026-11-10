// Enregistrer / charger : un effet seul (Mes effets) ou les 4 d'un coup (jeux d'effets).
import { CloseX } from '../ui/kit';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FxVisual } from '../ui/FxVisual';
import { Theme } from '../ui/theme';
import { fxType } from '../xair/effects';
import { applyAll, applyFx, FxNames, FxPreset, FxSet, loadFxSets, loadMyFx, saveFxSets, saveMyFx, snapAll, snapFx, SLOT_COLORS } from '../xair/fxSlots';
import { safetyBackup } from '../store/sessions';
import { XAirClient } from '../xair/XAirClient';

export type SaveMode = { kind: 'one'; slot: number; label: string } | { kind: 'all' };

export function FxSaveSheet(props: { client: XAirClient; theme: Theme; mode: SaveMode | null; names: FxNames; onNames: (n: FxNames) => void; onClose: () => void; onSaved?: (msg: string) => void }) {
  const { client, theme, mode } = props;
  const [one, setOne] = useState<FxPreset[]>([]);
  const [sets, setSets] = useState<FxSet[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!mode) return;
    loadMyFx().then(setOne); loadFxSets().then(setSets);
    setName(mode.kind === 'one' ? mode.label : `Concert ${new Date().toLocaleDateString('fr-FR')}`);
    setMsg('');
  }, [mode]);
  if (!mode) return null;
  const col = mode.kind === 'one' ? SLOT_COLORS[mode.slot - 1] : theme.accent;
  const n = name.trim() || 'Sans nom';

  const doSave = () => {
    if (mode.kind === 'one') {
      const list = [snapFx(client, mode.slot, n), ...one.filter((m) => m.name !== n)];
      setOne(list); saveMyFx(list);
      props.onNames({ ...props.names, [mode.slot]: n });
    } else {
      const list = [snapAll(client, props.names, n), ...sets.filter((x) => x.name !== n)];
      setSets(list); saveFxSets(list);
    }
    setMsg(`« ${n} » enregistré ✓`);
    props.onSaved?.(`« ${n} » enregistré`);
  };
  const loadOne = (p: FxPreset) => {
    if (mode.kind !== 'one') return;
    applyFx(client, mode.slot, p, true);
    props.onNames({ ...props.names, [mode.slot]: p.name });
    setMsg(`« ${p.name} » chargé dans FX${mode.slot} ✓`);
  };
  const loadSet = async (s: FxSet) => {
    await safetyBackup(client, `avant de charger « ${s.name} »`);
    props.onNames(applyAll(client, s));
    setMsg(`« ${s.name} » chargé : les 4 effets ✓ (sauvegarde de secours faite avant)`);
  };
  const del = (k: number) => {
    if (mode.kind === 'one') { const l = one.filter((_, x) => x !== k); setOne(l); saveMyFx(l); }
    else { const l = sets.filter((_, x) => x !== k); setSets(l); saveFxSets(l); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.scrim} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: col }]} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: 20, fontWeight: '800' }}>{mode.kind === 'one' ? `Enregistrer / charger FX${mode.slot}` : 'Enregistrer / charger les 4 effets'}</Text>
            <CloseX theme={theme} onPress={props.onClose} />
          </View>
          <Text style={[styles.kicker, { color: theme.muted }]}>ENREGISTRER SOUS</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={name} onChangeText={setName} maxLength={28} onSubmitEditing={doSave} style={[styles.input, { color: theme.text, borderColor: col, backgroundColor: theme.deep }]} />
            <Pressable onPress={doSave} style={[styles.go, { backgroundColor: col }]}><Text style={{ color: '#0B0B0F', fontWeight: '900', fontSize: 16 }}>💾 Enregistrer</Text></Pressable>
          </View>
          {!!msg && <Text style={{ color: '#34D399', fontWeight: '800' }}>{msg}</Text>}
          <Text style={[styles.kicker, { color: theme.muted }]}>CHARGER · appui long pour supprimer</Text>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {mode.kind === 'one' && one.map((p, k) => {
              const t = fxType(p.type);
              return (
                <Pressable key={p.name + k} onPress={() => loadOne(p)} onLongPress={() => del(k)} style={[styles.item, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                  <FxVisual kind={t.kind} color={col} a={p.pars[1] ?? 0.5} b={p.pars[2] ?? 0.5} c={p.pars[7] ?? 0.5} width={150} height={36} bg={theme.meterBg} />
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800' }}>{p.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>{t.fr} · Charger ›</Text>
                </Pressable>
              );
            })}
            {mode.kind === 'all' && sets.map((s, k) => (
              <Pressable key={s.name + k} onPress={() => loadSet(s)} onLongPress={() => del(k)} style={[styles.item, { width: 220, borderColor: theme.line2, backgroundColor: theme.deep }]}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {s.slots.map((p, j) => <FxVisual key={j} kind={fxType(p.type).kind} color={SLOT_COLORS[j]} a={p.pars[1] ?? 0.5} b={p.pars[2] ?? 0.5} c={p.pars[7] ?? 0.5} width={46} height={28} bg={theme.meterBg} />)}
                </View>
                <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800' }}>{s.name}</Text>
                <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10 }}>{s.slots.map((p, j) => s.names[j + 1] || fxType(p.type).fr).join(' · ')}</Text>
              </Pressable>
            ))}
            {(mode.kind === 'one' ? one.length : sets.length) === 0 && <Text style={{ color: theme.muted }}>Rien d’enregistré pour l’instant.</Text>}
          </ScrollView>
          {mode.kind === 'all' && <Text style={{ color: theme.muted, fontSize: 11 }}>Charger remplace les 4 effets et leurs retours. Les doses de chaque voie ne bougent pas.</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 760, maxHeight: '90%', borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  input: { flex: 1, height: 52, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, fontSize: 17, fontWeight: '800' },
  go: { height: 52, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  item: { width: 172, borderWidth: 1, borderRadius: 14, padding: 10, gap: 4 },
});
