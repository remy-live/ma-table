// Créer / modifier les groupes : un nom, et les voies qui en font partie.
// Stocké dans la table elle-même (groupes DCA 1 à 4).
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { i, s } from '../osc/osc';
import { CH_COUNT, chDcaPath, chNamePath, DCA_COUNT, dcaNamePath, inDca, toggleDca } from '../xair/addresses';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { GROUP_COLOR, RenameSheet } from '../ui/Strip';
import { Theme } from '../ui/theme';

const GROUP_NAMES = ['Batterie', 'Guitares', 'Voix', 'Choeurs', 'Claviers', 'Percus'];

export function GroupsSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [k, setK] = useState(1);
  const [renaming, setRenaming] = useState(false);
  const name = String(useParam<string>(client, dcaNamePath(k), '')) || `Groupe ${k}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.text }]}>Groupes</Text>
          <Pressable onPress={onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>
        <Text style={{ color: theme.muted, fontSize: 13 }}>
          Un groupe monte et baisse ses voies d'un bloc. Il est enregistré dans la table.
        </Text>

        <View style={styles.tabs}>
          {Array.from({ length: DCA_COUNT }, (_, n) => n + 1).map((g) => (
            <GroupTab key={g} client={client} k={g} active={g === k} theme={theme} onPress={() => setK(g)} />
          ))}
        </View>

        <Pressable onPress={() => setRenaming(true)} style={[styles.nameRow, { backgroundColor: theme.panel }]}>
          <Text style={{ color: GROUP_COLOR, fontSize: 18, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>Renommer</Text>
        </Pressable>

        <Text style={[styles.section, { color: theme.muted }]}>VOIES DU GROUPE</Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {Array.from({ length: CH_COUNT }, (_, n) => n + 1).map((ch) => (
            <MemberChip key={ch} client={client} ch={ch} k={k} theme={theme} />
          ))}
        </ScrollView>

        <RenameSheet
          visible={renaming}
          initial={name}
          title={`Nom du groupe ${k}`}
          theme={theme}
          suggestions={GROUP_NAMES}
          onClose={() => setRenaming(false)}
          onSave={(t) => {
            client.set(dcaNamePath(k), s(t.slice(0, 12)));
            setRenaming(false);
          }}
        />
      </View>
    </Modal>
  );
}

function GroupTab({ client, k, active, theme, onPress }: { client: XAirClient; k: number; active: boolean; theme: Theme; onPress: () => void }) {
  const name = String(useParam<string>(client, dcaNamePath(k), '')) || `Groupe ${k}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={[styles.tab, active ? { backgroundColor: GROUP_COLOR } : { borderColor: theme.line2, borderWidth: 1 }]}
    >
      <Text style={{ color: active ? '#1A1204' : theme.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

function MemberChip({ client, ch, k, theme }: { client: XAirClient; ch: number; k: number; theme: Theme }) {
  const mask = Number(useParam<number>(client, chDcaPath(ch), 0));
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const on = inDca(mask, k);
  return (
    <Pressable
      onPress={() => client.set(chDcaPath(ch), i(toggleDca(mask, k)))}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.member, on ? { backgroundColor: '#2A2115', borderColor: GROUP_COLOR } : { backgroundColor: theme.panel, borderColor: theme.line }]}
    >
      <Text style={{ color: on ? '#FCD34D' : theme.muted, fontSize: 11 }}>CH {ch}</Text>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, paddingTop: 56, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 14, minHeight: 56 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 40 },
  member: { width: '31%', minHeight: 56, borderRadius: 12, borderWidth: 1, padding: 8, justifyContent: 'center' },
});
