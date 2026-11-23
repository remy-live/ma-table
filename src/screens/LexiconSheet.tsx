// « Les mots de la table » : le mot simple et le mot technique côte à côte,
// avec une phrase d'explication. On cherche dans les deux sens.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import { TERMS, useLevel } from '../ui/words';

export function LexiconSheet({ theme, visible, onClose }: { theme: Theme; visible: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [byTech, setByTech] = useState(false);
  const big = useLevel().big;
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = Object.values(TERMS)
    .filter((t) => !q || norm(`${t.simple} ${t.tech} ${t.help}`).includes(norm(q)))
    .sort((a, b) => (byTech ? a.tech.localeCompare(b.tech) : a.simple.localeCompare(b.simple)));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>📖</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Les mots de la table</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Partout dans l’appli : reste appuyé sur un bouton pour avoir son explication.</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Chercher un mot" placeholderTextColor={theme.muted} autoCapitalize="none" style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
            <Pressable onPress={() => setByTech((v) => !v)} style={[styles.sort, { borderColor: theme.accent }]}>
              <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 12 }}>{byTech ? 'Technique → simple' : 'Simple → technique'}</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
            {list.map((t) => (
              <View key={t.tech} style={[styles.row, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                <Text style={{ color: theme.text, fontSize: big ? 18 : 16, fontWeight: '800' }}>
                  {byTech ? t.tech : t.simple}
                  <Text style={{ color: theme.accent, fontSize: big ? 15 : 13, fontWeight: '700' }}>{'  =  '}{byTech ? t.simple : t.tech}</Text>
                </Text>
                <Text style={{ color: theme.muted, fontSize: big ? 15 : 13, lineHeight: big ? 21 : 18 }}>{t.help}</Text>
              </View>
            ))}
            {list.length === 0 && <Text style={{ color: theme.muted }}>Aucun mot trouvé.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 640, borderRadius: 20, borderWidth: 1, padding: 16, gap: 10, maxHeight: '94%' },
  input: { flexGrow: 1, flexBasis: 200, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  sort: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, minHeight: 40, justifyContent: 'center' },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
});
