// Écran Débogage : journal en direct, diagnostic de la table, envoi du rapport,
// et lecture d'une adresse OSC à la main.
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearLog, Entry, getEntries, onLog, stamp } from '../debug/log';
import { APP_VERSION, runDiagnostic } from '../debug/diagnostic';
import { XAirClient } from '../xair/XAirClient';
import { Theme } from '../ui/theme';

const COLORS: Record<string, string> = { info: '#9AA3AD', warn: '#FBBF24', error: '#F87171', out: '#60A5FA', in: '#34D399' };

export function DebugScreen({ client, theme, visible, onClose }: { client: XAirClient | null; theme: Theme; visible: boolean; onClose: () => void }) {
  const platform = `${Platform.OS} ${String(Platform.Version)}`;
  const [entries, setEntries] = useState<Entry[]>(getEntries());
  const [showTraffic, setShowTraffic] = useState(false);
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState('');
  const [addr, setAddr] = useState('/fx/1/type');
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    if (!visible) return;
    setEntries(getEntries());
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onLog(() => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setEntries(getEntries());
      }, 300);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [visible]);

  const journal = () =>
    [`=== JOURNAL MA TABLE (sans table connectée) ===`, `Appli ${APP_VERSION} · ${platform} · ${new Date().toISOString()}`]
      .concat(getEntries().map((e) => `${stamp(e.t)} [${e.level}] ${e.msg}`))
      .join('\n');

  const diag = async () => {
    if (!client) return setReport(journal());
    setBusy('Diagnostic en cours…');
    try {
      setReport(await runDiagnostic(client, platform, setBusy));
    } catch (e) {
      setReport('Erreur pendant le diagnostic : ' + String(e));
    }
    setBusy('');
  };

  const send = async () => {
    const text = report || (client ? await runDiagnostic(client, platform, setBusy) : journal());
    setReport(text);
    setBusy('');
    await Share.share({ message: text, title: 'Rapport Ma table' });
  };

  const ask = async () => {
    if (!client) return setAnswer('Connecte d’abord une table');
    const p = addr.trim();
    if (!p.startsWith('/')) return setAnswer('L’adresse doit commencer par /');
    setAnswer('…');
    client.sendRaw(p);
    await new Promise((r) => setTimeout(r, 400));
    const v = client.get(p);
    setAnswer(v === undefined ? 'Pas de réponse de la table' : `${p} = ${v instanceof Uint8Array ? `blob(${v.length})` : JSON.stringify(v)}`);
  };

  const shown = entries.filter((e) => showTraffic || (e.level !== 'out' && e.level !== 'in')).slice(-150).reverse();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', flex: 1 }}>Débogage</Text>
          <Pressable onPress={onClose} style={[styles.small, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable onPress={diag} disabled={!!busy} style={[styles.btn, { backgroundColor: theme.panel, borderColor: theme.line2, borderWidth: 1 }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Lancer le diagnostic</Text>
          </Pressable>
          <Pressable onPress={send} disabled={!!busy} style={[styles.btn, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 13 }}>Envoyer le rapport</Text>
          </Pressable>
        </View>
        {!!busy && <Text style={{ color: theme.accent, fontSize: 13, paddingHorizontal: 16 }}>{busy}</Text>}

        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            value={addr}
            onChangeText={setAddr}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="/adresse/osc"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]}
          />
          <Pressable onPress={ask} style={[styles.small, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Lire</Text>
          </Pressable>
        </View>
        {!!answer && <Text style={{ color: theme.text, fontSize: 12, paddingHorizontal: 16, fontFamily: 'monospace' }}>{answer}</Text>}

        <View style={[styles.row, { alignItems: 'center' }]}>
          <Pressable onPress={() => setShowTraffic((v) => !v)} style={[styles.small, { borderColor: showTraffic ? theme.accent : theme.line2 }]}>
            <Text style={{ color: showTraffic ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>{showTraffic ? 'Trafic OSC affiché' : 'Afficher le trafic OSC'}</Text>
          </Pressable>
          <Pressable onPress={() => { clearLog(); setReport(''); }} style={[styles.small, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>Vider</Text>
          </Pressable>
        </View>

        <ScrollView style={[styles.logBox, { backgroundColor: theme.deep, borderColor: theme.line }]} contentContainerStyle={{ padding: 10, gap: 2 }}>
          {report ? (
            <Text selectable style={[styles.mono, { color: theme.text }]}>{report}</Text>
          ) : (
            shown.map((e, k) => (
              <Text key={k} selectable style={[styles.mono, { color: COLORS[e.level] ?? theme.text }]}>
                {stamp(e.t)} {e.level === 'out' ? '→' : e.level === 'in' ? '←' : e.level === 'error' ? '✖' : e.level === 'warn' ? '!' : '·'} {e.msg}
              </Text>
            ))
          )}
        </ScrollView>
        {!!report && (
          <Pressable onPress={() => setReport('')} style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Revenir au journal en direct</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 52, paddingBottom: 24, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  small: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  input: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 13 },
  logBox: { flex: 1, marginHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
});
