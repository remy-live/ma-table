// Alerte saturation : si une entrée touche le rouge, un bandeau le dit en clair
// et ouvre directement le réglage de gain de cette voie.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { chNamePath } from '../xair/addresses';
import { clipped } from '../xair/clip';
import { XAirClient } from '../xair/XAirClient';

export function ClipBanner(props: { client: XAirClient; onOpen: (ch: number) => void }) {
  const { client } = props;
  const [list, setList] = useState<number[]>([]);
  const [muted, setMuted] = useState<Record<number, number>>({});
  const last = useRef(new Map<number, number>());
  useEffect(() => {
    let prev = '';
    let t = 0;
    return client.onMeters((m) => {
      const now = Date.now();
      if (now - t < 250) return;
      t = now;
      const l = clipped(m, now, last.current);
      const key = l.join(',');
      if (key !== prev) {
        prev = key;
        setList(l);
      }
    });
  }, [client]);
  const show = list.filter((c) => !muted[c] || Date.now() - muted[c] > 60000);
  if (!show.length) return null;
  const c = show[0];
  const name = String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, backgroundColor: '#2A1414', borderColor: '#7F1D1D', borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: '#FCA5A5', flex: 1, fontSize: 13, fontWeight: '700' }}>
        {name} sature à l’entrée{show.length > 1 ? ` (+${show.length - 1})` : ''} : baisse le gain
      </Text>
      <Pressable onPress={() => props.onOpen(c)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EF4444', justifyContent: 'center' }}>
        <Text style={{ color: '#1A0505', fontWeight: '800', fontSize: 12 }}>Régler</Text>
      </Pressable>
      <Pressable onPress={() => setMuted((m) => ({ ...m, [c]: Date.now() }))} accessibilityLabel="Ignorer une minute" style={{ height: 36, paddingHorizontal: 8, justifyContent: 'center' }}>
        <Text style={{ color: '#FCA5A5', fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}
