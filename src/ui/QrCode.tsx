// QR code dessiné avec de simples View (aucun module natif, rien à recompiler).
// Chaque ligne est découpée en « traits » noirs consécutifs : ~300 vues au lieu de ~1000.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { qrMatrix } from './qrMatrix';

export function QrCode(props: { value: string; size: number }) {
  const m = useMemo(() => qrMatrix(props.value), [props.value]);
  const quiet = 4; // marge blanche obligatoire autour du code
  const cell = props.size / (m.length + quiet * 2);
  return (
    <View style={{ width: props.size, height: props.size, backgroundColor: '#FFFFFF', padding: cell * quiet }} accessibilityLabel="QR code d’invitation" accessibilityRole="image">
      {m.map((row, r) => {
        const runs: [number, number][] = [];
        for (let c = 0; c < row.length; c++) {
          if (!row[c]) continue;
          const start = c;
          while (c + 1 < row.length && row[c + 1]) c++;
          runs.push([start, c - start + 1]);
        }
        return (
          <View key={r} style={{ height: cell, flexDirection: 'row' }}>
            {runs.map(([x, w]) => (
              <View key={x} style={{ position: 'absolute', left: x * cell, width: w * cell + 0.5, height: cell + 0.5, backgroundColor: '#0B0D10' }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
