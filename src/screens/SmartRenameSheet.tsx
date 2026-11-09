// Renommer une voie : le nom reconnu propose couleur, groupe et préréglage.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { i } from '../osc/osc';
import { phantomPath } from '../xair/addresses';
import { applySmartName, colorOf, recognize } from '../xair/smartName';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { Theme } from '../ui/theme';

const QUICK = ['Voix', 'Guitare', 'Basse', 'Kick', 'Caisse claire', 'Charley', 'Toms', 'Overhead', 'Clavier'];

export function SmartRenameSheet({ client, ch, theme, onClose }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void }) {
  return (
    <Modal visible={ch !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>{ch !== null && <Body client={client} ch={ch} theme={theme} onClose={onClose} />}</View>
    </Modal>
  );
}

function Body({ client, ch, theme, onClose }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void }) {
  const current = String(useParam<string>(client, `/ch/${String(ch).padStart(2, '0')}/config/name`, ''));
  const [text, setText] = useState(current);
  const [off, setOff] = useState<Record<string, boolean>>({});
  useEffect(() => setText(current), [ch]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = recognize(text);
  const color = rec ? colorOf(rec.color) : theme.line2;

  const options = rec
    ? ([
        ['color', `Couleur et nom « ${rec.label} »`, 'Même couleur partout dans l’appli'],
        rec.group ? ['group', `Ajouter au groupe ${rec.group}`, 'Le groupe se crée s’il n’existe pas'] : null,
        rec.preset ? ['preset', `Préréglage ${rec.preset}`, 'Égaliseur, coupe-bas, gate, compresseur, effets'] : null,
        rec.phantom ? ['p48', 'Proposer le 48 V', 'Micro statique probable : confirmation demandée'] : null,
      ].filter(Boolean) as [string, string, string][])
    : [];
  const n = options.filter(([k]) => !off[k]).length;

  const apply = () => {
    applySmartName(client, ch, text.trim() || `Voie ${ch}`, rec, { color: !off.color, group: !off.group, preset: !off.preset });
    if (rec?.phantom && !off.p48) {
      Alert.alert('Activer le 48 V ?', 'Seulement pour un micro statique ou une DI active. Baisse le volume avant, ça peut claquer.', [
        { text: 'Non', style: 'cancel' },
        { text: 'Activer', onPress: () => client.set(phantomPath(ch), i(1)) },
      ]);
    }
    onClose();
  };

  return (
    <View style={[styles.sheet, { backgroundColor: theme.panel }]}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Renommer CH {ch}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={12}
        autoFocus
        placeholder="Ce qui est branché (ex. Kick)"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: color, backgroundColor: theme.deep }]}
      />
      <View style={styles.chips}>
        {QUICK.map((q) => (
          <Pressable key={q} onPress={() => setText(q)} style={[styles.chip, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontSize: 13 }}>{q}</Text>
          </Pressable>
        ))}
      </View>
      {rec ? (
        <View style={[styles.card, { borderColor: color, backgroundColor: theme.deep }]}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Reconnu : {rec.label}</Text>
          {options.map(([k, title, sub]) => {
            const on = !off[k];
            return (
              <Pressable
                key={k}
                onPress={() => setOff((o) => ({ ...o, [k]: !o[k] }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.opt}
              >
                <View style={[styles.box, { backgroundColor: on ? color : theme.line }]}>
                  <Text style={{ color: '#111', fontWeight: '900' }}>{on ? '✓' : ''}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{title}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: theme.muted, fontSize: 12 }}>Nom libre : seule l’étiquette change. Les noms connus règlent aussi couleur, groupe et préréglage.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={onClose} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 15 }}>Annuler</Text>
        </Pressable>
        <Pressable onPress={apply} style={[styles.btn, { flex: 1.6, backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>
            {rec && n ? `Renommer + ${n} réglage${n > 1 ? 's' : ''}` : 'Renommer'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, gap: 12 },
  input: { height: 54, borderRadius: 12, borderWidth: 2, paddingHorizontal: 14, fontSize: 19, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
