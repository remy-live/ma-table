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
  if (compact) {
    // un seul bouton : montre l'état, un appui bascule
    return (
      <Pressable onPress={mono ? toStereo : toMono} accessibilityLabel={mono ? 'Une enceinte (mono). Passer à deux enceintes' : 'Deux enceintes (stéréo). Passer à une enceinte'} style={[styles.one, { borderColor: mono ? theme.accent : theme.line2, backgroundColor: mono ? 'rgba(245,158,11,0.15)' : 'transparent' }]}>
        <Text style={{ fontSize: 13 }}>{mono ? '🔈' : '🔈🔈'}</Text>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 11 }}>{mono ? '1 enceinte' : '2 enceintes'}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.box, { borderColor: theme.line2 }]}>
      <Pressable onPress={toStereo} accessibilityState={{ selected: !mono }} style={[styles.btn, !mono && { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: 14 }}>🔈🔈</Text>
        <Text style={{ color: !mono ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>Deux enceintes</Text>
      </Pressable>
      <Pressable onPress={toMono} accessibilityState={{ selected: mono }} style={[styles.btn, mono && { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: 14 }}>🔈</Text>
        <Text style={{ color: mono ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>Une enceinte</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
  btn: { minHeight: 40, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  one: { height: 40, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
