// Connexion et sauvegarde : état de la liaison, ce qui est gardé dans l'appli,
// export / import, conseil de scène, quitter.
import { TableCheckSheet } from './TableCheckSheet';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Status, XAirClient } from '../xair/XAirClient';
import { isPersistent, load, save } from '../store/persist';
import { Theme } from '../ui/theme';
import { NetworkSetupScreen } from './NetworkSetupScreen';
import { DebugScreen } from './DebugScreen';
import { SessionsScreen } from './SessionsScreen';

const KEYS = ['balance', 'ordre', 'mesPresets', 'autos', 'mesEffets', 'jeuxEffets', 'fxNoms', 'prefs'];

/** compact : tout sur une colonne sans défilement (réglages de la tablette). */
export function ConnectionScreen({ client, theme, onDisconnect, compact }: { client: XAirClient; theme: Theme; onDisconnect: () => void; compact?: boolean }) {
  const [status, setStatus] = useState<Status>(client.status);
  const [silence, setSilence] = useState(client.silenceSeconds());
  const [importText, setImportText] = useState('');
  const [netOpen, setNetOpen] = useState(false);
  const [dbgOpen, setDbgOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [sessOpen, setSessOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  useEffect(() => client.onStatus(setStatus), [client]);
  useEffect(() => {
    const t = setInterval(() => setSilence(client.silenceSeconds()), 1000);
    return () => clearInterval(t);
  }, [client]);

  const ok = status === 'connecté';
  const lk = client.link();
  const bars = !ok ? 0 : Math.min(lk.bars, silence < 10 ? 4 : silence < 15 ? 3 : 2);
  const verdict = !ok ? '' : bars >= 4 ? 'Liaison excellente' : bars === 3 ? 'Bonne liaison' : bars === 2 ? 'Liaison moyenne : rapproche-toi de la table' : 'Liaison faible : rapproche-toi ou change de canal Wi-Fi';

  const doExport = async () => {
    const data: Record<string, unknown> = { app: 'Ma table', version: 1, date: new Date().toISOString() };
    for (const k of KEYS) data[k] = await load(k, null);
    await Share.share({ message: JSON.stringify(data) });
  };
  const doImport = async () => {
    try {
      const data = JSON.parse(importText);
      if (data.app !== 'Ma table') throw new Error('format');
      for (const k of KEYS) if (data[k] !== undefined && data[k] !== null) await save(k, data[k]);
      setImportText('');
      Alert.alert('Importé', 'Balance et ordre des voies restaurés. Rouvre l’écran Concert pour les voir.');
    } catch {
      Alert.alert('Import impossible', 'Colle ici le texte complet d’une sauvegarde « Ma table ».');
    }
  };

  const link = (label: string, sub: string, color: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.cardS, { backgroundColor: theme.panel, borderColor: color }]}>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{label} ›</Text>
      <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
    </Pressable>
  );
  if (compact) return (
    <View style={{ gap: 8 }}>
      {status === 'perdu' && <Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 13 }}>Liaison perdue · reconnexion en cours (la table garde son mix)</Text>}
      <View style={[styles.cardS, { backgroundColor: theme.panel, borderColor: theme.line, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 }}>
          {[8, 14, 20, 26].map((h, k) => <View key={h} style={{ width: 6, height: h, borderRadius: 2, backgroundColor: k < bars ? theme.ok : theme.line }} />)}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{ok ? `Connecté à ${client.info?.name ?? 'la table'}` : status === 'perdu' ? 'Recherche de la table…' : status}</Text>
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11 }}>{client.info ? `${client.info.model} · ${client.info.ip}` : ''}{lk.ms !== null ? ` · ${lk.ms} ms · ${lk.lost} % perdus` : ''}</Text>
          {ok && <Text numberOfLines={1} style={{ color: bars >= 3 ? theme.ok : '#FCD34D', fontWeight: '800', fontSize: 11 }}>{verdict}</Text>}
        </View>
      </View>
      {link('Réseau de la table', 'Partage de connexion, routeur, câble ou Wi-Fi de la table', theme.accent, () => setNetOpen(true))}
      {link('Mes soirées et sauvegardes', 'Enregistrer, nouvelle soirée, reprendre, copie dans la table', '#34D399', () => setSessOpen(true))}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={doExport} style={[styles.btnS, { flex: 1, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 13 }}>Exporter</Text></Pressable>
        <Pressable onPress={() => setImpOpen((x) => !x)} style={[styles.btnS, { flex: 1, borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{impOpen ? 'Fermer' : 'Importer…'}</Text></Pressable>
      </View>
      {impOpen && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TextInput value={importText} onChangeText={setImportText} placeholder="Coller une sauvegarde" placeholderTextColor={theme.muted} style={[styles.input, { flex: 1, minHeight: 40, color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
          <Pressable onPress={doImport} disabled={!importText} style={[styles.btnS, { paddingHorizontal: 14, backgroundColor: theme.accent, opacity: importText ? 1 : 0.5 }]}><Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 13 }}>OK</Text></Pressable>
        </View>
      )}
      <Text style={{ color: isPersistent() ? theme.ok : theme.accent, fontSize: 11 }}>{isPersistent() ? '✓ Sauvegarde automatique active' : '⚠ Sauvegarde en mémoire seulement'}</Text>
      {link('🩺 Vérifier ma table', 'Chaque fonction essayée sur la table : ✓ ou ✗', '#F87171', () => setCheckOpen(true))}
      {link('Débogage', 'Journal, diagnostic de la table, envoyer le rapport', theme.line2, () => setDbgOpen(true))}
      <Pressable onPress={onDisconnect} style={[styles.btnS, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Se déconnecter de la table</Text></Pressable>
      <NetworkSetupScreen client={client} theme={theme} visible={netOpen} onClose={() => setNetOpen(false)} />
      <SessionsScreen client={client} theme={theme} visible={sessOpen} onClose={() => setSessOpen(false)} />
      <DebugScreen client={client} theme={theme} visible={dbgOpen} onClose={() => setDbgOpen(false)} />
      <TableCheckSheet client={client} theme={theme} visible={checkOpen} onClose={() => setCheckOpen(false)} />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.body}>

      {status === 'perdu' && (
        <View style={[styles.banner, { backgroundColor: '#2A1414', borderColor: '#7F1D1D' }]}>
          <Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 14 }}>Liaison perdue · reconnexion en cours</Text>
          <Text style={{ color: '#FECACA', fontSize: 12 }}>Pas de panique : la table garde son mix et continue de jouer.</Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 34 }}>
          {[10, 18, 26, 34].map((h, k) => (
            <View key={h} style={{ width: 8, height: h, borderRadius: 2, backgroundColor: k < bars ? theme.ok : theme.line }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{ok ? `Connecté à ${client.info?.name ?? 'la table'}` : status === 'perdu' ? 'Recherche de la table…' : status}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            {client.info ? `${client.info.model} · ${client.info.ip} · firmware ${client.info.firmware}` : ''}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            {ok && <Text style={{ color: bars >= 3 ? theme.ok : '#FCD34D', fontWeight: '800' }}>{verdict} · </Text>}
            {lk.ms !== null ? `réponse en ${lk.ms} ms · ${lk.lost} % perdus · ` : ''}
            {silence >= 0 ? `dernière réponse il y a ${silence} s` : ''}
            {client.reconnections ? ` · ${client.reconnections} reconnexion${client.reconnections > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>
        Après une coupure, l’appli relit l’état de la table : elle ne renvoie jamais d’anciens réglages.
      </Text>

      <Pressable onPress={() => setNetOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.accent, gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Réseau de la table ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Partage de connexion du téléphone, routeur, câble ou Wi-Fi de la table</Text>
      </Pressable>
      <NetworkSetupScreen client={client} theme={theme} visible={netOpen} onClose={() => setNetOpen(false)} />

      <Text style={[styles.section, { color: theme.muted }]}>SAUVEGARDE</Text>
      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 10 }]}>
        <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>
          Les groupes et les noms sont dans la table. La balance et l’ordre des voies sont gardés dans l’appli.
        </Text>
        <Text style={{ color: isPersistent() ? theme.ok : theme.accent, fontSize: 12 }}>
          {isPersistent() ? '✓ Sauvegarde automatique active' : '⚠ Sauvegarde en mémoire seulement : recompile l’appli une fois (eas build) pour l’activer.'}
        </Text>
        <Pressable onPress={doExport} style={[styles.btn, { backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 14 }}>Exporter (envoyer à soi-même)</Text>
        </Pressable>
        <TextInput
          value={importText}
          onChangeText={setImportText}
          placeholder="Coller ici une sauvegarde pour l’importer"
          placeholderTextColor={theme.muted}
          multiline
          style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]}
        />
        <Pressable onPress={doImport} disabled={!importText} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1, opacity: importText ? 1 : 0.5 }]}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Importer</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.deep, borderColor: theme.line2, borderStyle: 'dashed' }]}>
        <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>Conseil pour la scène</Text>
        <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18 }}>
          Le Wi-Fi intégré de la XR16 est faible. Un petit routeur près de la scène, câblé à la table, rend la liaison bien plus stable, surtout à deux téléphones.
        </Text>
      </View>

      <Pressable onPress={() => setSessOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: '#34D399', gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Mes soirées et sauvegardes ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Enregistrer la soirée, en démarrer une nouvelle, reprendre, sauvegardes automatiques, copie dans la table.</Text>
      </Pressable>

      <Pressable onPress={() => setCheckOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: '#F87171', gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>🩺 Vérifier ma table ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>L’appli essaie chaque fonction sur ta table et te dit ce qui marche.</Text>
      </Pressable>
      <Pressable onPress={() => setDbgOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line2, gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Débogage ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Journal, diagnostic de la table, envoyer le rapport</Text>
      </Pressable>
      <SessionsScreen client={client} theme={theme} visible={sessOpen} onClose={() => setSessOpen(false)} />
      <DebugScreen client={client} theme={theme} visible={dbgOpen} onClose={() => setDbgOpen(false)} />
      <TableCheckSheet client={client} theme={theme} visible={checkOpen} onClose={() => setCheckOpen(false)} />

      <Pressable onPress={onDisconnect} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Se déconnecter de la table</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  banner: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  cardS: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 1 },
  btnS: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 70, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, textAlignVertical: 'top' },
});
