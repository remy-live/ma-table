import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  allTargets, busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, dcaNamePath, inDca, outOnPath, outPath, Target, targetId,
} from '../xair/addresses';
import { Group } from '../xair/groups';
import { CopyMixSheet } from './CopyMixSheet';
import { LarsenSheet } from './LarsenSheet';
import { CopySettingsSheet } from './CopySettingsSheet';
import { Status, XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import { GroupStrip, OutStrip, Strip, StripView } from '../ui/Strip';
import { GainTile } from '../ui/GainTile';
import { useMono } from '../ui/useMono';
import { MonoSwitch } from '../ui/MonoSwitch';
import { TableWiringStandalone } from './TableWiring';
import { Theme } from '../ui/theme';
import { ChannelScreen } from './ChannelScreen';
import { GroupsSheet } from './GroupsSheet';
import { InputSheet } from './InputSheet';
import { SmartRenameSheet } from './SmartRenameSheet';
import { STRIP_WIDTHS, StripWidth } from './SettingsScreen';
import { ClipBanner } from './ClipBanner';
import { MixChips, MixPickerSheet } from './MixPicker';
import { InputSourceSheet } from './InputSourceSheet';
import { insrcPath, insrcPlug, soloPath } from '../xair/addresses';
import { i as oscI } from '../osc/osc';
import { useAnyTick } from '../ui/useTick';
import { GroupBar } from '../ui/GroupBar';
import { OrganizeOverlay } from '../ui/OrganizeOverlay';
import { HELP, showTip } from '../ui/tip';

const CHANNELS = Array.from({ length: CH_COUNT }, (_, k) => k + 1);

/** Bandeau jaune tant qu'une voie est en solo : on sait qu'on n'entend qu'elle au casque, et on arrête tout d'un appui. */
function SoloBar({ client, theme }: { client: XAirClient; theme: Theme }) {
  useAnyTick(client, 150);
  const on = CHANNELS.filter((ch) => Number(client.get(soloPath(ch)) ?? 0) === 1);
  if (!on.length) return null;
  const names = on.map((ch) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`).join(', ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FACC15' }}>
      <Text style={{ fontSize: 18 }}>🎧</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: '#1A1204', fontWeight: '800', fontSize: 13 }}>Solo : {names} · au casque, tu n’entends que ça (le public n’est pas touché)</Text>
      <Pressable onPress={() => on.forEach((ch) => client.set(soloPath(ch), oscI(0)))} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1A1204', justifyContent: 'center' }}>
        <Text style={{ color: '#FACC15', fontWeight: '800', fontSize: 13 }}>Arrêter les solos</Text>
      </Pressable>
    </View>
  );
}
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

export function MixerScreen(props: { client: XAirClient; theme: Theme; stripWidth?: StripWidth; onOpenEffects?: (ch: number) => void }) {
  const { client, theme } = props;
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [status, setStatus] = useState<Status>(client.status);
  useEffect(() => client.onStatus(setStatus), [client]);

  const [target, setTarget] = useState<Target>({ kind: 'main' });
  const [detailCh, setDetailCh] = useState<number | null>(null);
  const [inputCh, setInputCh] = useState<number | null>(null);
  const [renameCh, setRenameCh] = useState<number | null>(null);
  const drawerActions = {
    // l'égaliseur s'ouvre à côté des tranches : on revient à la vue complète si on était en Gains ou Table
    onDetail: (c: number) => { setView((v) => (v === 'gains' || v === 'table' ? 'full' : v)); setDetailCh(c); },
    onCopy: (c: number) => setCopySet(c),
  };
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
  // « ☑ Sélectionner » : cocher des voies pour en faire un groupe
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const togglePick = (c: number) => setPicked((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));
  const startPick = (c?: number) => { setPicking(true); setOrganize(false); setPicked(c ? [c] : []); };
  const endPick = () => { setPicking(false); setPicked([]); };
  const [mode, setMode] = useState<null | 'swap'>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [larsen, setLarsen] = useState(false);
  const [rangerOpen, setRangerOpen] = useState(false);
  const [monoOpen, setMonoOpen] = useState(false);
  const mono = useMono(client);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySet, setCopySet] = useState<number | null | 0>(null); // voie de départ (0 = aucune choisie), null = fermé
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [copyDrag, setCopyDrag] = useState<{ ch: number; dx: number } | null>(null);
  const [srcCh, setSrcCh] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { busName, groups } = useMixerLabels(client);

  const say = (m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    void m; // plus de bandeau vert : l'écran montre déjà le résultat
    setToast('');
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
    client.loadPaths([...CHANNELS.map((ch) => chLevelPath(ch, target)), ...CHANNELS.map(soloPath), outPath(target), outOnPath(target)]);
  }, [client, target]);

  const [bodyH, setBodyH] = useState(0);
  const [listW, setListW] = useState(0);
  const faderH = Math.max(260, bodyH - 12); // la tranche tient entièrement dans la zone : rien de coupé, tout reste cliquable // hauteur totale d'une tranche ; le fader prend le reste
  const [view, setView] = useState<StripView>('full');
  useEffect(() => { load<StripView>('vueTable', 'full').then((v) => v && setView(v)); }, []);
  const VIEWS: { id: StripView; label: string; icon: string }[] = [
    { id: 'full', label: 'Complète', icon: '▥' },
    { id: 'compact', label: 'Compacte', icon: '▤' },
    { id: 'gains', label: 'Gains', icon: '◎' },
    { id: 'table', label: 'Table', icon: '▦' },
  ].filter((v) => wide || v.id !== 'table') as { id: StripView; label: string; icon: string }[];
  const pickView = (n: StripView) => {
    if (n === view) return;
    if (n === 'table') { setOrganize(false); setSel(null); setMode(null); }
    setView(n);
    save('vueTable', n);
    say(n === 'full' ? 'Vue complète' : n === 'compact' ? 'Vue compacte : faders plus grands' : n === 'gains' ? 'Vue gains : un bouton par entrée, pour la balance' : 'Vue table : touche une prise pour la régler ou la relier');
  };
  const curView = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  // vue gains : la plus grande taille de bouton qui fait tenir les 16 entrées sans défiler
  const availW = width - (wide ? 96 : 0) - 24;
  const gainSize = (() => {
    let best = 50;
    for (let cols = 3; cols <= 10; cols++) {
      const rows = Math.ceil(CH_COUNT / cols);
      const byW = (availW - (cols - 1) * 10) / cols - 28;
      const byH = (bodyH - 12 - (rows - 1) * 10) / rows - 150;
      best = Math.max(best, Math.min(byW, byH));
    }
    return Math.floor(Math.min(130, best));
  })();
  const label = (t: Target) => (t.kind === 'main' ? 'Façade' : t.kind === 'bus' ? busName(t.n) : `Effet ${t.n}`);
  const color = targetColor(target, theme);
  const name = (ch: number) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;

  // Liste à l'écran : chaque groupe prend la place de son premier membre ; ses voies n'apparaissent que déplié.
  const items: Item[] = [];
  const shown = new Set<number>();
  const shownCh = new Set<number>(); // une voie n'apparaît qu'une fois, même si elle est dans deux groupes
  for (const ch of order) {
    const g = groups.find((x) => x.members.includes(ch));
    if (!g) {
      if (!shownCh.has(ch)) { shownCh.add(ch); items.push({ kind: 'ch', ch, inOpenGroup: false }); }
      continue;
    }
    if (shown.has(g.k)) continue;
    shown.add(g.k);
    items.push({ kind: 'group', g });
    if (openGroups.includes(g.k)) order.filter((c) => g.members.includes(c) && !shownCh.has(c)).forEach((c) => { shownCh.add(c); items.push({ kind: 'ch', ch: c, inOpenGroup: true }); });
    else g.members.forEach((c) => shownCh.add(c));
  }

  // Vue compacte : toutes les tranches tiennent dans la largeur (elles s'affinent au besoin).
  const fitW = view === 'compact' && listW > 0 ? Math.max(60, Math.min(stripW, Math.floor((listW - 20 - (items.length - 1) * 6) / Math.max(1, items.length)))) : 0;
  const chW = fitW || stripW;
  const grpW = fitW || 92;

  // Glisser « Copier » sur une autre tranche : quelle tranche est sous le doigt ?
  const itemAt = (ch: number, dx: number): Item | null => {
    const widths = items.map((it) => (it.kind === 'group' ? grpW : chW));
    const idx = items.findIndex((it) => it.kind === 'ch' && it.ch === ch);
    if (idx < 0) return null;
    let x = 0;
    const starts = widths.map((w) => { const s0 = x; x += w + 6; return s0; });
    const center = starts[idx] + widths[idx] / 2 + dx;
    const k = starts.findIndex((s0, n) => center >= s0 && center <= s0 + widths[n]);
    return k >= 0 && k !== idx ? items[k] : null;
  };
  const copyTarget = copyDrag ? itemAt(copyDrag.ch, copyDrag.dx) : null;
  const dropCopy = (ch: number, dx: number) => {
    const t = itemAt(ch, dx);
    setCopyDrag(null);
    if (!t) return;
    setCopyTo(t.kind === 'ch' ? [t.ch] : t.g.members.filter((c) => c !== ch));
    setCopySet(ch);
  };
  const CopyHere = () => (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20, borderRadius: 12, borderWidth: 4, borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.30)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>⧉{'\n'}Copier{'\n'}ici</Text>
    </View>
  );

  const onSelect = (ch: number) => {
    if (mode === 'swap' && sel !== null && ch !== sel) {
      const a = sel;
      setMode(null);
      setSel(null);
      doSwapFrom(a, ch);
      return;
    }
    setMode(null);
    setSel((s) => (s === ch ? null : ch));
  };

  const doSwapFrom = (a: number, ch: number) => doSwapCore(a, ch);
  const doSwap = (ch: number) => { if (sel !== null) doSwapCore(sel, ch); };
  const doSwapCore = (a0: number, ch: number) => {
    const sel = a0;
    if (sel === null || ch === sel) return;
    const a = sel;
    setMode(null);
    setSel(null);
    // Échanger = les deux tranches changent de place à l'écran (les branchements ne bougent pas)
    const o = order.slice();
    const ia = o.indexOf(a);
    const ib = o.indexOf(ch);
    [o[ia], o[ib]] = [o[ib], o[ia]];
    setAndSaveOrder(o);
    say(`${name(a)} et ${name(ch)} ont échangé leur place`);
  };
  /** Déplace une voie de k places à l'écran : un groupe replié compte pour une seule place. */
  const shiftOrder = (o0: number[], ch: number, k: number, its: Item[]): number[] => {
    let o = o0.slice();
    const dir = k > 0 ? 1 : -1;
    for (let step = 0; step < Math.abs(k); step++) {
      const i = its.findIndex((it) => it.kind === 'ch' && it.ch === ch);
      const nb = its[i + dir];
      if (i < 0 || !nb) break;
      o = o.filter((c) => c !== ch);
      const ref = nb.kind === 'ch' ? [nb.ch] : order.filter((c) => nb.g.members.includes(c));
      const at = dir > 0 ? o.indexOf(ref[ref.length - 1]) + 1 : o.indexOf(ref[0]);
      o.splice(Math.max(0, at), 0, ch);
      // la liste à l'écran suit, pour le pas suivant
      const j = its.findIndex((it) => it === nb);
      its = its.slice();
      [its[i], its[j]] = [its[j], its[i]];
    }
    return o;
  };
  const moveBy = (ch: number, k: number, quiet = false) => {
    if (!k) return;
    setAndSaveOrder(shiftOrder(order, ch, k, items));
    if (!quiet) say(`${name(ch)} déplacée (l’ordre à l’écran, pas les branchements)`);
  };
  // glisser : la voie suit le doigt et les autres s'écartent au fur et à mesure
  const dragDone = useRef(0);
  const onDragLive = (ch: number, dx: number) => {
    const w = chW + 6;
    const steps = Math.trunc((dx - dragDone.current) / w);
    if (steps) { moveBy(ch, steps, true); dragDone.current += steps * w; }
    setDrag({ ch, dx: dx - dragDone.current });
  };
  const onDropLive = (ch: number) => {
    dragDone.current = 0;
    setDrag(null);
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
  const busy = picking || organize; // un mode « ranger » est en cours
  const viewBar = (
    <View style={[styles.viewBar, { borderColor: theme.line2 }]} accessibilityRole="tablist">
      {VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <Pressable key={v.id} onPress={() => pickView(v.id)} onLongPress={() => showTip(HELP.view)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Vue ${v.label}`}
            style={[styles.viewBtn, !wide && { minWidth: 44, paddingHorizontal: 2 }, on && { backgroundColor: theme.accent }]}>
            <Text style={{ color: on ? theme.onAccent : theme.text, fontSize: 17, fontWeight: '900' }}>{v.icon}</Text>
            <Text numberOfLines={1} style={{ color: on ? theme.onAccent : theme.muted, fontSize: 9, fontWeight: '800' }}>{v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const mixTools = (
    <>
      <Pressable onPress={() => setCopyOpen(true)} onLongPress={() => showTip(HELP.copyMix)} accessibilityLabel="Copier ce qu’entend cette personne vers une ou plusieurs autres" style={[styles.iconBtn, !wide && { width: 46 }, { borderColor: theme.line2 }]}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>⧉</Text>
        <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '800' }}>Copier</Text>
      </Pressable>
      {target.kind === 'bus' && (
        <Pressable onPress={() => setLarsen(true)} onLongPress={() => showTip('Ça siffle ? Repère la note qui siffle dans ce retour et la creuse, sans toucher au public.')} accessibilityLabel="Ça siffle ?" style={[styles.iconBtn, { borderColor: '#F87171' }]}>
          <Text style={{ fontSize: 16 }}>🔔</Text>
          <Text style={{ color: '#FCA5A5', fontSize: 9, fontWeight: '800' }}>Siffle ?</Text>
        </Pressable>
      )}
    </>
  );
  const rightTools = (
    <>
      {viewBar}
      <Pressable onPress={() => (busy ? (picking ? endPick() : (setOrganize(false), setSel(null), setMode(null))) : setRangerOpen((o) => !o))} onLongPress={() => showTip('Ranger : choisir des voies pour en faire un groupe, déplacer ou échanger des voies, gérer les groupes.')}
        accessibilityState={{ expanded: rangerOpen }} style={[styles.hbtn, busy || rangerOpen ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }, { minWidth: wide ? 104 : 78, paddingHorizontal: wide ? 10 : 6, alignItems: 'center' }]}>
        <Text style={{ color: busy || rangerOpen ? theme.onAccent : theme.text, fontSize: 13, fontWeight: '900' }}>{picking ? (view === 'table' ? '✓ Terminé' : `✓ Terminé · ${picked.length}`) : organize ? '✓ Terminé' : wide ? '✎ Ranger ▾' : '✎ Ranger'}</Text>
      </Pressable>
      <Pressable onPress={() => { const n = client.undo(); say(n ? `Annulé (${n} réglage${n > 1 ? 's' : ''})` : 'Rien à annuler'); }} disabled={!undoN} onLongPress={() => showTip(HELP.undo)} accessibilityLabel="Annuler le dernier geste" style={[styles.hbtn, { borderColor: theme.line2, opacity: undoN ? 1 : 0.4, minWidth: wide ? 54 : 44, paddingHorizontal: 4, alignItems: 'center' }]}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>↶</Text>
      </Pressable>
    </>
  );
  const rangerItem = (icon: string, label: string, sub: string, onPress: () => void, disabled?: boolean) => (
    <Pressable onPress={() => { setRangerOpen(false); onPress(); }} disabled={disabled} style={[styles.rangerItem, { borderColor: theme.line2, backgroundColor: theme.deep }, disabled && { opacity: 0.35 }]}>
      <Text style={{ fontSize: 20, color: theme.accent, fontWeight: '900', width: 26, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
      </View>
    </Pressable>
  );
  const rangerMenu = rangerOpen && (
    <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 90 }} onPress={() => setRangerOpen(false)}>
      <View style={[styles.rangerMenu, { backgroundColor: theme.panel, borderColor: theme.accent, top: wide ? 64 : 120 }, !wide && { right: 10, left: 10, width: undefined }]}>
        {rangerItem('☑', 'Sélectionner', 'coche des voies pour en faire un groupe', () => startPick())}
        {rangerItem('⇄', 'Organiser', 'déplacer, échanger, copier, renommer', () => { setOrganize(true); setSel(null); setMode(null); }, view === 'table')}
        {rangerItem('▦', 'Groupes', 'voir, renommer, défaire les groupes', () => setGroupsOpen(true))}
      </View>
    </Pressable>
  );
  const monoPop = monoOpen && (
    <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 90 }} onPress={() => setMonoOpen(false)}>
      <View style={[styles.monoPop, { backgroundColor: theme.panel, borderColor: theme.line2, top: wide ? 64 : 58 }, !wide && { left: 10 }]}>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800' }}>LE PUBLIC · combien d’enceintes ?</Text>
        <MonoSwitch client={client} theme={theme} />
      </View>
    </Pressable>
  );
  const chips = <MixChips client={client} target={target} theme={theme} onPick={setTarget} onMore={() => setPickerOpen(true)} mainSub={mono ? '🔈 1 enceinte ▾' : '🔈🔈 2 enceintes ▾'} onActiveMain={() => setMonoOpen((o) => !o)} />;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {wide ? (
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: dot, marginRight: 2 }]} accessibilityLabel={`Table ${status}`} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ flexShrink: 1 }}>{chips}</View>
            {mixTools}
          </View>
          {rightTools}
        </View>
      ) : (
        // téléphone : « qui écoute » sur une ligne, les outils sur une autre
        <View style={{ paddingHorizontal: 10, paddingBottom: 6, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: dot }]} accessibilityLabel={`Table ${status}`} />
            <View style={{ flex: 1 }}>{chips}</View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {mixTools}
            <View style={{ flex: 1 }} />
            {rightTools}
          </View>
        </View>
      )}
      {status === 'perdu' && <Text style={{ color: theme.mute, fontSize: 12, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 4 }}>Liaison perdue — la table garde son mix, reconnexion en cours…</Text>}
      <SoloBar client={client} theme={theme} />
      <ClipBanner client={client} onOpen={setInputCh} />
      {picking && view !== 'table' && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 50 }}>
          <GroupBar client={client} theme={theme} chans={picked} onDone={(m) => { say(m); endPick(); }} onCancel={endPick} />
        </View>
      )}

      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {bodyH > 0 && view === 'table' && <TableWiringStandalone client={client} theme={theme} actions={drawerActions} multiCtl={{ on: picking, set: (v) => (v ? startPick() : endPick()), picked, setPicked }} />}
        {bodyH > 0 && view === 'gains' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingBottom: 12, justifyContent: 'center' }}>
            {order.map((ch) => <GainTile key={ch} client={client} ch={ch} theme={theme} size={gainSize} onOpen={setInputCh} picked={picking ? picked.includes(ch) : undefined} onPick={(c) => (picking ? togglePick(c) : startPick(c))} group={groups.find((g) => g.members.includes(ch))} organize={organize ? { onMove: (k) => moveBy(ch, k), onCopy: () => setCopySet(ch), onRename: () => setRenameCh(ch) } : undefined} />)}
          </ScrollView>
        )}
        {bodyH > 0 && view !== 'gains' && view !== 'table' && (
          <>
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.strips} onLayout={(e) => setListW(e.nativeEvent.layout.width)}>
              {items.map((it) =>
                it.kind === 'group' ? (
                  <View key={'g' + it.g.k}>
                  <GroupStrip
                    client={client}
                    group={it.g}
                    target={target}
                    theme={theme}
                    width={grpW}
                    height={faderH}
                    open={openGroups.includes(it.g.k)}
                    onToggleOpen={() => setOpenGroups((a) => (a.includes(it.g.k) ? a.filter((k) => k !== it.g.k) : [...a, it.g.k]))}
                    virtual={virtual[targetId(target) + it.g.k] ?? 0.75}
                    setVirtual={(v) => setVirtual((m) => ({ ...m, [targetId(target) + it.g.k]: v }))}
                  />
                  {copyTarget === it && <CopyHere />}
                  </View>
                ) : (
                  <View key={it.ch} style={drag && drag.ch === it.ch ? { transform: [{ translateX: drag.dx }], zIndex: 10, opacity: 0.9 } : undefined}>
                  <Strip
                    width={chW}
                    view={view}
                    client={client}
                    ch={it.ch}
                    target={target}
                    color={color}
                    theme={theme}
                    height={faderH}
                    selected={sel === it.ch}
                    inOpenGroup={it.inOpenGroup}
                    pasteTarget={mode !== null && sel !== null && it.ch !== sel}
                    pasteLabel="Échanger ⇄"
                    onPasteToggle={doSwap}
                    dim={false}
                    onSelect={onSelect}
                    onRename={picking ? togglePick : setRenameCh}
                    picked={picking ? picked.includes(it.ch) : undefined}
                    onNameLong={(c) => (picking ? togglePick(c) : startPick(c))}
                    onOpenInput={setInputCh}
                    onOpenDetail={setDetailCh}
                    onOpenFx={(c) => (props.onOpenEffects ? props.onOpenEffects(c) : setDetailCh(c))}
                  />
                  {/* en sélection : toute la piste se touche pour la cocher (les faders ne bougent pas) */}
                  {picking && (
                    <Pressable onPress={() => togglePick(it.ch)} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(it.ch) }} accessibilityLabel={`Choisir ${name(it.ch)}`}
                      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 5, borderRadius: 14, borderWidth: picked.includes(it.ch) ? 3 : 0, borderColor: theme.accent, backgroundColor: picked.includes(it.ch) ? 'rgba(245,158,11,0.10)' : 'rgba(0,0,0,0.001)' }} />
                  )}
                  {organize && !(mode !== null && it.ch !== sel) && (
                    <OrganizeOverlay
                      theme={theme}
                      isSource={mode !== null && it.ch === sel}
                      modeLabel="échange"
                      onCopy={() => { setCopyTo([]); setCopySet(it.ch); }}
                      onSwap={() => { setSel(it.ch); setMode('swap'); }}
                      onInput={() => setSrcCh(it.ch)}
                      onRename={() => setRenameCh(it.ch)}
                      onCancel={() => { setSel(null); setMode(null); }}
                      onDrag={(dx) => onDragLive(it.ch, dx)}
                      onDrop={() => onDropLive(it.ch)}
                      onCopyDrag={(dx) => setCopyDrag(dx === null ? null : { ch: it.ch, dx })}
                      onCopyDrop={(dx) => dropCopy(it.ch, dx)}
                    />
                  )}
                  {copyTarget === it && <CopyHere />}
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
                Prise {insrcPlug(Number(client.get(insrcPath(sel)) ?? sel - 1))} · {mode === 'swap' ? 'touche la voie avec laquelle échanger sa place à l’écran (les branchements ne bougent pas)' : 'que faire ?'}
              </Text>
            </View>
            <Pressable onPress={() => { setSel(null); setMode(null); }} accessibilityLabel="Fermer" style={styles.close}>
              <Text style={{ color: theme.muted, fontSize: 22 }}>×</Text>
            </Pressable>
          </View>
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
      <InputSheet client={client} ch={inputCh} theme={theme} onClose={() => setInputCh(null)} actions={drawerActions} />
      <SmartRenameSheet client={client} ch={renameCh} theme={theme} onClose={() => setRenameCh(null)} />
      {rangerMenu}
      {monoPop}
      <GroupsSheet client={client} theme={theme} visible={groupsOpen} onClose={() => setGroupsOpen(false)} />
      <CopySettingsSheet client={client} theme={theme} visible={copySet !== null} from={copySet || null} to={copyTo} onClose={() => { setCopySet(null); setCopyTo([]); }} />
      <CopyMixSheet client={client} theme={theme} visible={copyOpen} dst={target} onClose={() => setCopyOpen(false)} onDone={say} />
      {larsen && <LarsenSheet client={client} theme={theme} bus={target.kind === 'bus' ? target.n : null} name={label(target)} onClose={() => setLarsen(false)} />}
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
  root: { flex: 1, paddingTop: 40 },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  viewBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, gap: 2, height: 54 },
  viewBtn: { minWidth: 58, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 54, height: 54, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rangerMenu: { position: 'absolute', right: 74, width: 320, borderWidth: 2, borderRadius: 18, padding: 8, gap: 6, elevation: 20, zIndex: 100 },
  rangerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 10, minHeight: 58 },
  monoPop: { position: 'absolute', left: 110, borderWidth: 1, borderRadius: 16, padding: 10, gap: 8, elevation: 20, zIndex: 100 },
  hbtn: { height: 54, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  targets: { gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  target: { height: 42, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tdot: { width: 8, height: 8, borderRadius: 4 },
  hintRow: { marginHorizontal: 16, marginBottom: 4, borderRadius: 10, paddingHorizontal: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingTop: 4, paddingBottom: 6 },
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
