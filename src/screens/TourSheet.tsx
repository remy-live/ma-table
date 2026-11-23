// « Visite de la table » : à quoi sert chaque rond (prises, gain, façade, AUX,
// effets, groupes), expliqué sur le dessin avec les vrais noms de la table,
// puis un petit exercice pour de vrai.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { f } from '../osc/osc';
import { CloseX } from '../ui/kit';
import { MiniOut, MiniTable } from '../ui/MiniTable';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, dcaNamePath, DCA_COUNT, FX_COUNT, inDca } from '../xair/addresses';
import { dbToFader, faderToDb } from '../xair/levels';
import { familyRank } from '../xair/reorder';
import { plugColor, plugs } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';

interface Step { title: string; text: string; blink?: number[]; blinkOuts?: number[]; exercise?: boolean }

export function TourSheet({ client, theme, visible, onClose }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const [k, setK] = useState(0);
  const [, setT] = useState(0);
  useEffect(() => { if (visible) setK(0); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const off = client.on('*', (_v, p) => { if (p.includes('/mix/')) setT((t) => t + 1); });
    return () => { off(); };
  }, [client, visible]);

  const P = plugs(client);
  const inG = (c: number, g: number) => inDca(Number(client.get(chDcaPath(c)) ?? 0), g);
  const named = P.filter((p) => p.name);
  const nm = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const bus = (b: number) => String(client.get(busNamePath(b)) ?? '') || `Retour ${b}`;
  const voice = Array.from({ length: CH_COUNT }, (_, j) => j + 1).find((c) => familyRank(nm(c)) === 0) ?? named[0]?.chans[0] ?? 1;
  const voicePlug = P.find((p) => p.chans.includes(voice))?.n ?? voice;
  const ex = { ch: voice, bus: 1 };
  const exDb = faderToDb(Number(client.get(chLevelPath(ex.ch, { kind: 'bus', n: ex.bus })) ?? 0));
  const groups = Array.from({ length: DCA_COUNT }, (_, j) => j + 1).filter((g) => Array.from({ length: CH_COUNT }, (_, c) => c + 1).some((c) => inG(c, g)));
  const ex1 = named.slice(0, 3).map((p) => `prise ${p.n} = ${p.name}`).join(', ');

  const steps: Step[] = [
    { title: 'Les prises', text: `Chaque rond est une prise à l’arrière de la table : un micro ou un instrument par prise. Chez toi : ${ex1 || 'aucune prise nommée pour l’instant'}.`, blink: named.map((p) => p.n) },
    { title: 'Le gain', text: `Le gain règle la force du signal à l’entrée d’une prise (prise ${voicePlug}, ${nm(voice)}). Il vaut pour tout : la façade ET tous les retours. On le règle une fois, au début.`, blink: [voicePlug] },
    { title: 'La façade', text: 'MAIN L/R, c’est ce qu’entend le public, dans les enceintes de façade. Chaque voie y va avec son fader (le volume « public »).', blinkOuts: [0] },
    { title: 'Les AUX = les retours', text: `Chaque AUX est un mélange à part, pour un musicien. AUX 1 = « ${bus(1)} » : ce qui sort dans son enceinte ou son casque. Chaque voie y envoie plus ou moins de son, sans changer la façade.`, blinkOuts: [1] },
    { title: 'Les effets', text: `La table a ${FX_COUNT} effets (réverbe, écho…). Une voie envoie un peu de son vers un effet ; l’effet revient ensuite dans la façade et dans les retours. Plus d’envoi = plus d’effet sur cette voie.`, blinkOuts: [-1] },
    ...(groups.length ? [{ title: 'Les groupes', text: `Un groupe (DCA) monte ou baisse plusieurs voies d’un coup, en gardant leur équilibre : « ${String(client.get(dcaNamePath(groups[0])) ?? '') || `Groupe ${groups[0]}`} » en est un. Il agit sur la façade.`, blink: P.filter((p) => p.chans.some((c) => inG(c, groups[0]))).map((p) => p.n) }] : []),
    { title: 'À toi', text: `Monte « ${nm(ex.ch)} » dans « ${bus(ex.bus)} » : c’est ce que tu ferais si ce musicien dit « je ne m’entends pas ». La façade ne bouge pas.`, blink: [voicePlug], blinkOuts: [ex.bus], exercise: true },
  ];
  const st = steps[Math.min(k, steps.length - 1)];
  const outs: MiniOut[] = [
    { n: 0, tag: 'MAIN', label: 'Façade', color: '#E8EAED' },
    ...Array.from({ length: Math.min(BUS_COUNT, 6) }, (_, j) => ({ n: j + 1, label: bus(j + 1), color: '#34D399' })),
    { n: -1, tag: 'FX', label: 'Effets', color: '#C084FC' },
  ];
  const nudge = (d: number) => {
    const cur = isFinite(exDb) ? exDb : -30;
    client.set(chLevelPath(ex.ch, { kind: 'bus', n: ex.bus }), f(dbToFader(Math.max(-60, Math.min(10, cur + d)))));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>🧭</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Visite de la table</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{k + 1} / {steps.length} · {st.title}</Text>
            </View>
            <CloseX theme={theme} onPress={onClose} />
          </View>
          <MiniTable
            maxWidth={560}
            plugs={Object.fromEntries(P.map((p) => [p.n, { label: p.name || undefined, color: p.chans.length ? plugColor(client, p, () => '') : undefined, dim: !!st.blink && !st.blink.includes(p.n) }]))}
            outs={outs}
            blink={st.blink}
            blinkOuts={st.blinkOuts}
          />
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{st.text}</Text>
          {st.exercise && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center' }}>
              <Pressable onPress={() => nudge(-3)} style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>−</Text></Pressable>
              <View style={{ alignItems: 'center', minWidth: 120 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>{isFinite(exDb) ? `${exDb > 0 ? '+' : ''}${Math.round(exDb)} dB` : 'coupé'}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{nm(ex.ch)} → {bus(ex.bus)}</Text>
              </View>
              <Pressable onPress={() => nudge(3)} style={[styles.pm, { borderColor: '#34D399' }]}><Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>+</Text></Pressable>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable disabled={k === 0} onPress={() => setK(k - 1)} style={[styles.go, { flex: 1, borderWidth: 1, borderColor: theme.line2, opacity: k === 0 ? 0.4 : 1 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>‹ Avant</Text></Pressable>
            <Pressable onPress={() => (k < steps.length - 1 ? setK(k + 1) : onClose())} style={[styles.go, { flex: 1, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800' }}>{k < steps.length - 1 ? 'Suivant ›' : 'J’ai compris'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 640, borderRadius: 20, borderWidth: 1, padding: 16, gap: 12, maxHeight: '96%' },
  pm: { width: 56, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  go: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
