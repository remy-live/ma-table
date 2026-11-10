// Bandeau « ça siffle ? » : il apparaît sur tous les écrans quand un retour ou
// la façade reste très fort à un niveau constant. Rien ne bouge tout seul :
// on propose de baisser, ou de chercher la fréquence qui siffle.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { f } from '../osc/osc';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, meterIndex, outPath, Target } from '../xair/addresses';
import { LarsenWatcher } from '../xair/larsenWatch';
import { dbToFader, faderToDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { LarsenSheet } from './LarsenSheet';

const BUS_IDX = Array.from({ length: BUS_COUNT }, (_, n) => meterIndex.bus(n + 1));
const targetOf = (idx: number): Target => (idx === meterIndex.lrL || idx === meterIndex.lrR ? { kind: 'main' } : { kind: 'bus', n: idx - meterIndex.bus(0) });

export function LarsenWatch({ client, theme, top = 10 }: { client: XAirClient; theme: Theme; top?: number }) {
  const [hit, setHit] = useState<{ idx: number; at: number } | null>(null);
  const [hunt, setHunt] = useState<number | null>(null);
  const w = useRef(new LarsenWatcher([...BUS_IDX, meterIndex.lrL])).current;

  useEffect(() => {
    client.startMeters();
    const off = client.onMeters((m) => {
      const now = Date.now();
      const h = w.push(m, now);
      if (h) setHit((cur) => (cur && cur.idx === h.idx && now - cur.at < 500 ? cur : { idx: h.idx, at: now }));
    });
    const t = setInterval(() => setHit((cur) => (cur && Date.now() - cur.at > 6000 ? null : cur)), 1000);
    return () => { off(); clearInterval(t); client.stopMeters(); };
  }, [client, w]);

  if (!hit && hunt === null) return null;
  const tg = hit ? targetOf(hit.idx) : null;
  const name = !tg ? '' : tg.kind === 'main' ? 'la façade' : `« ${String(client.get(busNamePath((tg as { n: number }).n)) ?? '') || `Retour ${(tg as { n: number }).n}`} »`;
  const lower = () => {
    if (!tg || !hit) return;
    const p = outPath(tg);
    const d = faderToDb(Number(client.get(p) ?? 0.75));
    client.set(p, f(dbToFader((isFinite(d) ? d : -10) - 6)));
    w.snooze(hit.idx, Date.now(), 8000);
    setHit(null);
  };
  const fine = () => { if (hit) w.snooze(hit.idx, Date.now(), 120000); setHit(null); };
  const btn = (label: string, onPress: () => void, main?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: main ? '#EF4444' : 'transparent', borderWidth: 1, borderColor: main ? '#EF4444' : '#FCA5A5' }}>
      <Text style={{ color: main ? '#1A0505' : '#FCA5A5', fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  return (
    <>
      {hit && tg && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }}>
          <View accessibilityLiveRegion="assertive" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 760, marginHorizontal: 10, padding: 10, borderRadius: 16, borderWidth: 2, borderColor: '#EF4444', backgroundColor: '#2A1010', elevation: 16 }}>
            <View style={{ flexShrink: 1, minWidth: 160 }}>
              <Text style={{ color: '#FECACA', fontWeight: '900', fontSize: 15 }}>🔊 Ça siffle dans {name} ?</Text>
              <Text style={{ color: '#FCA5A5', fontSize: 11 }}>un son très fort qui ne bouge pas : souvent un larsen</Text>
            </View>
            {btn('Baisser de 6 dB', lower, true)}
            {tg.kind === 'bus' && btn('Trouver la fréquence', () => { setHunt((tg as { n: number }).n); fine(); })}
            {btn('Non, ça va', fine)}
          </View>
        </View>
      )}
      {hunt !== null && <LarsenSheet client={client} theme={theme} bus={hunt} name={String(client.get(busNamePath(hunt)) ?? '') || `Retour ${hunt}`} onClose={() => setHunt(null)} />}
    </>
  );
}
