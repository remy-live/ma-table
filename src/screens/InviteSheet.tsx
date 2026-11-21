// Inviter un musicien : d'abord des visages (un par retour), puis le QR code
// expliqué en 3 images, et ses droits en tuiles.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { load, save } from '../store/persist';
import { QrCode } from '../ui/QrCode';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath } from '../xair/addresses';
import { ownersOf, roleOf } from '../xair/autoBalance';
import { DEFAULT_RIGHTS, inviteLink, LEVELS, levelOf, MonConfig, MonRights, rightsFor } from '../xair/monitor';
import { myAddress, prepareInvite, registerInvite, remoteSupported, REMOTE_PORT, startRemote } from '../web/remoteServer';

/** QR code « rejoindre ce Wi-Fi » (lu par l'appareil photo, iPhone et Android). */
export function wifiQr(ssid: string, pass: string): string {
  const e = (t: string) => t.replace(/([\\;,:"])/g, '\\$1');
  return pass ? `WIFI:T:WPA;S:${e(ssid)};P:${e(pass)};;` : `WIFI:T:nopass;S:${e(ssid)};;`;
}
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
  const wideI = useWindowDimensions().width >= 900;
  const { client, theme } = props;
  const [bus, setBus] = useState<number | null>(null);
  const [me, setMe] = useState<number[]>([]);
  const [rights, setRights] = useState<MonRights>(DEFAULT_RIGHTS);
  const [showCode, setShowCode] = useState(false);
  const [editMe, setEditMe] = useState(false);
  const [mode, setMode] = useState<'wifi' | 'app' | 'web'>('app');
  const [wifi, setWifi] = useState<{ ssid: string; pass: string }>({ ssid: '', pass: '' });
  const [web, setWeb] = useState<{ url: string; err: string }>({ url: '', err: '' });
  useEffect(() => { load<{ ssid: string; pass: string } | null>('wifiInvite', null).then((w) => { if (w) { setWifi(w); setMode('wifi'); } }); }, []);
  const editWifi = (w: { ssid: string; pass: string }) => { setWifi(w); save('wifiInvite', w); };
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
  // « Sans l'appli » : la tablette sert la page, le QR code mène à son adresse
  useEffect(() => {
    if (mode !== 'web' || !cfg) return;
    if (!remoteSupported || host === 'demo') { setWeb({ url: `http://192.168.1.20:${REMOTE_PORT}/?k=demo`, err: 'Démo : sur la vraie table, la tablette sert la page « Mon retour » et ce QR code y mène.' }); return; }
    let alive = true;
    (async () => {
      const ok = await startRemote(client);
      const ip = await myAddress();
      if (!alive) return;
      if (!ok || !ip || ip === '0.0.0.0') { setWeb({ url: '', err: 'Impossible de partager la page : vérifie que ce téléphone est sur le Wi-Fi.' }); return; }
      prepareInvite(client, cfg);
      setWeb({ url: `http://${ip}:${REMOTE_PORT}/?k=${registerInvite(cfg)}`, err: '' });
    })();
    return () => { alive = false; };
  }, [mode, cfg?.bus, JSON.stringify(cfg?.rights), cfg?.me.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
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
            <View style={{ flexDirection: wideI ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
              <View style={[styles.card, { flex: wideI ? 1 : undefined, alignSelf: 'stretch', backgroundColor: theme.panel, borderColor: sel.color, alignItems: 'center' }]}>
                <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch' }}>
                  {([['wifi', '① Wi-Fi'], ['app', '② Avec l’appli'], ['web', '② Sans l’appli']] as const).map(([m, l]) => (
                    <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m ? { backgroundColor: sel.color, borderColor: sel.color } : { borderColor: theme.line2 }]}>
                      <Text style={{ color: mode === m ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 12 }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
                {mode === 'wifi' && (
                  <>
                    {wifi.ssid ? <QrCode value={wifiQr(wifi.ssid, wifi.pass)} size={200} /> : <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>Écris une fois le nom du Wi-Fi (celui de la table, ou celui où est reliée la tablette) : le musicien le rejoint en scannant, sans taper le mot de passe.</Text>}
                    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch' }}>
                      <TextInput value={wifi.ssid} onChangeText={(t) => editWifi({ ...wifi, ssid: t })} placeholder="Nom du Wi-Fi (ex. XR18-1A2B3C)" placeholderTextColor={theme.muted} autoCapitalize="none" style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                      <TextInput value={wifi.pass} onChangeText={(t) => editWifi({ ...wifi, pass: t })} placeholder="Mot de passe" placeholderTextColor={theme.muted} autoCapitalize="none" secureTextEntry style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch', alignItems: 'center' }}>
                      <Pic icon="📷" text="Il scanne avec l’appareil photo" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="📶" text="Son téléphone rejoint le Wi-Fi" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="②" text="Puis le code de l’étape 2" theme={theme} />
                    </View>
                  </>
                )}
                {mode === 'app' && (
                  <>
                    <QrCode value={link} size={200} />
                    {host === 'demo' && <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>Démo : ce QR code est un exemple, il ne mène à aucune table. Sur la vraie table, le musicien le scanne et arrive sur son retour.</Text>}
                    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch', alignItems: 'center' }}>
                      <Pic icon="📷" text="Il ouvre son appareil photo" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="📱" text="Il vise le code" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="🎧" text="L’appli s’ouvre sur son retour" theme={theme} />
                    </View>
                    <Pressable onPress={() => setShowCode((x) => !x)} style={{ padding: 4 }}>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>{showCode ? 'Masquer le code à taper' : 'Pas d’appareil photo ? Le code à taper'}</Text>
                    </Pressable>
                    {showCode && (
                      <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>
                        Dans l’appli « Ma table » › Rejoindre, il tape <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{host} · {sel.b}</Text>
                      </Text>
                    )}
                  </>
                )}
                {mode === 'web' && (
                  <>
                    {!!web.url && <QrCode value={web.url} size={200} />}
                    {!!web.url && <Text selectable style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{web.url}</Text>}
                    {!!web.err && <Text style={{ color: web.url ? theme.muted : '#FCA5A5', fontSize: 12, textAlign: 'center' }}>{web.err}</Text>}
                    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch', alignItems: 'center' }}>
                      <Pic icon="📶" text="Même Wi-Fi que cette tablette" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="🌐" text="Il scanne : la page s’ouvre" theme={theme} />
                      <Text style={{ color: theme.muted }}>›</Text>
                      <Pic icon="🎧" text="Il règle son retour, sans rien installer" theme={theme} />
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center' }}>Garde l’appli ouverte sur cette tablette : c’est elle qui parle à la table pour lui.</Text>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
                  <Pressable onPress={() => Share.share({ message: mode === 'web' && web.url ? `Ton retour, sans rien installer (même Wi-Fi que la tablette) : ${web.url}` : `Ton retour sur la table : ${link}\nOu dans Ma table › Rejoindre : ${host} · ${sel.b}` })} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Envoyer le lien</Text>
                  </Pressable>
                  <Pressable onPress={() => props.onTryHere(cfg)} style={[styles.btn, { backgroundColor: theme.accent }]}>
                    <Text style={{ color: theme.onAccent, fontWeight: '800' }}>Voir son écran</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flex: wideI ? 1 : undefined, alignSelf: 'stretch', gap: 12 }}>
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

              <Text style={[styles.kicker, { color: theme.muted }]}>JUSQU’OÙ IL PEUT ALLER</Text>
              <View style={styles.grid}>
                {LEVELS.map((l) => {
                  const on = levelOf(rights) === l.id;
                  return (
                    <Pressable key={l.id} onPress={() => setRights((r) => rightsFor(l.id, r))} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.face, { minHeight: 84, borderColor: on ? sel.color : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
                      <Text style={{ fontSize: 20 }}>{l.icon}</Text>
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>{l.label}</Text>
                      <Text style={{ color: on ? sel.color : theme.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{l.sub}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {rights.full && <Text style={{ color: '#FCD34D', fontSize: 12, fontWeight: '700' }}>⚠ Avec l’appli, il peut passer à toute la table (gains, effets, façade). Sans l’appli, la page reste limitée à son retour et ses voies.</Text>}
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
              </View>
            </View>
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
  tab: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  input: { flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 13 },
  small: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});
