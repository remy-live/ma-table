import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_RIGHTS, MonConfig, parseInvite, parseShortCode } from '../xair/monitor';
import { TableInfo, XAirClient } from '../xair/XAirClient';
import { RnUdpTransport } from '../xair/udpTransport';
import { DemoTransport } from '../xair/demoTransport';
import { HOTSPOT_PREFIXES, sweep } from '../xair/network';
import { load, save } from '../store/persist';
import * as dbg from '../debug/log';
import { DebugScreen } from './DebugScreen';
import { Theme } from '../ui/theme';

export function ConnectScreen({ theme, onConnected, invite }: { theme: Theme; onConnected: (c: XAirClient, mon?: MonConfig) => void; invite?: MonConfig | null }) {
  const [code, setCode] = useState('');
  const [lastMon, setLastMon] = useState<MonConfig | null>(null);
  const [found, setFound] = useState<TableInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [ip, setIp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [dbgOpen, setDbgOpen] = useState(false);

  useEffect(() => {
    load<string | null>('derniereIp', null).then(setLast);
  }, []);

  /** Partage de connexion : la diffusion ne passe pas toujours, on interroge chaque adresse. */
  const searchHotspot = async () => {
    setSweeping(true);
    setError('');
    const extra = ip.trim().split('.').length >= 3 ? [ip.trim().split('.').slice(0, 3).join('.')] : [];
    const lastPrefix = last ? [last.split('.').slice(0, 3).join('.')] : [];
    const prefixes = Array.from(new Set([...extra, ...lastPrefix, ...HOTSPOT_PREFIXES]));
    try {
      const res = await sweep(new RnUdpTransport(), prefixes);
      dbg.info(`Balayage ${prefixes.join(', ')} : ${res.length} table(s) ${res.map((r) => r.ip).join(', ')}`);
      setFound((f) => [...f.filter((x) => !res.some((r) => r.ip === x.ip)), ...res]);
      if (!res.length) setError('Aucune table trouvée. Vérifie que l’interrupteur REMOTE est sur WIFI CLIENT et que ton partage est actif.');
    } catch (e) {
      setError('Recherche impossible : ' + String(e));
    }
    setSweeping(false);
  };

  const search = async () => {
    setSearching(true);
    setError('');
    try {
      const res = await XAirClient.discover(new RnUdpTransport());
      dbg.info(`Recherche par diffusion : ${res.length} table(s) ${res.map((r) => r.ip).join(', ')}`);
      setFound(res);
    } catch (e) {
      setError('Recherche impossible : ' + String(e));
    }
    setSearching(false);
  };

  useEffect(() => {
    search();
  }, []);

  useEffect(() => {
    load<MonConfig | null>('monRetour', null).then(setLastMon);
  }, []);
  // Lien d'invitation reçu (QR code scanné avec l'appareil photo)
  useEffect(() => {
    if (invite) connect(invite.host, invite.host === 'demo', invite);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = () => {
    const full = parseInvite(code);
    const short = full ? null : parseShortCode(code);
    const cfg: MonConfig | null = full ?? (short ? { host: short.host, bus: short.bus, name: `Retour ${short.bus}`, me: [], rights: DEFAULT_RIGHTS } : null);
    if (!cfg) {
      setError('Code non reconnu. Exemple : 172.20.10.2 · 1 (adresse de la table, puis numéro du retour).');
      return;
    }
    connect(cfg.host, false, cfg);
  };

  const connect = async (host: string, demo = false, mon?: MonConfig) => {
    setBusy(true);
    setError('');
    const client = new XAirClient(demo ? new DemoTransport() : new RnUdpTransport());
    try {
      await client.connect(host);
      if (!demo && !mon) save('derniereIp', host);
      if (mon && !demo) save('monRetour', mon);
      onConnected(client, mon);
    } catch (e) {
      client.close();
      dbg.error(`Connexion à ${host} impossible : ${String(e)}`);
      setError(`Pas de réponse de ${host}. Vérifie que le téléphone est sur le Wi-Fi de la table.`);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: theme.text }]}>Ma table</Text>
      {lastMon && (
        <Pressable onPress={() => connect(lastMon.host, false, lastMon)} style={[styles.card, { borderColor: '#34D399', backgroundColor: '#13261E' }]}>
          <Text style={{ color: '#A7F3D0', fontSize: 16, fontWeight: '800' }}>Reprendre mon retour</Text>
          <Text style={{ color: '#6EE7B7', fontSize: 12 }}>{lastMon.name} · AUX {lastMon.bus} · {lastMon.host}</Text>
        </Pressable>
      )}
      <Text style={{ color: theme.muted, fontSize: 14 }}>Connecte le téléphone au Wi-Fi de la XR16, puis choisis-la.</Text>

      <View style={styles.row}>
        <Text style={[styles.section, { color: theme.muted }]}>TABLES TROUVÉES</Text>
        <Pressable onPress={search} disabled={searching} style={[styles.small, { borderColor: theme.line2 }]}>
          {searching ? <ActivityIndicator color={theme.text} /> : <Text style={{ color: theme.text }}>Chercher</Text>}
        </Pressable>
      </View>
      {found.length === 0 && !searching && <Text style={{ color: theme.muted }}>Aucune table trouvée pour l'instant.</Text>}
      {found.map((t) => (
        <Pressable
          key={t.ip}
          onPress={() => connect(t.ip)}
          style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}
        >
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{t.name}</Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            {t.model} · {t.ip}
          </Text>
        </Pressable>
      ))}

      <Pressable onPress={searchHotspot} disabled={sweeping} style={[styles.card, { borderColor: theme.line2 }]}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{sweeping ? 'Recherche sur ton réseau…' : 'Chercher sur mon partage de connexion'}</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Quand la table a rejoint le Wi-Fi de ton téléphone ou d’un routeur.</Text>
      </Pressable>
      {last && (
        <Pressable onPress={() => connect(last)} style={[styles.card, { borderColor: theme.accent }]}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Reconnecter à la dernière table</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{last}</Text>
        </Pressable>
      )}
      <Text style={[styles.section, { color: theme.muted, marginTop: 12 }]}>OU PAR ADRESSE IP</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.1"
          placeholderTextColor={theme.muted}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]}
        />
        <Pressable
          onPress={() => ip && connect(ip.trim())}
          style={[styles.go, { backgroundColor: theme.accent, opacity: ip ? 1 : 0.5 }]}
        >
          <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 16 }}>Connecter</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => connect('demo', true)} style={[styles.card, { borderColor: theme.line2, marginTop: 12 }]}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Essayer sans table (démo)</Text>
        <Text style={{ color: theme.muted, fontSize: 13 }}>Une XR16 imitée dans l'appli, rien n'est envoyé.</Text>
      </Pressable>

      <Text style={[styles.section, { color: theme.muted, marginTop: 12 }]}>JE SUIS MUSICIEN : REJOINDRE MON RETOUR</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="172.20.10.2 · 1"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]}
        />
        <Pressable onPress={join} style={[styles.go, { backgroundColor: '#34D399', opacity: code ? 1 : 0.5 }]}>
          <Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 16 }}>Rejoindre</Text>
        </Pressable>
      </View>
      <Text style={{ color: theme.muted, fontSize: 12 }}>Le plus simple : scanne le QR code du sondier avec l’appareil photo.</Text>
      <Pressable onPress={() => connect('demo', true, { host: 'demo', bus: 1, name: 'Bassiste', me: [4], rights: { ...DEFAULT_RIGHTS, fx: true } })} style={{ paddingVertical: 6 }}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>Essayer le mode musicien en démo</Text>
      </Pressable>

      {busy && <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />}
      <Pressable onPress={() => setDbgOpen(true)} style={{ paddingVertical: 12 }}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>Débogage : envoyer le journal</Text>
      </Pressable>
      <DebugScreen client={null} theme={theme} visible={dbgOpen} onClose={() => setDbgOpen(false)} />
      {!!error && <Text style={{ color: theme.mute, marginTop: 8 }}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 64, gap: 10, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  small: { height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  input: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  go: { height: 52, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
});
