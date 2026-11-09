// Les extras du mode Scène : bouton « Au secours » (larsen), check-list avant
// concert, journal des changements.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { journal } from '../store/journal';
import { load } from '../store/persist';
import { listSessions } from '../store/sessions';
import { Theme } from '../ui/theme';
import { busDyn } from '../xair/monitor';
import { readWifiClient } from '../xair/network';
import { Check, checklist, rescue, RescueState, unrescue } from '../xair/rescue';
import { XAirClient } from '../xair/XAirClient';

export function RescueButton({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [st, setSt] = useState<RescueState | null>(null);
  return (
    <Pressable
      onPress={() => {
        if (st) {
          unrescue(client, st);
          setSt(null);
        } else {
          setSt(rescue(client));
        }
      }}
      accessibilityLabel={st ? 'Remettre les retours' : 'Au secours : baisser tous les retours de 6 dB'}
      style={[styles.rescue, st ? { backgroundColor: '#F59E0B', borderColor: '#F59E0B' } : { borderColor: '#EF4444', backgroundColor: '#2A1414' }]}
    >
      <Text style={{ color: st ? '#1A1204' : '#FCA5A5', fontWeight: '800', fontSize: 16 }}>{st ? 'Remettre les retours' : 'AU SECOURS · larsen'}</Text>
      <Text style={{ color: st ? '#1A1204' : '#FCA5A5', fontSize: 11 }}>{st ? 'les retours reviennent comme avant' : 'tous les retours −6 dB d’un coup · la façade ne bouge pas'}</Text>
    </Pressable>
  );
}

export function ChecklistSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const bal = await load('balance', null);
      const sessions = await listSessions();
      let wifi: boolean | null = null;
      try {
        const r = await readWifiClient(client);
        wifi = !!r.ssid;
      } catch {
        wifi = null;
      }
      await client.loadPaths(Array.from({ length: 6 }, (_, k) => busDyn(k + 1, 'on')), false);
      const limiters = Array.from({ length: 6 }, (_, k) => Number(client.get(busDyn(k + 1, 'on')) ?? 0)).filter((x) => x === 1).length;
      setChecks(checklist(client, { balanceSaved: !!bal, sessionSaved: sessions.some((s) => Date.now() - s.savedAt < 12 * 3600 * 1000), wifiClient: wifi, limiters, namedReturns: 1 }));
    })();
  }, [visible, client]);
  const okCount = checks.filter((c) => c.ok).length;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Avant le concert</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{checks.length ? `${okCount} / ${checks.length} · ${okCount === checks.length ? 'tout est prêt' : 'il reste des points'}` : 'Vérification…'}</Text>
          </View>
          <Pressable onPress={onClose} style={[styles.done, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Fermer</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 30 }}>
          {checks.map((c) => (
            <View key={c.id} style={[styles.check, { backgroundColor: theme.panel, borderColor: c.ok ? '#1F6F4A' : '#7F1D1D' }]}>
              <Text style={{ fontSize: 22 }}>{c.ok ? '✅' : '⚠️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{c.label}</Text>
                {!c.ok && <Text style={{ color: '#FCD34D', fontSize: 12 }}>{c.hint}</Text>}
              </View>
            </View>
          ))}
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }}>Et à la main : téléphone chargé, partage de connexion allumé, mise en veille désactivée (l’appli garde l’écran allumé tant qu’elle est devant).</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function JournalSheet({ theme, visible, onClose }: { theme: Theme; visible: boolean; onClose: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => journal.onChange(() => setTick((x) => x + 1)), []);
  const entries = journal.entries;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Journal</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Qui a changé quoi, et quand</Text>
          </View>
          <Pressable onPress={() => Share.share({ message: journal.asText() })} style={[styles.done, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Envoyer</Text></Pressable>
          <Pressable onPress={onClose} style={[styles.done, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Fermer</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 30 }}>
          {entries.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Rien pour l’instant. Chaque réglage changé (par toi ou par un autre appareil) s’écrit ici.</Text>}
          {entries.map((e, k) => (
            <View key={e.at + ':' + k} style={[styles.entry, { backgroundColor: theme.panel, borderLeftColor: e.who === 'moi' ? theme.accent : '#60A5FA' }]}>
              <Text style={{ color: theme.muted, fontSize: 11, width: 46 }}>{new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{e.text}</Text>
                <Text style={{ color: theme.muted, fontSize: 10 }}>{e.who === 'moi' ? 'cet appareil' : 'un autre appareil (téléphone d’un musicien, appli X AIR…)'}</Text>
              </View>
            </View>
          ))}
          {entries.length > 0 && (
            <Pressable onPress={() => Alert.alert('Effacer le journal ?', '', [{ text: 'Non' }, { text: 'Effacer', style: 'destructive', onPress: () => journal.clear() }])} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Effacer le journal</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  rescue: { minHeight: 64, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 8 },
  check: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  entry: { borderLeftWidth: 4, borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
});
