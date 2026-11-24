// Les extras du mode Scène : bouton « Au secours » (larsen), check-list avant
// concert, journal des changements.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { journal } from '../store/journal';
import { load, save } from '../store/persist';
import { listSessions } from '../store/sessions';
import { Theme } from '../ui/theme';
import { busDyn } from '../xair/monitor';
import { readWifiClient } from '../xair/network';
import { clearClipHistory, clipHistory, onClipHistory } from '../xair/clip';
import { chColor } from '../xair/smartName';
import { CH_COUNT, chNamePath } from '../xair/addresses';
import { Check, checklist, rescue, RescueState, unrescue } from '../xair/rescue';
import { XAirClient } from '../xair/XAirClient';
import { isSpeaking, onSpeak, speakKept, speakOff, speakOn } from '../xair/speakMode';
import { guessRole } from '../xair/listen';

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
      <Text style={{ color: st ? '#1A1204' : '#FCA5A5', fontWeight: '800', fontSize: 16 }}>{st ? 'Remettre les retours' : 'AU SECOURS · ça siffle (larsen)'}</Text>
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

/** « Ce soir, Voix a saturé 3 fois » : pour corriger entre deux morceaux. */
export function ClipHistoryCard({ client, theme, onOpen }: { client: XAirClient; theme: Theme; onOpen?: (ch: number) => void }) {
  const [, setT] = React.useState(0);
  React.useEffect(() => onClipHistory(() => setT((x) => x + 1)), []);
  const list = clipHistory();
  const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
  return (
    <View style={{ borderWidth: 1, borderColor: list.length ? '#7F1D1D' : theme.line, backgroundColor: list.length ? '#2A1414' : theme.panel, borderRadius: 18, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: list.length ? '#FCA5A5' : theme.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{list.length ? '🔴 Saturations ce soir' : '✓ Aucune saturation ce soir'}</Text>
        {list.length > 0 && <Pressable onPress={clearClipHistory} style={{ height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#7F1D1D', justifyContent: 'center' }}><Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 12 }}>Effacer</Text></Pressable>}
      </View>
      {list.slice(0, 6).map((e) => (
        <View key={e.ch} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chColor(client, e.ch) }} />
          <Text style={{ color: theme.text, fontWeight: '800', flex: 1 }}>{String(client.get(chNamePath(e.ch)) ?? '') || `Voie ${e.ch}`} <Text style={{ color: '#FCA5A5' }}>× {e.count}</Text> <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>· dernière à {hhmm(e.last)}</Text></Text>
          {onOpen && <Pressable onPress={() => onOpen(e.ch)} style={{ height: 34, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#EF4444', justifyContent: 'center' }}><Text style={{ color: '#1A0505', fontWeight: '800', fontSize: 12 }}>Baisser le gain</Text></Pressable>}
        </View>
      ))}
      {list.length > 0 && <Text style={{ color: theme.muted, fontSize: 11 }}>Baisse la force du micro (gain) de 2 à 3 dB entre deux morceaux, puis remonte son volume (fader) si besoin.</Text>}
    </View>
  );
}


/** « Parler au public » : tout se coupe sauf le ou les micros choisis ; un appui rouvre tout comme avant. */
export function SpeakButton({ client, theme, locked }: { client: XAirClient; theme: Theme; locked?: boolean }) {
  const [, setN] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [keep, setKeep] = React.useState<number[]>([]);
  React.useEffect(() => onSpeak(() => setN((n) => n + 1)), []);
  const on = isSpeaking();
  const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).map((c) => ({ c, name: String(client.get(chNamePath(c)) ?? '').trim() })).filter((x) => x.name);
  const ask = async () => {
    const last = await load<number[] | null>('speakKeep', null).catch(() => null);
    const voices = named.filter((x) => guessRole(x.name) === 'Voix').map((x) => x.c);
    const start = (last ?? []).filter((c) => named.some((x) => x.c === c));
    setKeep(start.length ? start : voices.slice(0, 1));
    setOpen(true);
  };
  const names = speakKept().map((c) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`).join(', ');
  return (
    <>
      <Pressable
        onPress={() => (on ? speakOff(client) : ask())}
        disabled={locked && !on}
        accessibilityLabel={on ? 'Tout rouvrir : la musique reprend' : 'Parler au public : tout couper sauf un micro'}
        style={{ minHeight: 56, borderRadius: 14, borderWidth: 2, borderColor: on ? '#FBBF24' : theme.line2, backgroundColor: on ? '#FBBF24' : theme.panel, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' }}
      >
        <Text numberOfLines={1} style={{ color: on ? '#1A1204' : theme.text, fontSize: 15, fontWeight: '900' }}>{on ? '🎤 Tout rouvrir' : '🎤 Parler au public'}</Text>
        <Text numberOfLines={1} style={{ color: on ? '#1A1204' : theme.muted, fontSize: 11, fontWeight: '600' }}>{on ? `seul ${names} est ouvert · touche pour reprendre la musique` : 'tout se coupe sauf un micro'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: 460, maxWidth: '100%', maxHeight: '90%', borderRadius: 18, borderWidth: 1, borderColor: theme.line2, backgroundColor: theme.panel, padding: 16, gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>🎤 Parler au public</Text>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>Quel micro reste ouvert ? Toutes les autres voies se coupent. Un appui sur « Tout rouvrir » remet tout comme avant.</Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {named.map((x) => {
                const k = keep.includes(x.c);
                return (
                  <Pressable key={x.c} onPress={() => setKeep(k ? keep.filter((c) => c !== x.c) : [...keep, x.c])} accessibilityState={{ checked: k }} style={{ width: '48.5%', minHeight: 48, borderRadius: 12, borderWidth: 2, borderColor: k ? theme.accent : theme.line, backgroundColor: k ? theme.deep : 'transparent', paddingHorizontal: 10, justifyContent: 'center' }}>
                    <Text numberOfLines={1} style={{ color: k ? theme.text : theme.muted, fontSize: 15, fontWeight: k ? '800' : '500' }}>{k ? '✓ ' : ''}{x.name}</Text>
                  </Pressable>
                );
              })}
              {!named.length && <Text style={{ color: theme.muted, fontSize: 13 }}>Nomme d’abord tes voies (Table › la voie › son nom).</Text>}
            </ScrollView>
            <Pressable disabled={!keep.length} onPress={() => { save('speakKeep', keep).catch(() => {}); speakOn(client, keep); setOpen(false); }} style={{ minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBBF24', opacity: keep.length ? 1 : 0.4 }}>
              <Text style={{ color: '#1A1204', fontSize: 16, fontWeight: '900' }}>Couper tout le reste</Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.muted, fontSize: 14, fontWeight: '700' }}>Annuler</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
