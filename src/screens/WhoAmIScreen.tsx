// « Je suis… » : le musicien dit qui il est en se connectant.
// Il choisit son retour dans la liste (Bassiste, Mon retour…), ou tape son prénom
// et prend un retour libre. Le nom est écrit sur la table : le sondier le voit
// aussitôt sur sa tablette (la pastille du retour porte ce nom).
// Il coche aussi « ses » voies, celles que « Plus de moi » montera.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { s as oscS } from '../osc/osc';
import { bottomPad } from '../ui/immersive';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath } from '../xair/addresses';
import { DEFAULT_RIGHTS, MonConfig } from '../xair/monitor';
import { chColor } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { initials, MIX_COLORS } from './MixPicker';

const INSTRUMENTS: [string, RegExp][] = [
  ['Voix', /voix|chant|vocal|lead|chœur|choeur/i],
  ['Guitare', /guit/i],
  ['Basse', /bass/i],
  ['Batterie', /kick|caisse|snare|charley|hat|tom|overhead|oh\b|batt/i],
  ['Clavier', /clav|piano|key|synth/i],
  ['Autre', /$^/],
];

export function WhoAmIScreen(props: { client: XAirClient; theme: Theme; host: string; current?: MonConfig | null; onDone: (cfg: MonConfig) => void; onCancel: () => void }) {
  const { client, theme } = props;
  const wide = useWindowDimensions().width >= 700;
  const [ready, setReady] = useState(false);
  const [bus, setBus] = useState<number | null>(props.current?.bus ?? null);
  const [first, setFirst] = useState('');
  const [inst, setInst] = useState<string | null>(null);
  const [me, setMe] = useState<number[]>(props.current?.me ?? []);
  useEffect(() => {
    const paths = [...Array.from({ length: BUS_COUNT }, (_, k) => busNamePath(k + 1)), ...Array.from({ length: CH_COUNT }, (_, k) => chNamePath(k + 1))];
    client.loadPaths(paths).finally(() => setReady(true));
  }, [client]);

  const busName = (n: number) => String(client.get(busNamePath(n)) ?? '').trim();
  const chName = (c: number) => String(client.get(chNamePath(c)) ?? '').trim();
  const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => chName(c));
  const free = Array.from({ length: BUS_COUNT }, (_, k) => k + 1).find((n) => !busName(n) || /^retour\s*\d*$/i.test(busName(n))) ?? null;
  const pickInst = (i: string) => {
    setInst(i);
    const re = INSTRUMENTS.find(([n]) => n === i)?.[1];
    if (re) setMe(named.filter((c) => re.test(chName(c))));
  };
  const chooseBus = (n: number) => {
    setBus(n);
    setFirst('');
    // ses voies devinées d'après le nom du retour (« Bassiste » → la basse)
    const nm = busName(n);
    const hit = INSTRUMENTS.find(([, re]) => re.test(nm));
    if (hit && !me.length) setMe(named.filter((c) => hit[1].test(chName(c))));
  };
  const typedName = first.trim();
  const target = typedName ? (bus && !busName(bus) ? bus : free) : bus;
  const finalName = typedName ? (inst && inst !== 'Autre' ? `${typedName} ${inst.toLowerCase()}` : typedName).slice(0, 12) : bus ? busName(bus) || `Retour ${bus}` : '';
  const done = () => {
    if (!target) return;
    if (typedName) client.set(busNamePath(target), oscS(finalName));
    props.onDone({ host: props.host, bus: target, name: typedName || finalName, me, rights: props.current?.rights ?? DEFAULT_RIGHTS });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
      <Text style={[styles.title, { color: theme.text }]}>Je suis…</Text>
      <Text style={{ color: theme.muted, fontSize: 14 }}>Choisis ton retour. Le sondier verra ton nom sur sa tablette.</Text>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <View style={styles.grid}>
          {Array.from({ length: BUS_COUNT }, (_, k) => k + 1).map((n) => {
            const nm = busName(n);
            const on = bus === n && !typedName;
            const c = MIX_COLORS[n] ?? '#9AA3AD';
            return (
              <Pressable key={n} onPress={() => chooseBus(n)} accessibilityState={{ selected: on }} style={[styles.tile, { width: wide ? '31.5%' : '48%', borderColor: on ? c : theme.line, backgroundColor: on ? theme.panel : theme.deep }]}>
                <View style={[styles.avatar, { backgroundColor: c }]}><Text style={styles.avatarText}>{nm ? initials(nm) : String(n)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: nm ? theme.text : theme.muted, fontSize: 17, fontWeight: '800' }}>{nm || 'Libre'}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>retour {n} · AUX {n}</Text>
                </View>
                {on && <Text style={{ color: c, fontSize: 22, fontWeight: '900' }}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { borderColor: typedName ? theme.accent : theme.line, backgroundColor: theme.panel }]}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Pas dans la liste ? Ton prénom</Text>
          <TextInput value={first} onChangeText={setFirst} placeholder="ex. Paul" placeholderTextColor={theme.muted} maxLength={12} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
          <View style={styles.chips}>
            {INSTRUMENTS.map(([i]) => (
              <Pressable key={i} onPress={() => pickInst(i)} style={[styles.chip, { borderColor: inst === i ? theme.accent : theme.line2, backgroundColor: inst === i ? theme.accent : 'transparent' }]}>
                <Text style={{ color: inst === i ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{i}</Text>
              </Pressable>
            ))}
          </View>
          {typedName ? <Text style={{ color: free || bus ? theme.muted : '#F87171', fontSize: 12 }}>{target ? `Tu prendras le retour ${target} (AUX ${target}), renommé « ${finalName} ».` : 'Plus de retour libre : choisis-en un dans la liste ci-dessus.'}</Text> : null}
        </View>

        {ready && named.length > 0 && (
          <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.panel }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Ce que tu joues <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>· pour le bouton « Plus de moi »</Text></Text>
            <View style={styles.chips}>
              {named.map((c) => {
                const on = me.includes(c);
                const col = chColor(client, c);
                return (
                  <Pressable key={c} onPress={() => setMe((m) => (on ? m.filter((x) => x !== c) : [...m, c]))} style={[styles.chip, { borderColor: col, backgroundColor: on ? col : 'transparent' }]}>
                    <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 13 }}>{on ? '✓ ' : ''}{chName(c)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={props.onCancel} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Retour</Text></Pressable>
        <Pressable onPress={done} disabled={!target} style={[styles.btn, { flex: 2, backgroundColor: target ? '#34D399' : theme.line }]}>
          <Text style={{ color: '#052E1F', fontWeight: '900', fontSize: 17 }}>{target ? `C’est moi : ${typedName ? finalName : busName(target) || `Retour ${target}`}` : 'Choisis ton retour'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 44, paddingHorizontal: 16, gap: 10 },
  title: { fontSize: 28, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { minHeight: 72, borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0B0D10', fontSize: 14, fontWeight: '900' },
  card: { borderWidth: 2, borderRadius: 16, padding: 12, gap: 10 },
  input: { height: 50, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, fontSize: 18, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 2, justifyContent: 'center' },
  btn: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
