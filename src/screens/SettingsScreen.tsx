// Réglages : le design (20 au choix, avec aperçu vivant), le confort
// (vibration, largeur des voies), puis la connexion, le réseau et le débogage.
import { LangPicker } from '../i18n/LangPicker';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { Fader } from '../ui/Fader';
import { Knob } from '../ui/Knob';
import { canImmersive, NavRoom } from '../ui/immersive';
import { ScreenHeader, Segmented } from '../ui/kit';
import { Theme, THEME_ORDER, THEMES } from '../ui/theme';
import { XAirClient } from '../xair/XAirClient';
import { ConnectionScreen } from './ConnectionScreen';

export type StripWidth = 'compact' | 'normal' | 'large';
export const STRIP_WIDTHS: Record<StripWidth, number> = { compact: 80, normal: 92, large: 116 };

import { WordMode } from '../ui/words';

export interface Prefs {
  immersive: boolean;
  navRoom?: NavRoom;
  theme: string;
  /** design d'avant la Nuit rouge, pour y revenir */
  dayTheme?: string;
  haptics: boolean;
  width: StripWidth;
  /** mode simple (débutant) : l'écran Table n'affiche que l'essentiel */
  simple?: boolean;
  /** les mots : simple + technique, technique seul, simple seul */
  words?: WordMode;
  /** gros texte */
  big?: boolean;
  /** a déjà choisi « Je débute / Je connais » */
  levelChosen?: boolean;
}

/** Mode simple, les mots (simple / technique), gros texte. */
function LevelBox({ theme, prefs, set, compact }: { theme: Theme; prefs: Prefs; set: (p: Partial<Prefs>) => void; compact?: boolean }) {
  const words = prefs.words ?? 'double';
  const ex = words === 'technique' ? 'AUX 2 · gate · 48V' : words === 'simple' ? 'Retour de Seb · Anti-bruit' : 'Retour de Seb · AUX 2';
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.kicker, { color: theme.muted }]}>MON NIVEAU</Text>
      <View style={[styles.boxS, { backgroundColor: theme.panel, borderColor: theme.line, gap: 8 }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>Mode simple</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Table : le nom, le volume, Couper et Solo. Le reste derrière « Réglages ».</Text>
          </View>
          <Switch value={!!prefs.simple} onValueChange={(v) => set({ simple: v, levelChosen: true })} accessibilityLabel="Mode simple" />
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 8, gap: 6 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>Les mots</Text>
          <View style={{ flexDirection: compact ? 'column' : 'row', gap: 6 }}>
            {([['double', 'Simple + technique'], ['technique', 'Technique'], ['simple', 'Simple']] as const).map(([w, l]) => {
              const on = words === w;
              return (
                <Pressable key={w} onPress={() => set({ words: w })} accessibilityState={{ selected: on }} style={{ flex: compact ? undefined : 1, minHeight: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.accent : 'transparent' }}>
                  <Text style={{ color: on ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12, textAlign: 'center' }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Exemple : {ex}. Appui long sur un bouton = son explication.</Text>
        </View>
        <View style={[styles.row, { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 8 }]}>
          <Text style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: 14 }}>Gros texte</Text>
          <Switch value={!!prefs.big} onValueChange={(v) => set({ big: v })} accessibilityLabel="Gros texte" />
        </View>
      </View>
    </View>
  );
}

export function SettingsScreen(props: { client: XAirClient; theme: Theme; prefs: Prefs; onPrefs: (p: Prefs) => void; onDisconnect: () => void }) {
  const { theme, prefs } = props;
  const [part, setPart] = useState<'look' | 'conn'>('look');
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const cols = wide ? 4 : width > 600 ? 3 : 2;
  const set = (p: Partial<Prefs>) => props.onPrefs({ ...prefs, ...p });
  const chips = <T extends string>(val: T, opts: [T, string][], onPick: (v: T) => void) => (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {opts.map(([w, l]) => {
        const on = val === w;
        return (
          <Pressable key={w} onPress={() => onPick(w)} accessibilityState={{ selected: on }} style={[styles.chipS, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
            <Text style={{ color: on ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 11 }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  // tablette : tout sur un seul écran, sans défiler — design | confort | connexion
  if (wide) return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader theme={theme} title="Réglages" sub="Le design, le confort et la liaison avec la table, d’un coup d’œil" />
      <View style={{ flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingBottom: 10 }}>
        <View style={{ flex: 1.75, gap: 6 }}>
          <Text style={[styles.kicker, { color: theme.muted }]}>DESIGN · {THEME_ORDER.length} au choix · touche pour essayer</Text>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' }}>
            {THEME_ORDER.map((id) => <ThemeCard key={id} t={THEMES[id]} on={prefs.theme === id} accent={theme.accent} onPress={() => set({ theme: id })} />)}
          </View>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <LevelBox theme={theme} prefs={prefs} set={set} compact />
          <LangPicker theme={theme} />
          <Text style={[styles.kicker, { color: theme.muted }]}>CONFORT</Text>
          <View style={[styles.boxS, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={styles.row}>
              <Text style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: 13 }}>Vibration au 0 dB</Text>
              <Switch value={prefs.haptics} onValueChange={(v) => set({ haptics: v })} />
            </View>
            <Text style={{ color: theme.muted, fontSize: 11 }}>Comme le cran d’un vrai potentiomètre.</Text>
          </View>
          {canImmersive && (
            <View style={[styles.boxS, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <View style={styles.row}>
                <Text style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: 13 }}>Cacher les boutons de la tablette</Text>
                <Switch value={prefs.immersive !== false} onValueChange={(v) => set({ immersive: v })} />
              </View>
              <Text style={{ color: theme.muted, fontSize: 11 }}>Ils reviennent d’un glissement depuis le bord.</Text>
            </View>
          )}
          {Platform.OS === 'android' && (
            <View style={[styles.boxS, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>Place pour les boutons Android</Text>
              {chips<NavRoom>(prefs.navRoom ?? 'garde', [['garde', 'Garder'], ['auto', 'Auto'], ['aucune', 'Aucune']], (w) => set({ navRoom: w }))}
            </View>
          )}
          <View style={[styles.boxS, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>Largeur des voies</Text>
            {chips<StripWidth>(prefs.width, [['compact', 'Compact'], ['normal', 'Normal'], ['large', 'Large']], (w) => set({ width: w }))}
          </View>
          <Text style={[styles.kicker, { color: theme.muted, marginTop: 4 }]}>APERÇU · {theme.name}</Text>
          <StylePreview theme={theme} />
        </View>
        <View style={{ flex: 1.05, gap: 8 }}>
          <Text style={[styles.kicker, { color: theme.muted }]}>CONNEXION</Text>
          <ConnectionScreen client={props.client} theme={theme} onDisconnect={props.onDisconnect} compact />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader theme={theme} title="Réglages" sub={part === 'look' ? 'L’allure de l’appli et le confort' : 'La liaison avec la table et les sauvegardes'}>
        <Segmented theme={theme} value={part} onChange={setPart} options={[['look', 'Apparence'], ['conn', 'Connexion']] as const} />
      </ScreenHeader>
      {part === 'conn' ? (
        <ConnectionScreen client={props.client} theme={theme} onDisconnect={props.onDisconnect} />
      ) : (
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>
          <LevelBox theme={theme} prefs={prefs} set={set} />
          <Text style={[styles.kicker, { color: theme.muted }]}>DESIGN · touche pour essayer</Text>
          <View style={styles.grid}>
            {THEME_ORDER.map((id) => {
              const t = THEMES[id];
              const on = prefs.theme === id;
              return (
                <Pressable key={id} onPress={() => props.onPrefs({ ...prefs, theme: id })} accessibilityState={{ selected: on }} accessibilityLabel={`Design ${t.name}`} style={[styles.card, { width: `${100 / cols - 2}%`, backgroundColor: t.bg, borderColor: on ? theme.accent : t.line }]}>
                  <View style={[styles.mini, { backgroundColor: t.panel, borderColor: t.line }]}>
                    <Knob value={0.62} size={40} theme={t} color={t.accent} />
                    <View style={{ width: 40, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ position: 'absolute', width: 4, top: 4, bottom: 4, borderRadius: 2, backgroundColor: t.track }} />
                      <View style={{ position: 'absolute', width: 4, bottom: 4, height: 30, borderRadius: 2, backgroundColor: t.accent }} />
                      <View style={{ position: 'absolute', bottom: 26, width: t.look === 'minimal' ? 22 : 26, height: t.look === 'minimal' ? 5 : 14, borderRadius: 3, backgroundColor: t.look === 'neon' ? t.bg : t.cap, borderWidth: t.look === 'neon' ? 1.5 : 0, borderColor: t.accent }} />
                    </View>
                    <View style={{ gap: 4 }}>
                      <View style={{ width: 30, height: 12, borderRadius: 3, backgroundColor: t.mute }} />
                      <View style={{ width: 30, height: 12, borderRadius: 3, borderWidth: 1, borderColor: t.accent }} />
                      <View style={{ width: 30, height: 12, borderRadius: 3, backgroundColor: t.ok }} />
                    </View>
                  </View>
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '800' }}>{on ? '✓ ' : ''}{t.name}</Text>
                  <Text numberOfLines={2} style={{ color: t.muted, fontSize: 11 }}>{t.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          <LangPicker theme={theme} />
          <Text style={[styles.kicker, { color: theme.muted }]}>CONFORT</Text>
          <View style={[styles.box, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Vibration au passage du 0 dB</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>Comme le cran d’un vrai potentiomètre, sur les curseurs de volume (faders) et la force du micro (gain).</Text>
              </View>
              <Switch value={prefs.haptics} onValueChange={(v) => props.onPrefs({ ...prefs, haptics: v })} />
            </View>
            {canImmersive && (
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Cacher les boutons de la tablette</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Plein écran : les boutons Android reviennent d’un glissement depuis le bord.</Text>
                </View>
                <Switch value={prefs.immersive !== false} onValueChange={(v) => props.onPrefs({ ...prefs, immersive: v })} />
              </View>
            )}
            {Platform.OS === 'android' && (
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Place pour les boutons Android</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Si les boutons ▢ ◯ ◁ passent sur l’appli, laisse « Garder la place ».</Text>
                </View>
                {([['garde', 'Garder la place'], ['auto', 'Auto'], ['aucune', 'Aucune']] as [NavRoom, string][]).map(([w, l]) => {
                  const on = (prefs.navRoom ?? 'garde') === w;
                  return (
                    <Pressable key={w} onPress={() => props.onPrefs({ ...prefs, navRoom: w })} accessibilityState={{ selected: on }} style={[styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                      <Text style={{ color: on ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Largeur des voies</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>Compact pour voir les 16 voies, large pour les doigts.</Text>
              </View>
              {(['compact', 'normal', 'large'] as StripWidth[]).map((w) => (
                <Pressable key={w} onPress={() => props.onPrefs({ ...prefs, width: w })} accessibilityState={{ selected: prefs.width === w }} style={[styles.chip, prefs.width === w ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                  <Text style={{ color: prefs.width === w ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{w === 'compact' ? 'Compact' : w === 'normal' ? 'Normal' : 'Large'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={[styles.side, wide ? { width: 210, borderLeftWidth: 1 } : { flexDirection: 'row', borderTopWidth: 1 }, { borderColor: theme.line, backgroundColor: theme.panel }]}>
          <Text style={[styles.kicker, { color: theme.muted }]}>APERÇU</Text>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{theme.name}</Text>
          <LivePreview theme={theme} small={!wide} />
        </View>
        </View>
      )}
    </View>
  );
}

/** Un design en vignette : bouton, fader, couleurs — dans ses propres couleurs. */
function ThemeCard({ t, on, accent, onPress }: { t: Theme; on: boolean; accent: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: on }} accessibilityLabel={`Design ${t.name}`} style={[styles.tcard, { backgroundColor: t.bg, borderColor: on ? accent : t.line }]}>
      <View style={[styles.tmini, { backgroundColor: t.panel, borderColor: t.line }]}>
        <Knob value={0.62} size={30} theme={t} color={t.accent} />
        <View style={{ width: 22, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: 3, top: 3, bottom: 3, borderRadius: 2, backgroundColor: t.track }} />
          <View style={{ position: 'absolute', width: 3, bottom: 3, height: 18, borderRadius: 2, backgroundColor: t.accent }} />
          <View style={{ position: 'absolute', bottom: 16, width: 18, height: t.look === 'minimal' ? 4 : 9, borderRadius: 2, backgroundColor: t.look === 'neon' ? t.bg : t.cap, borderWidth: t.look === 'neon' ? 1.5 : 0, borderColor: t.accent }} />
        </View>
        <View style={{ gap: 3 }}>
          <View style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: t.mute }} />
          <View style={{ width: 20, height: 8, borderRadius: 2, borderWidth: 1, borderColor: t.accent }} />
          <View style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: t.ok }} />
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: '800' }}>{on ? '✓ ' : ''}{t.name}</Text>
    </Pressable>
  );
}

/** Un potentiomètre (tourne-le), une prise de la table, une voie : le design choisi, en vrai. */
function StylePreview({ theme }: { theme: Theme }) {
  const [g, setG] = useState(0.6);
  const [v, setV] = useState(0.72);
  const jack = (n: number, name: string, c: string, on: boolean) => (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: c, backgroundColor: theme.deep, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#0B0D10', borderWidth: 2, borderColor: on ? c : theme.line2, alignItems: 'center', justifyContent: 'center' }}>
          {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />}
        </View>
      </View>
      <View style={{ backgroundColor: c, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ color: '#0B0D10', fontSize: 9, fontWeight: '900' }}>{n} · {name}</Text></View>
    </View>
  );
  return (
    <View style={[styles.boxS, { paddingVertical: 14, backgroundColor: theme.bg, borderColor: theme.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }]}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Knob value={g} size={60} theme={theme} color={theme.accent} onChange={setG} label="Gain (aperçu)" />
        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{`${Math.round(g * 72 - 12) > 0 ? '+' : ''}${Math.round(g * 72 - 12)} dB`}</Text>
        <Text style={{ color: theme.muted, fontSize: 9 }}>tourne-le</Text>
      </View>
      <View style={{ gap: 10 }}>
        {jack(1, 'Voix', '#F59E0B', true)}
        {jack(2, 'Guit.', '#34D399', false)}
      </View>
      <Fader value={v} onChange={(x) => setV(Math.max(0, Math.min(1, x)))} color={theme.accent} theme={theme} height={150} label="Fader (aperçu)" meter={0.5} />
    </View>
  );
}

function LivePreview({ theme, small }: { theme: Theme; small?: boolean }) {
  const [g, setG] = useState(0.55);
  const [v, setV] = useState(0.75);
  const [p, setP] = useState(0.5);
  return (
    <View style={[styles.strip, { backgroundColor: theme.bg, borderColor: theme.line }]}>
      <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '800' }}>PRISE 1 · MICRO</Text>
      <Knob value={g} size={64} theme={theme} color={'#F472B6'} onChange={setG} label="Gain (aperçu)" />
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{`${Math.round(g * 72 - 12) > 0 ? '+' : ''}${Math.round(g * 72 - 12)} dB`}</Text>
      <Knob value={p} size={36} theme={theme} color={theme.muted} center onChange={setP} label="Pan (aperçu)" />
      <View style={{ backgroundColor: theme.deep, borderBottomWidth: 3, borderBottomColor: '#F472B6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Voix</Text>
      </View>
      <Fader value={v} onChange={(x) => setV(Math.max(0, Math.min(1, x)))} color={theme.accent} theme={theme} height={small ? 120 : 200} label="Fader (aperçu)" meter={0.55} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 40, paddingHorizontal: 14, paddingBottom: 8, gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, alignSelf: 'flex-start' },
  segBtn: { height: 40, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  side: { padding: 12, gap: 8, alignItems: 'center' },
  preview: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 18, alignItems: 'center' },
  strip: { width: 116, borderWidth: 1, borderRadius: 14, padding: 8, alignItems: 'center', gap: 6 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderWidth: 2, borderRadius: 16, padding: 10, gap: 6, minWidth: 150, flexGrow: 1 },
  mini: { borderWidth: 1, borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  box: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tcard: { width: '23.8%', borderWidth: 2, borderRadius: 12, padding: 6, gap: 4 },
  tmini: { borderWidth: 1, borderRadius: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  boxS: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  chipS: { height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  chip: { height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
});
