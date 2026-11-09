// Interrupteur « une enceinte / deux enceintes » pour la façade.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { goMono, goStereo, hasSavedPans, isMono, monoPaths } from '../xair/mono';
import { XAirClient } from '../xair/XAirClient';
import { useAnyTick } from './useTick';
import { Theme } from './theme';

export function MonoSwitch({ client, theme, compact }: { client: XAirClient; theme: Theme; compact?: boolean }) {
  useAnyTick(client, 200);
  const [saved, setSaved] = useState(false);
  useEffect(() => { client.loadPaths(monoPaths()); hasSavedPans().then(setSaved); }, [client]);
  const mono = isMono(client);
  const toMono = async () => { await goMono(client); setSaved(await hasSavedPans()); };
  const toStereo = async () => {
    if (!saved) { Alert.alert('Déjà au centre', 'Tous les panoramiques sont au centre et aucun réglage stéréo n’a été gardé. Règle les panoramiques dans chaque voie (tiroir Entrée).'); return; }
    const n = await goStereo(client);
    if (!n) Alert.alert('Rien à remettre', 'Aucun panoramique gardé.');
  };
  return (
    <View style={[styles.box, { borderColor: theme.line2 }, compact && { padding: 2 }]}>
      <Pressable onPress={toStereo} accessibilityState={{ selected: !mono }} style={[styles.btn, !mono && { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: compact ? 14 : 18 }}>🔊🔊</Text>
        {!compact && <Text style={{ color: !mono ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>Deux enceintes</Text>}
        {!compact && <Text style={{ color: !mono ? theme.onAccent : theme.muted, fontSize: 10 }}>stéréo, gauche ≠ droite</Text>}
      </Pressable>
      <Pressable onPress={toMono} accessibilityState={{ selected: mono }} style={[styles.btn, mono && { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: compact ? 14 : 18 }}>🔊</Text>
        {!compact && <Text style={{ color: mono ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>Une enceinte</Text>}
        {!compact && <Text style={{ color: mono ? theme.onAccent : theme.muted, fontSize: 10 }}>mono : tout dans L et R</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
  btn: { minHeight: 44, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
