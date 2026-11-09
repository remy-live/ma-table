// Réglages : le design (10 au choix, avec aperçu vivant), le confort
// (vibration, largeur des voies), puis la connexion, le réseau et le débogage.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { Fader } from '../ui/Fader';
import { Knob } from '../ui/Knob';
import { Theme, THEME_ORDER, THEMES } from '../ui/theme';
import { XAirClient } from '../xair/XAirClient';
import { ConnectionScreen } from './ConnectionScreen';

export type StripWidth = 'compact' | 'normal' | 'large';
export const STRIP_WIDTHS: Record<StripWidth, number> = { compact: 80, normal: 92, large: 116 };

export interface Prefs {
  theme: string;
  haptics: boolean;
  width: StripWidth;
}

export function SettingsScreen(props: { client: XAirClient; theme: Theme; prefs: Prefs; onPrefs: (p: Prefs) => void; onDisconnect: () => void }) {
  const { theme, prefs } = props;
  const [part, setPart] = useState<'look' | 'conn'>('look');
  const { width } = useWindowDimensions();
  const cols = width > 900 ? 5 : width > 600 ? 3 : 2;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Réglages</Text>
        <View style={[styles.seg, { borderColor: theme.line2 }]}>
          {([['look', 'Apparence'], ['conn', 'Connexion et réseau']] as const).map(([id, l]) => (
            <Pressable key={id} onPress={() => setPart(id)} accessibilityState={{ selected: part === id }} style={[styles.segBtn, part === id && { backgroundColor: theme.accent }]}>
              <Text style={{ color: part === id ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {part === 'conn' ? (
        <ConnectionScreen client={props.client} theme={theme} onDisconnect={props.onDisconnect} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}>
          <View style={[styles.preview, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <LivePreview theme={theme} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>DESIGN ACTUEL</Text>
              <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{theme.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 13 }}>{theme.desc}</Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>L’aperçu est vivant : tourne le bouton, glisse le fader. Touche un design ci-dessous pour l’essayer.</Text>
            </View>
          </View>

          <Text style={[styles.kicker, { color: theme.muted }]}>10 DESIGNS</Text>
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

          <Text style={[styles.kicker, { color: theme.muted }]}>CONFORT</Text>
          <View style={[styles.box, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Vibration au passage du 0 dB</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>Comme le cran d’un vrai potentiomètre, sur les faders et le gain.</Text>
              </View>
              <Switch value={prefs.haptics} onValueChange={(v) => props.onPrefs({ ...prefs, haptics: v })} />
            </View>
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
      )}
    </View>
  );
}

function LivePreview({ theme }: { theme: Theme }) {
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
      <Fader value={v} onChange={(x) => setV(Math.max(0, Math.min(1, x)))} color={theme.accent} theme={theme} height={190} label="Fader (aperçu)" meter={0.55} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 48, paddingHorizontal: 14, paddingBottom: 8, gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, alignSelf: 'flex-start' },
  segBtn: { height: 40, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  preview: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 18, alignItems: 'center' },
  strip: { width: 116, borderWidth: 1, borderRadius: 14, padding: 8, alignItems: 'center', gap: 6 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderWidth: 2, borderRadius: 16, padding: 10, gap: 6, minWidth: 150, flexGrow: 1 },
  mini: { borderWidth: 1, borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  box: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
});
