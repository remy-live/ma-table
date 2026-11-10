// Gros bandeau quand la liaison avec la table est perdue (Wi-Fi coupé, table
// éteinte…) : impossible de le rater en concert. La table garde son son.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Status, XAirClient } from '../xair/XAirClient';

export function LinkBanner({ client, top = 0 }: { client: XAirClient; top?: number }) {
  const [st, setSt] = useState<Status>(client.status);
  const [since, setSince] = useState(0);
  const [back, setBack] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => client.onStatus((s) => {
    setSt((prev) => {
      if (s === 'perdu' && prev !== 'perdu') setSince(Date.now());
      if (s === 'connecté' && (prev === 'perdu' || prev === 'connexion')) { setBack(true); setTimeout(() => setBack(false), 3000); }
      return s;
    });
  }), [client]);
  useEffect(() => {
    if (st !== 'perdu') return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [st]);
  const lost = st === 'perdu' || st === 'connexion';
  if (!lost && !back) return null;
  const secs = since ? Math.round((Date.now() - since) / 1000) : 0;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="assertive" style={{ position: 'absolute', left: 0, right: 0, top, alignItems: 'center', zIndex: 200 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, margin: 10, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18, borderWidth: 3, borderColor: lost ? '#EF4444' : '#22C55E', backgroundColor: lost ? '#3A0D0D' : '#0D2A18', elevation: 20, maxWidth: 760 }}>
        {lost ? <ActivityIndicator color="#FCA5A5" /> : <Text style={{ fontSize: 22 }}>✓</Text>}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: lost ? '#FECACA' : '#BBF7D0', fontSize: 18, fontWeight: '900' }}>{lost ? `📡 Liaison perdue avec la table${secs ? ` · ${secs} s` : ''}` : 'Table retrouvée'}</Text>
          <Text style={{ color: lost ? '#FCA5A5' : '#86EFAC', fontSize: 12 }}>{lost ? 'Le son continue : la table garde son mix. Je me reconnecte tout seul… Vérifie le Wi-Fi de la tablette.' : 'Tout est relu depuis la table.'}</Text>
        </View>
      </View>
    </View>
  );
}
