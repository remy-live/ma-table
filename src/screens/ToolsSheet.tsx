// Menu « Outils » de la table : tout ce qui n'est pas un fader.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';

export type Tool = 'soirees' | 'branchements' | 'auto' | 'guide' | 'effets' | 'presets' | 'groupes' | 'theme';

const ITEMS: [Tool, string, string, string][] = [
  ['auto', 'Balance automatique', 'Chacun son tour, puis tous ensemble : l’appli règle', '#22C55E'],
  ['guide', 'Mode guidé', 'Installer un concert pas à pas, en 5 étapes', '#34D399'],
  ['effets', 'Effets de la table', 'Réverbes, échos, chorus · recettes prêtes · tap tempo', '#C084FC'],
  ['presets', 'Préréglages', 'Par instrument, avec variantes · mes réglages', '#F59E0B'],
  ['branchements', 'Branchements', 'La face arrière de la table, les fils, qui entend quoi', '#60A5FA'],
  ['groupes', 'Groupes', 'Batterie, Guitares… monter plusieurs voies d’un coup', '#FBBF24'],
  ['soirees', 'Mes soirées', 'Enregistrer, nouvelle soirée, reprendre, sauvegardes', '#34D399'],
  ['theme', 'Changer de thème', 'Nuit · Scène ambre · Plein jour', '#9AA3AD'],
];

export function ToolsSheet(props: { theme: Theme; visible: boolean; onClose: () => void; onPick: (t: Tool) => void }) {
  const { theme } = props;
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.back} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Outils</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {ITEMS.map(([id, title, sub, c]) => (
              <Pressable key={id} onPress={() => props.onPick(id)} style={[styles.item, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: c }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{sub}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, paddingBottom: 34, maxHeight: '85%' },
  item: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 64, alignItems: 'center' },
});
