// Chasse au larsen : un retour siffle ? On écoute son spectre quelques secondes,
// l'appli repère la fréquence qui dépasse nettement les autres et propose de la
// creuser dans l'égaliseur de CE retour seulement (le public n'est pas touché).
// Adresses de l'égaliseur des retours et de la sélection de l'analyseur : à vérifier sur la table.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f, i } from '../osc/osc';
import { Theme } from '../ui/theme';
import { eqGainToF, hzToF, qToF } from '../xair/addresses';
import { argFor, XAirClient } from '../xair/XAirClient';

const busEq = (bus: number, band: number, k: 'type' | 'f' | 'g' | 'q') => `/bus/${bus}/eq/${band}/${k}`;
const busEqOn = (bus: number) => `/bus/${bus}/eq/on`;
const bandHz = (k: number) => 20 * Math.pow(1000, k / 99);
const hzText = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1).replace('.0', '').replace('.', ',')} kHz` : `${Math.round(hz)} Hz`);
const NOTCH_BANDS = [5, 4, 3]; // bandes de l'égaliseur du retour utilisées pour creuser

export function LarsenSheet({ client, theme, bus, name, onClose }: { client: XAirClient; theme: Theme; bus: number | null; name: string; onClose: () => void }) {
  const [spec, setSpec] = useState<number[] | null>(null);
  const [peak, setPeak] = useState<{ k: number; over: number } | null>(null);
  const [cuts, setCuts] = useState<number[]>([]); // fréquences déjà creusées
  const hold = useRef<number[]>(Array(100).fill(-90));
  const saved = useRef<Map<string, ReturnType<XAirClient['get']>>>(new Map());

  useEffect(() => {
    if (!bus) return;
    hold.current = Array(100).fill(-90);
    setPeak(null);
    setCuts([]);
    saved.current = new Map();
    const paths = [busEqOn(bus), ...NOTCH_BANDS.flatMap((b) => (['type', 'f', 'g', 'q'] as const).map((k) => busEq(bus, b, k)))];
    client.loadPaths(paths).then(() => paths.forEach((p) => saved.current.set(p, client.get(p))));
    client.startRta(undefined, 20 + bus); // l'analyseur écoute ce retour (21..26 = retours 1..6)
    let last = 0;
    const off = client.onRta((d) => {
      // on garde le maximum qui retombe lentement : un sifflement reste visible
      for (let k = 0; k < 100; k++) hold.current[k] = Math.max(d[k], hold.current[k] - 0.6);
      const now = Date.now();
      if (now - last < 150) return;
      last = now;
      const h = hold.current;
      const sorted = [...h].sort((a, b) => a - b);
      const median = sorted[50];
      let best = -1, over = 0;
      for (let k = 10; k < 98; k++) { const o = h[k] - Math.max(h[k - 3], h[k + 3], median); if (o > over) { over = o; best = k; } }
      setSpec([...h]);
      setPeak(best >= 0 && over > 9 && h[best] > -50 ? { k: best, over } : null);
    });
    return () => { off(); client.stopRta(); };
  }, [client, bus]);

  if (!bus) return null;
  const cut = () => {
    if (!peak) return;
    const band = NOTCH_BANDS[cuts.length % NOTCH_BANDS.length];
    const hz = bandHz(peak.k);
    client.set(busEqOn(bus), i(1));
    client.set(busEq(bus, band, 'type'), i(2)); // PEQ
    client.set(busEq(bus, band, 'f'), f(hzToF(hz)));
    client.set(busEq(bus, band, 'q'), f(qToF(8)));
    client.set(busEq(bus, band, 'g'), f(eqGainToF(-9)));
    setCuts((c) => [...c, hz]);
    hold.current = Array(100).fill(-90);
    setPeak(null);
  };
  const undoAll = () => {
    saved.current.forEach((v, p) => { if (v !== undefined) client.set(p, argFor(p, v)); });
    setCuts([]);
  };

  const W = 600, H = 170;
  const x = (k: number) => 10 + (k / 99) * (W - 20);
  const y = (db: number) => H - 20 - Math.max(0, Math.min(1, (db + 80) / 80)) * (H - 30);
  const line = spec ? spec.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(d).toFixed(1)}`).join(' ') : '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.panel, borderColor: peak ? '#F87171' : theme.line }]}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>🔔 Ça siffle dans « {name} » ?</Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>Laisse siffler une seconde : l’appli repère la note qui dépasse et la creuse dans ce retour seulement. Le public n’est pas touché.</Text>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
            <Rect x={0} y={0} width={W} height={H} rx={12} fill={theme.meterBg} />
            {[100, 1000, 10000].map((hz) => { const k = (Math.log(hz / 20) / Math.log(1000)) * 99; return <React.Fragment key={hz}><Line x1={x(k)} y1={8} x2={x(k)} y2={H - 18} stroke={theme.line} /><SvgText x={x(k)} y={H - 4} fontSize={11} textAnchor="middle" fill={theme.muted}>{hzText(hz)}</SvgText></React.Fragment>; })}
            {spec && <Path d={`${line} L${x(99)} ${H - 20} L${x(0)} ${H - 20} Z`} fill="#38BDF8" opacity={0.3} />}
            {spec && <Path d={line} fill="none" stroke="#7DD3FC" strokeWidth={2} />}
            {cuts.map((hz, n) => { const k = (Math.log(hz / 20) / Math.log(1000)) * 99; return <Line key={n} x1={x(k)} y1={8} x2={x(k)} y2={H - 20} stroke="#A78BFA" strokeWidth={3} strokeDasharray="6 4" />; })}
            {peak && spec && <><Line x1={x(peak.k)} y1={8} x2={x(peak.k)} y2={H - 20} stroke="#F87171" strokeWidth={3} /><SvgText x={x(peak.k)} y={y(spec[peak.k]) - 8} fontSize={15} fontWeight="900" textAnchor="middle" fill="#F87171">{hzText(bandHz(peak.k))}</SvgText></>}
          </Svg>
          {!spec && <Text style={{ color: theme.muted, fontSize: 12 }}>En attente du spectre de la table…</Text>}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Pressable onPress={cut} disabled={!peak} style={[styles.btn, { flex: 2, backgroundColor: peak ? '#F87171' : theme.line }]}>
              <Text style={{ color: peak ? '#1F0707' : theme.muted, fontWeight: '900', fontSize: 15 }}>{peak ? `Creuser ${hzText(bandHz(peak.k))} dans ce retour` : 'Pas de sifflement repéré'}</Text>
            </Pressable>
            {cuts.length > 0 && <Pressable onPress={undoAll} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Annuler ({cuts.length})</Text></Pressable>}
            <Pressable onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Fermer</Text></Pressable>
          </View>
          {cuts.length > 0 && <Text style={{ color: '#C4B5FD', fontSize: 12 }}>Creusé : {cuts.map(hzText).join(', ')} (−9 dB, très étroit). S’il siffle encore, recommence.</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet: { alignSelf: 'center', width: '100%', maxWidth: 760, borderRadius: 20, borderWidth: 2, padding: 16, gap: 10 },
  btn: { minHeight: 50, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
