// Plan de scène à partager : qui est branché où (prise, micro, 48 V) et ce
// qu'entend chaque retour. Une page claire à montrer, et un texte à envoyer
// au groupe ou à l'ingé son de la salle (SMS, WhatsApp, mail…).
import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import { chLevelPath, chNamePath, insrcPath, insrcPlug, MODEL, phantomPath, sourceKind } from '../xair/addresses';
import { faderToDb } from '../xair/levels';
import { chColor } from '../xair/smartName';
import { outlets, wiringPaths } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { MIX_COLORS } from './MixPicker';

const CHS = Array.from({ length: 16 }, (_, k) => k + 1);

export function stagePlan(client: XAirClient) {
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '').trim();
  const inputs = CHS.filter((c) => name(c)).map((c) => {
    const insrc = Number(client.get(insrcPath(c)) ?? c - 1);
    const p48 = Number(client.get(phantomPath(c)) ?? 0) === 1;
    return { ch: c, name: name(c), plug: insrcPlug(insrc), kind: sourceKind(insrc, p48) };
  });
  const outs = outlets(client).map((o) => ({
    o,
    hears: inputs
      .map((i) => ({ ...i, db: faderToDb(Number(client.get(chLevelPath(i.ch, o.t)) ?? 0)) }))
      .filter((i) => isFinite(i.db) && i.db > -40)
      .sort((a, b) => b.db - a.db),
  }));
  return { inputs, outs };
}

export function stagePlanText(client: XAirClient): string {
  const { inputs, outs } = stagePlan(client);
  const lines = [`PLAN DE SCÈNE · ${MODEL.name}`, '', 'ENTRÉES'];
  inputs.forEach((i) => lines.push(`  Prise ${i.plug} · ${i.name} · ${i.kind}`));
  lines.push('', 'SORTIES');
  outs.forEach(({ o, hears }) => lines.push(`  ${o.label} · ${o.name}${hears.length ? ' : ' + hears.map((h) => h.name).join(', ') : ' : rien'}`));
  lines.push('', 'Fait avec Ma table');
  return lines.join('\n');
}

export function StagePlanSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  useAnyTick(client, 300);
  const wide = useWindowDimensions().width >= 900;
  useEffect(() => { if (visible) client.loadPaths(wiringPaths()); }, [client, visible]);
  if (!visible) return null;
  const { inputs, outs } = stagePlan(client);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>Plan de scène</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>Qui est branché où, et qui entend quoi · à envoyer au groupe ou à la salle</Text>
          </View>
          <Pressable onPress={() => Share.share({ message: stagePlanText(client), title: 'Plan de scène' })} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>↗ Partager</Text></Pressable>
          <Pressable onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Fermer</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ flexDirection: wide ? 'row' : 'column', gap: 14, paddingBottom: 12 }}>
          <View style={[styles.col, { borderColor: theme.line, backgroundColor: theme.panel }]}>
            <Text style={[styles.kicker, { color: theme.muted }]}>ENTRÉES · {inputs.length}</Text>
            {inputs.map((i) => (
              <View key={i.ch} style={styles.row}>
                <View style={[styles.plug, { borderColor: chColor(client, i.ch) }]}><Text style={{ color: theme.text, fontWeight: '900' }}>{i.plug}</Text></View>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{i.name}</Text>
                <Text style={{ color: i.kind === 'Micro 48V' ? '#F87171' : theme.muted, fontSize: 12, fontWeight: '700' }}>{i.kind}</Text>
              </View>
            ))}
            {!inputs.length && <Text style={{ color: theme.muted }}>Aucune voie nommée : donne un nom aux voies (Table › touche un nom).</Text>}
          </View>
          <View style={[styles.col, { borderColor: theme.line, backgroundColor: theme.panel }]}>
            <Text style={[styles.kicker, { color: theme.muted }]}>SORTIES · QUI ENTEND QUOI</Text>
            {outs.map(({ o, hears }) => {
              const c = o.t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(o.t as { n: number }).n] ?? '#9AA3AD';
              return (
                <View key={o.id} style={{ gap: 6, paddingVertical: 4 }}>
                  <View style={styles.row}>
                    <View style={[styles.plug, { borderColor: c, width: 'auto', paddingHorizontal: 8 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 12 }}>{o.label.replace('MAIN L/R', 'MAIN')}</Text></View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{o.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 8 }}>
                    {hears.length ? hears.map((h) => (
                      <View key={h.ch} style={[styles.chip, { backgroundColor: chColor(client, h.ch) }]}><Text style={{ color: '#0B0D10', fontWeight: '800', fontSize: 12 }}>{h.name}</Text></View>
                    )) : <Text style={{ color: theme.muted, fontSize: 12 }}>rien</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40, paddingHorizontal: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: { height: 48, paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  col: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plug: { minWidth: 40, height: 36, borderRadius: 10, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
});
