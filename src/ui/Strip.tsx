// Tranches de console, direction A : bouton de gain, témoins 48 V / Ø, pan,
// bandeau de nom coloré, mute, fader + vumètre, boutons EQ et FX.
// Les faders règlent la « cible » choisie en haut (façade, un retour ou un effet).
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  chDcaPath, chLevelPath, chNamePath, chOnPath, dcaFaderPath, dcaOnPath, fToGainDb, fToPan, headampGainPath,
  inDca, invertPath, meterIndex, outOnPath, outPath, panPath, phantomPath, Target,
  insrcPath, insrcPlug, sourceKind,
} from '../xair/addresses';
import { Group, moveMembers, snapshot } from '../xair/groups';
import { dbToFader, faderToDb, formatDb } from '../xair/levels';
import { colorOf } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { useFader, useMute, useParam, useParamOpt } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { Fader } from './Fader';
import { Knob } from './Knob';
import { tick } from './haptics';
import { f } from '../osc/osc';
import { Theme } from './theme';
import { SLOT_COLORS } from '../xair/fxSlots';

export const GROUP_COLOR = '#F59E0B';

/** Le fader prend toute la hauteur qui reste dans la tranche : le bas reste toujours visible. */
function AutoFader(props: React.ComponentProps<typeof Fader>) {
  const [h, setH] = useState(0);
  return (
    <View style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', minHeight: 90 }} onLayout={(e) => setH(Math.floor(e.nativeEvent.layout.height))}>
      {h > 0 && <Fader {...props} height={Math.max(90, h)} />}
    </View>
  );
}
export type StripView = 'full' | 'compact' | 'gains' | 'table';
const SUGGESTIONS = ['Voix', 'Guitare', 'Basse', 'Kick', 'Caisse claire', 'Charley', 'Toms', 'Overhead', 'Clavier'];

/** Hauteur d'une tranche hors fader (en-tête, gain, nom, mute, dB, EQ/FX, marges). */
export const STRIP_CHROME = 318;

interface StripProps {
  client: XAirClient;
  ch: number;
  target: Target;
  color: string; // couleur de la cible (remplissage du fader)
  theme: Theme;
  height: number;
  selected: boolean;
  inOpenGroup: boolean;
  /** mode copier/échanger : cette voie est une cible possible */
  pasteTarget?: boolean;
  pasted?: boolean;
  pasteLabel?: string;
  onPasteToggle?: (ch: number) => void;
  dim?: boolean;
  width?: number;
  view?: StripView;
  onSelect: (ch: number) => void;
  onRename: (ch: number) => void;
  onOpenInput: (ch: number) => void;
  onOpenDetail: (ch: number) => void;
  onOpenFx?: (ch: number) => void;
}

export function Strip(p: StripProps) {
  const { client, ch, target, theme } = p;
  const [level, setLevel] = useFader(client, chLevelPath(ch, target));
  const [muted, toggleMute] = useMute(client, chOnPath(ch));
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const scribble = colorOf(Number(useParam<number>(client, `/ch/${String(ch).padStart(2, '0')}/config/color`, 0)));
  const gain = useParamOpt(client, headampGainPath(ch));
  const p48 = Number(useParamOpt(client, phantomPath(ch)) ?? 0) === 1;
  const inv = Number(useParam<number>(client, invertPath(ch), 0)) === 1;
  const pan = Number(useParam<number>(client, panPath(ch), 0.5));
  const eqOn = Number(useParamOpt(client, `/ch/${String(ch).padStart(2, '0')}/eq/on`) ?? 0) === 1;
  // (map et non some : le nombre de hooks doit rester constant)
  const fxVals = [7, 8, 9, 10].map((b) => useParamOpt(client, `/ch/${String(ch).padStart(2, '0')}/mix/${String(b).padStart(2, '0')}/level`));
  const fxOn = fxVals.some((v) => Number(v ?? 0) > 0);
  const meter = useMeter(client, [meterIndex.ch(ch)]);
  const gainDb = gain === undefined ? null : fToGainDb(Number(gain));
  const insrc = Number(useParam<number>(client, insrcPath(ch), ch - 1));
  const kind = sourceKind(insrc, p48);

  const narrow = (p.width ?? 92) < 80;
  const bg = p.selected ? '#1F1C14' : p.inOpenGroup ? '#1C1A14' : theme.panel;
  const border = p.selected ? GROUP_COLOR : p.inOpenGroup ? '#4A3B12' : theme.line;

  return (
    <View style={[styles.strip, { height: p.height, width: p.width ?? 92, backgroundColor: bg, borderColor: border, borderWidth: p.selected ? 3 : 1, opacity: p.dim ? 0.45 : 1 }]}>
      {p.selected && (
        <View style={{ position: 'absolute', top: -1, left: -1, right: -1, zIndex: 2, backgroundColor: GROUP_COLOR, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingVertical: 3, alignItems: 'center' }}>
          <Text style={{ color: '#1A1204', fontSize: 11, fontWeight: '800' }}>✓ SÉLECTIONNÉE</Text>
        </View>
      )}
      {p.pasteTarget && (
        <Pressable
          onPress={() => p.onPasteToggle?.(ch)}
          accessibilityRole="button"
          accessibilityState={{ selected: !!p.pasted }}
          accessibilityLabel={`${p.pasteLabel ?? 'Coller ici'} : ${name}`}
          style={[StyleSheet.absoluteFill, { zIndex: 5, borderRadius: 12, borderWidth: 3, borderStyle: 'dashed', borderColor: p.pasted ? '#34D399' : GROUP_COLOR, backgroundColor: p.pasted ? 'rgba(52,211,153,0.28)' : 'rgba(245,158,11,0.14)', alignItems: 'center', justifyContent: 'center', padding: 6 }]}
        >
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', textAlign: 'center' }}>{p.pasted ? '✓' : '+'}</Text>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{p.pasteLabel ?? 'Coller ici'}</Text>
        </Pressable>
      )}
      {p.view !== 'compact' && (<>
      <Pressable
        onPress={() => p.onOpenInput(ch)}
        accessibilityRole="button"
        accessibilityLabel={`Prise ${insrcPlug(insrc)} · ${kind}`}
        style={[styles.head, { backgroundColor: theme.deep, borderColor: theme.line, borderWidth: 1, height: 34 }]}
      >
        <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '800' }}>PRISE {insrcPlug(insrc)}</Text>
        <Text style={{ color: kind === 'Micro 48V' ? '#F87171' : kind === 'USB' ? '#A3E635' : theme.text, fontSize: 10, fontWeight: '700' }}>{kind}</Text>
      </Pressable>

      <Pressable onPress={() => p.onOpenInput(ch)} accessibilityRole="button" accessibilityLabel={`Entrée de ${name}`} style={styles.inputZone}>
        <Knob
          value={gain === undefined ? 0.5 : Number(gain)}
          size={52}
          color={scribble}
          theme={theme}
          dim={gain === undefined}
          label={`Gain de ${name}`}
          onPress={() => p.onOpenInput(ch)}
          onChange={gain === undefined ? undefined : (v) => {
            const before = fToGainDb(Number(gain));
            const after = fToGainDb(v);
            if ((before < 0 && after >= 0) || (before > 0 && after <= 0)) tick();
            client.set(headampGainPath(ch), f(v));
          }}
        />
        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {gainDb === null ? 'Ligne' : `${gainDb > 0 ? '+' : ''}${gainDb.toFixed(0)} dB`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Badge on={p48} label="48V" onBg="#DC2626" onInk="#FFFFFF" theme={theme} w={32} />
          <Badge on={inv} label="Ø" onBg={theme.text} onInk={theme.bg} theme={theme} w={24} />
        </View>
        <PanBar value={pan} theme={theme} />
      </Pressable>
      </>)}

      <Pressable
        onPress={() => p.onRename(ch)}
        onLongPress={() => p.onRename(ch)}
        accessibilityRole="button"
        accessibilityLabel={`Renommer ${name}`}
        style={[styles.name, { backgroundColor: theme.deep, borderBottomColor: scribble }]}
      >
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
          {name}
        </Text>
      </Pressable>

      <MuteButton muted={muted} onPress={toggleMute} theme={theme} narrow={narrow} />
      <AutoFader
        narrow={narrow}
        value={level}
        onChange={setLevel}
        color={p.color}
        theme={theme}
        label={name}
        meter={muted ? 0 : meter.level}
        clip={meter.clip}
      />
      <Text style={[styles.db, { color: theme.muted }]}>{formatDb(level)}</Text>

      <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 4, width: '100%', alignItems: 'stretch' }}>
        <SmallBtn label="EQ" on={eqOn} onColor="#F59E0B" theme={theme} onPress={() => p.onOpenDetail(ch)} a11y={`Égaliseur de ${name}`} narrow={narrow} />
        <Pressable onPress={() => (p.onOpenFx ?? p.onOpenDetail)(ch)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Effets de ${name}`} style={[narrow ? styles.smallN : styles.small, narrow && { height: 40 }, { borderColor: fxOn ? theme.line2 : theme.line, backgroundColor: theme.deep, flexDirection: 'row', flexWrap: 'wrap', gap: 3, padding: narrow ? 3 : 6 }]}>
          {fxVals.map((v, k) => {
            const on = Number(v ?? 0) > 0;
            const d = faderToDb(Number(v ?? 0));
            const s = on ? Math.round(7 + Math.max(0, Math.min(1, (d + 40) / 40)) * 6) : 7;
            return <View key={k} style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: on ? SLOT_COLORS[k] : 'transparent', borderWidth: on ? 0 : 1, borderColor: theme.line2 }} /></View>;
          })}
        </Pressable>
      </View>
    </View>
  );
}

/** Tranche de groupe repliable. Façade : vrai DCA de la table. Retours / effets :
 *  l'appli décale les envois des membres du même nombre de dB. */
export function GroupStrip(props: {
  client: XAirClient;
  group: Group;
  target: Target;
  theme: Theme;
  height: number;
  open: boolean;
  onToggleOpen: () => void;
  virtual: number;
  setVirtual: (v: number) => void;
  width?: number;
}) {
  const { client, group, target, theme } = props;
  const narrow = (props.width ?? 92) < 80;
  const isMain = target.kind === 'main';
  const [dca, setDca] = useFader(client, dcaFaderPath(group.k));
  const [dcaMuted, toggleDca] = useMute(client, dcaOnPath(group.k));
  const gesture = useRef<{ snap: Map<number, number>; v0: number } | null>(null);
  const value = isMain ? dca : props.virtual;

  const begin = () => {
    if (!isMain) gesture.current = { snap: snapshot(client, group.members, target), v0: props.virtual };
  };
  const change = (v: number) => {
    if (isMain) return setDca(v);
    props.setVirtual(v);
    const g = gesture.current;
    if (g) moveMembers(client, g.snap, target, faderToDb(v) - faderToDb(g.v0));
  };
  const end = () => {
    gesture.current = null;
  };
  const nudge = (db: number) => {
    begin();
    const cur = faderToDb(value);
    change(dbToFader((isFinite(cur) ? cur : -30) + db));
    end();
  };

  return (
    <View style={[styles.strip, { height: props.height, width: props.width ?? 92, backgroundColor: '#1C1A14', borderColor: '#6B4E14', borderWidth: 2 }]}>
      <View style={[styles.head, { backgroundColor: GROUP_COLOR }]}>
        <Text style={{ color: '#1A1204', fontSize: 10, fontWeight: '800' }}>GROUPE</Text>
      </View>
      <Text style={{ color: '#FBBF24', fontSize: 14, fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>
        {group.name}
      </Text>
      <Text style={{ color: '#D6B46A', fontSize: 11 }}>{group.members.length} {group.members.length > 1 ? 'voies' : 'voie'}</Text>
      <Pressable
        onPress={props.onToggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: props.open }}
        style={[styles.fold, narrow && { width: '100%' }]}
      >
        <Text style={{ color: '#FCD34D', fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{props.open ? '◂ Replier' : 'Déplier ▸'}</Text>
      </Pressable>
      <MiniMeters client={client} members={group.members} />
      {isMain ? <MuteButton muted={dcaMuted} onPress={toggleDca} theme={theme} narrow={narrow} /> : <View style={{ height: 30 }} />}
      <AutoFader
        narrow={narrow}
        value={value}
        onChange={change}
        onStart={begin}
        onEnd={end}
        color={GROUP_COLOR}
        theme={theme}
        label={`Groupe ${group.name}`}
      />
      <Text style={[styles.db, { color: '#D6B46A' }]}>{formatDb(value)}</Text>
      <View style={{ flexDirection: 'row', gap: 4, width: '100%' }}>
        <Pressable onPress={() => nudge(-2)} accessibilityLabel={`Baisser ${group.name} de 2 dB`} style={styles.nudge}>
          <Text style={{ color: '#FCD34D', fontSize: 18, fontWeight: '800' }}>−</Text>
        </Pressable>
        <Pressable onPress={() => nudge(2)} accessibilityLabel={`Monter ${group.name} de 2 dB`} style={styles.nudge}>
          <Text style={{ color: '#FCD34D', fontSize: 18, fontWeight: '800' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OutStrip(props: { client: XAirClient; target: Target; label: string; color: string; theme: Theme; height: number }) {
  const { client, target, theme } = props;
  const [level, setLevel] = useFader(client, outPath(target));
  const [muted, toggleMute] = useMute(client, outOnPath(target));
  const idx = target.kind === 'main' ? [meterIndex.lrL, meterIndex.lrR] : target.kind === 'bus' ? [meterIndex.bus(target.n)] : [meterIndex.fxsend(target.n)];
  const meter = useMeter(client, idx);
  return (
    <View style={[styles.strip, { height: props.height, backgroundColor: theme.deep, borderColor: theme.line, borderWidth: 1 }]}>
      <View style={[styles.head, { backgroundColor: props.color }]}>
        <Text style={{ color: '#0B0D10', fontSize: 10, fontWeight: '800' }}>SORTIE</Text>
      </View>
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
        {props.label}
      </Text>
      <View style={{ height: 110 }} />
      <MuteButton muted={muted} onPress={toggleMute} theme={theme} />
      <AutoFader value={level} onChange={setLevel} color={props.color} theme={theme} label={`Sortie ${props.label}`} meter={meter.level} clip={meter.clip} />
      <Text style={[styles.db, { color: theme.muted }]}>{formatDb(level)}</Text>
      <View style={{ height: 40 }} />
    </View>
  );
}

// ---------- petits éléments ----------

function Badge({ on, label, onBg, onInk, theme, w }: { on: boolean; label: string; onBg: string; onInk: string; theme: Theme; w: number }) {
  return (
    <View style={[styles.badge, { width: w }, on ? { backgroundColor: onBg } : { borderWidth: 1, borderColor: theme.line2 }]}>
      <Text style={{ color: on ? onInk : theme.muted, fontSize: 10, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function PanBar({ value, theme }: { value: number; theme: Theme }) {
  const p = fToPan(value);
  return (
    <View style={styles.pan} accessibilityLabel={`Panoramique ${Math.abs(p) < 2 ? 'centre' : (p < 0 ? 'gauche ' : 'droite ') + Math.round(Math.abs(p))}`}>
      <View style={[styles.panLine, { backgroundColor: theme.line }]} />
      <View style={[styles.panMid, { backgroundColor: theme.line2 }]} />
      <View style={[styles.panDot, { left: value * 48, backgroundColor: theme.text }]} />
    </View>
  );
}

function MiniMeters({ client, members }: { client: XAirClient; members: number[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, height: 24, alignItems: 'flex-end' }}>
      {members.slice(0, 8).map((ch) => (
        <MiniMeter key={ch} client={client} ch={ch} />
      ))}
    </View>
  );
}

function MiniMeter({ client, ch }: { client: XAirClient; ch: number }) {
  const m = useMeter(client, [meterIndex.ch(ch)], 120);
  return <View style={{ width: 7, height: Math.max(2, m.level * 24), borderRadius: 2, backgroundColor: m.clip ? '#EF4444' : '#22C55E' }} />;
}

function SmallBtn(props: { label: string; on: boolean; onColor: string; theme: Theme; onPress: () => void; a11y: string; narrow?: boolean }) {
  const { theme, on } = props;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.a11y}
      style={[props.narrow ? styles.smallN : styles.small, { borderColor: on ? props.onColor : theme.line, backgroundColor: theme.deep }]}
    >
      <Text style={{ color: on ? props.onColor : theme.muted, fontSize: 14, fontWeight: '800' }}>{props.label}</Text>
    </Pressable>
  );
}

function MuteButton({ muted, onPress, theme, narrow }: { muted: boolean; onPress: () => void; theme: Theme; narrow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: muted }}
      accessibilityLabel={muted ? 'Réactiver' : 'Couper'}
      style={[styles.mute, narrow && { width: '100%' }, muted ? { backgroundColor: theme.mute } : { borderColor: theme.line, borderWidth: 1 }]}
    >
      <Text style={{ color: muted ? theme.onMute : theme.muted, fontWeight: '800', fontSize: 11 }}>MUTE</Text>
    </Pressable>
  );
}

/** Feuille de saisie simple (groupes). Les voies utilisent SmartRenameSheet. */
export function RenameSheet(props: {
  visible: boolean;
  initial: string;
  title: string;
  theme: Theme;
  suggestions?: string[];
  onClose: () => void;
  onSave: (t: string) => void;
}) {
  const { theme } = props;
  const [text, setText] = useState(props.initial);
  return (
    <Modal visible={props.visible} transparent animationType="slide" onShow={() => setText(props.initial)} onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.panel }]}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{props.title}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={12}
            autoFocus
            placeholder="Nom"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]}
          />
          <View style={styles.chips}>
            {(props.suggestions ?? SUGGESTIONS).map((sug) => (
              <Pressable key={sug} onPress={() => setText(sug)} style={[styles.chip, { borderColor: theme.line2 }]}>
                <Text style={{ color: theme.text, fontSize: 14 }}>{sug}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={props.onClose} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}>
              <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16 }}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => props.onSave(text.trim())} style={[styles.btn, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 16 }}>Valider</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  strip: { width: 92, borderRadius: 12, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 4, alignItems: 'center', gap: 6 },
  head: { width: '100%', height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  inputZone: { alignItems: 'center', gap: 4, paddingVertical: 2 },
  knob: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center' },
  knobMark: { width: 3, height: 12, borderRadius: 2, marginTop: 2 },
  badge: { height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  pan: { width: 60, height: 12 },
  panLine: { position: 'absolute', left: 0, right: 0, top: 5, height: 2 },
  panMid: { position: 'absolute', left: 29.5, top: 1, width: 1, height: 10 },
  panDot: { position: 'absolute', top: 0, width: 12, height: 12, borderRadius: 6 },
  name: { width: '100%', minHeight: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderBottomWidth: 3 },
  mute: { width: 68, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  db: { fontSize: 11, fontVariant: ['tabular-nums'] },
  smallN: { alignSelf: 'stretch', height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  small: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fold: { width: 72, minHeight: 52, borderRadius: 10, borderWidth: 1, borderColor: '#6B4E14', backgroundColor: '#2A2115', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  nudge: { flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#6B4E14', backgroundColor: '#0E1013', alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  input: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
