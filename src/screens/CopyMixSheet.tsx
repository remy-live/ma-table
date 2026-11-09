// « Copier depuis… » : ce qu'entend une personne (le public, un retour) copié
// vers une autre, pour toutes les voies ou seulement celles qu'on coche.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { allTargets, CH_COUNT, chLevelPath, chNamePath, Target, targetId } from '../xair/addresses';
import { copyMix } from '../xair/groups';
import { faderToDb } from '../xair/levels';
import { colorOf } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { mixInfo } from './MixPicker';

export function CopyMixSheet(props: { client: XAirClient; theme: Theme; visible: boolean; dst: Target; onClose: () => void; onDone: (msg: string) => void }) {
  const { client, theme, dst } = props;
  const mixes = allTargets().filter((t) => t.kind !== 'fx' && targetId(t) !== targetId(dst));
  const [src, setSrc] = useState<Target>(mixes[0]);
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => { if (props.visible) { setSrc(mixes.find((t) => t.kind === 'main') ?? mixes[0]); setAll(true); setPicked([]); } }, [props.visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(chNamePath(c)) ?? ''));
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const dbTxt = (t: Target, c: number) => { const d = faderToDb(Number(client.get(chLevelPath(c, t)) ?? 0)); return !isFinite(d) || d < -60 ? '—' : `${d > 0 ? '+' : ''}${Math.round(d)}`; };
  const dstInfo = mixInfo(client, dst);
  const srcInfo = mixInfo(client, src);
  const chans = all ? undefined : picked;
  const count = all ? CH_COUNT : picked.length;
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.scrim} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: dstInfo.color }]} onPress={() => {}}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Copier vers <Text style={{ color: dstInfo.color }}>{dstInfo.name}</Text></Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>Prends le réglage d’une autre personne comme point de départ, puis ajuste.</Text>

          <Text style={[styles.k, { color: theme.muted }]}>1 · DEPUIS QUI ?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {mixes.map((t) => {
              const m = mixInfo(client, t);
              const on = targetId(t) === targetId(src);
              return (
                <Pressable key={targetId(t)} onPress={() => setSrc(t)} accessibilityState={{ selected: on }} style={[styles.chip, { borderColor: m.color, backgroundColor: on ? m.color : 'transparent' }]}>
                  <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 13 }}>{t.kind === 'main' ? '👥 ' : '🎧 '}{m.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.k, { color: theme.muted }]}>2 · QUELLES VOIES ?</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable onPress={() => setAll(true)} style={[styles.chip, { flex: 1, borderColor: theme.accent, backgroundColor: all ? theme.accent : 'transparent', alignItems: 'center' }]}><Text style={{ color: all ? theme.onAccent : theme.text, fontWeight: '800' }}>Toutes</Text></Pressable>
            <Pressable onPress={() => setAll(false)} style={[styles.chip, { flex: 1, borderColor: theme.accent, backgroundColor: !all ? theme.accent : 'transparent', alignItems: 'center' }]}><Text style={{ color: !all ? theme.onAccent : theme.text, fontWeight: '800' }}>Je choisis</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {named.map((c) => {
              const on = all || picked.includes(c);
              const col = colorOf(Number(client.get(`/ch/${String(c).padStart(2, '0')}/config/color`) ?? 0));
              return (
                <Pressable key={c} disabled={all} onPress={() => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} accessibilityState={{ checked: on }} style={[styles.ch, { borderColor: on ? col : theme.line, backgroundColor: on ? theme.deep : 'transparent', opacity: all ? 0.7 : 1 }]}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{on ? '✓ ' : ''}{name(c)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{srcInfo.name.slice(0, 8)} {dbTxt(src, c)} → {dstInfo.name.slice(0, 8)} {dbTxt(dst, c)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={props.onClose} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Annuler</Text></Pressable>
            <Pressable disabled={!count} onPress={() => { const n = copyMix(client, src, dst, chans); props.onDone(`${dstInfo.name} entend maintenant comme ${srcInfo.name}${chans ? ` pour ${n} voie${n > 1 ? 's' : ''}` : ''}`); props.onClose(); }} style={[styles.btn, { flex: 1.6, backgroundColor: theme.accent, opacity: count ? 1 : 0.5 }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Copier {all ? 'tout' : `${picked.length} voie${picked.length > 1 ? 's' : ''}`}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 720, borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  k: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 4 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, justifyContent: 'center' },
  ch: { width: '32%', minHeight: 52, borderRadius: 12, borderWidth: 2, padding: 8, justifyContent: 'center' },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
