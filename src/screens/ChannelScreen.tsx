// La voie, visuelle : le trajet du son en blocs (Entrée › Coupe-bas › Gate ›
// EQ › Comp › Effets), un égaliseur dessiné avec 4 points, des effets en
// tuiles avec « Retirer », et en bas qui entend cette voie.
import { DragBar } from '../ui/DragBar';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { f, i } from '../osc/osc';
import {
  BUS_COUNT, channelDetailPaths, chLevelPath, chNamePath, dynOnPath, dynThrPath, eqGainToF, eqOnPath, eqPath, formatHz, fToCompDb,
  fToEqGain, fToGainDb, fToGateDb, fToHpfHz, fToHz, fToQ, FX_COUNT, gateOnPath, gateThrPath, headampGainPath, hpfHzToF, hpfPath, hpOnPath,
  hzToF, insrcPath, insrcPlug, MAIN, phantomPath, sourceKind, Target,
} from '../xair/addresses';
import { Band, bandName } from '../xair/eqCurve';
import { BAND_COLORS, EqGraph } from '../ui/EqGraph';
import { useAB } from '../ui/useAB';
import { fxType, fxTypePath } from '../xair/effects';
import { dbToFader, faderToDb, formatDb } from '../xair/levels';

import { useMeter } from '../xair/useMeter';
import { useParam, useParamOpt } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import { EffectDetail } from './EffectDetail';
import { FxNames, loadFxNames, saveFxNames } from '../xair/fxSlots';
import { InputSheet } from './InputSheet';
import { InputSourceSheet } from './InputSourceSheet';
import { mixInfo } from './MixPicker';
import { PresetsSheet } from './PresetsSheet';
import { meterIndex } from '../xair/addresses';

const FX_COLORS = ['#C084FC', '#F472B6', '#2DD4BF', '#FBBF24'];
type Block = 'in' | 'hpf' | 'gate' | 'eq' | 'comp' | 'fx' | 'qui';

/** Téléphone : plein écran, un bloc à la fois. Tablette (`wide`) : panneau latéral, tout visible d'un coup. */
/** Bouton Avant / Après : entendre le son d'avant les réglages, puis revenir. */
export function ABButton({ theme, ab }: { theme: Theme; ab: { mode: 'apres' | 'avant'; toggle: () => void } }) {
  const avant = ab.mode === 'avant';
  return (
    <Pressable onPress={ab.toggle} accessibilityRole="switch" accessibilityState={{ checked: avant }} style={{ flexDirection: 'row', height: 46, borderRadius: 12, borderWidth: 2, borderColor: avant ? '#A78BFA' : theme.line2, overflow: 'hidden' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: avant ? '#A78BFA' : 'transparent' }}><Text style={{ color: avant ? '#140F24' : theme.muted, fontWeight: '900', fontSize: 14 }}>◀ Avant</Text></View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: avant ? 'transparent' : theme.accent }}><Text style={{ color: avant ? theme.muted : theme.onAccent, fontWeight: '900', fontSize: 14 }}>Après ▶</Text></View>
    </Pressable>
  );
}

export function ChannelScreen({ client, ch, theme, onClose, wide }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void; wide?: boolean }) {
  if (wide) return ch !== null ? <ChannelBody client={client} ch={ch} theme={theme} onClose={onClose} wide /> : null;
  return (
    <Modal visible={ch !== null} animationType="slide" onRequestClose={onClose}>
      {ch !== null && <ChannelBody client={client} ch={ch} theme={theme} onClose={onClose} />}
    </Modal>
  );
}

export function ChannelBody({ client, ch, theme, onClose, wide }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void; wide?: boolean }) {
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const [blockSel, setBlock] = useState<Block>('eq');
  const block = blockSel;
  // un bloc à la fois, sur téléphone comme sur tablette : tout tient sans défiler
  const show = (b: Block | Block[]) => (Array.isArray(b) ? b.includes(block) : block === b);
  const [band, setBand] = useState(2);
  const [lib, setLib] = useState(false);
  const [fxOpen, setFxOpen] = useState<number | null>(null);
  const [fxNames, setFxNames] = useState<FxNames>({});
  useEffect(() => { loadFxNames().then(setFxNames); }, []);
  const [inputOpen, setInputOpen] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);

  useEffect(() => {
    client.loadPaths([...channelDetailPaths(ch), insrcPath(ch), headampGainPath(ch), phantomPath(ch), ...Array.from({ length: BUS_COUNT }, (_, k) => chLevelPath(ch, { kind: 'bus', n: k + 1 })), chLevelPath(ch, MAIN)]);
    client.startMeters();
  }, [client, ch]);
  // Avant / Après sur l'égaliseur
  const eqAB = useAB(client, [eqOnPath(ch), hpOnPath(ch), hpfPath(ch), ...[1, 2, 3, 4].flatMap((b) => (['type', 'f', 'g', 'q'] as const).map((k) => eqPath(ch, b, k)))], `eq${ch}`);
  // spectre en direct de la voie, dessiné derrière la courbe de l'égaliseur
  const [rta, setRta] = useState<Float32Array | null>(null);
  useEffect(() => {
    client.startRta(ch);
    let last = 0;
    const off = client.onRta((d) => { const n = Date.now(); if (n - last < 90) return; last = n; setRta(new Float32Array(d)); });
    return () => { off(); client.stopRta(); };
  }, [client, ch]);

  const num = (p: string, fb: number) => Number(useParam<number>(client, p, fb));
  const eqOn = num(eqOnPath(ch), 0) === 1;
  const hpOn = num(hpOnPath(ch), 0) === 1;
  const hpf = num(hpfPath(ch), 0.3);
  const gateOn = num(gateOnPath(ch), 0) === 1;
  const gateThr = num(gateThrPath(ch), 0.5);
  const dynOn = num(dynOnPath(ch), 0) === 1;
  const dynThr = num(dynThrPath(ch), 0.6);
  const bands: Band[] = [1, 2, 3, 4].map((b) => ({ type: num(eqPath(ch, b, 'type'), 2), hz: fToHz(num(eqPath(ch, b, 'f'), 0.5)), db: fToEqGain(num(eqPath(ch, b, 'g'), 0.5)), q: fToQ(num(eqPath(ch, b, 'q'), 0.5)) }));
  const sends = Array.from({ length: FX_COUNT }, (_, k) => num(chLevelPath(ch, { kind: 'fx', n: k + 1 }), 0));
  const insrc = num(insrcPath(ch), ch - 1);
  const gain = useParamOpt(client, headampGainPath(ch));
  const p48 = Number(useParamOpt(client, phantomPath(ch)) ?? 0) === 1;
  const kind = sourceKind(insrc, p48);
  const meter = useMeter(client, [meterIndex.ch(ch)], 120);
  const dests: Target[] = [MAIN, ...Array.from({ length: BUS_COUNT }, (_, k) => ({ kind: 'bus', n: k + 1 }) as Target)];
  const destLv = dests.map((t) => num(chLevelPath(ch, t), 0));

  const fxCount = sends.filter((v) => v > 0).length;
  const BLOCKS: { id: Block; icon: string; label: string; sub: string; color: string }[] = [
    { id: 'in', icon: '🎤', label: 'Entrée', sub: `prise ${insrcPlug(insrc)} · ${gain === undefined ? kind : `${fToGainDb(Number(gain)) > 0 ? '+' : ''}${fToGainDb(Number(gain)).toFixed(0)} dB`}`, color: '#C9CED4' },
    { id: 'hpf', icon: '⤴', label: 'Coupe-bas', sub: hpOn ? formatHz(fToHpfHz(hpf)) : 'off', color: '#60A5FA' },
    { id: 'gate', icon: '▯', label: 'Gate', sub: gateOn ? `${fToGateDb(gateThr).toFixed(0)} dB` : 'off', color: '#9AA3AD' },
    { id: 'eq', icon: '〰', label: 'EQ', sub: eqOn ? '4 bandes' : 'off', color: theme.accent },
    { id: 'comp', icon: '◐', label: 'Comp', sub: dynOn ? `${fToCompDb(dynThr).toFixed(0)} dB` : 'off', color: '#34D399' },
    { id: 'fx', icon: '✦', label: 'Effets', sub: fxCount ? `${fxCount} actif${fxCount > 1 ? 's' : ''}` : 'aucun', color: '#C084FC' },
    { id: 'qui', icon: '🎧', label: 'Qui entend', sub: `${destLv.filter((v) => v > 0).length} sortie${destLv.filter((v) => v > 0).length > 1 ? 's' : ''}`, color: '#60A5FA' },
  ];
  const active = (b: Block) => (b === 'hpf' ? hpOn : b === 'gate' ? gateOn : b === 'eq' ? eqOn : b === 'comp' ? dynOn : b === 'fx' ? fxCount > 0 : true);

  // EQ
  const setBandG = (k: number, db: number) => client.set(eqPath(ch, k + 1, 'g'), f(eqGainToF(Math.max(-15, Math.min(15, db)))));
  const setBandF = (k: number, hz: number) => client.set(eqPath(ch, k + 1, 'f'), f(hzToF(Math.max(20, Math.min(20000, hz)))));
  const flat = () => bands.forEach((_, k) => setBandG(k, 0));
  const b = bands[band];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }, wide ? styles.wideRoot : { paddingBottom: bottomPad() }]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} accessibilityLabel={wide ? 'Fermer le panneau' : 'Retour à la table'} style={[styles.back, { backgroundColor: theme.panel }]}>
          <Text style={{ color: theme.text, fontSize: 20 }}>{wide ? '×' : '‹'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            Voie {ch} · prise {insrcPlug(insrc)} · {kind.toLowerCase()}
          </Text>
        </View>
        <Pressable onPress={() => setLib(true)} style={[styles.chip, { borderColor: theme.accent, borderWidth: 1 }]}>
          <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>Préréglage ▾</Text>
        </Pressable>
      </View>

      {/* LE TRAJET DU SON (téléphone : navigation ; tablette : tout est affiché) */}
      {<ScrollView horizontal scrollEnabled={!wide} showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }, wide && { gap: 4, flexGrow: 1 }]} style={{ flexGrow: 0 }}>
        {BLOCKS.map((bl) => {
          const on = block === bl.id;
          const act = active(bl.id);
          return (
            <Pressable key={bl.id} onPress={() => setBlock(bl.id)} accessibilityState={{ selected: on }} accessibilityLabel={`${bl.label} · ${bl.sub}`} style={[styles.block, wide && { minWidth: 0, width: undefined, flex: 1, paddingHorizontal: 2 }, { borderColor: on ? bl.color : theme.line, backgroundColor: on ? theme.deep : theme.panel, opacity: act || on ? 1 : 0.6 }]}>
              <Text style={{ fontSize: 18 }}>{bl.icon}</Text>
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{bl.label}</Text>
              <Text style={{ color: on ? bl.color : theme.muted, fontSize: 10 }} numberOfLines={1}>{bl.sub}</Text>
            </Pressable>
          );
        })}
      </ScrollView>}

      <ScrollView contentContainerStyle={[styles.body, wide && { paddingTop: 4 }]}>
        {show('in') && (
          <Card theme={theme} title="Entrée" color="#C9CED4">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.plug, { backgroundColor: theme.deep, borderColor: theme.line2 }]}>
                <Text style={{ color: theme.muted, fontSize: 10 }}>PRISE</Text>
                <Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>{insrcPlug(insrc)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{kind}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{insrc >= 16 ? 'Le son de l’ordinateur par USB.' : `Branché à l’arrière de la table, prise n°${insrcPlug(insrc)}.`}</Text>
              </View>
              <Pressable onPress={() => setSrcOpen(true)} style={[styles.chip, { borderColor: theme.line2, borderWidth: 1 }]}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>Changer</Text>
              </Pressable>
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ height: 14, borderRadius: 7, backgroundColor: theme.meterBg, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(meter.level * 100)}%`, height: 14, backgroundColor: meter.db > -3 ? theme.mute : meter.db > -18 ? theme.ok : '#FCD34D' }} />
              </View>
              <Text style={{ color: meter.db > -3 ? theme.mute : meter.db > -18 ? theme.ok : theme.muted, fontSize: 11, fontWeight: '700' }}>
                {meter.db < -55 ? 'Rien n’arrive' : meter.db > -3 ? 'Niveau d’entrée : trop fort, baisse le gain' : meter.db > -18 ? 'Niveau d’entrée : parfait' : 'Niveau d’entrée : un peu faible'}
              </Text>
            </View>
            <Pressable onPress={() => setInputOpen(true)} style={[styles.wide, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 14 }}>Gain · 48 V · phase · pan</Text>
            </Pressable>
          </Card>
        )}

        {show('eq') && (
          <Card theme={theme} title="Égaliseur" color="#FBBF24" on={eqOn} onToggle={() => client.set(eqOnPath(ch), i(eqOn ? 0 : 1))}>
            <EqGraph
              bands={bands}
              on={eqOn}
              hpfHz={hpOn ? fToHpfHz(hpf) : null}
              selected={band}
              theme={theme}
              onSelect={setBand}
              onActivate={() => client.set(eqOnPath(ch), i(1))}
              rta={rta}
              onChange={(k, hz, db) => {
                setBandF(k, hz);
                setBandG(k, db);
              }}
            />
            {eqAB.changed && <ABButton theme={theme} ab={eqAB} />}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {bands.map((bd, k) => (
                <Pressable key={k} onPress={() => setBand(k)} accessibilityState={{ selected: band === k }} style={[styles.bandBtn, { borderColor: band === k ? BAND_COLORS[k] : theme.line, backgroundColor: band === k ? theme.deep : theme.panel }]}>
                  <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{bandName(bd.hz)}</Text>
                  <Text style={{ color: BAND_COLORS[k], fontSize: 11, fontWeight: '700' }}>{`${bd.db > 0 ? '+' : ''}${bd.db.toFixed(0)} dB`}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => setBandG(band, b.db - 1)} accessibilityLabel="Baisser la bande" style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}><Text style={[styles.pmText, { color: theme.text }]}>−</Text></Pressable>
              <View style={{ flex: 1, alignItems: 'stretch' }}>
                <Text style={{ textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800' }}>{`${b.db > 0 ? '+' : ''}${b.db.toFixed(1)} dB`}</Text>
                <View style={{ flexDirection: 'row' }}><DragBar center frac={(b.db + 15) / 30} onFrac={(x) => setBandG(band, Math.round((x * 30 - 15) * 2) / 2)} color={BAND_COLORS[band]} bg={theme.deep} barH={8} style={{ height: 30 }} label="Gain de la bande" valueText={`${b.db.toFixed(1)} dB`} /></View>
              </View>
              <Pressable onPress={() => setBandG(band, b.db + 1)} accessibilityLabel="Monter la bande" style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}><Text style={[styles.pmText, { color: theme.text }]}>+</Text></Pressable>
              <Pressable onPress={() => setBandF(band, b.hz / 1.2)} accessibilityLabel="Plus grave" style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>◀</Text></Pressable>
              <View style={{ width: 110 }}>
                <Text style={{ textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '700' }}>{formatHz(b.hz)}</Text>
                <View style={{ flexDirection: 'row' }}><DragBar frac={Math.log(b.hz / 20) / Math.log(1000)} onFrac={(x) => setBandF(band, 20 * Math.pow(1000, x))} color={BAND_COLORS[band]} bg={theme.deep} barH={8} style={{ height: 30 }} label="Fréquence de la bande" valueText={formatHz(b.hz)} /></View>
              </View>
              <Pressable onPress={() => setBandF(band, b.hz * 1.2)} accessibilityLabel="Plus aigu" style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>▶</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[
                ['Moins de boum', () => setBandG(1, bands[1].db - 2)],
                ['Plus de clarté', () => setBandG(2, bands[2].db + 2)],
                ['Plus d’air', () => setBandG(3, bands[3].db + 2)],
                ['Remettre à plat', flat],
              ].map(([label, go]) => (
                <Pressable key={label as string} onPress={go as () => void} style={[styles.quick, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{label as string}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {show('hpf') && (
          <Card theme={theme} title="Coupe-bas" color="#60A5FA" on={hpOn} onToggle={() => client.set(hpOnPath(ch), i(hpOn ? 0 : 1))}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.muted, fontSize: 11 }}>Enlève le grondement sous la voix (100 Hz) ou sous les guitares (80 Hz). Garde-le coupé pour le kick et la basse.</Text>
              <HSlider label="Fréquence" value={hpf} valueText={formatHz(fToHpfHz(hpf))} onChange={(v) => client.set(hpfPath(ch), f(v))} color="#60A5FA" theme={theme} />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[80, 100, 150].map((hz) => (
                  <Pressable key={hz} onPress={() => { client.set(hpfPath(ch), f(hpfHzToF(hz))); client.set(hpOnPath(ch), i(1)); }} style={[styles.quick, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{hz} Hz</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>
        )}

        {show('gate') && (
          <Card theme={theme} title="Gate" color="#9AA3AD" on={gateOn} onToggle={() => client.set(gateOnPath(ch), i(gateOn ? 0 : 1))}>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Coupe le micro quand on ne joue pas. Utile sur le kick et les toms (il ne laisse passer que les coups). À éviter sur la voix.</Text>
            <HSlider label="Seuil" value={gateThr} valueText={`${fToGateDb(gateThr).toFixed(0)} dB`} onChange={(v) => client.set(gateThrPath(ch), f(v))} color={theme.ok} theme={theme} />
          </Card>
        )}

        {show('comp') && (
          <Card theme={theme} title="Compresseur" color="#34D399" on={dynOn} onToggle={() => client.set(dynOnPath(ch), i(dynOn ? 0 : 1))}>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Rapproche les passages forts et faibles : la voix reste devant même quand on chante doucement. Seuil bas = plus de compression.</Text>
            <HSlider label="Seuil" value={dynThr} valueText={`${fToCompDb(dynThr).toFixed(0)} dB`} onChange={(v) => client.set(dynThrPath(ch), f(v))} color={theme.ok} theme={theme} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[['Léger', -24], ['Moyen', -18], ['Ferme', -12]].map(([l, db]) => (
                <Pressable key={l as string} onPress={() => { client.set(dynThrPath(ch), f(((db as number) + 60) / 60)); client.set(dynOnPath(ch), i(1)); }} style={[styles.quick, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{l as string}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {show('fx') && (
          <Card theme={theme} title={`Effets sur ${name}`} color="#C084FC">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sends.map((v, k) => {
                const on = v > 0;
                const t = fxType(Number(client.get(fxTypePath(k + 1)) ?? 0));
                const c = FX_COLORS[k];
                const path = chLevelPath(ch, { kind: 'fx', n: k + 1 });
                const db = faderToDb(v);
                return (
                  <View key={k} style={[styles.fxTile, { borderColor: on ? c : theme.line, backgroundColor: theme.deep, opacity: on ? 1 : 0.7 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.fxBadge, { backgroundColor: c }]}><Text style={{ color: '#0B0D10', fontSize: 11, fontWeight: '800' }}>FX{k + 1}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{t.fr}</Text>
                        <Text style={{ color: theme.muted, fontSize: 10 }}>{t.family.toLowerCase()}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row' }}><DragBar frac={on ? Math.max(0.04, (db + 40) / 40) : 0} onFrac={(x) => client.set(path, f(x < 0.03 ? 0 : dbToFader(x * 40 - 40)))} color={c} bg={theme.panel} barH={10} label={`Quantité de ${t.fr}`} valueText={on ? `${formatDb(v)} dB` : 'aucun'} /></View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable onPress={() => client.set(path, f(on ? dbToFader(Math.max(-40, db - 2)) : 0))} accessibilityLabel={`Moins de ${t.fr}`} style={[styles.pm, { width: 40, height: 40, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>−</Text></Pressable>
                      <Text style={{ flex: 1, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800' }}>{on ? `${formatDb(v)} dB` : 'aucun'}</Text>
                      <Pressable onPress={() => client.set(path, f(on ? dbToFader(Math.min(0, db + 2)) : dbToFader(-20)))} accessibilityLabel={`Plus de ${t.fr}`} style={[styles.pm, { width: 40, height: 40, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>+</Text></Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable onPress={() => client.set(path, f(on ? 0 : dbToFader(-14)))} style={[styles.quick, { flex: 1, borderColor: on ? theme.mute : theme.line2, alignItems: 'center' }]}>
                        <Text style={{ color: on ? '#FCA5A5' : theme.text, fontSize: 12, fontWeight: '800' }}>{on ? '✕ Retirer' : '+ Ajouter'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setFxOpen(k + 1)} style={[styles.quick, { borderColor: c, alignItems: 'center' }]}>
                        <Text style={{ color: c, fontSize: 12, fontWeight: '800' }}>Régler</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* QUI ENTEND CETTE VOIE */}
        {show('qui') && <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1 }]}>
          <Text style={[styles.kicker, { color: theme.muted }]}>QUI ENTEND « {name.toUpperCase()} »</Text>
          {dests.map((t, k) => {
            const m = mixInfo(client, t);
            const db = faderToDb(destLv[k]);
            const on = destLv[k] > 0;
            const path = chLevelPath(ch, t);
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                <View style={[styles.avatar, { backgroundColor: m.color }]}><Text style={{ color: '#0B0D10', fontSize: 10, fontWeight: '800' }}>{m.ini}</Text></View>
                <Text numberOfLines={1} style={{ width: 86, color: theme.text, fontSize: 13, fontWeight: '700' }}>{m.name}</Text>
                <DragBar frac={on ? Math.max(0.03, (db + 40) / 50) : 0} onFrac={(x) => client.set(path, f(x < 0.03 ? 0 : dbToFader(x * 50 - 40)))} color={m.color} bg={theme.meterBg} label={`Niveau pour ${m.name}`} valueText={on ? formatDb(destLv[k]) : 'rien'} />
                <Pressable onPress={() => client.set(path, f(on ? dbToFader(Math.max(-40, db - 2)) : 0))} accessibilityLabel={`Moins pour ${m.name}`} style={[styles.pm, { width: 38, height: 38, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>−</Text></Pressable>
                <Text style={{ width: 48, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{on ? formatDb(destLv[k]) : 'rien'}</Text>
                <Pressable onPress={() => client.set(path, f(on ? dbToFader(Math.min(10, db + 2)) : dbToFader(-10)))} accessibilityLabel={`Plus pour ${m.name}`} style={[styles.pm, { width: 38, height: 38, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>+</Text></Pressable>
              </View>
            );
          })}
        </View>}

        <View style={{ height: 30 }} />
      </ScrollView>

      <PresetsSheet client={client} theme={theme} visible={lib} ch={ch} onClose={() => setLib(false)} />
      <EffectDetail client={client} theme={theme} slot={fxOpen} names={fxNames} onNames={(n) => { setFxNames(n); saveFxNames(n); }} onClose={() => setFxOpen(null)} onOpen={setFxOpen} />
      <InputSheet client={client} ch={inputOpen ? ch : null} theme={theme} onClose={() => setInputOpen(false)} />
      <InputSourceSheet client={client} ch={srcOpen ? ch : null} theme={theme} onClose={() => setSrcOpen(false)} />
    </View>
  );
}

function Toggle(props: { on: boolean; theme: Theme; onPress: () => void }) {
  const { theme, on } = props;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} style={[styles.toggle, on ? { backgroundColor: theme.ok } : { borderColor: theme.line2, borderWidth: 1 }]}>
      <Text style={{ color: on ? '#0B0D10' : theme.muted, fontWeight: '700', fontSize: 12 }}>{on ? 'ACTIF' : 'COUPÉ'}</Text>
    </Pressable>
  );
}

function Card(props: { theme: Theme; title: string; color: string; on?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  const { theme } = props;
  return (
    <View style={[styles.card, { backgroundColor: theme.panel, borderColor: props.color, borderWidth: 2 }]}>
      <View style={styles.cardHead}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{props.title}</Text>
        {props.onToggle && <Toggle on={!!props.on} theme={theme} onPress={props.onToggle} />}
      </View>
      {props.children}
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40 },
  wideRoot: { paddingTop: 8, borderLeftWidth: 1, borderLeftColor: '#2A3038' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  back: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12, gap: 12 },
  chip: { height: 40, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
  block: { width: 78, height: 70, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  card: { borderRadius: 18, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { height: 32, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  plug: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wide: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bandBtn: { flex: 1, height: 50, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pm: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pmText: { fontSize: 20, fontWeight: '800' },
  quick: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  sub: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  fxTile: { width: '48%', flexGrow: 1, borderRadius: 14, borderWidth: 2, padding: 10, gap: 8 },
  fxBadge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
