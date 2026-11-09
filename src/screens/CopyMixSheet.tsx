// « Copier un mix » en trois gestes, tout cliquable directement :
//   1. ce qu'entend QUI (une personne)
//   2. pour le donner à QUI (une ou plusieurs)
//   3. quelles voies (toutes cochées ; un appui décoche)
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dbLabel } from '../ui/format';
import { readInset } from '../ui/immersive';
import { Btn, Kicker, SEM } from '../ui/kit';
import { Theme } from '../ui/theme';
import { allTargets, CH_COUNT, chLevelPath, chNamePath, Target, targetId } from '../xair/addresses';
import { copyMix } from '../xair/groups';
import { colorOf } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { safetyBackup } from '../store/sessions';
import { mixInfo } from './MixPicker';

const ALL = Array.from({ length: CH_COUNT }, (_, k) => k + 1);

export function CopyMixSheet(props: { client: XAirClient; theme: Theme; visible: boolean; dst: Target; onClose: () => void; onDone: (msg: string) => void }) {
  const { client, theme } = props;
  const mixes = allTargets().filter((t) => t.kind !== 'fx');
  const [src, setSrc] = useState<string>('main');
  const [dsts, setDsts] = useState<string[]>([]);
  const named = ALL.filter((c) => String(client.get(chNamePath(c)) ?? ''));
  const list = named.length ? named : ALL;
  const [picked, setPicked] = useState<number[]>(list);
  useEffect(() => {
    if (!props.visible) return;
    const cur = targetId(props.dst);
    // on part du cas le plus courant : le public → le retour affiché
    setSrc('main');
    setDsts(cur === 'main' ? [] : [cur]);
    setPicked(list);
  }, [props.visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = (id: string) => mixes.find((t) => targetId(t) === id)!;
  const srcT = byId(src) ?? mixes[0];
  const srcInfo = mixInfo(client, srcT);
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const targets = dsts.filter((d) => d !== src);
  const ready = targets.length > 0 && picked.length > 0;
  const go = async () => {
    await safetyBackup(client, 'avant de copier un mix').catch(() => null);
    targets.forEach((d) => copyMix(client, srcT, byId(d), picked));
    props.onDone('copié');
    props.onClose();
  };
  const Person = ({ t, on, onPress, disabled }: { t: Target; on: boolean; onPress: () => void; disabled?: boolean }) => {
    const m = mixInfo(client, t);
    return (
      <Pressable onPress={disabled ? undefined : onPress} accessibilityState={{ selected: on, disabled: !!disabled }} style={[styles.chip, { borderColor: m.color, backgroundColor: on ? m.color : 'transparent', opacity: disabled ? 0.25 : 1 }]}>
        <Text numberOfLines={1} style={{ color: on ? SEM.ink : theme.text, fontWeight: '800', fontSize: 13 }}>{on ? '✓ ' : ''}{t.kind === 'main' ? '👥 ' : '🎧 '}{m.name}</Text>
      </Pressable>
    );
  };
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={[styles.scrim, { paddingBottom: 20 + readInset() }]} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: srcInfo.color }]} onPress={() => {}}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Copier un mix</Text>

          <Kicker theme={theme}>1 · JE PRENDS CE QU’ENTEND… (un seul)</Kicker>
          <View style={styles.wrap}>
            {mixes.map((t) => <Person key={targetId(t)} t={t} on={targetId(t) === src} onPress={() => { setSrc(targetId(t)); setDsts((d) => d.filter((x) => x !== targetId(t))); }} />)}
          </View>

          <Kicker theme={theme}>2 · …ET JE LE DONNE À (un ou plusieurs)</Kicker>
          <View style={styles.wrap}>
            {mixes.map((t) => { const id = targetId(t); return <Person key={id} t={t} disabled={id === src} on={id !== src && dsts.includes(id)} onPress={() => setDsts((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))} />; })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}><Kicker theme={theme}>3 · POUR CES VOIES (touche pour retirer ou remettre)</Kicker></View>
            <Btn theme={theme} small kind="ghost" label="Tout" onPress={() => setPicked(list)} />
            <Btn theme={theme} small kind="ghost" label="Rien" onPress={() => setPicked([])} />
          </View>
          <ScrollView style={{ maxHeight: 230 }} contentContainerStyle={styles.wrap}>
            {list.map((c) => {
              const on = picked.includes(c);
              const col = colorOf(Number(client.get(`/ch/${String(c).padStart(2, '0')}/config/color`) ?? 0));
              return (
                <Pressable key={c} onPress={() => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.ch, { borderColor: on ? col : theme.line, backgroundColor: on ? theme.deep : 'transparent', opacity: on ? 1 : 0.55 }]}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{on ? '✓ ' : ''}{name(c)}</Text>
                  <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11 }}>{srcInfo.name} : {dbLabel(Number(client.get(chLevelPath(c, srcT)) ?? 0), 'rien')}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn theme={theme} label="Annuler" onPress={props.onClose} style={{ flex: 1 }} />
            <Btn theme={theme} kind="primary" disabled={!ready} onPress={go} style={{ flex: 2 }}
              label={!targets.length ? 'Choisis à qui le donner' : !picked.length ? 'Choisis au moins une voie' : `Copier ${picked.length === list.length ? 'tout' : `${picked.length} voie${picked.length > 1 ? 's' : ''}`} vers ${targets.length === 1 ? mixInfo(client, byId(targets[0])).name : `${targets.length} personnes`}`} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 900, borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, justifyContent: 'center', maxWidth: 170 },
  ch: { width: '32%', minHeight: 50, borderRadius: 12, borderWidth: 2, padding: 8, justifyContent: 'center' },
});
