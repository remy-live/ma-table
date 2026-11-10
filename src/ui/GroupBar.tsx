// « Sélectionner » des voies puis en faire un groupe (DCA de la table), ou les
// ajouter à un groupe qui existe. Partagé par la Table (toutes les vues) et
// Branchements.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { i, s as oscS } from '../osc/osc';
import { CH_COUNT, chDcaPath, chNamePath, DCA_COUNT, dcaNamePath } from '../xair/addresses';
import { readGroups } from '../xair/groups';
import { XAirClient } from '../xair/XAirClient';
import { GROUP_COLORS } from '../screens/GroupsSheet';
import { showTip } from './tip';
import { Theme } from './theme';
import { load, save } from '../store/persist';

/** Met des voies dans le groupe k. Une voie n'est que dans un groupe à la fois : elle quitte l'ancien. */
export function addToGroup(client: XAirClient, k: number, chans: number[]) {
  for (const c of chans) client.set(chDcaPath(c), i(1 << (k - 1)));
}
/** Le premier groupe vide de la table, ou null s'ils sont tous pris. */
export function freeGroup(client: XAirClient): number | null {
  const g = readGroups(client);
  for (let k = 1; k <= DCA_COUNT; k++) if (!g.find((x) => x.k === k)?.members.length) return k;
  return null;
}
/** Un nom proposé d'après les voies : « Guitares », « Voix »… */
function guessName(client: XAirClient, chans: number[]): string {
  const names = chans.map((c) => String(client.get(chNamePath(c)) ?? '').toLowerCase());
  const all = (re: RegExp) => names.length > 0 && names.every((n) => re.test(n));
  if (all(/kick|caisse|snare|charley|hh|tom|overhead|oh|cymb|batt/)) return 'Batterie';
  if (all(/guit/)) return 'Guitares';
  if (all(/voix|ch(œ|oe)ur|chant|vocal/)) return 'Voix';
  if (all(/clav|piano|synth/)) return 'Claviers';
  if (all(/ordi|pc|usb/)) return 'Ordi';
  return '';
}

export function GroupBar({ client, theme, chans, onDone, onCancel }: { client: XAirClient; theme: Theme; chans: number[]; onDone: (msg: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const groups = readGroups(client).filter((g) => g.members.length);
  const free = freeGroup(client);
  const label = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const proposed = guessName(client, chans);
  const make = () => {
    if (!free || !chans.length) return;
    const nm = (name.trim() || proposed || `Groupe ${free}`).slice(0, 12);
    client.set(dcaNamePath(free), oscS(nm));
    addToGroup(client, free, chans);
    tipOnce();
    onDone(`Groupe « ${nm} » : ${chans.length} voie${chans.length > 1 ? 's' : ''}`);
  };
  return (
    <View style={[styles.bar, { backgroundColor: theme.panel, borderColor: theme.accent }]}>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
          {chans.length ? `${chans.length} voie${chans.length > 1 ? 's' : ''} : ${chans.map(label).join(', ')}` : 'Touche les noms des voies à réunir'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {free ? (
            <>
              <TextInput value={name} onChangeText={setName} placeholder={proposed || 'Nom du groupe : Chœurs…'} placeholderTextColor={theme.muted} maxLength={12} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
              <Pressable onPress={make} disabled={!chans.length} style={[styles.btn, { backgroundColor: theme.accent, opacity: chans.length ? 1 : 0.4 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 13 }}>＋ Faire un groupe</Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: theme.muted, fontSize: 12 }}>Les {DCA_COUNT} groupes de la table sont pris : ajoute à un groupe existant.</Text>
          )}
          {groups.map((g) => (
            <Pressable key={g.k} disabled={!chans.length} onPress={() => { addToGroup(client, g.k, chans); onDone(`${chans.length} voie${chans.length > 1 ? 's' : ''} ajoutée${chans.length > 1 ? 's' : ''} à « ${g.name} »`); }} style={[styles.btn, { borderWidth: 1.5, borderColor: GROUP_COLORS[g.k - 1] ?? theme.accent, opacity: chans.length ? 1 : 0.4 }]}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Ajouter à {g.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable onPress={onCancel} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Annuler</Text>
      </Pressable>
    </View>
  );
}

/** La première fois : on apprend le raccourci. */
async function tipOnce() {
  if (await load<boolean>('tipGroupLong', false)) return;
  save('tipGroupLong', true);
  setTimeout(() => showTip('Astuce : un appui long sur le nom d’une voie fait la même chose que « ☑ Sélectionner ».'), 1200);
}

export const ALL_CH = Array.from({ length: CH_COUNT }, (_, k) => k + 1);

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 16, padding: 10 },
  input: { height: 38, minWidth: 170, flexGrow: 0, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: '700' },
  btn: { height: 38, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
});
