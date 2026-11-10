// État de la liaison Wi-Fi avec la table, toujours visible : 4 barres et un mot.
// Vert = tout va bien, jaune = ça traîne, rouge = coupure en vue.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { XAirClient } from '../xair/XAirClient';
import { Theme } from './theme';
import { showTip } from './tip';

export function LinkBadge({ client, theme, small }: { client: XAirClient; theme: Theme; small?: boolean }) {
  const [lk, setLk] = useState(client.link());
  const [silent, setSilent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { setLk(client.link()); setSilent(client.silenceSeconds()); }, 1500);
    return () => clearInterval(t);
  }, [client]);
  const bars = silent > 6 ? 0 : lk.bars;
  const c = bars >= 3 ? '#34D399' : bars === 2 ? '#FACC15' : '#F87171';
  const word = silent > 6 ? 'coupée' : bars >= 3 ? 'bonne' : bars === 2 ? 'moyenne' : 'faible';
  const tip = () => showTip(`Liaison avec la table : ${word}.${lk.ms !== null ? ` Réponse en ${lk.ms} ms` : ''}${lk.lost ? `, ${lk.lost} % de messages perdus` : ''}. ${bars >= 3 ? 'Tout va bien.' : 'Rapproche-toi de la table, ou éloigne le téléphone/la tablette des enceintes et des murs.'}`);
  return (
    <Pressable onPress={tip} onLongPress={tip} accessibilityLabel={`Liaison ${word}`} style={{ alignItems: 'center', gap: 3, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 }}>
        {[0, 1, 2, 3].map((k) => <View key={k} style={{ width: 4, height: 5 + k * 3.5, borderRadius: 1, backgroundColor: k < bars ? c : theme.line2 }} />)}
      </View>
      {!small && <Text style={{ color: c, fontSize: 10, fontWeight: '800' }}>{word}</Text>}
    </Pressable>
  );
}
