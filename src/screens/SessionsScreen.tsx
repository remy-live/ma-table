// « Mes soirées » : la soirée en cours, enregistrer, nouvelle soirée,
// reprendre une ancienne, envoyer / recevoir, et les filets de sécurité
// (sauvegardes automatiques, copie dans la table).
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Auto, clearAutos, Current, current, deleteAuto, deleteSession, exportSession, freeTableSlot, importText, listAutos, listSessions, loadFromTable, renameCurrent,
  renameSession, safetyBackup, saveCurrentSession, saveToTable, Session, StartFrom, startNewSession, tableSnapPaths,
} from '../store/sessions';
import { load } from '../store/persist';
import { Theme } from '../ui/theme';
import { Btn, ScreenHeader, Segmented } from '../ui/kit';
import { Shell } from '../ui/Shell';
import { changedCount, restore, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { snapNamePath } from '../xair/addresses';

const when = (t: number) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function SessionsScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; embedded?: boolean }) {
  const { client, theme } = props;
  const [cur, setCur] = useState<Current | null>(null);
  const [list, setList] = useState<Session[]>([]);
  const [autos, setAutos] = useState<Auto[]>([]);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState<StartFrom>('same');
  const [rename, setRename] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTxt, setImportTxt] = useState('');
  const [changes, setChanges] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = async () => {
    setCur(await current());
    setList(await listSessions());
    setAutos(await listAutos());
    setTick((x) => x + 1);
  };
  useEffect(() => {
    if (!props.visible) return;
    refresh();
    client.loadPaths(tableSnapPaths(), false);
    load<Snapshot | null>('balance', null).then((b) => setChanges(b ? changedCount(client, b) : null));
  }, [props.visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const say = (t: string) => { void t; setToast(''); }; // plus de bandeau vert

  const doSave = async () => {
    const s = await saveCurrentSession(client);
    setSaved(true);
    say(`« ${s.name} » enregistrée`);
    refresh();
  };
  const doNew = async () => {
    const old = cur?.name ?? '';
    const n = await startNewSession(client, from);
    setAsking(false);
    setSaved(false);
    say(`« ${old} » enregistrée · nouvelle soirée démarrée`);
    setCur(n);
    refresh();
  };
  const doLoad = (s: Session) =>
    Alert.alert(`Reprendre « ${s.name} » ?`, `Toute la table reprend les réglages du ${when(s.savedAt)}. La soirée en cours est d’abord enregistrée.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Reprendre', onPress: async () => { await saveCurrentSession(client); await safetyBackup(client, 'avant reprise de soirée'); const n = restore(client, s.snap); await renameCurrent(s.name); say(`${n} réglages envoyés à la table`); refresh(); } },
    ]);
  const more = (s: Session) =>
    Alert.alert(s.name, when(s.savedAt), [
      { text: 'Renommer', onPress: () => setRename(s.id) },
      { text: 'Envoyer (bassiste, mail, Drive…)', onPress: async () => Share.share({ message: await exportSession(s), title: `Ma table · ${s.name}` }) },
      { text: 'Mettre dans la table', onPress: () => toTable(s) },
      { text: 'Supprimer', style: 'destructive', onPress: () => Alert.alert('Supprimer ?', s.name, [{ text: 'Non' }, { text: 'Supprimer', style: 'destructive', onPress: async () => setList(await deleteSession(s.id)) }]) },
      { text: 'Fermer', style: 'cancel' },
    ]);
  const toTable = (s: Session) => {
    const slot = s.tableSlot ?? freeTableSlot(client);
    if (!slot) { Alert.alert('Table pleine', 'Les 64 emplacements de la table sont pris. Libère-en un avec l’appli X AIR.'); return; }
    Alert.alert('Copier dans la table ?', `L’état ACTUEL de la table est enregistré dans son emplacement n°${slot} sous « ${s.name.slice(0, 12)} ». Même sans téléphone, l’appli X AIR officielle pourra le rappeler.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Copier', onPress: () => { saveToTable(client, slot, s.name); say(`Emplacement ${slot} de la table : « ${s.name.slice(0, 12)} »`); } },
    ]);
  };
  const doImport = async () => {
    try {
      const r = await importText(importTxt);
      setImportTxt('');
      setImportOpen(false);
      Alert.alert('Reçu', `Restauré : ${r.restored.join(', ')}.${r.session ? ' La soirée est dans la liste : « Reprendre » pour l’envoyer à la table.' : ''}`);
      refresh();
    } catch {
      Alert.alert('Impossible', 'Colle le texte complet d’une sauvegarde « Ma table ».');
    }
  };
  const tableSlots = Array.from({ length: 64 }, (_, k) => k + 1).map((n) => ({ n, name: String(client.get(snapNamePath(n)) ?? '') })).filter((x) => x.name);
  void tick;

  return (
    <Shell embedded={props.embedded} visible={props.visible} onClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <ScreenHeader theme={theme} title="Soirées et sauvegardes" sub="Une soirée = tout le réglage de la table, gardé dans l’appli" style={{ paddingHorizontal: 0 }}>
          {!props.embedded && <Btn theme={theme} kind="primary" label="Fermer" onPress={props.onClose} />}
        </ScreenHeader>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          {/* EN COURS */}
          {cur && (
            <View style={[styles.card, { backgroundColor: '#13261E', borderColor: '#34D399' }]}>
              <Text style={[styles.kicker, { color: '#6EE7B7' }]}>● EN COURS</Text>
              <Pressable onPress={() => setRename('current')}>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{cur.name} <Text style={{ color: '#6EE7B7', fontSize: 13 }}>✎</Text></Text>
                <Text style={{ color: '#A7F3D0', fontSize: 12 }}>Depuis {when(cur.startedAt)}{changes !== null ? ` · ${changes} réglage${changes > 1 ? 's' : ''} depuis l’enregistrement` : ''}</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={doSave} style={[styles.btn, { backgroundColor: '#34D399' }]}><Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 14 }}>{saved ? '✓ Enregistrée' : 'Enregistrer maintenant'}</Text></Pressable>
                <Pressable onPress={() => setAsking((x) => !x)} style={[styles.btn, { borderColor: '#34D399', borderWidth: 1 }]}><Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 14 }}>Nouvelle soirée</Text></Pressable>
              </View>
            </View>
          )}
          {asking && (
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.accent }]}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Nouvelle soirée</Text>
              <Text style={{ color: theme.muted, fontSize: 13 }}>« {cur?.name} » est d’abord enregistrée telle quelle. Ensuite, on repart de :</Text>
              {([['same', 'Le même réglage', 'pour enchaîner un autre set avec le même groupe'], ['balance', 'Le dernier enregistrement', 'on annule tout ce qui a bougé depuis'], ['blank', 'Une table vide', 'noms, groupes, envois effacés (les gains restent) : nouveau groupe, nouvelle salle']] as [StartFrom, string, string][]).map(([id, l, sub]) => (
                <Pressable key={id} onPress={() => setFrom(id)} accessibilityState={{ selected: from === id }} style={[styles.opt, { borderColor: from === id ? theme.accent : theme.line, backgroundColor: from === id ? '#1F1C14' : theme.deep }]}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{l}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
                </Pressable>
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setAsking(false)} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Annuler</Text></Pressable>
                <Pressable onPress={doNew} style={[styles.btn, { backgroundColor: theme.accent, flex: 2 }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>Enregistrer et démarrer</Text></Pressable>
              </View>
            </View>
          )}

          {/* ENREGISTRÉES */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.kicker, { color: theme.muted, flex: 1 }]}>SOIRÉES ENREGISTRÉES</Text>
            <Pressable onPress={() => setImportOpen((x) => !x)} style={{ padding: 4 }}><Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Recevoir une soirée</Text></Pressable>
          </View>
          {importOpen && (
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <TextInput value={importTxt} onChangeText={setImportTxt} multiline placeholder="Colle ici le texte reçu (mail, message, Drive…)" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep, minHeight: 80 }]} />
              <Pressable onPress={doImport} disabled={!importTxt} style={[styles.btn, { backgroundColor: theme.accent, opacity: importTxt ? 1 : 0.5 }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>Ajouter à mes soirées</Text></Pressable>
            </View>
          )}
          {list.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Aucune pour l’instant. « Enregistrer maintenant » garde la soirée en cours.</Text>}
          {list.filter((s) => s.id !== cur?.id).map((s) => (
            <View key={s.id} style={[styles.row, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <View style={[styles.date, { backgroundColor: theme.deep }]}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{new Date(s.savedAt).getDate()}</Text>
                <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '700' }}>{new Date(s.savedAt).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{s.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{Object.keys(s.snap.values).length} réglages{s.tableSlot ? ` · dans la table n°${s.tableSlot}` : ''}</Text>
              </View>
              <Pressable onPress={() => doLoad(s)} style={[styles.small, { borderColor: theme.accent }]}><Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800' }}>Reprendre</Text></Pressable>
              <Pressable onPress={() => more(s)} accessibilityLabel="Plus d’actions" style={[styles.small, { borderColor: theme.line2, width: 44, paddingHorizontal: 0, alignItems: 'center' }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>⋯</Text></Pressable>
            </View>
          ))}

          {/* FILETS DE SÉCURITÉ */}
          <Text style={[styles.kicker, { color: theme.muted, marginTop: 6 }]}>FILETS DE SÉCURITÉ</Text>
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.text, fontWeight: '800', flex: 1 }}>Sauvegardes automatiques</Text>
              {autos.length > 0 && (
                <Pressable onPress={() => Alert.alert('Tout effacer ?', `${autos.length} sauvegardes automatiques.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Effacer', style: 'destructive', onPress: async () => setAutos(await clearAutos()) }])} hitSlop={8}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>Tout effacer</Text>
                </Pressable>
              )}
            </View>
            <Text style={{ color: theme.muted, fontSize: 12 }}>À la connexion, toutes les 10 minutes, et avant chaque opération risquée. Les 12 dernières.</Text>
            {autos.map((a) => (
              <View key={a.at} style={[styles.auto, { borderColor: theme.line2 }]}>
                <Pressable onPress={() => Alert.alert('Remettre la table comme à ce moment ?', `${when(a.at)} · ${a.reason}`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Remettre', style: 'destructive', onPress: () => say(`${restore(client, a)} réglages remis`) }])} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{when(a.at)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{a.reason}</Text>
                </Pressable>
                <Pressable onPress={async () => setAutos(await deleteAuto(a.at))} hitSlop={8} accessibilityLabel="Supprimer cette sauvegarde" style={{ width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: '#7F1D1D', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FCA5A5', fontWeight: '800' }}>✕</Text>
                </Pressable>
              </View>
            ))}
            {autos.length === 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucune pour l’instant.</Text>}
          </View>
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>Dans la table elle-même</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>La {client.info?.model || 'table'} a 64 emplacements internes. Si le téléphone meurt, l’appli X AIR officielle peut les rappeler. « ⋯ › Mettre dans la table » sur une soirée.</Text>
            {tableSlots.length === 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucun emplacement nommé pour l’instant (ou adresse à vérifier avec le rapport de débogage).</Text>}
            {tableSlots.map((x) => (
              <Pressable key={x.n} onPress={() => Alert.alert(`Rappeler l’emplacement ${x.n} ?`, `« ${x.name} » remplace tout le réglage actuel de la table.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Rappeler', style: 'destructive', onPress: () => { loadFromTable(client, x.n); say(`Emplacement ${x.n} rappelé`); setTimeout(() => client.loadState(), 800); } }])} style={[styles.auto, { borderColor: theme.line2 }]}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{x.n} · {x.name}</Text>
                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>Rappeler</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Modal visible={rename !== null} transparent animationType="fade" onRequestClose={() => setRename(null)}>
          <Pressable style={styles.back} onPress={() => setRename(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Nom de la soirée</Text>
              <RenameBox initial={rename === 'current' ? cur?.name ?? '' : list.find((s) => s.id === rename)?.name ?? ''} theme={theme} onDone={async (n) => { if (rename === 'current') setCur(await renameCurrent(n)); else if (rename) setList(await renameSession(rename, n)); setRename(null); }} />
            </Pressable>
          </Pressable>
        </Modal>
        {!!toast && <View pointerEvents="none" style={styles.toast}><Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text></View>}
      </View>
    </Shell>
  );
}

function RenameBox({ initial, theme, onDone }: { initial: string; theme: Theme; onDone: (n: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <TextInput value={v} onChangeText={setV} autoFocus placeholder="ex. Salle des fêtes · 9 nov." placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
      <Pressable onPress={() => onDone(v)} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>OK</Text></Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  card: { borderWidth: 2, borderRadius: 18, padding: 14, gap: 10 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  opt: { borderWidth: 2, borderRadius: 14, padding: 10, gap: 2 },
  row: { borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  date: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  small: { height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  auto: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  toast: { position: 'absolute', left: 24, right: 24, top: 100, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
