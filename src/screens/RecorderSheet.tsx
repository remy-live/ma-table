// « Enregistrer le concert » : la tablette, branchée en USB sur la table, écrit un
// fichier par voie choisie (+ la façade en stéréo). Après coup : réécouter,
// repères de morceaux, mixage automatique retouchable, partage.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { autoTrim, candidates, currentSong, defaultName, facadePossible, fmtTime, hoursLeft, mark, onRec, parseMeta, recState, RecMeta, startRec, stopRec } from '../xair/recorder';
import { SessEntry, usbListen as usbAudio } from '../xair/usbAudio';
import { ListenScreen } from './ListenScreen';
import { XAirClient } from '../xair/XAirClient';

const RED = '#DC2626';
const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.round(b / 1e6)} Mo`);

export function useRec() {
  const [, setN] = useState(0);
  useEffect(() => onRec(() => setN((n) => n + 1)), []);
  return recState();
}

/** Le bandeau rouge du mode Concert pendant qu'on enregistre : durée, morceau, « Morceau suivant ». */
export function RecBar({ theme, onOpen }: { theme: Theme; onOpen: () => void }) {
  const st = useRec();
  if (!st.on) return null;
  const song = currentSong();
  const hotNames = st.hot.map((k) => st.meta?.tracks.find((t) => t.ch === k || (t.stereo && t.ch + 1 === k))?.name).filter(Boolean);
  const bad = st.writeErrors > 0;
  return (
    <View style={[styles.bar, { borderColor: RED, backgroundColor: '#2A1010' }]}>
      <Pressable onPress={onOpen} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityLabel="Ouvrir l’enregistreur">
        <Text numberOfLines={1} style={{ color: '#FCA5A5', fontSize: 15, fontWeight: '900' }}>⏺ {fmtTime(st.t)} · {song?.label ?? ''}</Text>
        <Text numberOfLines={1} style={{ color: bad || hotNames.length ? '#FACC15' : theme.muted, fontSize: 11 }}>
          {bad ? '⚠ écriture impossible (place ?)' : hotNames.length ? `⚠ sature : ${hotNames.join(', ')} · baisse son gain` : 'enregistrement en cours'}
        </Text>
      </Pressable>
      <Pressable onPress={mark} style={[styles.next, { backgroundColor: RED }]} accessibilityLabel="Morceau suivant">
        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>Morceau suivant ›</Text>
      </Pressable>
    </View>
  );
}

/** Dans Concert : le gros bouton rouge « Enregistrer le concert » ; pendant la prise, il devient le bandeau. */
export function RecCard({ theme, onOpen }: { theme: Theme; onOpen: () => void }) {
  const st = useRec();
  if (!usbAudio) return null;
  if (st.on) return <RecBar theme={theme} onOpen={onOpen} />;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Enregistrer le son du concert" style={{ minHeight: 64, borderRadius: 16, backgroundColor: RED, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }} /></View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900' }}>Enregistrer le concert</Text>
        <Text numberOfLines={1} style={{ color: '#FEE2E2', fontSize: 11, fontWeight: '600' }}>le son, piste par piste · réécouter, mixer, partager</Text>
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900' }}>›</Text>
    </Pressable>
  );
}

/** Petite pastille rouge posée par-dessus les autres écrans pendant qu'on enregistre. */
export function RecPill({ wide, onOpen }: { wide: boolean; onOpen: () => void }) {
  const st = useRec();
  if (!st.on) return null;
  const warn = st.hot.length > 0 || st.writeErrors > 0;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: wide ? 6 : 40, left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
      <View style={{ flexDirection: 'row', borderRadius: 999, overflow: 'hidden', borderWidth: 1.5, borderColor: RED, backgroundColor: '#2A1010' }}>
        <Pressable onPress={onOpen} accessibilityLabel="Enregistrement en cours : ouvrir" style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text style={{ color: warn ? '#FACC15' : '#FCA5A5', fontWeight: '900', fontSize: 13 }}>{warn ? '⚠' : '⏺'} {fmtTime(st.t)} · {currentSong()?.label ?? ''}</Text>
        </Pressable>
        <Pressable onPress={mark} accessibilityLabel="Morceau suivant" style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: RED }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>suivant ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RecorderSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const st = useRec();
  const [tab, setTab] = useState<'rec' | 'list'>('rec');
  const [name, setName] = useState(defaultName());
  const [sel, setSel] = useState<number[]>([]);
  const [facade, setFacade] = useState(facadePossible());
  const [free, setFree] = useState(0);
  const [msg, setMsg] = useState('');
  const [list, setList] = useState<SessEntry[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const cands = useMemo(() => (visible ? candidates(client) : []), [visible, client]);

  const reload = () => setList(usbAudio?.sessList() ?? []);
  useEffect(() => {
    if (!visible) return;
    setMsg('');
    if (!st.on) {
      setName(defaultName());
      const c = candidates(client);
      const named = c.filter((x) => x.named && !x.muted).map((x) => x.ch);
      setSel(named.length ? named : c.map((x) => x.ch));
    }
    try { setFree(usbAudio?.recFree().free ?? 0); } catch { setFree(0); }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => { if (!st.on && st.last) reload(); }, [st.on, st.last]);

  const planned = [...sel.map(() => ({ stereo: false })), ...(facade ? [{ stereo: true }] : [])];
  const hours = hoursLeft(st.on ? st.free : free, st.on ? st.meta?.tracks ?? [] : planned);

  const go = async () => {
    if (!sel.length && !facade) { setMsg('Coche au moins une voie.'); return; }
    setMsg('Démarrage… (accepte la fenêtre « Autoriser Ma table » si elle s’ouvre)');
    const err = await startRec(client, name.trim() || defaultName(), [...sel].sort((a, b) => a - b), facade, false);
    setMsg(err);
    if (!err) onClose(); // c'est parti : retour à la table, la pastille rouge prend le relais
  };
  const stop = () => Alert.alert('Arrêter l’enregistrement ?', 'Les fichiers sont gardés.', [
    { text: 'Continuer', style: 'cancel' },
    { text: 'Arrêter', style: 'destructive', onPress: async () => { await stopRec(); reload(); setTab('list'); } },
  ]);

  const toggle = (ch: number) => setSel((s) => (s.includes(ch) ? s.filter((x) => x !== ch) : [...s, ch]));
  const entry = list.find((e) => e.id === open) ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={[styles.head, entry ? { display: 'none' } : null]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Enregistrer le concert</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>La tablette branchée en USB sur la table · un fichier par voie</Text>
          </View>
          <CloseX theme={theme} onPress={onClose} />
        </View>

        {!usbAudio ? (
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 22 }}>L’enregistrement se fait sur la tablette Android branchée à la table par le câble USB. Sur cet appareil, il n’est pas disponible.</Text>
        ) : entry ? (
          <ListenScreen entry={entry} theme={theme} onBack={() => { setOpen(null); reload(); }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {([['rec', st.on ? '⏺ En cours' : '⏺ Enregistrer'], ['list', `🎵 Mes enregistrements${list.length ? ` (${list.length})` : ''}`]] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, { borderColor: tab === k ? theme.accent : theme.line2, backgroundColor: tab === k ? theme.accent : 'transparent' }]}>
                  <Text style={{ color: tab === k ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 14 }}>{l}</Text>
                </Pressable>
              ))}
            </View>

            {tab === 'rec' && !st.on && (
              <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.panel }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>NOM DU CONCERT</Text>
                  <TextInput value={name} onChangeText={setName} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} placeholderTextColor={theme.muted} />
                </View>
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.panel }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>LES VOIES À ENREGISTRER · {sel.length} cochée{sel.length > 1 ? 's' : ''}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Les voies qui ont un nom sont déjà cochées. Décoche ce qui ne sert pas : ça économise de la place.</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {cands.map((c) => {
                      const on = sel.includes(c.ch);
                      return (
                        <Pressable key={c.ch} onPress={() => toggle(c.ch)} accessibilityState={{ checked: on }} style={[styles.chk, { borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.deep : 'transparent' }]}>
                          <Text style={{ fontSize: 16 }}>{on ? '☑' : '☐'}</Text>
                          <Text numberOfLines={1} style={{ flex: 1, color: on ? theme.text : theme.muted, fontSize: 14, fontWeight: on ? '800' : '500' }}>{c.ch} · {c.name || 'sans nom'}{c.muted ? ' (coupée)' : ''}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {facadePossible() && (
                    <Pressable onPress={() => setFacade((v) => !v)} accessibilityState={{ checked: facade }} style={[styles.chk, { width: '100%', borderColor: facade ? theme.accent : theme.line2, backgroundColor: facade ? theme.deep : 'transparent' }]}>
                      <Text style={{ fontSize: 16 }}>{facade ? '☑' : '☐'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>La façade en stéréo (ce que le public entend)</Text>
                        <Text style={{ color: theme.muted, fontSize: 11 }}>Un fichier prêt à écouter, avec tes réglages et les effets. La table l’envoie sur les pistes USB 17-18.</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
                <Text style={{ color: hours < 2 ? '#FACC15' : theme.muted, fontSize: 13 }}>
                  Place libre : {gb(free)} · environ {hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h d’enregistrement avec ce choix.
                </Text>
                <Pressable onPress={go} disabled={st.starting} style={[styles.go, { backgroundColor: RED, opacity: st.starting ? 0.5 : 1 }]}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18 }}>⏺ Enregistrer</Text>
                </Pressable>
                {!!msg && <Text style={{ color: '#FCD34D', fontSize: 13 }}>{msg}</Text>}
                {st.last && !!st.last.reason && <Text style={{ color: '#FCA5A5', fontSize: 13 }}>Le dernier enregistrement s’est arrêté tout seul après {fmtTime(st.last.seconds)} : {st.last.reason}. Ce qui était enregistré est gardé.</Text>}
                <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>
                  À savoir : le câble USB occupe la prise de charge, pars avec la tablette chargée à 100 %. Tu peux fermer cet écran et mixer normalement : l’enregistrement continue. Le son enregistré suit le gain d’entrée de chaque voie, pas les faders.
                </Text>
              </ScrollView>
            )}

            {tab === 'rec' && st.on && (
              <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
                <View style={[styles.box, { borderColor: RED, backgroundColor: '#2A1010', alignItems: 'center' }]}>
                  <Text style={{ color: '#FCA5A5', fontSize: 44, fontWeight: '900' }}>⏺ {fmtTime(st.t)}</Text>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{currentSong()?.label} · depuis {fmtTime(st.t - (currentSong()?.t ?? 0))}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{st.meta?.name} · encore {hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h de place{st.isPublic ? ' · Musique/Ma table' : ''}</Text>
                </View>
                <Pressable onPress={onClose} style={[styles.go, { borderWidth: 2, borderColor: theme.accent }]}>
                  <Text style={{ color: theme.text, fontWeight: '900', fontSize: 17 }}>‹ Retourner à la table</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>l’enregistrement continue · une pastille rouge reste en haut de l’écran</Text>
                </Pressable>
                <Pressable onPress={mark} style={[styles.go, { backgroundColor: theme.accent }]}>
                  <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 18 }}>Morceau suivant ›</Text>
                  <Text style={{ color: theme.onAccent, fontSize: 11 }}>pose un repère : pratique pour retrouver chaque morceau</Text>
                </Pressable>
                {(st.writeErrors > 0 || st.usbErrors > 20) && (
                  <Text style={{ color: '#FACC15', fontSize: 13, fontWeight: '700' }}>{st.writeErrors > 0 ? '⚠ La tablette n’arrive plus à écrire (plus de place ?).' : `⚠ ${st.usbErrors} petites erreurs USB (câble ?).`}</Text>
                )}
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.panel }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>CE QUI ARRIVE DE LA TABLE</Text>
                  {st.meta?.tracks.map((t) => {
                    const d = Math.max(st.peaks[t.ch] ?? -120, t.stereo ? st.peaks[t.ch + 1] ?? -120 : -120);
                    const w = Math.max(0, Math.min(1, (d + 60) / 60));
                    const clips = (st.clips[t.ch] ?? 0) + (t.stereo ? st.clips[t.ch + 1] ?? 0 : 0);
                    const c = d > -3 ? '#EF4444' : d > -18 ? '#FACC15' : '#34D399';
                    return (
                      <View key={t.file} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text numberOfLines={1} style={{ width: 130, color: theme.text, fontSize: 13 }}>{t.name}</Text>
                        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.line }}><View style={{ width: `${w * 100}%`, height: 10, borderRadius: 5, backgroundColor: c }} /></View>
                        <Text style={{ width: 86, color: clips ? '#FCA5A5' : theme.muted, fontSize: 11, textAlign: 'right' }}>{clips ? 'a saturé' : ''}</Text>
                      </View>
                    );
                  })}
                  <Text style={{ color: theme.muted, fontSize: 11 }}>« a saturé » : baisse le gain d’entrée de cette voie (Table › la voie › Gain).</Text>
                </View>
                <Pressable onPress={stop} style={[styles.go, { borderWidth: 2, borderColor: RED }]}>
                  <Text style={{ color: '#FCA5A5', fontWeight: '900', fontSize: 16 }}>■ Arrêter l’enregistrement</Text>
                </Pressable>
              </ScrollView>
            )}

            {tab === 'list' && (
              <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 30 }}>
                {!list.length && <Text style={{ color: theme.muted, fontSize: 14 }}>Pas encore d’enregistrement.</Text>}
                {list.map((e) => {
                  const m = parseMeta(e.meta);
                  const size = e.files.reduce((a, f) => a + f.size, 0);
                  const live = st.on && st.id === e.id;
                  return (
                    <Pressable key={e.id} onPress={() => !live && setOpen(e.id)} style={[styles.box, { borderColor: live ? RED : theme.line, backgroundColor: theme.panel }]}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{live ? '⏺ ' : ''}{e.id}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>
                        {live ? 'en cours…' : `${m?.seconds ? fmtTime(m.seconds) + ' · ' : ''}${e.files.length} fichiers · ${gb(size)}${m ? ` · ${m.markers.length} morceau${m.markers.length > 1 ? 'x' : ''}` : ''}`}
                      </Text>
                    </Pressable>
                  );
                })}
                {!!list.length && <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Les fichiers sont dans le dossier Musique › Ma table de la tablette : tu les retrouves avec l’appli Fichiers, ou depuis un ordinateur en branchant la tablette.</Text>}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 44 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  tab: { flex: 1, minHeight: 46, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 46, fontSize: 16 },
  chk: { width: '48.5%', minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  go: { minHeight: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  next: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  mini: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  pm: { width: 38, height: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
