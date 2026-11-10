// Préréglages, dans l'onglet « Préréglage » de la voie (pas de fenêtre en plus) :
// la bonne famille est déjà choisie d'après le nom de la voie, on touche un
// préréglage pour l'essayer, on compare Avant / Après, on garde ou on annule.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { OscValue } from '../osc/osc';
import { load, save } from '../store/persist';
import { EqThumb, PresetDots } from '../ui/EqThumb';
import { Theme } from '../ui/theme';
import { showTip } from '../ui/tip';
import { useAnyTick } from '../ui/useTick';
import { applyPreset, DRUM_PARTS, FAMILIES, Family, guessFamily, LIBRARY, Preset, presetFromChannel, presetPaths } from '../xair/presets';
import { argFor, XAirClient } from '../xair/XAirClient';

export const FAM_COLORS: Record<string, string> = { Voix: '#F472B6', Guitares: '#2DD4BF', Basse: '#60A5FA', Batterie: '#F59E0B', Claviers: '#A3E635', 'Vents & cordes': '#C084FC', 'Mes réglages': '#FBBF24' };
const FAM_ICON: Record<string, string> = { Voix: '🎤', Guitares: '🎸', Basse: '🎸', Batterie: '🥁', Claviers: '🎹', 'Vents & cordes': '🎷', 'Mes réglages': '★' };
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Trial = { p: Preset; before: Map<string, OscValue>; side: 'avant' | 'apres' };

export function PresetPanel({ client, ch, theme, name, wide, onApplied }: { client: XAirClient; ch: number; theme: Theme; name: string; wide: boolean; onApplied?: (p: Preset | null) => void }) {
  useAnyTick(client, 250); // les vignettes et les onglets suivent ce qui change sur la table
  const guess = guessFamily(name);
  const [fam, setFam] = useState<Family>(guess?.family ?? 'Voix');
  const [part, setPart] = useState<string | null>(guess?.element ?? null);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<Preset[]>([]);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [keepName, setKeepName] = useState('');
  useEffect(() => { load<Preset[]>('mesPresets', []).then(setMine); }, []);
  // une autre voie, ou la voie renommée : on repart de sa famille
  useEffect(() => { setFam(guess?.family ?? 'Voix'); setPart(guess?.element ?? null); setTrial(null); }, [ch, guess?.family, guess?.element]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = q.trim()
    ? [...LIBRARY, ...mine].filter((p) => norm(`${p.name} ${p.variant ?? ''} ${p.desc ?? ''} ${p.family ?? ''} ${p.element ?? ''}`).includes(norm(q.trim())))
    : fam === 'Mes réglages' ? mine : LIBRARY.filter((p) => p.family === fam && (fam !== 'Batterie' || !part || p.element === part));

  const putBack = (m: Map<string, OscValue>) => m.forEach((v, path) => client.set(path, argFor(path, v)));
  const tryIt = (p: Preset) => {
    const before = trial ? trial.before : new Map<string, OscValue>();
    if (!trial) for (const path of presetPaths(ch)) { const v = client.get(path); if (v !== undefined) before.set(path, v); }
    applyPreset(client, ch, p);
    setTrial({ p, before, side: 'apres' });
  };
  const side = (sd: 'avant' | 'apres') => {
    if (!trial || trial.side === sd) return;
    if (sd === 'avant') putBack(trial.before); else applyPreset(client, ch, trial.p);
    setTrial({ ...trial, side: sd });
  };
  const keep = () => {
    if (!trial) return;
    if (trial.side === 'avant') applyPreset(client, ch, trial.p);
    showTip(`« ${title(trial.p)} » gardé sur ${name}`);
    onApplied?.(trial.p);
    setTrial(null);
  };
  const cancel = () => { if (!trial) return; putBack(trial.before); setTrial(null); showTip('Préréglage annulé : la voie est comme avant'); };
  const keepMine = async () => {
    await client.loadPaths(presetPaths(ch), false);
    const p = presetFromChannel(client, ch, keepName.trim() || name);
    const next = [...mine.filter((m) => m.name !== p.name), p];
    setMine(next);
    await save('mesPresets', next);
    setKeepName('');
    showTip(`« ${p.name} » rangé dans Mes réglages`);
  };
  const removeMine = async (p: Preset) => { const next = mine.filter((m) => m.name !== p.name); setMine(next); await save('mesPresets', next); };

  const cardW = wide ? 148 : 150;
  return (
    <View style={{ gap: 8 }}>
      {/* l'essai en cours, toujours en haut */}
      {trial ? (
        <View style={[styles.trial, { borderColor: theme.accent, backgroundColor: theme.deep }]}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '900', width: '100%' }}>« {title(trial.p)} » : écoute avant / après, puis garde ou annule</Text>
          <View style={{ flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: theme.line2, overflow: 'hidden' }}>
            {(['avant', 'apres'] as const).map((sd) => (
              <Pressable key={sd} onPress={() => side(sd)} accessibilityState={{ selected: trial.side === sd }} style={{ height: 40, paddingHorizontal: wide ? 14 : 10, justifyContent: 'center', backgroundColor: trial.side === sd ? (sd === 'avant' ? '#A78BFA' : theme.accent) : 'transparent' }}>
                <Text style={{ color: trial.side === sd ? '#0B0D10' : theme.text, fontWeight: '900', fontSize: 13 }}>{sd === 'avant' ? '◀ Avant' : 'Après ▶'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={cancel} accessibilityLabel="Annuler le préréglage" style={[styles.pill, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{wide ? '✕ Annuler' : '✕'}</Text></Pressable>
          <Pressable onPress={keep} style={[styles.pill, { borderColor: theme.accent, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 13, fontWeight: '900' }}>✓ Garder</Text></Pressable>
        </View>
      ) : (
        <Text style={{ color: theme.muted, fontSize: 12 }}>{guess ? `Pour « ${name} », voici les préréglages ${guess.element ? `de ${guess.element.toLowerCase()}` : `de la famille ${guess.family}`}. ` : ''}Touche-en un pour l’essayer : rien n’est gardé tant que tu n’as pas dit « Garder ».</Text>
      )}

      <TextInput value={q} onChangeText={setQ} placeholder="🔎 Cherche : kick, voix rock, saxo, cajon…" placeholderTextColor={theme.muted}
        style={{ height: 44, borderRadius: 12, borderWidth: 2, paddingHorizontal: 12, fontSize: 14, color: theme.text, borderColor: q ? theme.accent : theme.line2, backgroundColor: theme.deep }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, opacity: q ? 0.4 : 1 }} contentContainerStyle={{ gap: 6 }}>
        {FAMILIES.map((fa) => {
          const on = fa === fam && !q;
          return (
            <Pressable key={fa} onPress={() => { setFam(fa); setQ(''); setPart(fa === guess?.family ? guess?.element ?? null : null); }} accessibilityState={{ selected: on }} style={[styles.chip, on ? { backgroundColor: FAM_COLORS[fa], borderColor: FAM_COLORS[fa] } : { borderColor: theme.line2 }]}>
              <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 12 }}>{FAM_ICON[fa]} {fa}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {fam === 'Batterie' && !q && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
          {[null, ...DRUM_PARTS].map((d) => (
            <Pressable key={d ?? 'tout'} onPress={() => setPart(d)} accessibilityState={{ selected: part === d }} style={[styles.chip, { height: 34 }, part === d ? { backgroundColor: FAM_COLORS.Batterie, borderColor: FAM_COLORS.Batterie } : { borderColor: theme.line2 }]}>
              <Text style={{ color: part === d ? '#0B0D10' : theme.text, fontSize: 12, fontWeight: '800' }}>{d ?? 'Toute la batterie'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {list.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>{q ? `Rien pour « ${q} ». Essaie un autre mot : voix, guitare, kick…` : 'Rien ici pour l’instant : règle la voie à ton goût, puis range-la en bas.'}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => {
          const on = trial?.p.name === p.name;
          const c = FAM_COLORS[p.family ?? 'Mes réglages'] ?? theme.accent;
          return (
            <Pressable key={p.name} onPress={() => tryIt(p)} onLongPress={p.family === 'Mes réglages' ? () => removeMine(p) : () => showTip(p.desc ?? p.name)} accessibilityState={{ selected: on }}
              style={[styles.card, { width: cardW, borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
              <View style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: theme.meterBg }}>
                <EqThumb p={p} width={cardW - 18} height={38} color={c} theme={theme} />
              </View>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '900', fontSize: 13 }}>{on ? '▶ ' : ''}{title(p, !!q || !part)}</Text>
              <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 10.5, minHeight: 26 }}>{q && p.family ? `${p.family} · ` : ''}{p.desc ?? p.name}</Text>
              <PresetDots p={p} theme={theme} />
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <TextInput value={keepName} onChangeText={setKeepName} placeholder={`Ranger ce réglage : « Ma ${name.toLowerCase()} »`} placeholderTextColor={theme.muted}
          style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }} />
        <Pressable onPress={keepMine} style={[styles.pill, { borderColor: FAM_COLORS['Mes réglages'] }]}><Text style={{ color: FAM_COLORS['Mes réglages'], fontWeight: '900', fontSize: 13 }}>★ Ranger</Text></Pressable>
      </View>
    </View>
  );
}

const title = (p: Preset, withElement = false) => `${p.element && withElement ? `${p.element} · ` : ''}${p.variant ?? p.name}`;

const styles = StyleSheet.create({
  trial: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 8, borderRadius: 14, borderWidth: 2 },
  pill: { height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, justifyContent: 'center' },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 2, borderRadius: 14, padding: 8, gap: 4 },
});
