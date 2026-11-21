// « Trouver ce micro » : on fait jouer l'instrument, l'appli montre sur le
// dessin de la table la prise où le son arrive vraiment. Si ce n'est pas la
// bonne voie, un bouton échange les deux voies (réglages et nom compris).
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { MiniTable } from '../ui/MiniTable';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath, meterIndex } from '../xair/addresses';
import { record } from '../xair/changeLog';
import { swapChannels } from '../xair/clipboard';
import { setDemoStage } from '../xair/tableModel';
import { plugColor, plugs } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { ChangeSet } from '../xair/changeLog';

export function FindMicSheet({ client, theme, ch, visible, onClose, onSwapped }: { client: XAirClient; theme: Theme; ch: number; visible: boolean; onClose: () => void; onSwapped?: (set: ChangeSet | null) => void }) {
  const [found, setFound] = useState<number | null>(null); // voie où le son arrive
  const [busy, setBusy] = useState(false);
  const peaks = useRef<number[]>([]);
  const since = useRef<{ c: number; t: number } | null>(null);
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;

  useEffect(() => {
    if (!visible) return;
    setFound(null);
    peaks.current = Array(CH_COUNT + 1).fill(-90);
    since.current = null;
    // démo : « le musicien » joue sur une autre voie nommée, comme une erreur de branchement
    const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => c !== ch && String(client.get(chNamePath(c)) ?? ''));
    setDemoStage(named.length ? named[Math.floor(Math.random() * named.length)] : ch);
    client.startMeters();
    const off = client.onMeters((m) => {
      const p = peaks.current;
      for (let c = 1; c <= CH_COUNT; c++) {
        const db = m[meterIndex.ch(c)] ?? -90;
        p[c] = Math.max(db, p[c] - 1.5); // crête qui retombe doucement
      }
      // le plus fort, s'il dépasse nettement tous les autres
      let best = 1;
      for (let c = 2; c <= CH_COUNT; c++) if (p[c] > p[best]) best = c;
      const second = Math.max(...p.filter((_, c) => c !== best && c > 0));
      const clear = p[best] > -45 && p[best] - second >= 8;
      const now = Date.now();
      if (!clear) { since.current = null; return; }
      if (!since.current || since.current.c !== best) since.current = { c: best, t: now };
      else if (now - since.current.t > 600) setFound(best);
    });
    return () => { off(); client.stopMeters(); setDemoStage(null); };
  }, [visible, ch, client]);

  const P = plugs(client);
  const plugOf = (c: number) => P.find((p) => p.chans.includes(c))?.n;
  const want = plugOf(ch);
  const at = found ? plugOf(found) : undefined;
  const ok = found === ch;

  const swap = async () => {
    if (!found) return;
    setBusy(true);
    const rec = record(client, `Échange des voies ${ch} et ${found}`);
    await swapChannels(client, ch, found);
    const set = rec.stop([[Math.min(want ?? ch, at ?? found), Math.max(want ?? ch, at ?? found)]]);
    setBusy(false);
    onSwapped?.(set);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>🔍</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Trouver ce micro</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{name(ch)} · attendu sur la prise {want ?? '?'}</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {!found ? `Fais jouer ${name(ch)} (quelques coups, quelques notes)…` : ok ? `✓ C’est bien la prise ${at} : tout est bon.` : `Le son arrive sur la prise ${at}, la voie « ${name(found)} ».`}
          </Text>
          <MiniTable
            maxWidth={520}
            plugs={Object.fromEntries(P.map((p) => [p.n, { label: p.name || undefined, color: p.chans.length ? plugColor(client, p, () => '') : undefined, badge: p.n === want && !ok ? 'attendu' : p.n === at ? 'ici !' : undefined, dim: !!found && p.n !== at && p.n !== want }]))}
            blink={at ? [at] : want ? [want] : []}
            arrows={found && !ok && want && at ? [[Math.min(want, at), Math.max(want, at)]] : []}
          />
          {found && !ok && (
            <Pressable disabled={busy} onPress={swap} style={[styles.go, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>⇄ Échanger les voies {ch} et {found}</Text>
            </Pressable>
          )}
          {found && !ok && <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>Tous les réglages suivent l’instrument (nom, gain, égaliseur, retours). Pas besoin de rebrancher.</Text>}
          <Pressable onPress={() => { setFound(null); since.current = null; }} style={[styles.go, { borderWidth: 1, borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Réécouter</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 600, borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  go: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
