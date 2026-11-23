// « Proposer des effets » : pour chaque voie nommée, l'appli conseille une dose
// de réverbe (ou d'écho) selon l'instrument. On essaie, on écoute avec / sans,
// puis on garde ou on annule.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { f, i } from '../osc/osc';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { CH_COUNT, chLevelPath, chNamePath, FX_COUNT } from '../xair/addresses';
import { ChangeSet, record, undoChanges } from '../xair/changeLog';
import { applyRecipe, fxReturnOnPath, RECIPES } from '../xair/effects';
import { dbToFader } from '../xair/levels';
import { familyRank } from '../xair/reorder';
import { adviseFor } from '../xair/fxAdvice';
import { XAirClient } from '../xair/XAirClient';
import { ChangesSheet } from './ChangesSheet';

/** Le rack proposé : 1 = réverbe des voix, 2 = petite salle, 3 = écho. */
const RACK: { slot: number; recipe: string; label: string }[] = [
  { slot: 1, recipe: 'voixpop', label: 'Réverbe voix' },
  { slot: 2, recipe: 'piece', label: 'Petite salle' },
  { slot: 3, recipe: 'echo', label: 'Écho' },
];

interface Advice { ch: number; name: string; slot: number | null; db: number; why: string; on: boolean }

export function EffectsAdvisor({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [list, setList] = useState<Advice[]>([]);
  const [echo, setEcho] = useState(false);
  const [trial, setTrial] = useState<ChangeSet | null>(null);
  const [wet, setWet] = useState(true);
  const [changed, setChanged] = useState<ChangeSet | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTrial(null);
    setWet(true);
    const out: Advice[] = [];
    for (let c = 1; c <= CH_COUNT; c++) {
      const name = String(client.get(chNamePath(c)) ?? '');
      if (!name) continue;
      const a = adviseFor(name);
      out.push({ ch: c, name, slot: a.slot, db: a.db, why: a.why, on: a.slot !== null });
    }
    setList(out);
  }, [visible, client]);

  const used = useMemo(() => new Set(list.filter((a) => a.on && a.slot).map((a) => a.slot!).concat(echo ? [3] : [])), [list, echo]);
  const leads = list.filter((a) => familyRank(a.name) === 0);

  const tryIt = () => {
    const rec = record(client, 'Effets conseillés');
    for (const r of RACK) if (used.has(r.slot) && r.slot <= FX_COUNT) applyRecipe(client, r.slot, RECIPES.find((x) => x.id === r.recipe)!, false);
    for (const a of list) {
      if (!a.slot) continue;
      client.set(chLevelPath(a.ch, { kind: 'fx', n: a.slot }), f(a.on ? dbToFader(a.db) : 0));
    }
    if (echo) for (const a of leads) client.set(chLevelPath(a.ch, { kind: 'fx', n: 3 }), f(dbToFader(-20)));
    setTrial(rec.stop());
    setWet(true);
  };
  const toggleWet = () => {
    const v = !wet;
    for (const s of used) client.set(fxReturnOnPath(s), i(v ? 1 : 0));
    setWet(v);
  };
  const keep = () => { if (!wet) toggleWet(); const t = trial; setTrial(null); setChanged(t); };
  const cancel = () => { if (trial) undoChanges(client, trial); if (!wet) for (const s of used) client.set(fxReturnOnPath(s), i(1)); setTrial(null); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Proposer des effets</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>FX 1 réverbe voix · FX 2 petite salle{echo ? ' · FX 3 écho' : ''}. Touche une voie pour l’enlever.</Text>
            </View>
            <CloseX theme={theme} onPress={() => { if (trial) cancel(); onClose(); }} />
          </View>
          <ScrollView style={{ flexGrow: 0, maxHeight: 380 }} contentContainerStyle={{ gap: 6 }}>
            {list.length === 0 && <Text style={{ color: theme.muted }}>Aucune voie nommée : nomme d’abord tes voies (Voix, Guitare, Caisse claire…).</Text>}
            {list.map((a) => (
              <Pressable key={a.ch} disabled={!a.slot || !!trial} onPress={() => setList((l) => l.map((x) => (x.ch === a.ch ? { ...x, on: !x.on } : x)))}
                style={[styles.row, { borderColor: a.on ? '#C084FC' : theme.line, backgroundColor: theme.deep, opacity: a.slot && !a.on ? 0.55 : 1 }]}>
                <Text style={{ width: 26, color: theme.muted, fontWeight: '800' }}>{a.ch}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>{a.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{a.why}</Text>
                </View>
                <Text style={{ color: a.slot ? (a.on ? '#C084FC' : theme.muted) : theme.muted, fontWeight: '800', fontSize: 12 }}>
                  {a.slot ? (a.on ? `${RACK.find((r) => r.slot === a.slot)?.label} ${a.db} dB` : 'sans') : 'sec'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {leads.length > 0 && !trial && (
            <Pressable onPress={() => setEcho((e) => !e)} style={[styles.row, { borderColor: echo ? '#C084FC' : theme.line2 }]}>
              <Text style={{ flex: 1, color: theme.text, fontWeight: '700' }}>{echo ? '✓ ' : ''}Un léger écho sur {leads.map((l) => l.name).join(', ')}</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>à caler au tempo ensuite</Text>
            </Pressable>
          )}
          {!trial ? (
            <>
              <Pressable disabled={!used.size} onPress={tryIt} style={[styles.go, { backgroundColor: '#C084FC', opacity: used.size ? 1 : 0.4 }]}>
                <Text style={{ color: '#1E0B2E', fontWeight: '900', fontSize: 15 }}>Essayer</Text>
              </Pressable>
              <Text style={{ color: theme.muted, fontSize: 11 }}>Les emplacements FX {[...used].sort().join(', ')} prennent ces effets (leurs réglages actuels sont remplacés, annulable).</Text>
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Pressable onPress={toggleWet} style={[styles.go, { borderWidth: 2, borderColor: '#C084FC', backgroundColor: wet ? '#2A1640' : theme.deep }]}>
                <Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }}>{wet ? '🔊 Avec les effets · toucher pour écouter sans' : '🔈 Sans les effets · toucher pour écouter avec'}</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={cancel} style={[styles.go, { flex: 1, borderWidth: 1.5, borderColor: '#F87171' }]}><Text style={{ color: '#F87171', fontWeight: '800' }}>↶ Annuler</Text></Pressable>
                <Pressable onPress={keep} style={[styles.go, { flex: 1, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>Garder</Text></Pressable>
              </View>
            </View>
          )}
        </View>
        <ChangesSheet client={client} theme={theme} visible={!!changed} set={changed} onClose={() => { setChanged(null); onClose(); }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 640, borderRadius: 20, borderWidth: 1, padding: 16, gap: 10, maxHeight: '96%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  go: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});
