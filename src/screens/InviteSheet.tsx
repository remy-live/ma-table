// Inviter un musicien : il scanne le QR code avec l'appareil photo de son
// téléphone, l'appli s'ouvre directement sur SON retour, verrouillée.
// Le propriétaire choisit le retour, les voies « à lui » et ses droits.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { load, save } from '../store/persist';
import { QrCode } from '../ui/QrCode';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath } from '../xair/addresses';
import { DEFAULT_RIGHTS, inviteLink, MonConfig, MonRights } from '../xair/monitor';
import { XAirClient } from '../xair/XAirClient';

const RIGHTS: [keyof MonRights, string, string][] = [
  ['groups', 'Voir les groupes', 'Batterie, Guitares… en un seul bouton'],
  ['save', 'Garder sa balance', 'dans son téléphone, pour son retour uniquement'],
  ['fx', 'Régler les effets dans son casque', 'niveau de réverbe, delay… pour lui seul'],
  ['limiterOff', 'Couper le protège-oreilles', 'sinon la limite −6 dB reste active'],
];

interface Saved {
  me: number[];
  rights: MonRights;
}

export function InviteSheet(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onTryHere: (cfg: MonConfig) => void }) {
  const { client, theme } = props;
  const [bus, setBus] = useState(1);
  const [me, setMe] = useState<number[]>([]);
  const [rights, setRights] = useState<MonRights>(DEFAULT_RIGHTS);
  const busName = (b: number) => String(client.get(busNamePath(b)) ?? '') || `Retour ${b}`;
  const host = client.hostAddress;

  useEffect(() => {
    if (!props.visible) return;
    load<Saved | null>(`invite:${bus}`, null).then((s) => {
      setMe(s?.me ?? []);
      setRights(s?.rights ?? DEFAULT_RIGHTS);
    });
  }, [bus, props.visible]);
  useEffect(() => {
    if (props.visible) save(`invite:${bus}`, { me, rights });
  }, [me, rights]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg: MonConfig = { host, bus, name: busName(bus), me, rights };
  const link = inviteLink(cfg);
  const toggleMe = (c: number) => setMe((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c].sort((a, b) => a - b)));

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Inviter un musicien</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Il scanne, il règle son retour. Rien d’autre.</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Fermer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Array.from({ length: BUS_COUNT }, (_, k) => k + 1).map((b) => (
              <Pressable key={b} onPress={() => setBus(b)} accessibilityState={{ selected: b === bus }} style={[styles.chip, b === bus ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                <Text style={{ color: b === bus ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>
                  {busName(b)} · AUX {b}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, alignItems: 'center' }]}>
            {host === 'demo' ? (
              <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>En démo, pas de QR code : connecte-toi à la vraie table. Tu peux quand même essayer l’écran du musicien ici.</Text>
            ) : (
              <QrCode value={link} size={220} />
            )}
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>
              {busName(bus)} → AUX {bus}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
              Il ouvre l’appareil photo et vise le code (l’appli « Ma table » doit être installée).{'\n'}Sinon, dans l’appli : « Rejoindre en musicien » puis le code{' '}
              <Text style={{ color: '#FBBF24', fontWeight: '800' }}>
                {host} · {bus}
              </Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <Pressable onPress={() => Share.share({ message: `Ton retour sur la table : ${link}\nOu dans Ma table › Rejoindre en musicien : ${host} · ${bus}` })} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Envoyer le lien</Text>
              </Pressable>
              <Pressable onPress={() => props.onTryHere(cfg)} style={[styles.btn, { borderColor: theme.accent, borderWidth: 1 }]}>
                <Text style={{ color: '#FBBF24', fontWeight: '700' }}>Essayer ici</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={[styles.kicker, { color: theme.muted }]}>SES VOIES (bouton « Plus de moi »)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: CH_COUNT }, (_, k) => k + 1).map((c) => {
                const on = me.includes(c);
                const n = String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
                return (
                  <Pressable key={c} onPress={() => toggleMe(c)} accessibilityState={{ selected: on }} style={[styles.small, on ? { backgroundColor: '#34D399', borderColor: '#34D399' } : { borderColor: theme.line2 }]}>
                    <Text style={{ color: on ? '#052E1F' : theme.text, fontSize: 12, fontWeight: '700' }}>
                      {c} · {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={[styles.kicker, { color: theme.muted }]}>CE QU’IL PEUT FAIRE</Text>
            {RIGHTS.map(([k, label, sub]) => (
              <View key={k} style={styles.right}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
                </View>
                <Switch value={rights[k]} onValueChange={(v) => setRights((r) => ({ ...r, [k]: v }))} />
              </View>
            ))}
            <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>
              Le verrou est dans l’appli : il évite les fausses manips, pas un musicien déterminé. Sur la table, aucun mot de passe n’existe pour l’OSC.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  chip: { height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  small: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
});
