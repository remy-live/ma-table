// Connexion et sauvegarde : état de la liaison, ce qui est gardé dans l'appli,
// export / import, conseil de scène, quitter.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Status, XAirClient } from '../xair/XAirClient';
import { isPersistent, load, save } from '../store/persist';
import { Theme } from '../ui/theme';
import { NetworkSetupScreen } from './NetworkSetupScreen';
import { DebugScreen } from './DebugScreen';
import { SessionsScreen } from './SessionsScreen';

const KEYS = ['balance', 'ordre', 'mesPresets', 'autos'];

export function ConnectionScreen({ client, theme, onDisconnect }: { client: XAirClient; theme: Theme; onDisconnect: () => void }) {
  const [status, setStatus] = useState<Status>(client.status);
  const [silence, setSilence] = useState(client.silenceSeconds());
  const [importText, setImportText] = useState('');
  const [netOpen, setNetOpen] = useState(false);
  const [dbgOpen, setDbgOpen] = useState(false);
  const [sessOpen, setSessOpen] = useState(false);
  useEffect(() => client.onStatus(setStatus), [client]);
  useEffect(() => {
    const t = setInterval(() => setSilence(client.silenceSeconds()), 1000);
    return () => clearInterval(t);
  }, [client]);

  const ok = status === 'connecté';
  const bars = !ok ? 0 : silence < 10 ? 4 : silence < 15 ? 3 : 2;

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
      Alert.alert('Importé', 'Balance et ordre des voies restaurés. Rouvre l’écran Scène pour les voir.');
    } catch {
      Alert.alert('Import impossible', 'Colle ici le texte complet d’une sauvegarde « Ma table ».');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: theme.text }]}>Connexion et sauvegarde</Text>

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
            {silence >= 0 ? `Dernière réponse il y a ${silence} s` : ''}
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
        <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 13 }}>Conseil pour la scène</Text>
        <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18 }}>
          Le Wi-Fi intégré de la XR16 est faible. Un petit routeur près de la scène, câblé à la table, rend la liaison bien plus stable, surtout à deux téléphones.
        </Text>
      </View>

      <Pressable onPress={() => setSessOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: '#34D399', gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Mes soirées et sauvegardes ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Enregistrer la soirée, en démarrer une nouvelle, reprendre, sauvegardes automatiques, copie dans la table.</Text>
      </Pressable>

      <Pressable onPress={() => setDbgOpen(true)} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line2, gap: 2 }]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Débogage ›</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Journal, diagnostic de la table, envoyer le rapport</Text>
      </Pressable>
      <SessionsScreen client={client} theme={theme} visible={sessOpen} onClose={() => setSessOpen(false)} />
      <DebugScreen client={client} theme={theme} visible={dbgOpen} onClose={() => setDbgOpen(false)} />

      <Pressable onPress={onDisconnect} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Se déconnecter de la table</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 56, gap: 12, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  banner: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 70, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, textAlignVertical: 'top' },
});
