// Bibliothèque de préréglages : onglets par famille, plusieurs variantes par
// instrument, appliquer sur une ou plusieurs voies, et « Mes réglages ».
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { load, save } from '../store/persist';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath } from '../xair/addresses';
import { applyPreset, FAMILIES, Family, LIBRARY, Preset, presetFromChannel, presetPaths } from '../xair/presets';
import { XAirClient } from '../xair/XAirClient';
import { EqThumb, PresetDots } from '../ui/EqThumb';

const FAM_COLORS: Record<string, string> = { Voix: '#F472B6', Guitares: '#2DD4BF', Basse: '#60A5FA', Batterie: '#F59E0B', Claviers: '#A3E635', 'Mes réglages': '#FBBF24' };


export function PresetsSheet(props: { client: XAirClient; theme: Theme; visible: boolean; ch: number | null; onClose: () => void }) {
  const { client, theme } = props;
  const [fam, setFam] = useState<Family>('Voix');
  const [mine, setMine] = useState<Preset[]>([]);
  const [targets, setTargets] = useState<number[]>([]);
  const [sel, setSel] = useState<Preset | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!props.visible) return;
    load<Preset[]>('mesPresets', []).then(setMine);
    setTargets(props.ch ? [props.ch] : []);
    setSel(null);
  }, [props.visible, props.ch]);

  const list = fam === 'Mes réglages' ? mine : LIBRARY.filter((p) => p.family === fam);
  const chName = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const toggle = (c: number) => setTargets((t) => (t.includes(c) ? t.filter((x) => x !== c) : [...t, c].sort((a, b) => a - b)));

  const apply = () => {
    if (!sel || !targets.length) return;
    targets.forEach((c) => applyPreset(client, c, sel));
    Alert.alert('Appliqué', `« ${sel.name} » sur ${targets.map(chName).join(', ')}. C’est un point de départ : ajuste à l’oreille.`);
  };
  const keep = async () => {
    const c = props.ch ?? targets[0];
    if (!c) return;
    await client.loadPaths(presetPaths(c), false);
    const p = presetFromChannel(client, c, newName.trim() || chName(c));
    const next = [...mine.filter((m) => m.name !== p.name), p];
    setMine(next);
    await save('mesPresets', next);
    setNewName('');
    setFam('Mes réglages');
  };
  const remove = async (p: Preset) => {
    const next = mine.filter((m) => m.name !== p.name);
    setMine(next);
    await save('mesPresets', next);
    if (sel?.name === p.name) setSel(null);
  };

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.text, flex: 1 }]}>Préréglages</Text>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Fermer</Text>
          </Pressable>
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FAMILIES.map((fa) => (
              <Pressable key={fa} onPress={() => setFam(fa)} style={[styles.chip, fa === fam ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                <Text style={{ color: fa === fam ? theme.onAccent : theme.text, fontWeight: '700', fontSize: 13 }}>{fa}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 30 }}>
          {list.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Rien ici pour l’instant. Règle une voie à ton goût, puis « Garder ce réglage » en bas.</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {list.map((p) => {
              const on = sel?.name === p.name;
              const c = FAM_COLORS[p.family ?? 'Mes réglages'] ?? theme.accent;
              return (
                <Pressable key={p.name} onPress={() => setSel(p)} accessibilityState={{ selected: on }} onLongPress={fam === 'Mes réglages' ? () => Alert.alert('Supprimer ?', p.name, [{ text: 'Non' }, { text: 'Supprimer', style: 'destructive', onPress: () => remove(p) }]) : undefined} style={[styles.preset, { borderColor: on ? '#FFFFFF' : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
                  <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: theme.meterBg }}>
                    <EqThumb p={p} width={150} height={56} color={c} theme={theme} />
                  </View>
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{p.variant && p.variant !== 'Standard' ? p.variant : p.name}</Text>
                  <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 11, minHeight: 28 }}>{p.desc ?? p.name}</Text>
                  <PresetDots p={p} theme={theme} />
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.kicker, { color: theme.muted, marginTop: 8 }]}>SUR QUELLES VOIES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: CH_COUNT }, (_, n) => n + 1).map((c) => {
              const on = targets.includes(c);
              return (
                <Pressable key={c} onPress={() => toggle(c)} accessibilityState={{ selected: on }} style={[styles.small, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                  <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '700' }}>
                    {c} · {chName(c)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={apply} disabled={!sel || !targets.length} style={[styles.apply, { backgroundColor: theme.accent, opacity: sel && targets.length ? 1 : 0.4 }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>
              {sel ? `Appliquer « ${sel.variant && sel.variant !== 'Standard' ? sel.variant : sel.name} » sur ${targets.length} voie${targets.length > 1 ? 's' : ''}` : 'Choisis un préréglage'}
            </Text>
          </Pressable>

          {(props.ch || targets.length > 0) && (
            <View style={[styles.keep, { borderColor: theme.line, backgroundColor: theme.panel }]}>
              <Text style={[styles.kicker, { color: theme.muted }]}>GARDER LE RÉGLAGE DE LA VOIE {props.ch ?? targets[0]}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={newName} onChangeText={setNewName} placeholder={`ex. « Ma voix »`} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                <Pressable onPress={keep} style={[styles.go, { borderColor: theme.accent }]}>
                  <Text style={{ color: '#FBBF24', fontWeight: '800' }}>Garder</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  preset: { width: 174, borderWidth: 2, borderRadius: 16, padding: 11, gap: 6 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  small: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  apply: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  keep: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 8 },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  go: { height: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
});
