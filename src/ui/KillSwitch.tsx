// Le bouton rouge « Tout couper » (appui long) et le bandeau qui reste tant que c'est coupé.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { showTip } from './tip';
import { isKilled, killAll, onKill, restoreAll } from '../xair/killAll';
import { XAirClient } from '../xair/XAirClient';

export function useKilled() {
  const [k, setK] = useState(isKilled());
  useEffect(() => onKill(() => setK(isKilled())), []);
  return k;
}

export function KillButton({ client, vertical, pill }: { client: XAirClient; vertical?: boolean; pill?: boolean }) {
  const killed = useKilled();
  const [press, setPress] = useState(false);
  const c = killed ? '#FFFFFF' : '#F87171';
  return (
    <Pressable
      onPress={() => (killed ? restoreAll(client) : showTip('Appui long (1 s) pour TOUT couper : façade, retours et effets. Rien n’est perdu, un appui rétablit.'))}
      onLongPress={() => killAll(client)}
      delayLongPress={900}
      onPressIn={() => setPress(true)}
      onPressOut={() => setPress(false)}
      accessibilityLabel={killed ? 'Rétablir le son' : 'Tout couper (appui long)'}
      style={[pill ? styles.pill : vertical ? styles.item : styles.itemSmall, { borderColor: '#B91C1C', borderWidth: 1.5, backgroundColor: killed ? '#DC2626' : press ? '#7F1D1D' : '#2A1214' }]}
    >
      <Svg width={pill ? 16 : vertical ? 24 : 20} height={pill ? 16 : vertical ? 24 : 20} viewBox="0 0 24 24">
        <Path d="M4 9h4l5-4v14l-5-4H4z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
        <Line x1={16} y1={9} x2={21} y2={14} stroke={c} strokeWidth={2} strokeLinecap="round" />
        <Line x1={21} y1={9} x2={16} y2={14} stroke={c} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <Text numberOfLines={1} style={{ color: c, fontSize: pill ? 12 : vertical ? 11 : 9, fontWeight: '800' }}>{killed ? 'Rétablir' : 'Tout couper'}</Text>
    </Pressable>
  );
}

/** Bandeau rouge en haut tant que tout est coupé. */
export function KillBanner({ client }: { client: XAirClient }) {
  const killed = useKilled();
  if (!killed) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable onPress={() => restoreAll(client)} accessibilityLabel="Rétablir le son" style={styles.banner}>
        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>🔇 TOUT EST COUPÉ</Text>
        <Text style={{ color: '#FEE2E2', fontWeight: '700', fontSize: 13 }}>toucher pour rétablir</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { width: 84, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pill: { height: 30, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemSmall: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  banner: { marginTop: 8, backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: '#FCA5A5' },
});
