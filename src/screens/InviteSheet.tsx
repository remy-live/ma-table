// Inviter un musicien : d'abord des visages (un par retour), puis le QR code
// expliqué en 3 images, et ses droits en tuiles.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { load, save } from '../store/persist';
import { QrCode } from '../ui/QrCode';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath } from '../xair/addresses';
import { ownersOf, roleOf } from '../xair/autoBalance';
import { DEFAULT_RIGHTS, inviteLink, MonConfig, MonRights } from '../xair/monitor';
import { XAirClient } from '../xair/XAirClient';
import { initials, MIX_COLORS } from './MixPicker';

const RIGHTS: [keyof MonRights, string, string, string][] = [
  ['groups', '🥁', 'Voir les groupes', 'Batterie en un bouton'],
  ['save', '💾', 'Garder sa balance', 'pour son retour seulement'],
  ['fx', '✦', 'Régler sa réverbe', 'dans son casque'],
  ['limiterOff', '🔓', 'Couper le protège-oreilles', 'sinon limite −6 dB'],
];

interface Saved {
  me: number[];
  rights: MonRights;
}

export function InviteSheet(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onTryHere: (cfg: MonConfig) => void }) {
  const { client, theme } = props;
  const [bus, setBus] = useState<number | null>(null);
  const [me, setMe] = useState<number[]>([]);
  const [rights, setRights] = useState<MonRights>(DEFAULT_RIGHTS);
  const [showCode, setShowCode] = useState(false);
  const [editMe, setEditMe] = useState(false);
  const host = client.hostAddress;
  const busName = (b: number) => String(client.get(busNamePath(b)) ?? '').trim();
  const chName = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;

  useEffect(() => {
    if (!props.visible) { setBus(null); return; }
  }, [props.visible]);
  useEffect(() => {
    if (bus === null) return;
    load<Saved | null>(`invite:${bus}`, null).then((s) => {
      setMe(s?.me ?? ownersOf(client, busName(bus)));
      setRights(s?.rights ?? DEFAULT_RIGHTS);
    });
  }, [bus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bus !== null) save(`invite:${bus}`, { me, rights });
  }, [me, rights]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = Array.from({ length: BUS_COUNT }, (_, k) => k + 1).map((b) => {
    const raw = busName(b);
    const owners = ownersOf(client, raw);
    const instr = owners.length ? Array.from(new Set(owners.map((c) => roleOf(chName(c)).who))).join(' + ') : '';
    return { b, name: raw || `Retour ${b}`, named: !!raw, sub: `${instr ? instr + ' · ' : ''}AUX ${b}`, color: MIX_COLORS[b] ?? '#9AA3AD' };
  });
  const sel = bus !== null ? people[bus - 1] : null;
  const cfg: MonConfig | null = sel ? { host, bus: sel.b, name: sel.name, me, rights } : null;
  const link = cfg ? inviteLink(cfg) : '';
  const toggleMe = (c: number) => setMe((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c].sort((a, b) => a - b)));

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          {sel && (
            <Pressable onPress={() => setBus(null)} accessibilityLabel="Retour au choix du musicien" style={[styles.back, { backgroundColor: theme.panel }]}>
              <Text style={{ color: theme.text, fontSize: 20 }}>‹</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{sel ? `Inviter ${sel.name}` : 'Inviter un musicien'}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{sel ? 'Il scanne, il règle son retour. Rien d’autre.' : 'Chacun règle son propre retour depuis son téléphone'}</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Fermer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          {!sel && (
            <>
              <Text style={[styles.kicker, { color: theme.muted }]}>1 · QUI VEUX-TU INVITER ?</Text>
              <View style={styles.grid}>
                {people.map((p) => (
                  <Pressable key={p.b} onPress={() => setBus(p.b)} style={[styles.face, { borderColor: theme.line, backgroundColor: theme.panel, opacity: p.named ? 1 : 0.7 }]}>
                    <View style={[styles.avatar, { backgroundColor: p.color }]}><Text style={styles.avatarText}>{initials(p.name)}</Text></View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11, textAlign: 'center' }}>{p.sub}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Les prénoms viennent des noms des retours sur la table (« Retour Remy » → Rémy). L’instrument est deviné d’après ses voies. Pour nommer un retour : Aide-moi › Mode guidé, étape 3.</Text>
            </>
          )}

          {sel && cfg && (
            <>
              <View style={[styles.card, { backgroundColor: theme.panel, borderColor: sel.color, alignItems: 'center' }]}>
                {host === 'demo' ? (
                  <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>En démo, pas de QR code : connecte-toi à la vraie table. Tu peux quand même essayer l’écran du musicien.</Text>
                ) : (
                  <QrCode value={link} size={200} />
                )}
                <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch', alignItems: 'center' }}>
                  <Pic icon="📷" text="Il ouvre son appareil photo" theme={theme} />
                  <Text style={{ color: theme.muted }}>›</Text>
                  <Pic icon="📱" text="Il vise le code" theme={theme} />
                  <Text style={{ color: theme.muted }}>›</Text>
                  <Pic icon="🎧" text="Il règle son retour, rien d’autre" theme={theme} />
                </View>
                <Pressable onPress={() => setShowCode((x) => !x)} style={{ padding: 4 }}>
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>{showCode ? 'Masquer le code à taper' : 'Pas d’appareil photo ? Le code à taper'}</Text>
                </Pressable>
                {showCode && (
                  <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>
                    Dans l’appli « Ma table » › Rejoindre, il tape <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{host} · {sel.b}</Text>
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
                  <Pressable onPress={() => Share.share({ message: `Ton retour sur la table : ${link}\nOu dans Ma table › Rejoindre : ${host} · ${sel.b}` })} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Envoyer le lien</Text>
                  </Pressable>
                  <Pressable onPress={() => props.onTryHere(cfg)} style={[styles.btn, { backgroundColor: theme.accent }]}>
                    <Text style={{ color: theme.onAccent, fontWeight: '800' }}>Voir son écran</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.kicker, { color: theme.muted, flex: 1 }]}>SES VOIES (bouton « Plus de moi »)</Text>
                  <Pressable onPress={() => setEditMe((x) => !x)} style={{ padding: 4 }}><Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>{editMe ? 'OK' : 'Changer'}</Text></Pressable>
                </View>
                {!editMe && <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{me.length ? me.map((c) => `${c} · ${chName(c)}`).join(', ') : 'Aucune : « Plus de moi » sera grisé'}</Text>}
                {editMe && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from({ length: CH_COUNT }, (_, k) => k + 1).map((c) => {
                      const on = me.includes(c);
                      return (
                        <Pressable key={c} onPress={() => toggleMe(c)} accessibilityState={{ selected: on }} style={[styles.small, on ? { backgroundColor: '#34D399', borderColor: '#34D399' } : { borderColor: theme.line2 }]}>
                          <Text style={{ color: on ? '#052E1F' : theme.text, fontSize: 12, fontWeight: '700' }}>{c} · {chName(c)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <Text style={[styles.kicker, { color: theme.muted }]}>CE QU’IL PEUT FAIRE</Text>
              <View style={styles.grid}>
                {RIGHTS.map(([k, icon, label, sub]) => {
                  const on = rights[k];
                  return (
                    <Pressable key={k} onPress={() => setRights((r) => ({ ...r, [k]: !on }))} accessibilityRole="switch" accessibilityState={{ checked: on }} style={[styles.face, { minHeight: 90, borderColor: on ? '#34D399' : theme.line, backgroundColor: on ? '#13261E' : theme.panel }]}>
                      <Text style={{ fontSize: 22 }}>{icon}</Text>
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
                      <Text style={{ color: on ? '#34D399' : theme.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{on ? 'OUI' : 'NON'} · {sub}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>Le verrou est dans l’appli : il évite les fausses manips, pas un musicien déterminé (la table n’a pas de mot de passe).</Text>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Pic({ icon, text, theme }: { icon: string; text: string; theme: Theme }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.deep, borderRadius: 12, padding: 8, alignItems: 'center', gap: 4, minHeight: 72, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  face: { width: '47%', flexGrow: 1, minHeight: 108, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0B0D10', fontSize: 14, fontWeight: '800' },
  card: { borderWidth: 2, borderRadius: 20, padding: 14, gap: 10 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});
