// Préparer l'enregistrement : cocher les voies vite. Boutons qui cochent d'un coup
// (comme la dernière fois, celles qui reçoivent du son, tout, rien), par famille,
// et une barre verte quand le micro reçoit du son.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { meterIndex } from '../xair/addresses';
import { guessRole, Role } from '../xair/listen';
import { Candidate } from '../xair/recorder';
import { useLevels } from '../xair/useMeter';
import { XAirClient } from '../xair/XAirClient';

const FAMILIES: [string, string, Role[]][] = [
  ['Voix', '#F472B6', ['Voix', 'Chœurs']],
  ['Instruments', '#FB923C', ['Guitare', 'Basse', 'Clavier', 'Autre']],
  ['Batterie', '#60A5FA', ['Grosse caisse', 'Caisse claire', 'Tom', 'Cymbales']],
];
const famOf = (name: string) => FAMILIES.find((f) => f[2].includes(guessRole(name)));

export function Tick({ on, theme }: { on: boolean; theme: Theme }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? theme.accent : theme.muted, backgroundColor: on ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900', lineHeight: 16 }}>✓</Text>}
    </View>
  );
}

export function RecPrep({ client, theme, cands, sel, setSel, last, wide }: { client: XAirClient; theme: Theme; cands: Candidate[]; sel: number[]; setSel: (s: number[]) => void; last: number[] | null; wide: boolean }) {
  const lv = useLevels(client, cands.map((c) => c.ch), meterIndex.ch, 200);
  const has = (ch: number) => sel.includes(ch);
  const named = cands.filter((c) => c.named && !c.muted).map((c) => c.ch);
  const live = cands.filter((c) => (lv[c.ch] ?? 0) > 0.08).map((c) => c.ch);
  const same = (a: number[]) => a.length === sel.length && a.every(has);
  const quick: [string, number[]][] = [
    ...(last?.length ? [['Comme la dernière fois', last] as [string, number[]]] : []),
    ['Celles qui reçoivent du son', live], ['Celles qui ont un nom', named], ['Tout', cands.map((c) => c.ch)], ['Rien', []],
  ];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {quick.map(([label, ks]) => {
          const on = same(ks) && (ks.length > 0 || label === 'Rien');
          return (
            <Pressable key={label} onPress={() => setSel(ks.slice())} accessibilityState={{ selected: on }} style={[styles.chip, { borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.accent : 'transparent' }]}>
              <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 13, fontWeight: '800' }}>{label}</Text>
            </Pressable>
          );
        })}
        {FAMILIES.map(([label, color, roles]) => {
          const ks = cands.filter((c) => c.named && roles.includes(guessRole(c.name))).map((c) => c.ch);
          if (!ks.length) return null;
          const all = ks.every(has);
          return (
            <Pressable key={label} onPress={() => setSel(all ? sel.filter((k) => !ks.includes(k)) : Array.from(new Set([...sel, ...ks])))} accessibilityState={{ checked: all }} style={[styles.chip, { flexDirection: 'row', gap: 8, borderColor: all ? color : theme.line2, backgroundColor: all ? theme.deep : 'transparent' }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{label} ({ks.length})</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {cands.map((c) => {
          const on = has(c.ch), level = Math.max(0, Math.min(1, lv[c.ch] ?? 0)), fam = c.named ? famOf(c.name) : undefined;
          return (
            <Pressable key={c.ch} onPress={() => setSel(on ? sel.filter((x) => x !== c.ch) : [...sel, c.ch])} accessibilityState={{ checked: on }} accessibilityLabel={`Voie ${c.ch} ${c.name || 'sans nom'}`} style={[styles.tile, { width: wide ? '24.2%' : '48.5%', borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.deep : 'transparent' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tick on={on} theme={theme} />
                <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>{c.ch}</Text>
                <View style={{ flex: 1 }} />
                {fam && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fam[1] }} />}
              </View>
              <Text numberOfLines={1} style={{ color: on ? theme.text : theme.muted, fontSize: 15, fontWeight: '800' }}>{c.name || 'sans nom'}</Text>
              <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10, fontWeight: '600' }}>{c.muted ? 'coupée sur la table' : level > 0.08 ? 'reçoit du son' : 'silencieuse pour l’instant'}</Text>
              <View style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${Math.round(level * 100)}%`, backgroundColor: level > 0.8 ? '#FACC15' : '#34D399' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tile: { minHeight: 78, borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 2, overflow: 'hidden' },
});
