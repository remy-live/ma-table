// « Nouvelle salle » : on reprend la balance d'une salle déjà faite (mêmes
// musiciens, mêmes micros), puis une minute suffit : un silence, un refrain
// ensemble, et l'appli retouche seulement le volume général et les gains
// (±3 dB au plus). Le reste ne bouge pas. Ensuite : chasse au larsen, et on
// enregistre la nouvelle salle.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { f } from '../osc/osc';
import { listVenues, saveVenue, Venue } from '../store/venues';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath, fToGainDb, gainDbToF, headampGainPath, meterIndex } from '../xair/addresses';
import { percentile } from '../xair/autoBalance';
import { ChangeSet, record } from '../xair/changeLog';
import { hasPreamp } from '../xair/guide';
import { dbToFader, faderToDb } from '../xair/levels';
import { capture, restore } from '../xair/snapshot';
import { setDemoStage } from '../xair/tableModel';
import { plugs } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { ChangesSheet } from './ChangesSheet';
import { LR_TARGET, MAX_TRIM, trimFor } from '../xair/venueTrim';

const TUTTI_S = 20;

export function VenueQuick({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [from, setFrom] = useState<string | null>(null); // null = la balance actuelle
  const [phase, setPhase] = useState<'pick' | 'silence' | 'tutti' | 'done'>('pick');
  const [left, setLeft] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [changed, setChanged] = useState<ChangeSet | null>(null);
  const rec = useRef<ReturnType<typeof record> | null>(null);
  const samples = useRef<Map<number, number[]>>(new Map());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    listVenues().then(setVenues);
    setPhase('pick'); setLines([]); setSaved(false); setName(''); setFrom(null);
    return () => { if (timer.current) clearInterval(timer.current); setDemoStage(null); };
  }, [visible]);

  const named = () => Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(chNamePath(c)) ?? ''));

  const start = () => {
    rec.current?.cancel();
    rec.current = record(client, from ? `Nouvelle salle (depuis « ${from} »)` : 'Nouvelle salle');
    const v = venues.find((x) => x.name === from);
    if (v) restore(client, v.snap);
    // un silence de 4 s, puis 20 s tous ensemble
    setPhase('silence');
    setDemoStage('none');
    let t = 4;
    setLeft(t);
    timer.current = setInterval(() => {
      t--;
      setLeft(t);
      if (t <= 0) { if (timer.current) clearInterval(timer.current); listen(); }
    }, 1000);
  };

  const listen = () => {
    setPhase('tutti');
    setDemoStage('all');
    samples.current = new Map();
    client.startMeters();
    const off = client.onMeters((m) => {
      const put = (k: number, v: number) => { const a = samples.current.get(k) ?? []; a.push(v); samples.current.set(k, a); };
      for (const c of named()) put(c, m[meterIndex.ch(c)] ?? -90);
      put(0, Math.max(m[meterIndex.lrL] ?? -90, m[meterIndex.lrR] ?? -90));
    });
    let t = TUTTI_S;
    setLeft(t);
    timer.current = setInterval(() => {
      t--;
      setLeft(t);
      if (t <= 0) { if (timer.current) clearInterval(timer.current); off(); client.stopMeters(); finish(); }
    }, 1000);
  };

  const finish = () => {
    setDemoStage(null);
    const out: string[] = [];
    const P = plugs(client);
    // 1. les gains, à peine
    for (const c of named()) {
      const peak = percentile(samples.current.get(c) ?? [], 0.97);
      const d = trimFor(peak);
      const plug = P.find((p) => p.chans.includes(c))?.n ?? c;
      if (!d || !hasPreamp(plug)) continue;
      const cur = fToGainDb(Number(client.get(headampGainPath(plug)) ?? 0.5));
      client.set(headampGainPath(plug), f(gainDbToF(cur + d)));
      out.push(`${String(client.get(chNamePath(c)))} : gain ${d > 0 ? '+' : ''}${Math.round(d * 2) / 2} dB (${peak > -6 ? 'trop fort ici' : 'un peu faible ici'})`);
    }
    // 2. le volume général
    const lr = percentile(samples.current.get(0) ?? [], 0.97);
    if (isFinite(lr) && lr > -60) {
      const d = Math.max(-4, Math.min(4, LR_TARGET - lr));
      if (Math.abs(d) >= 1) {
        const cur = faderToDb(Number(client.get('/lr/mix/fader') ?? 0.75));
        client.set('/lr/mix/fader', f(dbToFader(Math.min(10, (isFinite(cur) ? cur : 0) + d))));
        out.push(`Volume général : ${d > 0 ? '+' : ''}${Math.round(d)} dB`);
      }
    }
    if (!out.length) out.push('Rien à retoucher : la balance tient dans cette salle.');
    setLines(out);
    setPhase('done');
    const set = rec.current?.stop() ?? null;
    rec.current = null;
    if (set) setChanged(set);
  };

  const keepVenue = async () => {
    if (!name.trim()) return;
    const snap = await capture(client, name.trim());
    await saveVenue(name.trim(), snap);
    setSaved(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Nouvelle salle</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Mêmes musiciens, autre salle : on reprend et on retouche en une minute.</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>

          {phase === 'pick' && (
            <>
              <Text style={[styles.kicker, { color: theme.muted }]}>PARTIR DE</Text>
              <ScrollView style={{ flexGrow: 0, maxHeight: 260 }} contentContainerStyle={{ gap: 6 }}>
                <Pressable onPress={() => setFrom(null)} style={[styles.row, { borderColor: from === null ? theme.accent : theme.line }]}>
                  <Text style={{ color: theme.text, fontWeight: '800', flex: 1 }}>La balance actuelle de la table</Text>
                  {from === null && <Text style={{ color: theme.accent, fontWeight: '900' }}>✓</Text>}
                </Pressable>
                {venues.map((v) => (
                  <Pressable key={v.name} onPress={() => setFrom(v.name)} style={[styles.row, { borderColor: from === v.name ? theme.accent : theme.line }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '800' }}>{v.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>balance du {new Date(v.at).toLocaleDateString('fr-FR')}</Text>
                    </View>
                    {from === v.name && <Text style={{ color: theme.accent, fontWeight: '900' }}>✓</Text>}
                  </Pressable>
                ))}
                {venues.length === 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucune salle enregistrée : à la fin, tu pourras garder celle-ci.</Text>}
              </ScrollView>
              <Text style={{ color: theme.muted, fontSize: 12 }}>1. Silence 4 s · 2. Un refrain tous ensemble, {TUTTI_S} s · l’appli retouche le volume général et les gains (±{MAX_TRIM} dB au plus). Égaliseurs, retours et effets ne bougent pas.</Text>
              <Pressable onPress={start} style={[styles.go, { backgroundColor: theme.ok }]}><Text style={{ color: '#052E1F', fontWeight: '900', fontSize: 16 }}>Commencer</Text></Pressable>
            </>
          )}

          {(phase === 'silence' || phase === 'tutti') && (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
              <Text style={{ color: theme.text, fontSize: 24, fontWeight: '900' }}>{phase === 'silence' ? '🤫 Silence…' : '🎶 Tous ensemble : un refrain'}</Text>
              <Text style={{ color: theme.accent, fontSize: 40, fontWeight: '900' }}>{left}</Text>
              <Text style={{ color: theme.muted }}>{phase === 'silence' ? 'Préparez-vous à jouer' : 'Jouez fort, comme au concert'}</Text>
            </View>
          )}

          {phase === 'done' && (
            <>
              {lines.map((l) => <Text key={l} style={{ color: theme.text, fontSize: 14 }}>• {l}</Text>)}
              <Text style={{ color: theme.muted, fontSize: 12 }}>Un retour qui siffle dans cette salle ? Ouvre-le dans Concert : « Chasser le larsen » trouve et creuse la fréquence.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={name} onChangeText={setName} placeholder="Nom de la salle (ex. Salle des fêtes)" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                <Pressable disabled={!name.trim() || saved} onPress={keepVenue} style={[styles.go, { paddingHorizontal: 14, backgroundColor: theme.accent, opacity: name.trim() && !saved ? 1 : 0.5 }]}>
                  <Text style={{ color: theme.onAccent, fontWeight: '800' }}>{saved ? '✓ Gardée' : 'Garder'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={onClose} style={[styles.go, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Fermer</Text></Pressable>
            </>
          )}
        </View>
        <ChangesSheet client={client} theme={theme} visible={!!changed} set={changed} onClose={() => setChanged(null)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 600, borderRadius: 20, borderWidth: 1, padding: 16, gap: 10, maxHeight: '96%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 10 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  go: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
