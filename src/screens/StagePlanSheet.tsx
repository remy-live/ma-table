// Plan de scène à partager : qui est branché où (prise, micro, 48 V) et ce
// qu'entend chaque retour. Une page claire à montrer, et un texte à envoyer
// au groupe ou à l'ingé son de la salle (SMS, WhatsApp, mail…).
import React, { useEffect } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { Theme } from '../ui/theme';
import { chLevelPath, chNamePath, insrcPath, insrcPlug, MODEL, phantomPath, sourceKind } from '../xair/addresses';
import { faderToDb } from '../xair/levels';
import { chColor } from '../xair/smartName';
import { outlets, wiringPaths } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { load } from '../store/persist';
import { EMPTY, endLabel, gearText, Stage } from '../store/stage';
import { StageEditor } from './StageEditor';

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

/** Le plan de scène = l'éditeur à blocs (les mêmes données que Branchements › Scène).
 *  « Partager » envoie tout : prises, qui entend quoi, câbles et matériel à emporter. */
export function StagePlanSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  useEffect(() => { if (visible) client.loadPaths(wiringPaths()); }, [client, visible]);
  if (!visible) return null;
  const share = async () => {
    const st = await load<Stage>('scene', EMPTY);
    const cables = (st ?? EMPTY).cables.map((c) => `  ${endLabel(st, c.a)} → ${endLabel(st, c.b)} · ${c.type === 'xlr' ? 'XLR' : 'jack'}`);
    const text = [stagePlanText(client).replace('\n\nFait avec Ma table', ''), '', ...(cables.length ? ['CÂBLES', ...cables, ''] : []), gearText(st ?? EMPTY), '', 'Fait avec Ma table'].join('\n');
    Share.share({ message: text, title: 'Plan de scène' });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>Plan de scène</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>Déplace les blocs, relie-les · le même plan que Branchements › Scène</Text>
          </View>
          <Pressable onPress={share} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>↗ Partager tout</Text></Pressable>
          <Pressable onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Fermer</Text></Pressable>
        </View>
        <View style={{ flex: 1, marginHorizontal: -10 }}>
          <StageEditor client={client} theme={theme} />
        </View>
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
