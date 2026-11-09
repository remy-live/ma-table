// « Quelle prise arrive sur cette voie ? » : choisir la prise à l'arrière
// (1 à 16) ou le son de l'ordinateur (17/18). Les réglages de la voie restent.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { i } from '../osc/osc';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath, INSRC_COUNT, insrcLabel, insrcPath, MODEL } from '../xair/addresses';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';

export function InputSourceSheet(props: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void }) {
  return (
    <Modal visible={props.ch !== null} transparent animationType="fade" onRequestClose={props.onClose}>
      {props.ch !== null && <Body {...props} ch={props.ch} />}
    </Modal>
  );
}

function Body({ client, ch, theme, onClose }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void }) {
  const cur = Number(useParam<number>(client, insrcPath(ch), ch - 1));
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  // Qui utilise déjà cette prise ? (pour prévenir, pas pour interdire)
  const usedBy = (src: number) => Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => c !== ch && Number(client.get(insrcPath(c)) ?? c - 1) === src);
  return (
    <Pressable style={styles.back} onPress={onClose}>
      <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Quelle prise arrive sur « {name} » ?</Text>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
          Sur la {MODEL.name}, chaque voie peut écouter n’importe quelle prise de l’arrière, ou le son de l’ordinateur (USB). L’EQ, les effets et les envois de la voie restent.
        </Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {Array.from({ length: INSRC_COUNT }, (_, k) => k).map((src) => {
            const on = src === cur;
            const others = usedBy(src);
            const preamp = src < MODEL.preamps;
            return (
              <Pressable
                key={src}
                onPress={() => {
                  client.set(insrcPath(ch), i(src));
                  onClose();
                }}
                accessibilityState={{ selected: on }}
                style={[styles.cell, { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? '#1F1C14' : theme.deep }]}
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{insrcLabel(src)}</Text>
                <Text style={{ color: others.length ? '#FCD34D' : theme.muted, fontSize: 10 }}>{others.length ? `aussi voie ${others.join(', ')}` : src >= 16 ? 'ordinateur' : preamp ? 'micro / ligne' : 'ligne'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={{ color: theme.muted, fontSize: 11 }}>Adresse de la table à confirmer avec le rapport de débogage si le choix ne prend pas.</Text>
        <Pressable onPress={onClose} style={[styles.close, { borderColor: theme.line2 }]}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>Fermer</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 10, maxHeight: '90%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '30%', flexGrow: 1, minHeight: 56, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  close: { height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
