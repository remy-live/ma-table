// Sonde Flow 8 : première étape pour piloter la Behringer FLOW 8 en Bluetooth.
// Son langage Bluetooth n'est pas publié : cet écran se connecte à la table,
// liste ce qu'elle propose (services, caractéristiques), écoute ce qu'elle
// envoie quand on bouge un fader, et fait un rapport à envoyer à Claude.
// Si la table parle le « MIDI Bluetooth » standard, les commandes MIDI du
// guide Behringer (CC 7 = volume, CC 5 = coupure…) peuvent être essayées ici.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, PermissionsAndroid, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { makeBleManager } from '../xair/ble';

const BLE_MIDI_SVC = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const BLE_MIDI_CHR = '7772e5db-3868-4112-a1a9-f2669d106bf3';

type Dev = { id: string; name: string; rssi: number; svcs: string[] };
type Chr = { svc: string; uuid: string; props: string; read?: string };

const hexOf = (b64: string | null | undefined) => {
  if (!b64) return '';
  const bin = globalThis.atob ? globalThis.atob(b64) : '';
  return Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
};
const b64Of = (bytes: number[]) => (globalThis.btoa ? globalThis.btoa(String.fromCharCode(...bytes)) : '');
const parseHex = (t: string) => t.replace(/[^0-9a-f]/gi, ' ').trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16) & 255);

/* eslint-disable @typescript-eslint/no-explicit-any */
let manager: any = null;
function ble(): any {
  if (Platform.OS === 'web') return null;
  // chargé seulement sur téléphone (le fichier de démo HTML n'a pas de Bluetooth)
  if (!manager) manager = makeBleManager();
  return manager;
}

async function askPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const P = PermissionsAndroid.PERMISSIONS as Record<string, string>;
  const want = Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const r = await PermissionsAndroid.requestMultiple(want.filter(Boolean) as never[]);
  return Object.values(r).every((v) => v === 'granted');
}

export function FlowProbe({ theme, visible, onClose }: { theme: Theme; visible: boolean; onClose: () => void }) {
  const [devs, setDevs] = useState<Dev[]>([]);
  const [scanning, setScanning] = useState(false);
  const [conn, setConn] = useState<any>(null);
  const [chrs, setChrs] = useState<Chr[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [hex, setHex] = useState('');
  const [target, setTarget] = useState<Chr | null>(null);
  const subs = useRef<any[]>([]);
  const t0 = useRef(Date.now());
  const counts = useRef(new Map<string, { n: number; last: string }>());
  const add = (s: string) => setLog((l) => [...l.slice(-400), `${((Date.now() - t0.current) / 1000).toFixed(2)}s ${s}`]);

  useEffect(() => () => { subs.current.forEach((s) => s?.remove?.()); }, []);

  const scan = async () => {
    const m = ble();
    if (!m) { add('Pas de Bluetooth dans le fichier de démo : essaie dans l’appli (APK).'); return; }
    if (!(await askPermissions())) { add('Permission Bluetooth refusée.'); return; }
    setDevs([]);
    setScanning(true);
    add('Recherche des appareils Bluetooth…');
    m.startDeviceScan(null, { allowDuplicates: false }, (err: any, d: any) => {
      if (err) { add('Erreur de recherche : ' + err.message); setScanning(false); return; }
      if (!d) return;
      setDevs((list) => (list.some((x) => x.id === d.id) ? list : [...list, { id: d.id, name: d.name || d.localName || '(sans nom)', rssi: d.rssi ?? 0, svcs: d.serviceUUIDs ?? [] }]));
    });
    setTimeout(() => { m.stopDeviceScan(); setScanning(false); add('Recherche terminée.'); }, 10000);
  };

  const connect = async (d: Dev) => {
    const m = ble();
    m.stopDeviceScan();
    setScanning(false);
    add(`Connexion à ${d.name} (${d.id})…`);
    try {
      const dev = await m.connectToDevice(d.id, { requestMTU: 185 });
      await dev.discoverAllServicesAndCharacteristics();
      setConn(dev);
      add(`Connecté. MTU ${dev.mtu ?? '?'}`);
      const out: Chr[] = [];
      for (const s of await dev.services()) {
        add(`SERVICE ${s.uuid}${s.uuid.toLowerCase() === BLE_MIDI_SVC ? '  ← MIDI Bluetooth standard !' : ''}`);
        for (const c of await s.characteristics()) {
          const props = [c.isReadable && 'lire', c.isWritableWithResponse && 'écrire', c.isWritableWithoutResponse && 'écrire-vite', c.isNotifiable && 'notifie', c.isIndicatable && 'indique'].filter(Boolean).join(',');
          const ch: Chr = { svc: s.uuid, uuid: c.uuid, props };
          if (c.isReadable) { try { const r = await c.read(); ch.read = hexOf(r.value); } catch (e: any) { ch.read = 'erreur ' + e.message; } }
          out.push(ch);
          add(`  CAR ${c.uuid} [${props}]${ch.read ? ' = ' + ch.read : ''}`);
          if (c.isNotifiable || c.isIndicatable) {
            subs.current.push(c.monitor((err: any, v: any) => {
              if (err) { add(`  ! ${c.uuid.slice(0, 8)} ${err.message}`); return; }
              const h = hexOf(v?.value);
              const k = c.uuid;
              const st = counts.current.get(k) ?? { n: 0, last: '' };
              st.n++;
              // les flux répétitifs (vumètres) : on n'écrit qu'un message sur 20
              if (h !== st.last || st.n % 20 === 0) add(`  ← ${k.slice(0, 8)} (${st.n}) ${h}`);
              st.last = h;
              counts.current.set(k, st);
            }));
          }
        }
      }
      setChrs(out);
      add('Bouge maintenant un fader, un bouton MUTE, un potard de la table : ce qu’elle envoie s’affiche ici.');
    } catch (e: any) {
      add('Échec de connexion : ' + e.message);
    }
  };

  const send = async (c: Chr, bytes: number[]) => {
    if (!conn) return;
    try {
      if (c.props.includes('écrire-vite')) await conn.writeCharacteristicWithoutResponseForService(c.svc, c.uuid, b64Of(bytes));
      else await conn.writeCharacteristicWithResponseForService(c.svc, c.uuid, b64Of(bytes));
      add(`→ ${c.uuid.slice(0, 8)} ${bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    } catch (e: any) { add('Envoi raté : ' + e.message); }
  };
  const midi = chrs.find((c) => c.svc.toLowerCase() === BLE_MIDI_SVC && c.uuid.toLowerCase() === BLE_MIDI_CHR);
  // un message MIDI dans un paquet MIDI Bluetooth (en-tête + horodatage)
  const cc = (ch: number, num: number, val: number) => midi && send(midi, [0x80, 0x80, 0xb0 | (ch - 1), num, val]);

  const report = () => Share.share({ message: ['Sonde Flow 8 · Ma table', ...log].join('\n') });
  const close = () => { ble()?.stopDeviceScan?.(); conn?.cancelConnection?.(); setConn(null); onClose(); };
  const btn = (bg?: string) => [styles.btn, { backgroundColor: bg ?? theme.deep, borderColor: theme.line2 }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Flow 8 · sonde Bluetooth</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Ferme l’appli FLOW Mix d’abord : la table n’accepte qu’un téléphone à la fois.</Text>
            </View>
            <CloseX theme={theme} onPress={close} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable onPress={scan} style={btn(theme.accent)}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>{scanning ? 'Recherche…' : '1 · Chercher la table'}</Text></Pressable>
            <Pressable onPress={report} style={btn()}><Text style={{ color: theme.text, fontWeight: '800' }}>Envoyer le rapport</Text></Pressable>
          </View>
          {!conn && devs.length > 0 && (
            <ScrollView style={{ maxHeight: 170, flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
              {[...devs].sort((a, b) => Number(/flow/i.test(b.name)) - Number(/flow/i.test(a.name)) || b.rssi - a.rssi).map((d) => (
                <Pressable key={d.id} onPress={() => connect(d)} style={[styles.row, { borderColor: /flow/i.test(d.name) ? theme.accent : theme.line }]}>
                  <Text style={{ color: theme.text, fontWeight: '800', flex: 1 }}>{d.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{d.rssi} dBm · 2 · se connecter ›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {conn && (
            <View style={{ gap: 6 }}>
              {midi ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ color: theme.ok, fontWeight: '800', fontSize: 12, width: '100%' }}>MIDI Bluetooth trouvé : essaie, et regarde la voie 1 de la table.</Text>
                  <Pressable onPress={() => cc(1, 7, 90)} style={btn()}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Voie 1 à −10 dB</Text></Pressable>
                  <Pressable onPress={() => cc(1, 7, 0)} style={btn()}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Voie 1 en bas</Text></Pressable>
                  <Pressable onPress={() => cc(1, 5, 127)} style={btn()}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Couper voie 1</Text></Pressable>
                  <Pressable onPress={() => cc(1, 5, 0)} style={btn()}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Rallumer voie 1</Text></Pressable>
                </View>
              ) : (
                <Text style={{ color: theme.muted, fontSize: 12 }}>Pas de MIDI Bluetooth standard : la table parle sa propre langue. Le rapport me permettra de la décoder.</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TextInput value={hex} onChangeText={setHex} placeholder="octets en hexa, ex. 80 80 b0 07 5a" placeholderTextColor={theme.muted}
                  style={{ flex: 1, color: theme.text, borderWidth: 1, borderColor: theme.line2, borderRadius: 8, paddingHorizontal: 8, height: 38, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} />
                <Pressable disabled={!target} onPress={() => target && send(target, parseHex(hex))} style={[...btn(), { opacity: target ? 1 : 0.4 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Envoyer</Text></Pressable>
              </View>
              <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
                {chrs.filter((c) => c.props.includes('écrire')).map((c) => (
                  <Pressable key={c.svc + c.uuid} onPress={() => setTarget(c)} style={[styles.pill, { borderColor: target === c ? theme.accent : theme.line2 }]}>
                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{c.uuid.slice(0, 8)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <ScrollView style={[styles.log, { borderColor: theme.line, backgroundColor: theme.deep }]} contentContainerStyle={{ padding: 8 }}>
            {log.length === 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Allume la Flow 8, ferme l’appli FLOW Mix, puis touche « Chercher la table ».</Text>}
            {log.map((l, k) => <Text key={k} style={{ color: theme.text, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{l}</Text>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 12 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center', maxHeight: '100%', flex: 1 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  pill: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, height: 28, justifyContent: 'center' },
  log: { flex: 1, borderWidth: 1, borderRadius: 10 },
});
