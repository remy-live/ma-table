// Vue « gains » : un gros bouton de gain par entrée, avec son vumètre.
// Pour la balance : on voit et règle toutes les entrées d'un coup d'œil.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { f } from '../osc/osc';
import { chNamePath, fToGainDb, headampGainPath, insrcPath, insrcPlug, meterIndex, phantomPath } from '../xair/addresses';
import { chColorOf, colorOf } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { useParam, useParamOpt } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { tick } from './haptics';
import { Knob } from './Knob';
import { GROUP_COLORS } from '../screens/GroupsSheet';
import { Theme } from './theme';

export interface TileOrganize { onMove: (k: number) => void; onCopy: () => void; onRename: () => void }

export function GainTile({ client, ch, theme, size, onOpen, organize, picked, onPick, group }: { client: XAirClient; ch: number; theme: Theme; size: number; onOpen: (ch: number) => void; organize?: TileOrganize; picked?: boolean; onPick?: (ch: number) => void; group?: { k: number; name: string } }) {
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const col = chColorOf(Number(useParam<number>(client, `/ch/${String(ch).padStart(2, '0')}/config/color`, 0)), ch);
  const gain = useParamOpt(client, headampGainPath(ch));
  const p48 = Number(useParamOpt(client, phantomPath(ch)) ?? 0) === 1;
  const insrc = Number(useParam<number>(client, insrcPath(ch), ch - 1));
  const m = useMeter(client, [meterIndex.ch(ch)]);
  const db = gain === undefined ? null : fToGainDb(Number(gain));
  const zone = m.clip ? '#EF4444' : m.db > -6 ? '#EAB308' : m.db > -24 ? '#22C55E' : theme.muted;
  return (
    <View style={[styles.tile, { width: size + 28, backgroundColor: theme.panel, borderColor: m.clip ? '#EF4444' : theme.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '800' }}>PRISE {insrcPlug(insrc)}{p48 ? ' · 48V' : ''}</Text>
        {group && <View style={{ borderRadius: 5, paddingHorizontal: 4, backgroundColor: GROUP_COLORS[group.k - 1] ?? theme.accent }}><Text numberOfLines={1} style={{ color: '#0B0D10', fontSize: 9, fontWeight: '900' }}>{group.name}</Text></View>}
      </View>
      <Pressable onPress={() => (picked !== undefined && onPick ? onPick(ch) : onOpen(ch))} onLongPress={onPick ? () => onPick(ch) : undefined} accessibilityRole={picked !== undefined ? 'checkbox' : 'button'} accessibilityState={picked !== undefined ? { checked: picked } : undefined} style={[styles.name, { borderBottomColor: col, backgroundColor: picked ? col : theme.deep }, picked === false && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.line2 }]}>
        <Text numberOfLines={1} style={{ color: picked ? '#0B0D10' : theme.text, fontSize: size < 70 ? 12 : 14, fontWeight: '800' }}>{picked ? '✓ ' : picked === false ? '○ ' : ''}{name}</Text>
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
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: size < 70 ? 13 : 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{db === null ? 'Ligne' : `${db > 0 ? '+' : ''}${db.toFixed(0)} dB`}</Text>
      <View style={[styles.meter, { backgroundColor: theme.meterBg }]}>
        <View style={{ width: `${m.level * 100}%`, height: '100%', backgroundColor: zone }} />
        <View style={[styles.target, { left: '70%', width: '20%', borderColor: theme.text }]} />
      </View>
      {organize ? (
        <View style={{ flexDirection: 'row', gap: 3, alignSelf: 'stretch' }}>
          {([['◀', () => organize.onMove(-1), 'Déplacer avant'], ['▶', () => organize.onMove(1), 'Déplacer après'], ['⧉', organize.onCopy, 'Copier les réglages'], ['✎', organize.onRename, 'Renommer']] as [string, () => void, string][]).map(([l, fn, a]) => (
            <Pressable key={a} onPress={fn} accessibilityLabel={a} style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.accent, fontWeight: '900', fontSize: 14 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={{ color: zone, fontSize: 10, fontWeight: '800' }}>{m.clip ? 'SATURE' : m.db > -6 ? 'fort' : m.db > -24 ? 'bon' : m.db > -90 ? 'faible' : '—'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1, borderRadius: 16, padding: 10, alignItems: 'center', gap: 6 },
  name: { alignSelf: 'stretch', minHeight: 34, borderRadius: 8, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  meter: { alignSelf: 'stretch', height: 10, borderRadius: 5, overflow: 'hidden' },
  target: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: 3, opacity: 0.4 },
});
