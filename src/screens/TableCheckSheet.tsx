// « Vérifier ma table » : chaque fonction est essayée sur la vraie table,
// avec un ✓ ou un ✗, et un rapport à envoyer.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { APP_VERSION } from '../debug/diagnostic';
import * as dbg from '../debug/log';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { CheckResult, CHECKS, reportText } from '../xair/tableCheck';
import { XAirClient } from '../xair/XAirClient';

export function TableCheckSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [res, setRes] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const wide = useWindowDimensions().width >= 900;
  useEffect(() => { if (visible) { setRes([]); setDone(false); setRunning(null); } }, [visible]);

  const run = async () => {
    setRes([]);
    setDone(false);
    const out: CheckResult[] = [];
    for (const c of CHECKS) {
      setRunning(c.id);
      let r: { ok: boolean | null; detail: string };
      try { r = await c.run(client); } catch (e) { r = { ok: false, detail: 'erreur : ' + String(e) }; }
      out.push({ id: c.id, label: c.label, ...r });
      setRes([...out]);
    }
    setRunning(null);
    setDone(true);
    dbg.info('Vérification de la table :\n' + reportText(client, out, APP_VERSION));
  };
  const okN = res.filter((r) => r.ok === true).length;
  const badN = res.filter((r) => r.ok === false).length;
  const send = () => Share.share({ message: reportText(client, res, APP_VERSION), title: 'Vérification de ma table' }).catch(() => {});

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line, maxWidth: wide ? 900 : 560 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 21, fontWeight: '900' }}>🩺 Vérifier ma table</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>L’appli essaie chaque fonction sur la table, puis remet tout comme avant. Ça se passe sur la voie 16, par tout petits pas : le public n’entend rien.</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 6 }}>
            {CHECKS.map((c) => {
              const r = res.find((x) => x.id === c.id);
              const now = running === c.id;
              const col = !r ? theme.line2 : r.ok === true ? '#22C55E' : r.ok === false ? '#EF4444' : theme.muted;
              return (
                <View key={c.id} style={[styles.row, { borderColor: col, backgroundColor: theme.deep, width: wide ? '49.4%' : '100%' }]}>
                  <Text style={{ width: 26, textAlign: 'center', color: col, fontSize: 18, fontWeight: '900' }}>{now ? '…' : !r ? '○' : r.ok === true ? '✓' : r.ok === false ? '✗' : '–'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{c.label}</Text>
                    <Text numberOfLines={1} style={{ color: r?.ok === false ? '#FCA5A5' : theme.muted, fontSize: 11 }}>{now ? 'essai en cours…' : r?.detail ?? 'pas encore essayé'}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {done && (
            <Text style={{ color: badN ? '#FCA5A5' : '#86EFAC', fontSize: 14, fontWeight: '800' }}>
              {badN ? `${okN} fonction${okN > 1 ? 's' : ''} marche${okN > 1 ? 'nt' : ''}, ${badN} ne marche${badN > 1 ? 'nt' : ''} pas : envoie le rapport pour qu’on corrige.` : `✓ Tout marche (${okN} essais).`}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={run} disabled={!!running} style={[styles.btn, { flex: 2, backgroundColor: theme.accent, opacity: running ? 0.5 : 1 }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>{running ? 'Vérification…' : done ? '↻ Recommencer' : '▶ Lancer la vérification'}</Text>
            </Pressable>
            <Pressable onPress={send} disabled={!done} style={[styles.btn, { borderWidth: 2, borderColor: theme.accent, opacity: done ? 1 : 0.4 }]}>
              <Text style={{ color: theme.accent, fontWeight: '900' }}>📤 Envoyer le rapport</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sheet: { width: '100%', maxHeight: '100%', borderRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  btn: { flex: 1, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
