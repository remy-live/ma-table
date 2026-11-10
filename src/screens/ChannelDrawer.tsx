// LE tiroir d'une entrée — le même partout (appui sur une tranche, vue Table,
// branchements). Deux onglets :
//   🎚 Régler  : gain + vumètre, couleur, 48 V, phase, panoramique, prise, groupes
//   🔗 Relier  : une case par sortie et par effet, un appui relie, un curseur dose
// Renommer, changer de prise et les préréglages s'ouvrent d'ici.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { f, i } from '../osc/osc';
import { dbLabel } from '../ui/format';
import { HSlider } from '../ui/HSlider';
import { Btn, Kicker, RAD, Segmented, SEM } from '../ui/kit';
import { Knob } from '../ui/Knob';
import { Theme } from '../ui/theme';
import { useAnyTick } from '../ui/useTick';
import {
  BUS_COUNT, busNamePath, chDcaPath, chLevelPath, chNamePath, chOnPath, DCA_COUNT, dcaNamePath, formatPan, FX_COUNT, fToGainDb, headampGainPath,
  inDca, insrcLabel, soloPath, hpOnPath, hpfPath, hpfHzToF, fToHpfHz, insrcPath, insrcPlug, invertPath, MAIN, meterIndex, panPath, panToF, phantomPath, Target, targetId, toggleDca,
} from '../xair/addresses';
import { fxType, fxTypePath } from '../xair/effects';
import { SLOT_COLORS } from '../xair/fxSlots';
import { dbToFader } from '../xair/levels';
import { chColorOf, colorOf, TABLE_COLORS } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { linkSide, onSide, toAllReturns, unlinkSide } from '../xair/wiring';
import { useMono } from '../ui/useMono';
import { XAirClient } from '../xair/XAirClient';
import { GROUP_COLORS } from './GroupsSheet';
import { InputSourceSheet } from './InputSourceSheet';
import { MIX_COLORS } from './MixPicker';
import { PresetsSheet } from './PresetsSheet';
import { SmartRenameSheet } from './SmartRenameSheet';

export interface DrawerActions {
  /** ouvrir l'égaliseur / le détail de la voie */
  onDetail?: (ch: number) => void;
  /** copier les réglages de cette voie vers d'autres */
  onCopy?: (ch: number) => void;
}
type Mode = 'in' | 'link';

/** Les adresses dont le tiroir a besoin pour une voie. */
export function drawerPaths(ch: number): string[] {
  const p = [chNamePath(ch), soloPath(ch), hpOnPath(ch), hpfPath(ch), headampGainPath(ch), phantomPath(ch), invertPath(ch), panPath(ch), chOnPath(ch), chDcaPath(ch), insrcPath(ch), chLevelPath(ch, MAIN)];
  for (let b = 1; b <= BUS_COUNT; b++) p.push(chLevelPath(ch, { kind: 'bus', n: b }), busNamePath(b));
  for (let k = 1; k <= FX_COUNT; k++) p.push(chLevelPath(ch, { kind: 'fx', n: k }), fxTypePath(k));
  return p;
}

export function ChannelDrawer(props: { client: XAirClient; theme: Theme; ch: number; actions?: DrawerActions; onClose?: () => void }) {
  const { client, theme, ch } = props;
  useAnyTick(client, 100);
  const mono = useMono(client);
  const wide = useWindowDimensions().width >= 900;
  const [mode, setMode] = useState<Mode>('in');
  const [rename, setRename] = useState(false);
  const [source, setSource] = useState(false);
  const [presets, setPresets] = useState(false);
  useEffect(() => { client.loadPaths(drawerPaths(ch)); }, [client, ch]);

  const n2 = String(ch).padStart(2, '0');
  const name = String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;
  const colIdx = Number(client.get(`/ch/${n2}/config/color`) ?? 0) & 7;
  const color = chColorOf(colIdx, ch);
  const insrc = Number(client.get(insrcPath(ch)) ?? ch - 1);

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={styles.row}>
        <View style={[styles.tag, { borderColor: color }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{insrcPlug(insrc)}</Text></View>
        <Pressable onPress={() => setRename(true)} accessibilityLabel={`Renommer ${name}`} style={{ flex: 1, minWidth: 120 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 19, fontWeight: '800' }}>{name} <Text style={{ color: theme.muted, fontSize: 14 }}>✎</Text></Text>
        </Pressable>
        <Segmented theme={theme} value={mode} onChange={setMode} options={[['in', '🎚 Régler'], ['link', '🔗 Relier']] as const} />
        {props.onClose && <Btn theme={theme} kind="primary" small label="OK" onPress={props.onClose} />}
      </View>

      {mode === 'in' ? (
        <ScrollView contentContainerStyle={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 18 : 12, alignItems: wide ? 'flex-start' : 'stretch' }}>
          <GainBlock client={client} theme={theme} ch={ch} color={color} wide={wide} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {Object.keys(TABLE_COLORS).map(Number).map((k) => (
                <Pressable key={k} onPress={() => client.set(`/ch/${n2}/config/color`, i(k))} accessibilityLabel={`Couleur ${k}`} style={[styles.sw, { backgroundColor: TABLE_COLORS[k], borderColor: colIdx === k ? '#FFFFFF' : 'transparent' }]} />
              ))}
            </View>
            <Toggles client={client} theme={theme} ch={ch} />
            <PanRow client={client} theme={theme} ch={ch} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Pressable onPress={() => setSource(true)} style={[styles.line, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
              <Kicker theme={theme}>BRANCHÉE SUR</Kicker>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 14, flex: 1 }}>{insrcLabel(insrc)}</Text>
              <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 12 }}>Changer ›</Text>
            </Pressable>
            <Groups client={client} theme={theme} ch={ch} />
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {props.actions?.onDetail && <Btn theme={theme} small icon="〰" label="Égaliseur" onPress={() => props.actions!.onDetail!(ch)} style={styles.act} />}
              <Btn theme={theme} small icon="★" label="Préréglages" onPress={() => setPresets(true)} style={styles.act} />
              {props.actions?.onCopy && <Btn theme={theme} small icon="⧉" label="Copier les réglages" onPress={() => props.actions!.onCopy!(ch)} style={styles.act} />}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 6 }}>
          <View style={[styles.knobs, !wide && { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
            {!mono && (['L', 'R'] as const).map((sd) => {
              // 2 enceintes : la façade a deux sorties, la voie part à gauche, à droite ou des deux côtés
              const path = chLevelPath(ch, MAIN);
              const on = onSide(client, [ch], sd);
              const v = on ? Number(client.get(path) ?? 0) : 0;
              return <LevelKnob key={'main' + sd} theme={theme} value={v} label={`Façade ${sd}`} kicker={sd === 'L' ? 'MAIN L' : 'MAIN R'} color={MIX_COLORS[0]} wide={wide}
                onToggle={() => (on ? unlinkSide(client, [ch], sd) : linkSide(client, [ch], sd, -10))} onSet={(x) => { if (!on) linkSide(client, [ch], sd, -10); client.set(path, f(x)); }} />;
            })}
            {[...(mono ? [MAIN] : []), ...Array.from({ length: BUS_COUNT }, (_, k) => ({ kind: 'bus', n: k + 1 }) as Target)].map((t) => {
              const c = t.kind === 'main' ? MIX_COLORS[0] : MIX_COLORS[(t as { n: number }).n] ?? '#9AA3AD';
              const label = t.kind === 'main' ? 'Le public' : String(client.get(busNamePath((t as { n: number }).n)) ?? '') || `Retour ${(t as { n: number }).n}`;
              return <DestKnob key={targetId(t)} client={client} theme={theme} path={chLevelPath(ch, t)} label={label} color={c} wide={wide} startDb={-10} />;
            })}
            {wide && <View style={[styles.sep, { backgroundColor: theme.line2 }]} />}
            {Array.from({ length: FX_COUNT }, (_, k) => k + 1).map((k) => (
              <DestKnob key={'fx' + k} client={client} theme={theme} path={chLevelPath(ch, { kind: 'fx', n: k })} label={fxType(Number(client.get(fxTypePath(k)) ?? 0)).fr} kicker={`FX${k}`} color={SLOT_COLORS[k - 1]} wide={wide} startDb={-14} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: theme.muted, fontSize: 12 }}>Touche un nom pour relier ou délier · tourne le bouton au doigt pour doser</Text>
            <Btn theme={theme} small kind="ghost" label="+ Vers tous les retours nommés" onPress={() => toAllReturns(client, { n: insrcPlug(insrc), chans: [ch], name, usb: false })} />
          </View>
        </ScrollView>
      )}

      <SmartRenameSheet client={client} ch={rename ? ch : null} theme={theme} onClose={() => setRename(false)} />
      <InputSourceSheet client={client} ch={source ? ch : null} theme={theme} onClose={() => setSource(false)} />
      <PresetsSheet client={client} theme={theme} visible={presets} ch={ch} onClose={() => setPresets(false)} />
    </View>
  );
}

function GainBlock({ client, theme, ch, color, wide }: { client: XAirClient; theme: Theme; ch: number; color: string; wide: boolean }) {
  const gain = client.get(headampGainPath(ch));
  const m = useMeter(client, [meterIndex.ch(ch)], 100);
  const gdb = gain === undefined ? null : fToGainDb(Number(gain));
  const zone = m.clip ? SEM.danger : m.db > -6 ? '#EAB308' : m.db > -24 ? '#22C55E' : theme.muted;
  const advice = m.clip ? 'Ça sature : baisse' : m.db > -6 ? 'Un peu fort' : m.db < -55 ? 'Joue fort pour régler' : m.db < -24 ? 'Trop faible : monte' : 'Bon niveau';
  return (
    <View style={{ alignItems: 'center', gap: 3, flexDirection: wide ? 'column' : 'row' }}>
      <Knob value={gain === undefined ? 0.5 : Number(gain)} size={wide ? 96 : 80} theme={theme} color={color} dim={gain === undefined} label="Gain" onChange={gain === undefined ? undefined : (v) => client.set(headampGainPath(ch), f(v))} />
      <View style={{ alignItems: 'center', gap: 3, width: 132 }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{gdb === null ? 'Entrée ligne' : `Gain ${gdb > 0 ? '+' : ''}${gdb.toFixed(0)} dB`}</Text>
        <View style={{ alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: theme.meterBg, overflow: 'hidden' }}>
          <View style={{ width: `${m.level * 100}%`, height: 10, backgroundColor: zone }} />
          <View style={{ position: 'absolute', left: '70%', width: '20%', top: 0, bottom: 0, borderWidth: 1, borderColor: theme.text, borderRadius: 3, opacity: 0.4 }} />
        </View>
        <Text style={{ color: zone, fontSize: 11, fontWeight: '800' }}>{advice}</Text>
      </View>
    </View>
  );
}

function Toggles({ client, theme, ch }: { client: XAirClient; theme: Theme; ch: number }) {
  const hasPreamp = client.get(headampGainPath(ch)) !== undefined;
  const p48 = Number(client.get(phantomPath(ch)) ?? 0) === 1;
  const inv = Number(client.get(invertPath(ch)) ?? 0) === 1;
  const on = Number(client.get(chOnPath(ch)) ?? 1) === 1;
  const solo = Number(client.get(soloPath(ch)) ?? 0) === 1;
  // coupe-bas : enlève souffle, bruits de pied de micro, boum de scène. Conseillé sur voix et guitares.
  const hp = Number(client.get(hpOnPath(ch)) ?? 0) === 1;
  const nm = String(client.get(chNamePath(ch)) ?? '');
  const isBass = /bass|kick|grosse/i.test(nm);
  const advised = !hp && /voix|chant|vocal|guit|chœur|choeur|overhead|charley|hat/i.test(nm);
  const cutHz = /voix|chant|vocal|chœur|choeur/i.test(nm) ? 100 : isBass ? 40 : 80;
  const T = ({ label, active, bg, onPress }: { label: string; active: boolean; bg: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: active }} style={[styles.tg, { backgroundColor: active ? bg : theme.deep, borderColor: active ? bg : theme.line2 }]}>
      <Text style={{ color: active ? (bg === theme.text ? theme.bg : '#FFFFFF') : theme.text, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {hasPreamp && (
        <T label={p48 ? '48 V allumé' : '48 V'} active={p48} bg="#DC2626" onPress={() => (p48 ? client.set(phantomPath(ch), i(0)) : Alert.alert('Activer le 48 V ?', 'Seulement pour un micro statique ou une DI active. Baisse le volume avant, ça peut claquer.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Activer', onPress: () => client.set(phantomPath(ch), i(1)) }]))} />
      )}
      <T label="Phase Ø" active={inv} bg={theme.text} onPress={() => client.set(invertPath(ch), i(inv ? 0 : 1))} />
      <T label={on ? 'Couper' : 'Voie coupée'} active={!on} bg={theme.mute} onPress={() => client.set(chOnPath(ch), i(on ? 0 : 1))} />
      <T label={hp ? `Coupe-bas ${Math.round(fToHpfHz(Number(client.get(hpfPath(ch)) ?? 0)))} Hz` : advised ? 'Coupe-bas ★' : 'Coupe-bas'} active={hp} bg="#2563EB" onPress={() => { if (hp) client.set(hpOnPath(ch), i(0)); else { client.set(hpfPath(ch), f(hpfHzToF(cutHz))); client.set(hpOnPath(ch), i(1)); } }} />
      <T label={solo ? '🎧 Solo ✓' : '🎧 Solo'} active={solo} bg="#CA8A04" onPress={() => client.set(soloPath(ch), i(solo ? 0 : 1))} />
    </View>
  );
}

function PanRow({ client, theme, ch }: { client: XAirClient; theme: Theme; ch: number }) {
  const pan = Number(client.get(panPath(ch)) ?? 0.5);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1 }}><HSlider label="G ↔ D" value={pan} center valueText={formatPan(pan)} onChange={(v) => client.set(panPath(ch), f(v))} color={theme.text} theme={theme} /></View>
      <Pressable onPress={() => client.set(panPath(ch), f(panToF(0)))} accessibilityLabel="Remettre au centre" style={[styles.tg, { borderColor: theme.line2, paddingHorizontal: 8 }]}><Text style={{ color: theme.muted, fontWeight: '800', fontSize: 12 }}>centre</Text></Pressable>
    </View>
  );
}

function Groups({ client, theme, ch }: { client: XAirClient; theme: Theme; ch: number }) {
  const mask = Number(client.get(chDcaPath(ch)) ?? 0);
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Kicker theme={theme}>GROUPES</Kicker>
      {Array.from({ length: DCA_COUNT }, (_, k) => k + 1).map((k) => {
        const inG = inDca(mask, k);
        const c = GROUP_COLORS[k - 1];
        return (
          <Pressable key={k} onPress={() => client.set(chDcaPath(ch), i(toggleDca(mask, k)))} accessibilityState={{ checked: inG }} style={[styles.chip, { borderColor: c, backgroundColor: inG ? c : 'transparent' }]}>
            <Text numberOfLines={1} style={{ color: inG ? SEM.ink : theme.text, fontWeight: '800', fontSize: 12 }}>{inG ? '✓ ' : ''}{String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Une destination en bouton rond : appui sur le nom = relier / délier, tourner = doser. */
function DestKnob({ client, theme, path, label, kicker, color, wide, startDb }: { client: XAirClient; theme: Theme; path: string; label: string; kicker?: string; color: string; wide: boolean; startDb: number }) {
  const v = Number(client.get(path) ?? 0);
  return <LevelKnob theme={theme} value={v} label={label} kicker={kicker} color={color} wide={wide} onToggle={() => client.set(path, f(v > 0 ? 0 : dbToFader(startDb)))} onSet={(x) => client.set(path, f(x))} />;
}

/** Bouton rond de niveau avec son nom au-dessus (relier / délier) et sa valeur dessous. */
export function LevelKnob({ theme, value: v, label, kicker, color, wide, onToggle, onSet, off = 'pas relié', size }: { size?: number; theme: Theme; value: number; label: string; kicker?: string; color: string; wide: boolean; onToggle: () => void; onSet: (v: number) => void; off?: string }) {
  const on = v > 0;
  return (
    <View style={[styles.dk, { width: wide ? undefined : 92, flex: wide ? 1 : undefined }]}>
      <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={`${kicker ? kicker + ' ' : ''}${label}`} style={[styles.dkPill, { backgroundColor: on ? color : theme.deep, borderColor: color, borderStyle: on ? 'solid' : 'dashed' }]}>
        {kicker && <Text style={{ color: on ? SEM.ink : color, fontSize: 9, fontWeight: '900' }}>{kicker}</Text>}
        <Text numberOfLines={1} style={{ color: on ? SEM.ink : theme.text, fontWeight: '800', fontSize: 11 }}>{on ? '' : '+ '}{label}</Text>
      </Pressable>
      <Knob value={v} size={size ?? (wide ? 58 : 52)} theme={theme} color={color} dim={!on} label={`Niveau ${label}`} onPress={onToggle} onChange={onSet} />
      <Text style={{ color: on ? theme.text : theme.muted, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{on ? dbLabel(v) : off}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  knobs: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  sep: { width: 2, borderRadius: 1, marginHorizontal: 2 },
  dk: { alignItems: 'center', gap: 4, minWidth: 74 },
  dkPill: { alignSelf: 'stretch', minHeight: 34, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag: { minWidth: 42, height: 42, borderRadius: RAD.md, borderWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sw: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  tg: { minHeight: 38, paddingHorizontal: 9, borderRadius: RAD.sm, borderWidth: 1, justifyContent: 'center' },
  line: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: RAD.sm + 2, paddingHorizontal: 10 },
  chip: { height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 2, justifyContent: 'center', maxWidth: 130 },
  act: { flexGrow: 1 },
});
