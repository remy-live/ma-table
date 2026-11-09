// Vue « gains » : un gros bouton de gain par entrée, avec son vumètre.
// Pour la balance : on voit et règle toutes les entrées d'un coup d'œil.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { f } from '../osc/osc';
import { chNamePath, fToGainDb, headampGainPath, insrcPath, insrcPlug, meterIndex, phantomPath } from '../xair/addresses';
import { colorOf } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { useParam, useParamOpt } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { tick } from './haptics';
import { Knob } from './Knob';
import { Theme } from './theme';

export function GainTile({ client, ch, theme, size, onOpen }: { client: XAirClient; ch: number; theme: Theme; size: number; onOpen: (ch: number) => void }) {
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const col = colorOf(Number(useParam<number>(client, `/ch/${String(ch).padStart(2, '0')}/config/color`, 0)));
  const gain = useParamOpt(client, headampGainPath(ch));
  const p48 = Number(useParamOpt(client, phantomPath(ch)) ?? 0) === 1;
  const insrc = Number(useParam<number>(client, insrcPath(ch), ch - 1));
  const m = useMeter(client, [meterIndex.ch(ch)]);
  const db = gain === undefined ? null : fToGainDb(Number(gain));
  const zone = m.clip ? '#EF4444' : m.db > -6 ? '#EAB308' : m.db > -24 ? '#22C55E' : theme.muted;
  return (
    <View style={[styles.tile, { width: size + 28, backgroundColor: theme.panel, borderColor: m.clip ? '#EF4444' : theme.line }]}>
      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '800' }}>PRISE {insrcPlug(insrc)}{p48 ? ' · 48V' : ''}</Text>
      <Pressable onPress={() => onOpen(ch)} style={[styles.name, { borderBottomColor: col, backgroundColor: theme.deep }]}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{name}</Text>
      </Pressable>
      <Knob
        value={gain === undefined ? 0.5 : Number(gain)}
        size={size}
        theme={theme}
        color={col}
        dim={gain === undefined}
        label={`Gain de ${name}`}
        onPress={() => onOpen(ch)}
        onChange={gain === undefined ? undefined : (v) => {
          const a = fToGainDb(Number(gain));
          const b = fToGainDb(v);
          if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) tick();
          client.set(headampGainPath(ch), f(v));
        }}
      />
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{db === null ? 'Ligne' : `${db > 0 ? '+' : ''}${db.toFixed(0)} dB`}</Text>
      <View style={[styles.meter, { backgroundColor: theme.meterBg }]}>
        <View style={{ width: `${m.level * 100}%`, height: '100%', backgroundColor: zone }} />
        <View style={[styles.target, { left: '70%', width: '20%', borderColor: theme.text }]} />
      </View>
      <Text style={{ color: zone, fontSize: 10, fontWeight: '800' }}>{m.clip ? 'SATURE' : m.db > -6 ? 'fort' : m.db > -24 ? 'bon' : m.db > -90 ? 'faible' : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1, borderRadius: 16, padding: 10, alignItems: 'center', gap: 6 },
  name: { alignSelf: 'stretch', minHeight: 34, borderRadius: 8, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  meter: { alignSelf: 'stretch', height: 10, borderRadius: 5, overflow: 'hidden' },
  target: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: 3, opacity: 0.4 },
});
