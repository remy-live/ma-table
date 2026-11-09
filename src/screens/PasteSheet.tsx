// Coller les réglages copiés : quoi, et sur quelles voies.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, Category, Clip } from '../xair/clipboard';
import { CH_COUNT, chNamePath } from '../xair/addresses';
import { XAirClient } from '../xair/XAirClient';
import { Theme } from '../ui/theme';

const DEFAULT: Category[] = ['eq', 'dyn', 'fx'];

export function PasteSheet(props: {
  client: XAirClient;
  clip: Clip | null;
  visible: boolean;
  preselect: number | null;
  theme: Theme;
  onClose: () => void;
  onPaste: (targets: number[], cats: Category[]) => void;
}) {
  const { client, clip, theme } = props;
  const [cats, setCats] = useState<Category[]>(DEFAULT);
  const [targets, setTargets] = useState<number[]>([]);
  useEffect(() => {
    if (props.visible) setTargets(props.preselect && clip && props.preselect !== clip.from ? [props.preselect] : []);
  }, [props.visible]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clip) return null;
  const name = (ch: number) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.panel }]}>
          <Text style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>
            Coller les réglages de {name(clip.from)} (CH {clip.from})
          </Text>
          <Text style={[styles.section, { color: theme.muted }]}>QUOI</Text>
          <View style={styles.grid}>
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCats((a) => toggle(a, c.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.opt, on ? { backgroundColor: '#2A2115', borderColor: theme.accent } : { borderColor: theme.line2 }]}
                >
                  <Text style={{ color: on ? '#FCD34D' : theme.text, fontSize: 13, fontWeight: '700' }}>
                    {on ? '✓ ' : '○ '}
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.section, { color: theme.muted }]}>SUR QUELLES VOIES</Text>
          <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={styles.chips}>
            {Array.from({ length: CH_COUNT }, (_, k) => k + 1)
              .filter((ch) => ch !== clip.from)
              .map((ch) => {
                const on = targets.includes(ch);
                return (
                  <Pressable
                    key={ch}
                    onPress={() => setTargets((a) => toggle(a, ch))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}
                  >
                    <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 13, fontWeight: '600' }}>
                      CH {ch} · {name(ch)}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={props.onClose} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
              <Text style={{ color: theme.text, fontWeight: '600', fontSize: 15 }}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={() => targets.length && cats.length && props.onPaste(targets, cats)}
              style={[styles.btn, { flex: 1.5, backgroundColor: theme.accent, opacity: targets.length && cats.length ? 1 : 0.5 }]}
            >
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>
                {targets.length ? `Coller sur ${targets.length} voie${targets.length > 1 ? 's' : ''}` : 'Choisis des voies'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, gap: 10 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { width: '48.5%', minHeight: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
