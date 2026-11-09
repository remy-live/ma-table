import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { SmartRenameSheet } from './SmartRenameSheet';
import { STRIP_WIDTHS, StripWidth } from './SettingsScreen';
import { safetyBackup } from '../store/sessions';
import { ClipBanner } from './ClipBanner';
import { MixPickerButton, MixPickerSheet, mixInfo } from './MixPicker';
import { InputSourceSheet } from './InputSourceSheet';
import { CATEGORIES, Category } from '../xair/clipboard';
import { insrcPath, insrcPlug } from '../xair/addresses';
import { OrganizeOverlay } from '../ui/OrganizeOverlay';

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

export function MixerScreen(props: { client: XAirClient; theme: Theme; stripWidth?: StripWidth }) {
  const { client, theme } = props;
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [status, setStatus] = useState<Status>(client.status);
  useEffect(() => client.onStatus(setStatus), [client]);

  const [target, setTarget] = useState<Target>({ kind: 'main' });
  const [detailCh, setDetailCh] = useState<number | null>(null);
  const [inputCh, setInputCh] = useState<number | null>(null);
  const [renameCh, setRenameCh] = useState<number | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [organize, setOrganize] = useState(false);
  const [drag, setDrag] = useState<{ ch: number; dx: number } | null>(null);
  const [undoN, setUndoN] = useState(client.undoCount);
  useEffect(() => client.onUndoChange(setUndoN), [client]);
  const stripW = STRIP_WIDTHS[props.stripWidth ?? 'normal'];
  const [virtual, setVirtual] = useState<Record<string, number>>({});
  const [openGroups, setOpenGroups] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(CHANNELS);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<null | 'copy' | 'swap'>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pasteSel, setPasteSel] = useState<number[]>([]);
  const [cats, setCats] = useState<Category[]>(['eq', 'dyn', 'fx']);
  const [srcCh, setSrcCh] = useState<number | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
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
    if (mode === 'copy' && sel !== null && ch !== sel) {
      togglePaste(ch);
      return;
    }
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

  const togglePaste = (ch: number) => setPasteSel((a) => (a.includes(ch) ? a.filter((x) => x !== ch) : [...a, ch]));
  const doSwap = async (ch: number) => {
    if (sel === null || ch === sel) return;
    const a = sel;
    setMode(null);
    setSel(null);
    await swapChannels(client, a, ch);
    // la place à l'écran suit aussi
    const o = order.slice();
    const ia = o.indexOf(a);
    const ib = o.indexOf(ch);
    [o[ia], o[ib]] = [o[ib], o[ia]];
    setAndSaveOrder(o);
    say(`Voies ${a} et ${ch} échangées (réglages et place)`);
  };
  const doPaste = async () => {
    if (sel === null || !pasteSel.length) return;
    const c = clip ?? (await copyChannel(client, sel));
    if (pasteSel.length > 1) safetyBackup(client, `avant collage sur ${pasteSel.length} voies`).catch(() => {});
    pasteChannel(client, c, pasteSel, cats);
    say(`Réglages de ${name(sel)} collés sur ${pasteSel.length} voie${pasteSel.length > 1 ? 's' : ''}`);
    setMode(null);
    setPasteSel([]);
    setSel(null);
  };

  const moveBy = (ch: number, k: number) => {
    if (!k) return;
    const o = order.filter((c) => c !== ch);
    const i = order.indexOf(ch);
    const j = Math.max(0, Math.min(o.length, i + k));
    o.splice(j, 0, ch);
    setAndSaveOrder(o);
    say(`${name(ch)} déplacée (l’ordre à l’écran, pas les branchements)`);
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
        <Pressable onPress={() => { const n = client.undo(); say(n ? `Annulé (${n} réglage${n > 1 ? 's' : ''})` : 'Rien à annuler'); }} disabled={!undoN} accessibilityLabel="Annuler le dernier geste" style={[styles.hbtn, { borderColor: theme.line2, opacity: undoN ? 1 : 0.4, minWidth: 54, alignItems: 'center' }]}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>↶</Text>
        </Pressable>
        <Pressable onPress={() => { setOrganize((o) => !o); setSel(null); setMode(null); setPasteSel([]); }} accessibilityState={{ selected: organize }} style={[styles.hbtn, organize ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
          <Text style={{ color: organize ? theme.onAccent : theme.text, fontSize: 13, fontWeight: '800' }}>{organize ? 'Terminé' : 'Organiser'}</Text>
        </Pressable>
        <Pressable onPress={() => setGroupsOpen(true)} style={[styles.hbtn, { borderColor: '#6B4E14', backgroundColor: '#1C1A14' }]}>
          <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700' }}>Groupes</Text>
        </Pressable>
      </View>
      <ClipBanner client={client} onOpen={setInputCh} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        <MixPickerButton client={client} target={target} theme={theme} onPress={() => setPickerOpen(true)} />
        {target.kind === 'bus' && (
          <Pressable onPress={() => { copyMainTo(client, target); say(`${mixInfo(client, target).name} entend maintenant comme le public`); }} style={[styles.copy, { backgroundColor: theme.panel, borderColor: color, borderWidth: 1, height: 54 }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>Comme{'\n'}le public</Text>
          </Pressable>
        )}
      </View>

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
                  <View key={it.ch} style={drag && drag.ch === it.ch ? { transform: [{ translateX: drag.dx }], zIndex: 10, opacity: 0.9 } : undefined}>
                  <Strip
                    width={stripW}
                    client={client}
                    ch={it.ch}
                    target={target}
                    color={color}
                    theme={theme}
                    height={faderH}
                    selected={sel === it.ch}
                    inOpenGroup={it.inOpenGroup}
                    pasteTarget={mode !== null && sel !== null && it.ch !== sel}
                    pasted={pasteSel.includes(it.ch)}
                    pasteLabel={mode === 'swap' ? 'Échanger ⇄' : 'Coller ici'}
                    onPasteToggle={(ch) => (mode === 'swap' ? doSwap(ch) : togglePaste(ch))}
                    dim={false}
                    onSelect={onSelect}
                    onRename={setRenameCh}
                    onOpenInput={setInputCh}
                    onOpenDetail={setDetailCh}
                  />
                  {organize && !(mode !== null && it.ch !== sel) && (
                    <OrganizeOverlay
                      theme={theme}
                      isSource={mode !== null && it.ch === sel}
                      modeLabel={mode === 'swap' ? 'échange' : 'copie'}
                      onCopy={() => { setSel(it.ch); setClip(null); setPasteSel([]); setMode('copy'); }}
                      onSwap={() => { setSel(it.ch); setMode('swap'); }}
                      onInput={() => setSrcCh(it.ch)}
                      onRename={() => setRenameCh(it.ch)}
                      onCancel={() => { setSel(null); setMode(null); setPasteSel([]); }}
                      onDrag={(dx) => setDrag({ ch: it.ch, dx })}
                      onDrop={(dx) => { setDrag(null); moveBy(it.ch, Math.round(dx / (stripW + 6))); }}
                    />
                  )}
                  </View>
                ),
              )}
            </ScrollView>
            <View style={[styles.master, { borderLeftColor: theme.line }]}>
              <OutStrip client={client} target={target} label={label(target)} color={target.kind === 'main' ? theme.accent : color} theme={theme} height={faderH} />
            </View>
            {wide && detailCh !== null && (
              <View style={{ width: Math.min(560, width * 0.46) }}>
                <ChannelScreen client={client} ch={detailCh} theme={theme} onClose={() => setDetailCh(null)} wide />
              </View>
            )}
          </>
        )}
      </View>

      {sel !== null && mode !== null && (
        <View style={[styles.bar, { backgroundColor: '#1F1C14', borderColor: '#F59E0B', borderWidth: 2 }]}>
          <View style={styles.barHead}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{name(sel)}</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>
                Prise {insrcPlug(Number(client.get(insrcPath(sel)) ?? sel - 1))} · {mode === 'copy' ? 'touche les voies qui reçoivent ces réglages' : mode === 'swap' ? 'touche la voie avec laquelle échanger (réglages et place)' : 'que faire ?'}
              </Text>
            </View>
            <Pressable onPress={() => { setSel(null); setMode(null); setPasteSel([]); }} accessibilityLabel="Fermer" style={styles.close}>
              <Text style={{ color: theme.muted, fontSize: 22 }}>×</Text>
            </Pressable>
          </View>
          {mode === null && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
              <BarBtn label="◀ Déplacer" theme={theme} onPress={() => move(-1)} />
              <BarBtn label="Déplacer ▶" theme={theme} onPress={() => move(1)} />
              <BarBtn label="Copier les réglages vers…" primary theme={theme} onPress={() => { setClip(null); setPasteSel([]); setMode('copy'); }} />
              <BarBtn label="Échanger avec…" theme={theme} onPress={() => setMode('swap')} />
              <BarBtn label="Changer l’entrée" theme={theme} onPress={() => setSrcCh(sel)} />
              <BarBtn label="Renommer" theme={theme} onPress={() => setRenameCh(sel)} />
            </ScrollView>
          )}
          {mode === 'copy' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
                {CATEGORIES.filter((c) => c.id !== 'nom').map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <Pressable key={c.id} onPress={() => setCats((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))} accessibilityState={{ selected: on }} style={[styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                      <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '700' }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.barRow}>
                <BarBtn label={pasteSel.length ? `Coller sur ${pasteSel.length} voie${pasteSel.length > 1 ? 's' : ''}` : 'Touche une ou plusieurs voies'} primary theme={theme} disabled={!pasteSel.length || !cats.length} onPress={doPaste} />
                <BarBtn label="Annuler" theme={theme} onPress={() => { setMode(null); setPasteSel([]); }} />
              </View>
            </>
          )}
          {mode === 'swap' && (
            <View style={styles.barRow}>
              <BarBtn label="Annuler" theme={theme} onPress={() => setMode(null)} />
            </View>
          )}
        </View>
      )}

      {!!toast && (
        <View style={styles.toast}>
          <Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text>
        </View>
      )}

      {!wide && <ChannelScreen client={client} ch={detailCh} theme={theme} onClose={() => setDetailCh(null)} />}
      <InputSheet client={client} ch={inputCh} theme={theme} onClose={() => setInputCh(null)} />
      <SmartRenameSheet client={client} ch={renameCh} theme={theme} onClose={() => setRenameCh(null)} />
      <GroupsSheet client={client} theme={theme} visible={groupsOpen} onClose={() => setGroupsOpen(false)} />
      <MixPickerSheet client={client} target={target} theme={theme} visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(t) => { setTarget(t); setPickerOpen(false); }} />
      <InputSourceSheet client={client} ch={srcCh} theme={theme} onClose={() => setSrcCh(null)} />
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
  copy: { paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingTop: 6, paddingBottom: 10 },
  strips: { gap: 6, paddingHorizontal: 10, alignItems: 'flex-start' },
  master: { paddingHorizontal: 8, borderLeftWidth: 1 },
  bar: { position: 'absolute', left: 10, right: 10, bottom: 12, borderRadius: 18, borderWidth: 1, padding: 10, gap: 6, elevation: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 },
  barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  barRow: { flexDirection: 'row', gap: 6 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  barBtn: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, top: 104, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
