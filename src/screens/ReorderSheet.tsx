// « Réorganiser les voies » : on range l'ordre des voies (voix d'abord, batterie
// à la fin…) sans débrancher un câble. Chaque voie emporte ses réglages et
// continue d'écouter la même prise.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { MiniTable } from '../ui/MiniTable';
import { Theme } from '../ui/theme';
import { chNamePath, insrcPath, insrcPlug, MODEL } from '../xair/addresses';
import { ChangeSet, record } from '../xair/changeLog';
import { applyOrder, moves, orderByFamily, reorderCount, reorderSupported, slotPaths } from '../xair/reorder';
import { chColor } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { ChangesSheet } from './ChangesSheet';

export function ReorderSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const n = reorderCount();
  const ident = () => Array.from({ length: n }, (_, k) => k + 1);
  const [order, setOrder] = useState<number[]>(ident);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<ChangeSet | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  useEffect(() => {
    if (!visible) return;
    setOrder(ident());
    client.loadPaths(Array.from({ length: n }, (_, k) => [chNamePath(k + 1), insrcPath(k + 1)]).flat(), false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const named = (c: number) => !!String(client.get(chNamePath(c)) ?? '');
  const plugOf = (c: number) => insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1));
  const move = (k: number, d: number) => setOrder((o) => {
    const j = k + d;
    if (j < 0 || j >= o.length) return o;
    const x = [...o];
    [x[k], x[j]] = [x[j], x[k]];
    return x;
  });
  const mv = moves(order);
  // « Comme les prises » : voie k = prise k (plus besoin de routage)
  const byPlug = () => setOrder([...ident()].sort((a, b) => (plugOf(a) ?? 99) - (plugOf(b) ?? 99)));

  const apply = async () => {
    setBusy(true);
    const rec = record(client, 'Voies réorganisées');
    await applyOrder(client, order);
    const set = rec.stop();
    setBusy(false);
    setOrder(ident());
    setChanged(set);
  };

  // conseil pour la prochaine fois : où brancher pour que voie = prise
  const tips = order.map((src, k) => ({ d: k + 1, src, plug: plugOf(src) })).filter((x) => named(x.src) && x.plug && x.plug !== x.d).slice(0, 6);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line, maxWidth: wide ? 980 : 640 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>🔀</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Réorganiser les voies</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Sans toucher aux câbles : chaque voie garde ses réglages et sa prise.</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>
          {!reorderSupported() ? (
            <Text style={{ color: theme.text, fontSize: 14 }}>Sur la {MODEL.name}, je ne sais pas encore changer la prise d’une voie. Pour réorganiser, déplace les câbles, puis utilise « Trouver ce micro » pour vérifier.</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable onPress={() => setOrder(orderByFamily(client))} style={[styles.chip, { borderColor: theme.accent }]}><Text style={{ color: theme.accent, fontWeight: '800' }}>✨ Ranger par famille</Text></Pressable>
                <Pressable onPress={byPlug} style={[styles.chip, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Voie = prise</Text></Pressable>
                <Pressable onPress={() => setOrder(ident())} style={[styles.chip, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Comme maintenant</Text></Pressable>
              </View>
              <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
                <ScrollView style={{ flexGrow: 0, maxHeight: wide ? 460 : 300, flex: wide ? 1 : undefined }} contentContainerStyle={{ gap: 4 }}>
                  {order.map((src, k) => {
                    const moved = src !== k + 1;
                    return (
                      <View key={k} style={[styles.row, { borderColor: moved ? theme.accent : theme.line, backgroundColor: theme.deep, opacity: named(src) ? 1 : 0.5 }]}>
                        <Text style={{ width: 30, color: theme.text, fontWeight: '900', textAlign: 'center' }}>{k + 1}</Text>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chColor(client, src) }} />
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800' }}>{name(src)}</Text>
                          <Text style={{ color: theme.muted, fontSize: 11 }}>prise {plugOf(src) ?? '—'}{moved ? ` · était la voie ${src}` : ''}</Text>
                        </View>
                        <Pressable onPress={() => move(k, -1)} accessibilityLabel={`Monter ${name(src)}`} style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>↑</Text></Pressable>
                        <Pressable onPress={() => move(k, 1)} accessibilityLabel={`Descendre ${name(src)}`} style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>↓</Text></Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={{ flex: wide ? 1 : undefined, gap: 8 }}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>LES CÂBLES NE BOUGENT PAS</Text>
                  <MiniTable
                    maxWidth={480}
                    plugs={Object.fromEntries(order.map((src, k) => [plugOf(src) ?? 0, { label: named(src) ? `${k + 1}·${name(src)}` : undefined, color: chColor(client, src), badge: src !== k + 1 ? `→ voie ${k + 1}` : undefined }]).filter(([p]) => p))}
                  />
                  {tips.length > 0 && (
                    <Text style={{ color: theme.muted, fontSize: 12 }}>
                      La prochaine fois, branche {tips.map((t) => `${name(t.src)} sur la prise ${t.d}`).join(', ')} : plus besoin de routage.
                    </Text>
                  )}
                </View>
              </View>
              <Pressable disabled={!mv.length || busy} onPress={apply} style={[styles.go, { backgroundColor: theme.accent, opacity: mv.length && !busy ? 1 : 0.4 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>{busy ? 'Je range…' : mv.length ? `Ranger · ${mv.length} voie(s) bougent` : 'Rien à changer'}</Text>
              </Pressable>
              <Text style={{ color: theme.muted, fontSize: 11 }}>Les réglages suivent la voie : nom, couleur, égaliseur, gate, compresseur, envois aux retours, groupes, fader ({slotPaths(1).length} réglages par voie). Les gains et le 48 V restent sur les prises. Annulable dans « Ce qui a changé ».</Text>
            </>
          )}
        </View>
        <ChangesSheet client={client} theme={theme} visible={!!changed} set={changed} onClose={() => setChanged(null)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 16, gap: 12, maxHeight: '96%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 },
  pm: { width: 38, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  go: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
