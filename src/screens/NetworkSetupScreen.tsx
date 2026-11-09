// Assistant « Réseau de la table » : faire rejoindre à la XR16 le partage de
// connexion du téléphone (ou un routeur), passer au câble, ou revenir à son propre Wi-Fi.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { i } from '../osc/osc';
import { readWifiClient, writeWifiClient } from '../xair/network';
import { XAirClient } from '../xair/XAirClient';
import { save } from '../store/persist';
import { Theme } from '../ui/theme';

type Mode = 'hotspot' | 'router' | 'cable' | 'ap';

const MODES: { id: Mode; title: string; sub: string }[] = [
  { id: 'hotspot', title: 'Le partage de connexion de mon téléphone', sub: 'Un seul réseau, le tien, partout. Pas de données consommées pour la table.' },
  { id: 'router', title: 'Un routeur en Wi-Fi', sub: 'La table rejoint le Wi-Fi du routeur.' },
  { id: 'cable', title: 'Un câble vers un routeur', sub: 'Le plus stable : prise réseau à l’arrière de la table.' },
  { id: 'ap', title: 'Revenir au Wi-Fi de la table', sub: 'Le réglage d’usine : la table crée son propre Wi-Fi.' },
];

export function NetworkSetupScreen({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [ssid, setSsid] = useState('');
  const [key, setKey] = useState('');
  const [current, setCurrent] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(null);
    setSaved(false);
    readWifiClient(client).then((r) => {
      setCurrent(r.ssid);
      setSsid(r.ssid);
    });
  }, [visible, client]);

  const saveWifi = () => {
    writeWifiClient(client, ssid.trim(), key);
    save('reseau', { mode, ssid: ssid.trim() }); // le mot de passe n'est pas gardé dans l'appli
    setSaved(true);
  };

  const step = (n: number, text: string, sub?: string) => (
    <View style={styles.step} key={n}>
      <View style={[styles.num, { backgroundColor: theme.accent }]}>
        <Text style={{ color: theme.onAccent, fontWeight: '900' }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{text}</Text>
        {sub ? <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>{sub}</Text> : null}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', flex: 1 }}>Réseau de la table</Text>
          <Pressable onPress={onClose} style={[styles.close, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </View>
        <Text style={{ color: theme.muted, fontSize: 13 }}>Comment ton téléphone doit-il parler à la table ?</Text>

        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                setMode(m.id);
                setSaved(false);
              }}
              accessibilityState={{ selected: on }}
              style={[styles.card, { backgroundColor: theme.panel, borderColor: on ? theme.accent : theme.line, borderWidth: on ? 2 : 1 }]}
            >
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{m.title}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{m.sub}</Text>
            </Pressable>
          );
        })}

        {(mode === 'hotspot' || mode === 'router') && (
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 10 }]}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>
              {mode === 'hotspot' ? 'Ton partage de connexion' : 'Le Wi-Fi du routeur'}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>
              {mode === 'hotspot'
                ? 'iPhone : Réglages › Partage de connexion. Android : Paramètres › Point d’accès mobile. Recopie le nom et le mot de passe exactement.'
                : 'Le nom et le mot de passe sont souvent sous le routeur.'}
            </Text>
            <TextInput value={ssid} onChangeText={setSsid} placeholder="Nom du Wi-Fi" placeholderTextColor={theme.muted} autoCapitalize="none" style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
            <TextInput value={key} onChangeText={setKey} placeholder="Mot de passe" placeholderTextColor={theme.muted} autoCapitalize="none" secureTextEntry style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
            {current ? <Text style={{ color: theme.muted, fontSize: 12 }}>Actuellement dans la table : « {current} »</Text> : null}
            <Pressable onPress={saveWifi} disabled={!ssid.trim()} style={[styles.btn, { backgroundColor: theme.accent, opacity: ssid.trim() ? 1 : 0.5 }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Enregistrer dans la table</Text>
            </Pressable>
            {saved && (
              <View style={{ gap: 10, marginTop: 4 }}>
                <Text style={{ color: theme.ok, fontWeight: '700' }}>✓ La table connaît maintenant « {ssid.trim()} ».</Text>
                {step(1, mode === 'hotspot' ? 'Active ton partage de connexion' : 'Allume le routeur', mode === 'hotspot' ? 'Sur iPhone, reste sur l’écran Partage de connexion pendant que la table se connecte.' : undefined)}
                {step(2, 'Mets l’interrupteur REMOTE de la table sur « WIFI CLIENT »', 'À l’arrière de la table. La liaison actuelle va se couper : c’est normal.')}
                {mode === 'router' && step(3, 'Connecte ce téléphone au Wi-Fi du routeur')}
                {step(mode === 'router' ? 4 : 3, 'Retrouve la table', 'Sur l’écran de connexion : « Chercher sur mon partage de connexion ».')}
              </View>
            )}
          </View>
        )}

        {mode === 'cable' && (
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 10 }]}>
            <Pressable onPress={() => { client.set('/-prefs/lan/mode', i(1)); setSaved(true); }} style={[styles.btn, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Régler la table pour le câble (DHCP)</Text>
            </Pressable>
            {saved && <Text style={{ color: theme.ok, fontWeight: '700' }}>✓ La table prendra son adresse auprès du routeur.</Text>}
            {step(1, 'Branche un câble réseau entre la table et le routeur', 'Sur une prise LAN du routeur, pas la prise « Internet ».')}
            {step(2, 'Mets l’interrupteur REMOTE sur « ETHERNET »')}
            {step(3, 'Connecte ce téléphone au Wi-Fi du routeur, puis « Chercher »')}
          </View>
        )}

        {mode === 'ap' && (
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 10 }]}>
            {step(1, 'Mets l’interrupteur REMOTE sur « ACCESS POINT »')}
            {step(2, 'Connecte ce téléphone au Wi-Fi de la table', 'Son nom ressemble à « XR16-xx-xx-xx ».')}
            {step(3, 'Si elle n’apparaît pas', 'Appuie 2 secondes dans le petit trou RESET (avec un trombone) : ça remet les réglages réseau d’usine.')}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.deep, borderColor: theme.line2 }]}>
          <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>Bon à savoir</Text>
          <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18 }}>
            Ce qui passe entre le téléphone et la table ne consomme pas de données mobiles. Coupe les mises à jour automatiques des autres appareils branchés sur ton partage.
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 40, gap: 10, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  close: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  card: { borderRadius: 16, padding: 14, gap: 4 },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
