// Coupe-bas et gate d'une voie, en plus parlant :
//  - coupe-bas : la courbe dessinée, le réglage conseillé pour l'instrument,
//    la pente si la table la propose ;
//  - gate : on VOIT quand la porte s'ouvre (le niveau qui arrive face au seuil),
//    des recettes par instrument, et les réglages fins (profondeur, attaque,
//    maintien, relâche) pour qui veut.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { f, i } from '../osc/osc';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import {
  fToGateDb, fToHpfHz, GATE_ATTACK, GATE_HOLD, GATE_RANGE, GATE_RELEASE, gateAttackPath, gateDbToF, gateHoldPath, gateModePath, gateOnPath,
  gateRangePath, gateReleasePath, gateThrPath, hpfHzToF, hpfPath, hpOnPath, hpSlopePath, meterIndex,
} from '../xair/addresses';
import { useMeter } from '../xair/useMeter';
import { useParam, useParamOpt } from '../xair/useParam';
import { recognize } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';

const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);

/** Le bon coupe-bas selon ce qui est branché (null = le laisser coupé). */
export function hpfAdvice(name: string): { hz: number | null; why: string } {
  const k = recognize(name)?.label ?? '';
  const t: Record<string, [number | null, string]> = {
    Voix: [100, 'enlève les chocs du micro et le grondement de scène'],
    Chœurs: [120, 'laisse la place à la voix principale'],
    'Guitare acou': [90, 'évite le « boum » de la caisse'],
    'Guitare élec': [90, 'laisse le grave à la basse'],
    Basse: [null, 'le grave, c’est elle : on ne coupe pas (40 Hz au plus)'],
    Kick: [null, 'le grave, c’est lui : on ne coupe pas'],
    'Caisse claire': [100, 'nettoie sans perdre le corps'],
    Charley: [250, 'le charley n’a rien en dessous'],
    Toms: [70, 'garde le corps des toms'],
    Overhead: [150, 'les cymbales seulement, le kick a son micro'],
    Overheads: [150, 'les cymbales seulement, le kick a son micro'],
    Clavier: [60, 'juste le très grave inutile'],
  };
  const r = t[k];
  return r ? { hz: r[0], why: r[1] } : { hz: 80, why: 'un bon point de départ pour presque tout' };
}

function HpfCurve({ hz, on, slope, theme, w = 600, h = 80 }: { hz: number; on: boolean; slope: number; theme: Theme; w?: number; h?: number }) {
  // fréquence (20 Hz - 20 kHz, log) → x ; réponse d'un passe-haut d'ordre n → y
  const X = (fr: number) => (Math.log(fr / 20) / Math.log(1000)) * w;
  const order = slope / 6;
  let d = '';
  for (let k = 0; k <= 60; k++) {
    const fr = 20 * Math.pow(1000, k / 60);
    const db = on ? -10 * Math.log10(1 + Math.pow(hz / fr, 2 * order)) : 0;
    const y = 10 + Math.min(1, -db / 30) * (h - 20);
    d += `${k ? 'L' : 'M'}${X(fr).toFixed(1)} ${y.toFixed(1)} `;
  }
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Rect x={0} y={0} width={w} height={h} rx={8} fill={theme.deep} />
      {[50, 100, 200, 500, 1000, 5000].map((fr) => (
        <React.Fragment key={fr}>
          <Line x1={X(fr)} y1={4} x2={X(fr)} y2={h - 14} stroke={theme.line} strokeWidth={1} />
          <SvgText x={X(fr)} y={h - 3} fontSize={8} textAnchor="middle" fill={theme.muted}>{fr >= 1000 ? `${fr / 1000}k` : fr}</SvgText>
        </React.Fragment>
      ))}
      <Path d={d + `L${w} ${h - 14} L0 ${h - 14} Z`} fill="#60A5FA" opacity={0.18} />
      <Path d={d} stroke="#60A5FA" strokeWidth={2.5} fill="none" />
      {on && <Line x1={X(hz)} y1={4} x2={X(hz)} y2={h - 14} stroke="#60A5FA" strokeDasharray="3 3" />}
    </Svg>
  );
}

export function HpfPanel({ client, theme, ch, name, quick }: { client: XAirClient; theme: Theme; ch: number; name: string; quick: object }) {
  const on = Number(useParam(client, hpOnPath(ch), 0)) === 1;
  const v = Number(useParam(client, hpfPath(ch), 0));
  const slopeRaw = useParamOpt(client, hpSlopePath(ch));
  const slopes = [12, 18, 24];
  const slope = typeof slopeRaw === 'number' ? slopes[Math.round(slopeRaw)] ?? 12 : 12;
  const hz = fToHpfHz(v);
  const adv = hpfAdvice(name);
  const set = (x: number) => { client.set(hpfPath(ch), f(hpfHzToF(x))); client.set(hpOnPath(ch), i(1)); };
  return (
    <View style={{ gap: 8 }}>
      <HpfCurve hz={hz} on={on} slope={slope} theme={theme} />
      <View style={[styles.advice, { borderColor: '#60A5FA', backgroundColor: theme.deep }]}>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800', flex: 1 }}>
          {name ? `Pour « ${name} » : ` : 'Conseil : '}{adv.hz ? fmtHz(adv.hz) : 'pas de coupe-bas'}
          <Text style={{ color: theme.muted, fontWeight: '600' }}> · {adv.why}</Text>
        </Text>
        <Pressable onPress={() => (adv.hz ? set(adv.hz) : client.set(hpOnPath(ch), i(0)))} style={[styles.small, { backgroundColor: '#60A5FA' }]}>
          <Text style={{ color: '#0B1220', fontWeight: '900', fontSize: 12 }}>Appliquer</Text>
        </Pressable>
      </View>
      <HSlider label="Fréquence" value={v} valueText={on ? fmtHz(hz) : 'coupé'} onChange={(x) => { client.set(hpfPath(ch), f(x)); if (!on) client.set(hpOnPath(ch), i(1)); }} color="#60A5FA" theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {[60, 80, 100, 150, 250].map((x) => (
          <Pressable key={x} onPress={() => set(x)} style={[quick, { borderColor: on && Math.abs(hz - x) < x * 0.06 ? '#60A5FA' : theme.line2, backgroundColor: theme.deep }]}>
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{x} Hz</Text>
          </Pressable>
        ))}
      </View>
      {typeof slopeRaw === 'number' && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>Pente</Text>
          {slopes.map((sl, k) => (
            <Pressable key={sl} onPress={() => client.set(hpSlopePath(ch), i(k))} style={[quick, { borderColor: slope === sl ? '#60A5FA' : theme.line2, backgroundColor: theme.deep }]}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{sl} dB{k === 0 ? ' · doux' : k === 2 ? ' · net' : ''}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Gate ----------
type Recipe = { id: string; label: string; mode: number; thr: number; range: number; att: number; hold: number; rel: number; why: string };
const RECIPES: Recipe[] = [
  { id: 'kick', label: 'Kick', mode: 3, thr: -30, range: 40, att: 0.5, hold: 30, rel: 120, why: 'ne garde que les coups' },
  { id: 'toms', label: 'Toms', mode: 3, thr: -35, range: 30, att: 1, hold: 80, rel: 300, why: 'coupe les toms qui résonnent entre les frappes' },
  { id: 'cc', label: 'Caisse claire', mode: 3, thr: -32, range: 18, att: 0.5, hold: 40, rel: 150, why: 'moins de charley dans la caisse' },
  { id: 'ampli', label: 'Ampli qui souffle', mode: 1, thr: -50, range: 12, att: 2, hold: 50, rel: 400, why: 'baisse le souffle quand la guitare se tait, en douceur' },
  { id: 'doux', label: 'Anti-bruit doux', mode: 0, thr: -55, range: 8, att: 5, hold: 100, rel: 600, why: 'un expandeur léger : presque invisible' },
];
const MODES = ['Expandeur doux', 'Expandeur', 'Expandeur fort', 'Gate', 'Ducker'];

function GateMeter({ level, db, thr, on, theme }: { level: number; db: number; thr: number; on: boolean; theme: Theme }) {
  const open = !on || db >= thr;
  const thrX = (thr + 80) / 80; // −80..0 dB
  const lvX = Math.max(0, Math.min(1, (db + 80) / 80));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 22, borderRadius: 8, backgroundColor: theme.meterBg, overflow: 'hidden', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lvX * 100}%`, backgroundColor: open ? theme.ok : '#6B7280' }} />
        {on && <View style={{ position: 'absolute', left: `${thrX * 100}%`, top: 0, bottom: 0, width: 3, marginLeft: -1.5, backgroundColor: '#F8FAFC' }} />}
      </View>
      <Text style={{ color: open ? theme.ok : theme.muted, fontSize: 12, fontWeight: '800' }}>
        {!on ? 'Gate coupé : tout passe' : level < 0.01 ? 'Rien n’arrive : la porte est fermée' : open ? '● Porte ouverte : le son passe' : '○ Porte fermée : le micro est baissé'}
      </Text>
    </View>
  );
}

export function GatePanel({ client, theme, ch, name, quick }: { client: XAirClient; theme: Theme; ch: number; name: string; quick: object }) {
  const on = Number(useParam(client, gateOnPath(ch), 0)) === 1;
  const thrF = Number(useParam(client, gateThrPath(ch), 0));
  const mode = Number(useParam(client, gateModePath(ch), 3));
  const range = Number(useParam(client, gateRangePath(ch), GATE_RANGE.to(60)));
  const att = Number(useParam(client, gateAttackPath(ch), GATE_ATTACK.to(1)));
  const hold = Number(useParam(client, gateHoldPath(ch), GATE_HOLD.to(50)));
  const rel = Number(useParam(client, gateReleasePath(ch), GATE_RELEASE.to(200)));
  const meter = useMeter(client, [meterIndex.ch(ch)], 66);
  const [fine, setFine] = useState(false);
  const thr = fToGateDb(thrF);
  const k = recognize(name)?.label ?? '';
  const suggested = k === 'Kick' ? 'kick' : k === 'Toms' ? 'toms' : k === 'Caisse claire' ? 'cc' : k === 'Guitare élec' ? 'ampli' : null;
  const apply = (r: Recipe) => {
    client.set(gateModePath(ch), i(r.mode));
    client.set(gateThrPath(ch), f(gateDbToF(r.thr)));
    client.set(gateRangePath(ch), f(GATE_RANGE.to(r.range)));
    client.set(gateAttackPath(ch), f(GATE_ATTACK.to(r.att)));
    client.set(gateHoldPath(ch), f(GATE_HOLD.to(r.hold)));
    client.set(gateReleasePath(ch), f(GATE_RELEASE.to(r.rel)));
    client.set(gateOnPath(ch), i(1));
  };
  // seuil « juste sous ce qui arrive » : on règle en jouant
  const learn = () => { if (meter.db > -75) { client.set(gateThrPath(ch), f(gateDbToF(Math.round(meter.db - 8)))); client.set(gateOnPath(ch), i(1)); } };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>
        Le gate baisse le micro quand on ne joue pas. Parfait sur kick et toms ; sur la voix, préfère « Anti-bruit doux » ou rien.
      </Text>
      <GateMeter level={meter.level} db={meter.db} thr={thr} on={on} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {RECIPES.map((r) => (
          <Pressable key={r.id} onPress={() => apply(r)} style={[quick, { borderColor: suggested === r.id ? theme.ok : theme.line2, backgroundColor: theme.deep }]}>
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{suggested === r.id ? '★ ' : ''}{r.label}</Text>
          </Pressable>
        ))}
      </View>
      <HSlider label="Seuil" value={thrF} valueText={`${thr.toFixed(0)} dB`} onChange={(x) => client.set(gateThrPath(ch), f(x))} color={theme.ok} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={learn} style={[quick, { flex: 1, borderColor: theme.ok, backgroundColor: theme.deep }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>🎯 Joue, puis touche ici : seuil juste sous ton niveau</Text>
        </Pressable>
        <Pressable onPress={() => setFine(!fine)} style={[quick, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{fine ? 'Moins ▴' : 'Réglages fins ▾'}</Text>
        </Pressable>
      </View>
      {fine && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {MODES.map((m, k) => (
              <Pressable key={m} onPress={() => client.set(gateModePath(ch), i(k))} style={[quick, { borderColor: mode === k ? theme.ok : theme.line2, backgroundColor: theme.deep }]}>
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <HSlider label="Profondeur" value={range} valueText={`${GATE_RANGE.from(range).toFixed(0)} dB`} onChange={(x) => client.set(gateRangePath(ch), f(x))} color={theme.ok} theme={theme} />
          <HSlider label="Attaque" value={att} valueText={`${GATE_ATTACK.from(att).toFixed(1)} ms`} onChange={(x) => client.set(gateAttackPath(ch), f(x))} color={theme.ok} theme={theme} />
          <HSlider label="Maintien" value={hold} valueText={`${GATE_HOLD.from(hold).toFixed(0)} ms`} onChange={(x) => client.set(gateHoldPath(ch), f(x))} color={theme.ok} theme={theme} />
          <HSlider label="Relâche" value={rel} valueText={`${GATE_RELEASE.from(rel).toFixed(0)} ms`} onChange={(x) => client.set(gateReleasePath(ch), f(x))} color={theme.ok} theme={theme} />
          <Text style={{ color: theme.muted, fontSize: 11 }}>Profondeur : de combien on baisse (60 = coupé net). Maintien : combien de temps la porte reste ouverte après le coup. Relâche : la vitesse à laquelle elle se referme.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  advice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 8 },
  small: { borderRadius: 8, paddingHorizontal: 10, height: 32, justifyContent: 'center' },
});
