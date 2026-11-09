import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  allTargets, busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, dcaNamePath, inDca, outOnPath, outPath, Target, targetId,
} from '../xair/addresses';
import { Clip, copyChannel, pasteChannel, swapChannels } from '../xair/clipboard';
import { copyMainTo, Group } from '../xair/groups';
import { Status, XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import { GroupStrip, OutStrip, Strip, STRIP_CHROME } from '../ui/Strip';
import { Theme } from '../ui/theme';
import { ChannelScreen } from './ChannelScreen';
import { GroupsSheet } from './GroupsSheet';
import { InputSheet } from './InputSheet';
import { PasteSheet } from './PasteSheet';
import { SmartRenameSheet } from './SmartRenameSheet';
import { Tool, ToolsSheet } from './ToolsSheet';
import { EffectsScreen } from './EffectsScreen';
import { PresetsSheet } from './PresetsSheet';
import { GuideScreen } from './GuideScreen';
import { WhoHearsScreen } from './WhoHearsScreen';
import { ClipBanner } from './ClipBanner';
import { AutoBalanceScreen } from './AutoBalanceScreen';

const CHANNELS = Array.from({ length: CH_COUNT }, (_, k) => k + 1);
const BUS_COLORS = ['#60A5FA', '#34D399', '#38BDF8', '#A3E635', '#FB923C', '#F87171'];
const FX_COLORS = ['#C084FC', '#F472B6', '#2DD4BF', '#FBBF24'];

function targetColor(t: Target, theme: Theme) {
  if (t.kind === 'main') return theme.text;
  return t.kind === 'bus' ? BUS_COLORS[t.n - 1] : FX_COLORS[t.n - 1];
}

/** Noms des retours et composition des groupes, relus en direct. */
function useMixerLabels(client: XAirClient) {
  const [tick, setTick] = useState(0);
  useEffect(
    () =>
      client.on('*', (_v, p) => {
        if (p.endsWith('/config/name') || p.endsWith('/grp/dca')) setTick((x) => x + 1);
      }),
    [client],
  );
  return useMemo(() => {
    const busName = (n: number) => String(client.get(busNamePath(n)) ?? '') || `Retour ${n}`;
    const groups: Group[] = [];
    for (let k = 1; k <= 4; k++) {
      const members = CHANNELS.filter((ch) => inDca(Number(client.get(chDcaPath(ch)) ?? 0), k));
      const name = String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`;
      if (members.length) groups.push({ k, name, members });
    }
    return { busName, groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tick]);
}

type Item = { kind: 'ch'; ch: number; inOpenGroup: boolean } | { kind: 'group'; g: Group };

export function MixerScreen(props: { client: XAirClient; theme: Theme; onNextTheme: () => void }) {
  const { client, theme } = props;
  const [status, setStatus] = useState<Status>(client.status);
  useEffect(() => client.onStatus(setStatus), [client]);

  const [target, setTarget] = useState<Target>({ kind: 'main' });
  const [detailCh, setDetailCh] = useState<number | null>(null);
  const [inputCh, setInputCh] = useState<number | null>(null);
  const [renameCh, setRenameCh] = useState<number | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [virtual, setVirtual] = useState<Record<string, number>>({});
  const [openGroups, setOpenGroups] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(CHANNELS);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<null | 'move' | 'swap'>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { busName, groups } = useMixerLabels(client);

  const say = (m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  // Ordre des voies à l'écran (Déplacer) : gardé dans l'appli.
  useEffect(() => {
    load<number[]>('ordre', CHANNELS).then((o) => o.length === CH_COUNT && setOrder(o));
  }, []);
  const setAndSaveOrder = (o: number[]) => {
    setOrder(o);
    save('ordre', o);
  };

  useEffect(() => {
    client.startMeters();
    return () => client.stopMeters();
  }, [client]);
  useEffect(() => {
    client.loadPaths([...CHANNELS.map((ch) => chLevelPath(ch, target)), outPath(target), outOnPath(target)]);
  }, [client, target]);

  const [bodyH, setBodyH] = useState(0);
  const faderH = Math.max(110, Math.min(460, bodyH - STRIP_CHROME));
  const label = (t: Target) => (t.kind === 'main' ? 'Façade' : t.kind === 'bus' ? busName(t.n) : `Effet ${t.n}`);
  const color = targetColor(target, theme);
  const name = (ch: number) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;

  // Liste à l'écran : chaque groupe prend la place de son premier membre ; ses voies n'apparaissent que déplié.
  const items: Item[] = [];
  const shown = new Set<number>();
  for (const ch of order) {
    const g = groups.find((x) => x.members.includes(ch));
    if (!g) {
      items.push({ kind: 'ch', ch, inOpenGroup: false });
      continue;
    }
    if (shown.has(g.k)) continue;
    shown.add(g.k);
    items.push({ kind: 'group', g });
    if (openGroups.includes(g.k)) order.filter((c) => g.members.includes(c)).forEach((c) => items.push({ kind: 'ch', ch: c, inOpenGroup: true }));
  }

  const onSelect = (ch: number) => {
    if (mode === 'swap' && sel !== null && ch !== sel) {
      const a = sel;
      setMode(null);
      setSel(null);
      swapChannels(client, a, ch).then(() => say(`Réglages échangés entre CH ${a} et CH ${ch}`));
      return;
    }
    setMode(null);
    setSel((s) => (s === ch ? null : ch));
  };

  const move = (dir: -1 | 1) => {
    if (sel === null) return;
    const o = order.slice();
    const i = o.indexOf(sel);
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setAndSaveOrder(o);
  };

  const dot = status === 'connecté' ? theme.ok : status === 'perdu' ? theme.mute : theme.accent;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Ma table</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {status === 'perdu' ? 'Liaison perdue — la table garde son mix' : `${client.info?.name ?? 'Table'} · ${status}`}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setGroupsOpen(true)} style={[styles.hbtn, { borderColor: '#6B4E14', backgroundColor: '#1C1A14' }]}>
          <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700' }}>Groupes</Text>
        </Pressable>
        <Pressable onPress={() => setToolsOpen(true)} style={[styles.hbtn, { borderColor: theme.line2 }]}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Outils</Text>
        </Pressable>
      </View>
      <ClipBanner client={client} onOpen={setInputCh} />

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets}>
          {allTargets().map((t) => {
            const on = targetId(t) === targetId(target);
            const c = targetColor(t, theme);
            return (
              <Pressable
                key={targetId(t)}
                onPress={() => setTarget(t)}
                accessibilityState={{ selected: on }}
                style={[styles.target, on ? { backgroundColor: c } : { backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1 }]}
              >
                {!on && <View style={[styles.tdot, { backgroundColor: c }]} />}
                <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: on ? '800' : '600', fontSize: 13 }}>{label(t)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {target.kind === 'bus' && (
        <View style={[styles.hintRow, { backgroundColor: theme.panel }]}>
          <Text style={{ color: theme.text, fontSize: 12, flex: 1 }}>Les faders règlent ce qu’il y a dans « {label(target)} ».</Text>
          <Pressable onPress={() => { copyMainTo(client, target); say('Mix façade copié dans ' + label(target)); }} style={[styles.copy, { backgroundColor: color }]}>
            <Text style={{ color: '#0B0D10', fontWeight: '700', fontSize: 12 }}>Copier la façade</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {bodyH > 0 && (
          <>
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.strips}>
              {items.map((it) =>
                it.kind === 'group' ? (
                  <GroupStrip
                    key={'g' + it.g.k}
                    client={client}
                    group={it.g}
                    target={target}
                    theme={theme}
                    height={faderH}
                    open={openGroups.includes(it.g.k)}
                    onToggleOpen={() => setOpenGroups((a) => (a.includes(it.g.k) ? a.filter((k) => k !== it.g.k) : [...a, it.g.k]))}
                    virtual={virtual[targetId(target) + it.g.k] ?? 0.75}
                    setVirtual={(v) => setVirtual((m) => ({ ...m, [targetId(target) + it.g.k]: v }))}
                  />
                ) : (
                  <Strip
                    key={it.ch}
                    client={client}
                    ch={it.ch}
                    target={target}
                    color={color}
                    theme={theme}
                    height={faderH}
                    selected={sel === it.ch}
                    inOpenGroup={it.inOpenGroup}
                    onSelect={onSelect}
                    onRename={setRenameCh}
                    onOpenInput={setInputCh}
                    onOpenDetail={setDetailCh}
                  />
                ),
              )}
            </ScrollView>
            <View style={[styles.master, { borderLeftColor: theme.line }]}>
              <OutStrip client={client} target={target} label={label(target)} color={target.kind === 'main' ? theme.accent : color} theme={theme} height={faderH} />
            </View>
          </>
        )}
      </View>

      {sel !== null && (
        <View style={[styles.bar, { backgroundColor: '#20242A', borderColor: theme.line2 }]}>
          <View style={styles.barHead}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
              {name(sel)} · CH {sel}
            </Text>
            <Pressable onPress={() => { setSel(null); setMode(null); }} accessibilityLabel="Fermer" style={styles.close}>
              <Text style={{ color: theme.muted, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          {mode === null && (
            <View style={styles.barRow}>
              <BarBtn label="Copier" primary theme={theme} onPress={async () => { const c = await copyChannel(client, sel); setClip(c); say(`Réglages de ${name(sel)} copiés`); }} />
              <BarBtn label="Coller" theme={theme} disabled={!clip} onPress={() => clip && setPasteOpen(true)} />
              <BarBtn label="Déplacer" theme={theme} onPress={() => setMode('move')} />
              <BarBtn label="Échanger" theme={theme} onPress={() => setMode('swap')} />
            </View>
          )}
          {mode === 'move' && (
            <View style={styles.barRow}>
              <BarBtn label="◀" theme={theme} onPress={() => move(-1)} />
              <BarBtn label="▶" theme={theme} onPress={() => move(1)} />
              <BarBtn label="Terminé" primary theme={theme} onPress={() => setMode(null)} />
            </View>
          )}
          {mode === 'swap' && (
            <Text style={{ color: '#FBBF24', fontSize: 13, paddingVertical: 8 }}>Touche le « CH ⋯ » de la voie avec laquelle tout échanger.</Text>
          )}
          <Text style={{ color: theme.muted, fontSize: 11 }}>
            {mode === 'move' ? 'Déplacer change l’ordre à l’écran, pas les branchements.' : clip ? `Presse-papiers : ${name(clip.from)}` : 'Copier garde les réglages ; Coller les applique à d’autres voies.'}
          </Text>
        </View>
      )}

      {!!toast && (
        <View style={styles.toast}>
          <Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text>
        </View>
      )}

      <ChannelScreen client={client} ch={detailCh} theme={theme} onClose={() => setDetailCh(null)} />
      <InputSheet client={client} ch={inputCh} theme={theme} onClose={() => setInputCh(null)} />
      <SmartRenameSheet client={client} ch={renameCh} theme={theme} onClose={() => setRenameCh(null)} />
      <GroupsSheet client={client} theme={theme} visible={groupsOpen} onClose={() => setGroupsOpen(false)} />
      <ToolsSheet
        theme={theme}
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onPick={(t) => {
          setToolsOpen(false);
          if (t === 'theme') props.onNextTheme();
          else if (t === 'groupes') setGroupsOpen(true);
          else setTool(t);
        }}
      />
      <EffectsScreen client={client} theme={theme} visible={tool === 'effets'} onClose={() => setTool(null)} />
      <PresetsSheet client={client} theme={theme} visible={tool === 'presets'} ch={null} onClose={() => setTool(null)} />
      <GuideScreen client={client} theme={theme} visible={tool === 'guide'} onClose={() => setTool(null)} />
      <AutoBalanceScreen client={client} theme={theme} visible={tool === 'auto'} onClose={() => setTool(null)} />
      <WhoHearsScreen client={client} theme={theme} visible={tool === 'quientend'} onClose={() => setTool(null)} />
      <PasteSheet
        client={client}
        clip={clip}
        visible={pasteOpen}
        preselect={sel}
        theme={theme}
        onClose={() => setPasteOpen(false)}
        onPaste={(targets, cats) => {
          if (!clip) return;
          pasteChannel(client, clip, targets, cats);
          setPasteOpen(false);
          setSel(null);
          say(`Collé sur ${targets.length} voie${targets.length > 1 ? 's' : ''}`);
        }}
      />
    </View>
  );
}

function BarBtn(props: { label: string; onPress: () => void; theme: Theme; primary?: boolean; disabled?: boolean }) {
  const { theme } = props;
  return (
    <Pressable
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityState={{ disabled: !!props.disabled }}
      style={[styles.barBtn, props.primary ? { backgroundColor: theme.accent } : { borderColor: theme.line2, borderWidth: 1, backgroundColor: theme.panel }]}
    >
      <Text style={{ color: props.primary ? theme.onAccent : props.disabled ? theme.line2 : theme.text, fontWeight: '800', fontSize: 13 }}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hbtn: { height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  targets: { gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  target: { height: 42, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tdot: { width: 8, height: 8, borderRadius: 4 },
  hintRow: { marginHorizontal: 16, marginBottom: 4, borderRadius: 10, paddingHorizontal: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { height: 34, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingTop: 6, paddingBottom: 10 },
  strips: { gap: 6, paddingHorizontal: 10, alignItems: 'flex-start' },
  master: { paddingHorizontal: 8, borderLeftWidth: 1 },
  bar: { position: 'absolute', left: 10, right: 10, bottom: 12, borderRadius: 18, borderWidth: 1, padding: 10, gap: 6, elevation: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 },
  barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  barRow: { flexDirection: 'row', gap: 6 },
  barBtn: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, top: 104, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
