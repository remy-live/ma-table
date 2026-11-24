// Écouter un enregistrement : les morceaux, la grande onde du concert, une onde par
// piste, un lecteur où l'on entend ses réglages tout de suite, la sélection d'un
// passage (couper, garder, niveau, fondus), l'export et le partage.
// Rien n'est modifié dans les fichiers : on garde une liste de retouches.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Theme } from '../ui/theme';
import { Tick } from './RecPrep';
import { Bar, bars, blankIsCut, buildMix, decodeB64, Edit, emptyMix, engineParams, findBlanks, firstClip, FxKind, keptSeconds, keptSegments, lin, MixState, regionGain, Role, ROLE_NAMES, ROLES } from '../xair/listen';
import { fmtTime, Marker, parseMeta, RecMeta } from '../xair/recorder';
import { CH_PALETTE } from '../xair/smartName';
import { SessEntry, SessFile, usbListen } from '../xair/usbAudio';

const BLUE = '#60A5FA';
const procForShow = (role: Role, force: number) => [5, 8, 11][Math.max(0, Math.min(2, force))] * (1 - 1 / ROLES[role].ratio);
const isExport = (n: string) => n.startsWith('Mix') || n.startsWith('Extrait');
const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.round(b / 1e6)} Mo`);
const pct = (x: number) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(2)}%` as `${number}%`;

interface Track { k: number; name: string; file: SessFile; pan: number; color: string }
type Scope = 'all' | 'song' | 'sel';

const Bars = React.memo(function Bars({ data, color, dim }: { data: Bar[]; color: string; dim?: boolean }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 2, paddingVertical: 3, opacity: dim ? 0.25 : 1 }]}>
      {data.map((b, i) => <View key={i} style={{ flex: 1, height: `${Math.round(b.h * 100)}%`, borderRadius: 1, backgroundColor: b.gone ? '#2A2F37' : b.clip ? '#EF4444' : color }} />)}
    </View>
  );
});

/** Une zone où l'on pose ou glisse le doigt pour se déplacer dans le temps. */
function SeekArea({ onSeek, style, children }: { onSeek: (f: number) => void; style?: object; children?: React.ReactNode }) {
  const w = useRef(1);
  const x0 = useRef(0);
  const at = (e: GestureResponderEvent) => onSeek(Math.max(0, Math.min(1, (e.nativeEvent.pageX - x0.current) / w.current)));
  return (
    <View
      style={style}
      onLayout={(e) => { w.current = Math.max(1, e.nativeEvent.layout.width); }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => { x0.current = e.nativeEvent.pageX - e.nativeEvent.locationX; at(e); }}
      onResponderMove={at}
      accessibilityLabel="Glisser pour se déplacer dans l’enregistrement"
    >
      {children}
    </View>
  );
}

/**
 * Une onde : toucher = se placer ; glisser = sélectionner un passage ;
 * attraper un bord de la sélection = l'ajuster. `edges` = les bords actuels (0..1) s'il y a une sélection.
 */
function DragArea({ onTap, onDrag, edges, style, children }: { onTap: (f: number) => void; onDrag: (a: number, b: number) => void; edges: [number, number] | null; style?: object | object[]; children?: React.ReactNode }) {
  const w = useRef(1);
  const x0 = useRef(0);
  const anchor = useRef(0);
  const start = useRef(0);
  const moved = useRef(false);
  const fOf = (e: GestureResponderEvent) => Math.max(0, Math.min(1, (e.nativeEvent.pageX - x0.current) / w.current));
  return (
    <View
      style={style}
      onLayout={(e) => { w.current = Math.max(1, e.nativeEvent.layout.width); }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        x0.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const f = fOf(e);
        start.current = f; moved.current = false; anchor.current = f;
        const near = 22 / w.current; // un bord se rattrape à ~22 px près
        if (edges) {
          if (Math.abs(f - edges[0]) < near && Math.abs(f - edges[0]) <= Math.abs(f - edges[1])) { anchor.current = edges[1]; moved.current = true; }
          else if (Math.abs(f - edges[1]) < near) { anchor.current = edges[0]; moved.current = true; }
        }
      }}
      onResponderMove={(e) => {
        const f = fOf(e);
        if (!moved.current && Math.abs(f - start.current) * w.current < 10) return;
        moved.current = true;
        onDrag(Math.min(anchor.current, f), Math.max(anchor.current, f));
      }}
      onResponderRelease={(e) => { if (!moved.current) onTap(fOf(e)); }}
      accessibilityLabel="Toucher pour se placer, glisser pour sélectionner un passage"
    >
      {children}
    </View>
  );
}

export function ListenScreen({ entry, theme, onBack }: { entry: SessEntry; theme: Theme; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const meta0 = useMemo<RecMeta>(() => parseMeta(entry.meta) ?? { name: entry.id, startedAt: 0, tracks: [], markers: [{ t: 0, label: 'Début' }], facade: false }, [entry]);
  const [files, setFiles] = useState(entry.files);
  const [markers, setMarkers] = useState<Marker[]>(meta0.markers.length ? meta0.markers : [{ t: 0, label: 'Début' }]);
  const [mix, setMix] = useState<MixState>({ ...emptyMix(), ...(meta0.mix ?? {}) });
  const [redo, setRedo] = useState<Edit[]>([]);
  const [solo, setSolo] = useState<number | null>(null);
  const [src, setSrc] = useState<'mix' | 'facade'>('mix');
  const [view, setView] = useState<'song' | 'all'>(meta0.markers.length > 1 ? 'song' : 'all');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [peaks, setPeaks] = useState<Record<string, Uint8Array>>({});
  const [bucket, setBucket] = useState(0.2);
  const [total, setTotal] = useState(meta0.seconds ?? 0);
  const [loading, setLoading] = useState('Préparation des ondes…');
  const [sharing, setSharing] = useState<Scope | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [raw, setRaw] = useState(false); // écouter « avant » : sans nettoyage ni finition
  const [edit, setEdit] = useState<number | null>(null);
  const [win, setWin] = useState<{ a: number; b: number } | null>(null); // la loupe
  const [cutOpen, setCutOpen] = useState(false); // la piste dont on ouvre les réglages
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [prog, setProg] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (m: string) => { setToast(m); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); };

  // les pistes à mixer (tout sauf la façade et les fichiers déjà exportés), et la façade
  const { tracks, facade } = useMemo(() => {
    const byFile = (n: string) => meta0.tracks.find((x) => `${x.file}.wav` === n);
    const wavs = entry.files.filter((f) => f.name.endsWith('.wav') && !isExport(f.name));
    const fac = wavs.find((f) => byFile(f.name)?.stereo && meta0.facade) ?? wavs.find((f) => f.name.startsWith('Façade')) ?? null;
    const list: Track[] = wavs.filter((f) => f !== fac && !byFile(f.name)?.stereo).map((f, k) => ({ k, file: f, name: byFile(f.name)?.name ?? f.name.replace(/\.wav$/, ''), pan: byFile(f.name)?.pan ?? 0, color: CH_PALETTE[k % CH_PALETTE.length] }));
    return { tracks: list, facade: fac };
  }, [entry, meta0]);
  const onFacade = src === 'facade' && !!facade;

  // 1) les ondes
  useEffect(() => {
    let dead = false;
    (async () => {
      const all = [...tracks.map((x) => x.file), ...(facade ? [facade] : [])];
      const got: Record<string, Uint8Array> = {};
      let secs = 0;
      for (let i = 0; i < all.length; i++) {
        if (dead) return;
        setLoading(`Préparation des ondes… ${i + 1} / ${all.length}`);
        const r = await usbListen?.peaks(all[i].path);
        if (r?.ok && r.data) { got[all[i].name] = decodeB64(r.data); if (r.bucket) setBucket(r.bucket); secs = Math.max(secs, r.seconds ?? 0); }
      }
      if (dead) return;
      setPeaks(got);
      if (secs > 0) setTotal(secs);
      setLoading('');
    })();
    return () => { dead = true; };
  }, [tracks, facade]);

  // 2) niveaux : automatique + retouche à la main, puis le tout ramené pour ne pas taper
  const mt = useMemo(() => tracks.map((x) => ({ key: x.file.name, name: x.name, pan: x.pan })), [tracks]);
  const built = useMemo(() => buildMix(mt, peaks, mix, solo, total || 1, raw), [mt, peaks, mix, solo, total, raw]);
  const levels = built.levels;
  const norm = built.norm;
  const edits = useMemo(() => (onFacade ? mix.edits.filter((e) => e.type !== 'gain' || e.k == null) : mix.edits), [mix.edits, onFacade]);
  const segs = useMemo(() => keptSegments(edits, total || 1), [edits, total]);
  const params = useMemo(() => (onFacade ? { ...engineParams({ gains: [1], pans: [0], master: lin(mix.master), edits, total }), limit: true } : built.params), [onFacade, built, mix.master, edits, total]);
  const paths = useMemo(() => (onFacade && facade ? [facade.path] : tracks.map((x) => x.file.path)), [onFacade, facade, tracks]);

  // 3) le lecteur : ouvert sur les pistes (ou la façade), il reçoit les réglages à chaque changement
  const tRef = useRef(0);
  tRef.current = t;
  useEffect(() => {
    if (loading || !paths.length) return;
    const r = usbListen?.playerOpen(paths);
    if (r && !r.ok) say(`Lecture impossible : ${r.error}`);
    usbListen?.playerSeek(tRef.current);
    setPlaying(false);
    const sub = usbListen?.addListener('onPlay', (e) => { setT(e.t); setPlaying(e.playing); });
    return () => { sub?.remove(); usbListen?.playerClose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, loading]);
  useEffect(() => { if (!loading) usbListen?.playerSet(params); }, [params, loading, paths]);
  useEffect(() => {
    const sub = usbListen?.addListener('onMix', (e) => { if (!e.peaks) setProg(e.p); });
    return () => { sub?.remove(); if (toastT.current) clearTimeout(toastT.current); };
  }, []);

  // 4) on garde les retouches et les repères avec l'enregistrement
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = setTimeout(() => usbListen?.metaSave(entry.id, JSON.stringify({ ...meta0, markers, mix, seconds: meta0.seconds ?? total })), 500);
    return () => clearTimeout(h);
  }, [mix, markers, entry.id, meta0, total]);

  const T = total || 1;
  const g = Math.max(0, markers.reduce((acc, m, i) => (t >= m.t ? i : acc), 0));
  const songEnd = (k: number) => markers[k + 1]?.t ?? T;
  // la loupe : une fenêtre plus serrée que le morceau, qui suit la lecture
  const base: [number, number] = view === 'song' ? [markers[g]?.t ?? 0, songEnd(g)] : [0, T];
  const zoomed = win && win.b > win.a ? win : null;
  const va = zoomed ? zoomed.a : base[0];
  const vb = zoomed ? zoomed.b : base[1];
  const vd = Math.max(0.5, vb - va);
  const zoom = (f: number) => {
    const span = (vb - va) * f;
    if (span >= base[1] - base[0] || span >= T) { setWin(null); return; }
    const w = Math.max(8, span), a = Math.max(0, Math.min(T - w, t - w / 2));
    setWin({ a, b: a + w });
  };
  // pendant la lecture, la loupe tourne la page quand la tête sort de l'écran
  useEffect(() => { if (zoomed && (t > zoomed.b || t < zoomed.a)) { const w = zoomed.b - zoomed.a, a = Math.max(0, Math.min(T - w, t < zoomed.a ? t - w * 0.1 : t - w * 0.05)); setWin({ a, b: a + w }); } }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (x: number) => { const v = Math.max(0, Math.min(T - 0.05, x)); setT(v); usbListen?.playerSeek(v); };
  const toggle = () => { usbListen?.playerPlay(!playing); setPlaying(!playing); };

  const addEdit = (e: Edit, msg: string) => { setMix((m) => ({ ...m, edits: [...m.edits, e] })); setRedo([]); if (e.type === 'cut' || e.type === 'keep') setSel(null); say(msg); };
  const undo = () => { const last = mix.edits[mix.edits.length - 1]; if (!last) return; setMix((m) => ({ ...m, edits: m.edits.slice(0, -1) })); setRedo((r) => [...r, last]); say('Retouche annulée'); };
  const doRedo = () => { const last = redo[redo.length - 1]; if (!last) return; setMix((m) => ({ ...m, edits: [...m.edits, last] })); setRedo((r) => r.slice(0, -1)); say('Retouche rétablie'); };
  const setTrim = (x: Track, d: number) => setMix((m) => ({ ...m, trims: { ...m.trims, [x.file.name]: Math.max(-24, Math.min(18, (m.trims[x.file.name] ?? levels[x.k].trim) + d)) } }));
  const selTxt = sel ? `${fmtTime(sel.a)} → ${fmtTime(sel.b)}` : '';
  const soloName = solo != null ? tracks[solo]?.name : null;

  const N = wide ? 150 : 70;
  const laneBars = useMemo(() => tracks.map((x, i) => bars(peaks[x.file.name] ?? null, bucket, va, vb, N, (tt) => levels[i].shown * norm * lin(mix.master) * regionGain(mix.edits, x.k, tt), segs)), [tracks, peaks, bucket, va, vb, N, levels, norm, mix.master, mix.edits, segs]);
  const overPeaks = useMemo(() => {
    if (facade && peaks[facade.name]) return peaks[facade.name];
    const len = Math.max(0, ...tracks.map((x) => peaks[x.file.name]?.length ?? 0));
    const out = new Uint8Array(len);
    tracks.forEach((x) => { const p = peaks[x.file.name]; if (p) for (let i = 0; i < p.length; i++) if (p[i] > out[i]) out[i] = p[i]; });
    return out;
  }, [facade, peaks, tracks]);
  const overBars = useMemo(() => bars(overPeaks, bucket, 0, T, wide ? 220 : 110, (tt) => regionGain(edits, -1, tt) * 1.5, segs), [overPeaks, bucket, T, wide, edits, segs]);
  const facadeBars = useMemo(() => (facade ? bars(peaks[facade.name] ?? null, bucket, va, vb, N, (tt) => lin(mix.master) * regionGain(edits, -1, tt) * 1.5, segs) : []), [facade, peaks, bucket, va, vb, N, mix.master, edits, segs]);

  const blanks = useMemo(() => findBlanks(overPeaks, bucket, T), [overPeaks, bucket, T]);
  const blanksLeft = blanks.filter((bl) => !blankIsCut(mix.edits, bl));
  const clip = useMemo(() => {
    let best: { t: number; name: string } | null = null;
    tracks.forEach((x) => { const c = firstClip(peaks[x.file.name] ?? null, bucket); if (c != null && (!best || c < best.t)) best = { t: c, name: x.name }; });
    return best as { t: number; name: string } | null;
  }, [tracks, peaks, bucket]);

  const exported = files.filter((f) => isExport(f.name));
  const refresh = () => setFiles(usbListen?.sessList().find((e) => e.id === entry.id)?.files ?? files);
  const doExport = async (scope: Scope, m4a: boolean) => {
    if (!usbListen) return;
    const lab = scope === 'sel' && sel ? `Extrait ${fmtTime(sel.a).replace(':', 'm')}-${fmtTime(sel.b).replace(':', 'm')}` : scope === 'song' ? `Mix ${markers[g]?.label ?? 'morceau'}` : 'Mix du concert';
    const out = `${entry.dir}/${lab}${onFacade ? ' (façade)' : ''}.${m4a ? 'm4a' : 'wav'}`;
    const from = scope === 'sel' && sel ? sel.a : scope === 'song' ? va : 0;
    const to = scope === 'sel' && sel ? sel.b : scope === 'song' ? vb : 0;
    usbListen.playerPlay(false);
    setProg(0);
    const r = await usbListen.mixExport({ ...params, paths, out, m4a, from, to });
    setProg(null);
    if (!r.ok || !r.path) { say(`Export impossible : ${r.error ?? ''}`); return; }
    refresh();
    setSharing(null);
    const ok = await usbListen.share(r.path).catch(() => false);
    say(ok ? `« ${out.split('/').pop()} » est prêt` : `« ${out.split('/').pop()} » est dans Musique › Ma table`);
  };

  const addMarker = () => {
    if (markers.some((m) => Math.abs(m.t - t) < 2)) { say('Il y a déjà un repère ici'); return; }
    const next = [...markers, { t, label: '' }].sort((x, y) => x.t - y.t).map((m, i) => (m.label === '' || /^Morceau \d+$/.test(m.label) ? { ...m, label: `Morceau ${i + 1}` } : m));
    setMarkers(next);
    say(`Repère posé à ${fmtTime(t)}`);
  };
  const del = () => Alert.alert('Supprimer cet enregistrement ?', `${entry.id} · tous ses fichiers seront effacés de la tablette.`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: () => { usbListen?.playerClose(); usbListen?.sessDelete(entry.id); onBack(); } },
  ]);

  const cutSecs = T - keptSeconds(segs);
  const changed = mix.edits.length > 0 || mix.master !== 0 || Object.keys(mix.trims).length > 0 || Object.values(mix.mute).some(Boolean);
  const seg = (on: boolean) => ({ backgroundColor: on ? theme.accent : 'transparent' });
  const segFg = (on: boolean) => ({ color: on ? theme.onAccent : theme.text });
  const laneH = wide ? undefined : 40;
  const selBand = sel && sel.b > va && sel.a < vb ? { left: pct((Math.max(sel.a, va) - va) / vd), width: pct((Math.min(sel.b, vb) - Math.max(sel.a, va)) / vd) } : null;
  const headShow = t >= va && t <= vb;
  const laneOverlays = (
    <>
      {view === 'all' && markers.slice(1).map((m, i) => <View key={i} pointerEvents="none" style={[styles.vline, { left: pct(m.t / T), backgroundColor: theme.line2 }]} />)}
      {selBand && (
        <View pointerEvents="none" style={[styles.selBand, selBand]}>
          <View style={[styles.grip, { left: -7 }]} />
          <View style={[styles.grip, { right: -7 }]} />
        </View>
      )}
      {headShow && <View pointerEvents="none" style={[styles.head, { left: pct((t - va) / vd) }]} />}
    </>
  );
  const small = (label: string, onPress: () => void, a11y: string, on?: boolean, onColor?: string) => (
    <Pressable onPress={onPress} accessibilityLabel={a11y} accessibilityState={{ selected: !!on }} style={[styles.sq, { borderColor: on ? onColor ?? theme.accent : theme.line2, backgroundColor: on ? onColor ?? theme.accent : theme.deep }]}>
      <Text style={{ color: on ? '#111418' : theme.text, fontSize: label.length > 1 ? 11 : 20, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
  const action = (label: string, onPress: () => void, strong?: 'light' | 'accent') => (
    <Pressable key={label} onPress={onPress} style={[styles.act, strong === 'light' ? { backgroundColor: '#E8EAED' } : strong === 'accent' ? { backgroundColor: theme.accent } : { borderWidth: 1, borderColor: BLUE }]}>
      <Text style={{ color: strong === 'light' ? '#111418' : strong === 'accent' ? theme.onAccent : '#E8EAED', fontSize: 13, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* EN-TÊTE */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Pressable onPress={() => { usbListen?.playerClose(); onBack(); }} accessibilityLabel="Retour à mes enregistrements" style={[styles.sq, { width: 44, borderColor: theme.line2, backgroundColor: theme.panel }]}><Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>‹</Text></Pressable>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 19, fontWeight: '900' }}>{entry.id}</Text>
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12 }}>
            {cutSecs > 1 ? `Mix de ${fmtTime(T - cutSecs)} (${fmtTime(cutSecs)} coupé)` : fmtTime(T)} · {markers.length} morceau{markers.length > 1 ? 'x' : ''} · {tracks.length} pistes{facade ? ' + façade' : ''}
            {meta0.holes != null ? (meta0.holes ? ` · ⚠ ${meta0.holes} trou${meta0.holes > 1 ? 's' : ''}` : ' · prise propre') : ''}{mix.edits.length ? ` · ${mix.edits.length} retouche${mix.edits.length > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        {!onFacade && tracks.length > 0 && (
          <View style={[styles.segBox, { backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.accent }]}>
            {([[true, 'Avant'], [false, 'Après']] as const).map(([v, l]) => (
              <Pressable key={l} onPress={() => setRaw(v)} accessibilityLabel={v ? 'Écouter avant : sans nettoyage ni finition' : 'Écouter après : le mix nettoyé'} accessibilityState={{ selected: raw === v }} style={[styles.segBtn, seg(raw === v)]}><Text style={[styles.segTxt, segFg(raw === v)]}>{l}</Text></Pressable>
            ))}
          </View>
        )}
        {facade && tracks.length > 0 && (
          <View style={[styles.segBox, { backgroundColor: theme.panel }]}>
            {([['mix', 'Mon mix'], ['facade', 'La façade']] as const).map(([id, l]) => (
              <Pressable key={id} onPress={() => setSrc(id)} accessibilityState={{ selected: src === id }} style={[styles.segBtn, seg(src === id)]}><Text style={[styles.segTxt, segFg(src === id)]}>{l}</Text></Pressable>
            ))}
          </View>
        )}
        {small('↶', undo, 'Annuler la dernière retouche')}
        {small('↷', doRedo, 'Rétablir')}
        {tracks.length > 0 && !onFacade && (
          <Pressable onPress={() => { setPick(Object.fromEntries(tracks.map((x, i) => [x.file.name, !mix.mute[x.file.name] && levels[i].auto != null]))); setAutoOpen(true); }} style={[styles.act, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 13, fontWeight: '900' }}>✨ Mix magique</Text></Pressable>
        )}
      </View>

      {!!loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{loading}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>La première fois, l’appli lit chaque piste pour dessiner son onde.</Text>
        </View>
      ) : (
        <>
          {/* LES MORCEAUX */}
          <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 6, flexDirection: 'row', ...(wide ? { width: '100%' } : null) }}>
            {markers.map((m, k) => (
              <Pressable key={k} onPress={() => go(m.t)} accessibilityState={{ selected: k === g }} style={[styles.song, wide ? { flex: Math.max(1, songEnd(k) - m.t), minWidth: 0 } : { minWidth: 120 }, { borderColor: k === g ? theme.accent : theme.line, backgroundColor: k === g ? theme.deep : theme.panel }]}>
                <Text numberOfLines={1} style={{ color: k === g ? theme.accent : theme.text, fontSize: 13, fontWeight: '800' }}>{k + 1} · {m.label}</Text>
                <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '600' }}>{fmtTime(songEnd(k) - m.t)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* TOUT LE CONCERT */}
          <SeekArea onSeek={(f) => go(f * T)} style={[styles.over, { borderColor: theme.line, backgroundColor: theme.deep }]}>
            <Bars data={overBars} color={theme.accent} />
            {markers.slice(1).map((m, i) => <View key={i} pointerEvents="none" style={[styles.vline, { left: pct(m.t / T), backgroundColor: theme.line2 }]} />)}
            {view === 'song' && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(va / T), width: pct(vd / T), borderWidth: 2, borderColor: theme.accent, borderRadius: 8 }} />}
            {sel && <View pointerEvents="none" style={[styles.selBand, { left: pct(sel.a / T), width: pct((sel.b - sel.a) / T), backgroundColor: 'rgba(96,165,250,0.35)' }]} />}
            <View pointerEvents="none" style={[styles.head, { left: pct(t / T) }]} />
          </SeekArea>

          {/* TRANSPORT */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, flexWrap: 'wrap' }}>
            {small('⏮', () => go(t - (markers[g]?.t ?? 0) > 4 ? markers[g].t : markers[Math.max(0, g - 1)].t), 'Morceau précédent')}
            {small('−10', () => go(t - 10), 'Reculer de 10 secondes')}
            <Pressable onPress={toggle} accessibilityLabel={playing ? 'Pause' : 'Lecture'} style={[styles.playBtn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 22, fontWeight: '900' }}>{playing ? '❚❚' : '▶'}</Text></Pressable>
            {small('+10', () => go(t + 10), 'Avancer de 10 secondes')}
            {small('⏭', () => g + 1 < markers.length && go(markers[g + 1].t), 'Morceau suivant')}
            <View style={{ minWidth: 150, marginLeft: 4 }}>
              <Text style={{ color: theme.text, fontSize: 24, fontWeight: '900' }}>{fmtTime(t)} <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '500' }}>/ {fmtTime(T)}</Text></Text>
              <Text numberOfLines={1} style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>{markers[g]?.label} · {fmtTime(t - (markers[g]?.t ?? 0))} / {fmtTime(songEnd(g) - (markers[g]?.t ?? 0))}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setSel(sel && t < sel.b ? { a: t, b: sel.b } : { a: t, b: Math.min(T, t + 20) })} style={[styles.act, { borderWidth: 1, borderColor: BLUE, backgroundColor: '#14202E' }]}><Text style={{ color: '#BFDBFE', fontSize: 13, fontWeight: '800' }}>[ Début ici</Text></Pressable>
            <Pressable onPress={() => setSel(sel && t > sel.a ? { a: sel.a, b: t } : { a: Math.max(0, t - 20), b: t })} style={[styles.act, { borderWidth: 1, borderColor: BLUE, backgroundColor: '#14202E' }]}><Text style={{ color: '#BFDBFE', fontSize: 13, fontWeight: '800' }}>Fin ici ]</Text></Pressable>
            {markers.length > 1 && (
              <View style={[styles.segBox, { backgroundColor: theme.panel }]}>
                {([['song', 'Ce morceau'], ['all', 'Tout']] as const).map(([id, l]) => (
                  <Pressable key={id} onPress={() => { setView(id); setWin(null); }} accessibilityState={{ selected: view === id }} style={[styles.segBtn, seg(view === id)]}><Text style={[styles.segTxt, segFg(view === id)]}>{l}</Text></Pressable>
                ))}
              </View>
            )}
            {small('🔍−', () => zoom(2), 'Voir plus large')}
            {small('🔍+', () => zoom(0.5), 'Voir de plus près, pour viser juste')}
            <Pressable onPress={() => setCutOpen(true)} style={[styles.act, { backgroundColor: '#E8EAED' }]}><Text style={{ color: '#111418', fontSize: 13, fontWeight: '900' }}>✂ Couper…</Text></Pressable>
            <Pressable onPress={addMarker} style={[styles.act, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>+ Repère</Text></Pressable>
          </View>

          {/* RÈGLE DU TEMPS */}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 24 }}>
            {wide && <Text style={{ width: 510, color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{onFacade ? 'LA FAÇADE, TELLE QUE LE PUBLIC L’A ENTENDUE' : 'LES PISTES DE MON MIX'}</Text>}
            <SeekArea onSeek={(f) => go(va + f * vd)} style={{ flex: 1, height: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => <Text key={f} style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>{fmtTime(va + f * vd)}</Text>)}
            </SeekArea>
          </View>

          {/* LES PISTES */}
          {onFacade && facade ? (
            <View style={{ flex: 1, gap: 6 }}>
              <DragArea onTap={(f) => go(va + f * vd)} onDrag={(a, b) => setSel({ a: va + a * vd, b: Math.max(va + a * vd + 0.3, va + b * vd) })} edges={selBand && sel ? [(sel.a - va) / vd, (sel.b - va) / vd] : null} style={[styles.lane, { flex: 1, borderColor: theme.line, backgroundColor: theme.deep }]}>
                <Bars data={facadeBars} color={theme.accent} />
                {laneOverlays}
              </DragArea>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Ici on ne dose pas les pistes : c’est le mélange de la table. Les coupes, les fondus et le volume s’appliquent quand même. Passe sur « Mon mix » pour régler chaque piste.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={wide ? { flexGrow: 1, gap: 5 } : { gap: 8, paddingBottom: 8 }}>
              {tracks.map((x, i) => {
                const L = levels[i];
                const empty = L.auto == null;
                const panel = (
                  <View style={[styles.panel, wide ? { width: 500 } : null, { borderColor: theme.line, backgroundColor: theme.panel }]}>
                    <View style={{ width: 6, alignSelf: 'stretch', marginVertical: 8, borderRadius: 3, backgroundColor: x.color }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: L.silenced || empty ? theme.muted : theme.text, fontSize: 14, fontWeight: '800' }}>{x.name}</Text>
                      <Text numberOfLines={1} style={{ color: mix.trims[x.file.name] != null && !L.silenced ? theme.accent : theme.muted, fontSize: 10, fontWeight: '600' }}>{empty ? 'piste vide' : mix.mute[x.file.name] ? 'coupée dans le mix' : L.silenced ? 'en attente (une autre est seule)' : `${L.role} · ${mix.trims[x.file.name] != null ? 'retouchée à la main' : 'niveau automatique'}`}</Text>
                    </View>
                    {small('Seule', () => setSolo(solo === x.k ? null : x.k), `Écouter ${x.name} seule`, solo === x.k, '#FBBF24')}
                    {small('Coupe', () => setMix((m) => ({ ...m, mute: { ...m.mute, [x.file.name]: !m.mute[x.file.name] } })), `Couper ${x.name} dans le mix`, !!mix.mute[x.file.name], '#F87171')}
                    {small('−', () => setTrim(x, -2), `Moins de ${x.name}`)}
                    <Text style={{ width: 44, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{L.trim > 0 ? '+' : ''}{L.trim} dB</Text>
                    {small('+', () => setTrim(x, 2), `Plus de ${x.name}`)}
                    {small('Régl.', () => setEdit(x.k), `Réglages de ${x.name} : instrument, nettoyage, gauche-droite`)}
                  </View>
                );
                const lane = (
                  <DragArea onTap={(f) => go(va + f * vd)} onDrag={(a, b) => setSel({ a: va + a * vd, b: Math.max(va + a * vd + 0.3, va + b * vd) })} edges={selBand && sel ? [(sel.a - va) / vd, (sel.b - va) / vd] : null} style={[styles.lane, wide ? { flex: 1 } : { height: laneH }, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                    <Bars data={laneBars[i]} color={x.color} dim={L.silenced} />
                    {laneOverlays}
                  </DragArea>
                );
                return wide
                  ? <View key={x.file.name} style={{ flex: 1, minHeight: 50, maxHeight: 84, flexDirection: 'row', gap: 10 }}>{panel}{lane}</View>
                  : <View key={x.file.name} style={{ gap: 4 }}>{panel}{lane}</View>;
              })}
              {!tracks.length && <Text style={{ color: theme.muted, fontSize: 14 }}>Pas de piste séparée dans cet enregistrement.</Text>}
            </ScrollView>
          )}

          {/* PIED */}
          {sel ? (
            <View style={[styles.selBar, { borderColor: BLUE }]}>
              <View style={{ minWidth: 150 }}>
                <Text style={{ color: '#BFDBFE', fontSize: 14, fontWeight: '800' }}>{selTxt} · {fmtTime(sel.b - sel.a)}</Text>
                <Text style={{ color: '#93C5FD', fontSize: 11, fontWeight: '600' }}>{onFacade || !soloName ? 'niveau : sur tout' : `niveau : sur ${soloName} seulement`}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
                {action('Couper', () => addEdit({ type: 'cut', a: sel.a, b: sel.b }, `Passage coupé (${fmtTime(sel.b - sel.a)}) · la suite se recolle sans clic`), 'light')}
                {action('Garder seulement', () => addEdit({ type: 'keep', a: sel.a, b: sel.b }, `On ne garde que ${selTxt}`))}
                {action('Moins fort', () => addEdit({ type: 'gain', a: sel.a, b: sel.b, db: -2, k: onFacade ? null : solo }, `−2 dB sur ${soloName && !onFacade ? soloName : 'tout'}, de ${selTxt}`))}
                {action('Plus fort', () => addEdit({ type: 'gain', a: sel.a, b: sel.b, db: 2, k: onFacade ? null : solo }, `+2 dB sur ${soloName && !onFacade ? soloName : 'tout'}, de ${selTxt}`))}
                {action('Fondu d’entrée', () => addEdit({ type: 'fadeIn', a: sel.a, b: sel.b }, `Le son monte doucement de ${selTxt}`))}
                {action('Fondu de sortie', () => addEdit({ type: 'fadeOut', a: sel.a, b: sel.b }, `Le son descend doucement de ${selTxt}`))}
                {action('Partager ce passage', () => setSharing('sel'), 'accent')}
              </ScrollView>
              <Pressable onPress={() => setSel(null)} accessibilityLabel="Enlever la sélection" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#BFDBFE', fontSize: 18, fontWeight: '800' }}>✕</Text></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {clip && (
                <Pressable onPress={() => { setView('song'); go(clip.t); setSel({ a: clip.t, b: Math.min(T, clip.t + 5) }); }} style={[styles.act, { borderWidth: 1, borderColor: '#B45309', backgroundColor: '#1F1C14', flexDirection: 'row', gap: 8 }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#EF4444' }} />
                  <Text style={{ color: '#FCD34D', fontSize: 13, fontWeight: '700' }}>{clip.name} a saturé à {fmtTime(clip.t)} · y aller</Text>
                </Pressable>
              )}
              <Text numberOfLines={2} style={{ flex: 1, minWidth: 120, color: theme.muted, fontSize: 12, display: blanksLeft.length && clip ? 'none' : 'flex' }}>{changed ? 'Tu entends tes retouches tout de suite. Les pistes d’origine ne changent jamais.' : 'Pour retoucher un passage : glisse le doigt sur une onde. Les bords bleus se rattrapent pour ajuster.'}</Text>
              {blanksLeft.length > 0 && (
                <Pressable onPress={() => { setPick(Object.fromEntries(tracks.map((x, i) => [x.file.name, !mix.mute[x.file.name] && levels[i].auto != null]))); setAutoOpen(true); }} style={[styles.act, { borderWidth: 1, borderColor: '#34D399', backgroundColor: '#10291F' }]}><Text style={{ color: '#BBF7D0', fontSize: 13, fontWeight: '800' }}>{blanksLeft.length} blanc{blanksLeft.length > 1 ? 's' : ''} à enlever ?</Text></Pressable>
              )}
              <Pressable onPress={() => setSel({ a: markers[g]?.t ?? 0, b: songEnd(g) })} style={[styles.act, { borderWidth: 1, borderColor: BLUE, backgroundColor: '#14202E' }]}><Text style={{ color: '#BFDBFE', fontSize: 13, fontWeight: '800' }}>Sélectionner ce morceau</Text></Pressable>
              <View style={[styles.panel, { borderColor: theme.line, backgroundColor: theme.panel, paddingHorizontal: 6 }]}>
                <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', paddingHorizontal: 4 }}>Volume du mix</Text>
                {small('−', () => setMix((m) => ({ ...m, master: Math.max(-12, m.master - 1) })), 'Baisser le volume du mix')}
                <Text style={{ width: 46, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{mix.master > 0 ? '+' : ''}{mix.master} dB</Text>
                {small('+', () => setMix((m) => ({ ...m, master: Math.min(12, m.master + 1) })), 'Monter le volume du mix')}
              </View>
              <Pressable onPress={() => setSharing(view === 'song' && markers.length > 1 ? 'song' : 'all')} style={[styles.act, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900' }}>Exporter · partager</Text></Pressable>
            </View>
          )}
        </>
      )}

      {/* COUPER : les coupes les plus courantes, d'un seul geste, là où se trouve la tête de lecture */}
      {cutOpen && (() => {
        const here = blanks.find((bl) => t >= bl.a - 1 && t <= bl.b + 1 && !blankIsCut(mix.edits, bl));
        const opts: [string, string, () => void][] = [
          [`Tout ce qui est avant ${fmtTime(t)}`, 'le début jusqu’à la tête de lecture', () => addEdit({ type: 'cut', a: 0, b: t }, `Début coupé jusqu’à ${fmtTime(t)}`)],
          [`Tout ce qui est après ${fmtTime(t)}`, 'de la tête de lecture jusqu’à la fin', () => addEdit({ type: 'cut', a: t, b: T }, `Fin coupée à partir de ${fmtTime(t)}`)],
          ...(markers.length > 1 ? [[`Tout « ${markers[g]?.label} »`, `le morceau entier · ${fmtTime(songEnd(g) - (markers[g]?.t ?? 0))}`, () => addEdit({ type: 'cut', a: markers[g]?.t ?? 0, b: songEnd(g) }, `« ${markers[g]?.label} » retiré du mix`)] as [string, string, () => void]] : []),
          ...(here ? [[`Le blanc ici · ${Math.round(here.b - here.a)} s`, `${fmtTime(here.a)} → ${fmtTime(here.b)}`, () => addEdit({ type: 'cut', a: here.a, b: here.b }, 'Blanc coupé')] as [string, string, () => void]] : []),
          ...(blanksLeft.length > 1 ? [[`Tous les blancs · ${blanksLeft.length}`, `${Math.round(blanksLeft.reduce((x, bl) => x + bl.b - bl.a, 0))} s en moins`, () => { setMix((m) => ({ ...m, edits: [...m.edits, ...blanksLeft.map((bl) => ({ type: 'cut' as const, a: bl.a, b: bl.b }))] })); setRedo([]); say(`${blanksLeft.length} blancs coupés`); }] as [string, string, () => void]] : []),
        ];
        return (
          <Pressable onPress={() => setCutOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }]}>
            <Pressable onPress={() => {}} style={[styles.sheet, { width: 460, backgroundColor: theme.panel, borderColor: theme.line2 }]}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>✂ Couper quoi ?</Text>
              {opts.map(([title, sub, run]) => (
                <Pressable key={title} onPress={() => { run(); setCutOpen(false); }} style={[styles.fmt, { minHeight: 54, borderColor: theme.line2, backgroundColor: theme.deep }]}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{title}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
                </Pressable>
              ))}
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Pour un passage précis : glisse le doigt sur une onde, puis « Couper ». Rien n’est effacé, ↶ annule.</Text>
              <Pressable onPress={() => setCutOpen(false)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 8 }}><Text style={{ color: theme.muted, fontSize: 14, fontWeight: '700' }}>Fermer</Text></Pressable>
            </Pressable>
          </Pressable>
        );
      })()}

      {/* RÉGLAGES D'UNE PISTE : instrument reconnu, nettoyage, gauche-droite */}
      {edit != null && tracks[edit] && (() => {
        const x = tracks[edit], L = levels[edit], key = x.file.name, R = ROLES[L.role];
        const fx: [FxKind, string, string, boolean][] = [
          ['hp', 'Coupe-bas', `enlève le grondement sous ${R.hp} Hz`, true],
          ['comp', 'Compression', `resserre les écarts : les crêtes baissent d’environ ${Math.round(procForShow(L.role, mix.force ?? 1))} dB`, true],
          ['gate', 'Anti-repisse', 'baisse la piste entre les frappes : moins des autres instruments', R.gate],
        ];
        return (
          <Pressable onPress={() => setEdit(null)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }]}>
            <Pressable onPress={() => {}} style={[styles.sheet, { width: 520, maxHeight: '94%', padding: 0, backgroundColor: theme.panel, borderColor: theme.line2 }]}>
             <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 28, borderRadius: 4, backgroundColor: x.color }} />
                <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 18, fontWeight: '900' }}>{x.name}</Text>
                {small('Seule', () => setSolo(solo === x.k ? null : x.k), `Écouter ${x.name} seule`, solo === x.k, '#FBBF24')}
              </View>
              <Text style={styles.kick}>C’EST QUEL INSTRUMENT ? (ÇA RÈGLE LE NETTOYAGE)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ROLE_NAMES.map((r: Role) => (
                  <Pressable key={r} onPress={() => setMix((m) => ({ ...m, roles: { ...m.roles, [key]: r }, trims: Object.fromEntries(Object.entries(m.trims).filter(([k2]) => k2 !== key)) }))} accessibilityState={{ selected: L.role === r }} style={[styles.act, { minHeight: 40, borderWidth: 1.5, borderColor: L.role === r ? theme.accent : theme.line2, backgroundColor: L.role === r ? theme.accent : 'transparent' }]}>
                    <Text style={{ color: L.role === r ? theme.onAccent : theme.text, fontSize: 13, fontWeight: '800' }}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.kick}>NETTOYAGE</Text>
              {fx.filter((f) => f[3]).map(([id, title, sub]) => {
                const on = !mix.off?.[`${key}:${id}`];
                return (
                  <Pressable key={id} onPress={() => setMix((m) => ({ ...m, off: { ...m.off, [`${key}:${id}`]: on } }))} accessibilityState={{ checked: on }} style={[styles.fmt, { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.deep : 'transparent' }]}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? theme.accent : theme.muted, backgroundColor: on ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900', lineHeight: 16 }}>✓</Text>}</View>
                    <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{title}</Text><Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text></View>
                  </Pressable>
                );
              })}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.kick, { marginRight: 4 }]}>NIVEAU</Text>
                {small('−', () => setTrim(x, -1), `Moins de ${x.name}`)}
                <Text style={{ width: 50, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800' }}>{L.trim > 0 ? '+' : ''}{L.trim} dB</Text>
                {small('+', () => setTrim(x, 1), `Plus de ${x.name}`)}
                <Text style={[styles.kick, { marginLeft: 12, marginRight: 4 }]}>GAUCHE · DROITE</Text>
                {small('◀', () => setMix((m) => ({ ...m, pans: { ...m.pans, [key]: Math.max(-1, Math.round((L.pan - 0.2) * 10) / 10) } })), 'Plus à gauche')}
                <Text style={{ width: 64, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800' }}>{Math.abs(L.pan) < 0.05 ? 'centre' : `${Math.round(Math.abs(L.pan) * 100)} % ${L.pan < 0 ? 'G' : 'D'}`}</Text>
                {small('▶', () => setMix((m) => ({ ...m, pans: { ...m.pans, [key]: Math.min(1, Math.round((L.pan + 0.2) * 10) / 10) } })), 'Plus à droite')}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => { const drop = (o?: Record<string, unknown>) => Object.fromEntries(Object.entries(o ?? {}).filter(([k2]) => k2 !== key && !k2.startsWith(`${key}:`))); setMix((m) => ({ ...m, trims: drop(m.trims) as Record<string, number>, roles: drop(m.roles) as Record<string, Role>, pans: drop(m.pans) as Record<string, number>, off: drop(m.off) as Record<string, boolean> })); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Revenir à l’automatique</Text></Pressable>
                <Pressable onPress={() => setEdit(null)} style={[styles.act, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900' }}>OK</Text></Pressable>
              </View>
             </ScrollView>
            </Pressable>
          </Pressable>
        );
      })()}

      {/* MIX AUTOMATIQUE : quelles pistes, puis l'appli met tout au même niveau */}
      {autoOpen && (
        <Pressable onPress={() => setAutoOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }]}>
          <Pressable onPress={() => {}} style={[styles.sheet, { width: 560, maxHeight: '94%', padding: 0, backgroundColor: theme.panel, borderColor: theme.line2 }]}>
           <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>Mix magique</Text>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Coche les pistes à garder. L’appli les met à peu près au même niveau (la voix un peu devant), avec tes panoramiques. Ensuite tu écoutes et tu retouches avec − / +.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {tracks.map((x, i) => {
                const empty = levels[i].auto == null;
                const on = !!pick[x.file.name] && !empty;
                return (
                  <Pressable key={x.file.name} disabled={empty} onPress={() => setPick((p) => ({ ...p, [x.file.name]: !p[x.file.name] }))} accessibilityState={{ checked: on }} style={{ width: '48.5%', minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, borderColor: on ? x.color : theme.line2, backgroundColor: on ? theme.deep : 'transparent', opacity: empty ? 0.5 : 1 }}>
                    <Tick on={on} theme={theme} />
                    <Text numberOfLines={1} style={{ flex: 1, color: on ? theme.text : theme.muted, fontSize: 14, fontWeight: on ? '800' : '500' }}>{x.name}{empty ? ' (vide)' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.kick}>NETTOYAGE DE CHAQUE PISTE (COUPE-BAS, COMPRESSION, ANTI-REPISSE)</Text>
            <View style={[styles.segBox, { backgroundColor: theme.deep, alignSelf: 'flex-start' }]}>
              {['Léger', 'Normal', 'Fort'].map((l, i) => (
                <Pressable key={l} onPress={() => setMix((m) => ({ ...m, force: i }))} accessibilityState={{ selected: (mix.force ?? 1) === i }} style={[styles.segBtn, seg((mix.force ?? 1) === i)]}><Text style={[styles.segTxt, segFg((mix.force ?? 1) === i)]}>{l}</Text></Pressable>
              ))}
            </View>
            <Text style={styles.kick}>FINITION (COMME UN MASTERING)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {([['eq', 'Équilibre graves / aigus'], ['glue', 'Colle d’ensemble']] as const).map(([id, l]) => {
                const on = mix[id] !== false;
                return <Pressable key={id} onPress={() => setMix((m) => ({ ...m, [id]: !on }))} accessibilityState={{ checked: on }} style={[styles.act, { borderWidth: 1.5, borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.deep : 'transparent' }]}><Text style={{ color: on ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{on ? '✓ ' : ''}{l}</Text></Pressable>;
              })}
              <View style={[styles.segBox, { backgroundColor: theme.deep }]}>
                {([['nat', 'Naturel'], ['std', 'Standard'], ['fort', 'Fort']] as const).map(([id, l]) => (
                  <Pressable key={id} onPress={() => setMix((m) => ({ ...m, loud: id }))} accessibilityLabel={`Volume final : ${l}`} accessibilityState={{ selected: (mix.loud ?? 'std') === id }} style={[styles.segBtn, seg((mix.loud ?? 'std') === id)]}><Text style={[styles.segTxt, segFg((mix.loud ?? 'std') === id)]}>{l}</Text></Pressable>
                ))}
              </View>
            </View>
            {blanks.length > 0 && (
              <>
                <Text style={styles.kick}>LES BLANCS TROUVÉS · À TOI DE DÉCIDER</Text>
                <ScrollView style={{ maxHeight: 132 }}>
                  {blanks.map((bl, i) => {
                    const done = blankIsCut(mix.edits, bl);
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                        <Pressable onPress={() => { go(Math.max(0, bl.a - 2)); usbListen?.playerPlay(true); setPlaying(true); }} accessibilityLabel="Écouter ce blanc" style={[styles.sq, { width: 40, height: 40, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 14 }}>▶</Text></Pressable>
                        <Text style={{ flex: 1, color: done ? theme.muted : theme.text, fontSize: 13 }}>{bl.where === 'début' ? 'Avant le début' : bl.where === 'fin' ? 'Après la fin' : 'Entre deux morceaux'} · {fmtTime(bl.a)} → {fmtTime(bl.b)} · {Math.round(bl.b - bl.a)} s</Text>
                        <Pressable disabled={done} onPress={() => addEdit({ type: 'cut', a: bl.a, b: bl.b }, `Blanc coupé (${Math.round(bl.b - bl.a)} s)`)} style={[styles.act, { minHeight: 40, borderWidth: 1.5, borderColor: done ? '#34D399' : theme.line2, backgroundColor: done ? '#10291F' : 'transparent' }]}><Text style={{ color: done ? '#BBF7D0' : theme.text, fontSize: 12, fontWeight: '800' }}>{done ? 'Coupé' : 'Couper'}</Text></Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPick(Object.fromEntries(tracks.map((x) => [x.file.name, true])))} style={[styles.act, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Tout cocher</Text></Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setAutoOpen(false)} style={[styles.act]}><Text style={{ color: theme.muted, fontSize: 14, fontWeight: '700' }}>Annuler</Text></Pressable>
            </View>
            <Pressable
              onPress={() => {
                const n = tracks.filter((x, i) => pick[x.file.name] && levels[i].auto != null).length;
                if (!n) { say('Coche au moins une piste'); return; }
                setMix((m) => ({ ...m, trims: {}, master: 0, off: {}, pans: {}, mute: Object.fromEntries(tracks.filter((x) => !pick[x.file.name]).map((x) => [x.file.name, true])) }));
                setSolo(null); setAutoOpen(false);
                go(markers[g]?.t ?? 0);
                usbListen?.playerPlay(true); setPlaying(true);
                say(`Mix automatique sur ${n} piste${n > 1 ? 's' : ''} · écoute, puis retouche avec − / +`);
              }}
              style={[styles.fmt, { alignItems: 'center', borderColor: theme.accent, backgroundColor: theme.accent }]}
            >
              <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '900' }}>Équilibrer et écouter ▶</Text>
            </Pressable>
            {mix.edits.length > 0 && <Pressable onPress={() => { setMix(emptyMix()); setRedo([]); setSolo(null); setAutoOpen(false); say('Tout est remis à zéro : ni coupe ni retouche'); }} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: '#FCA5A5', fontSize: 13, fontWeight: '700' }}>Enlever aussi les {mix.edits.length} coupes et retouches</Text></Pressable>}
           </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {/* PARTAGER : quoi, dans quel format, et les fichiers déjà faits */}
      {sharing && (
        <Pressable onPress={() => prog == null && setSharing(null)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }]}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>{sharing === 'sel' ? `Partager le passage ${selTxt}` : sharing === 'song' ? `Partager « ${markers[g]?.label} »` : onFacade ? 'Partager la façade' : 'Partager mon mix'}</Text>
            {sharing !== 'sel' && markers.length > 1 && prog == null && (
              <View style={[styles.segBox, { backgroundColor: theme.deep, alignSelf: 'flex-start' }]}>
                {([['song', 'Ce morceau'], ['all', 'Tout le concert']] as const).map(([id, l]) => (
                  <Pressable key={id} onPress={() => setSharing(id)} style={[styles.segBtn, seg(sharing === id)]}><Text style={[styles.segTxt, segFg(sharing === id)]}>{l}</Text></Pressable>
                ))}
              </View>
            )}
            {prog == null ? (
              <>
                {([[true, 'Fichier léger (M4A)', 'parfait pour WhatsApp ou un mail'], [false, 'Qualité maximale (WAV)', 'gros fichier · pour retravailler sur un ordinateur']] as const).map(([m4a, l, sub]) => (
                  <Pressable key={l} onPress={() => doExport(sharing, m4a)} style={[styles.fmt, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{l}</Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }}>{sub}</Text>
                  </Pressable>
                ))}
                {exported.length > 0 && <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 }}>DÉJÀ FAITS</Text>}
                <ScrollView style={{ maxHeight: 150 }}>
                  {exported.map((f) => (
                    <View key={f.path} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 13 }}>{f.name} · {gb(f.size)}</Text>
                      <Pressable onPress={() => usbListen?.share(f.path)} style={[styles.act, { minHeight: 38, borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Partager</Text></Pressable>
                      <Pressable onPress={() => { usbListen?.fileDelete(f.path); refresh(); }} accessibilityLabel={`Supprimer ${f.name}`} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.muted, fontSize: 15 }}>✕</Text></Pressable>
                    </View>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pressable onPress={del} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#FCA5A5', fontSize: 13, fontWeight: '700' }}>Supprimer l’enregistrement</Text></Pressable>
                  <Pressable onPress={() => setSharing(null)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: theme.muted, fontSize: 14, fontWeight: '700' }}>Fermer</Text></Pressable>
                </View>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ height: 12, borderRadius: 6, backgroundColor: theme.line }}><View style={{ width: `${Math.round(prog * 100)}%`, height: 12, borderRadius: 6, backgroundColor: theme.accent }} /></View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, color: theme.muted, fontSize: 12 }}>Fabrication du fichier… {Math.round(prog * 100)} %</Text>
                  <Pressable onPress={() => usbListen?.mixCancel()} style={[styles.act, { minHeight: 38, borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 12 }}>Annuler</Text></Pressable>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      )}

      {!!toast && <View pointerEvents="none" style={styles.toast}><Text style={{ color: '#111418', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{toast}</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  kick: { color: '#9AA3AD', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
  sq: { minWidth: 44, height: 44, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  act: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 72, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  segBox: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segTxt: { fontSize: 13, fontWeight: '800' },
  song: { minHeight: 44, borderRadius: 10, borderWidth: 2, paddingHorizontal: 10, justifyContent: 'center', overflow: 'hidden' },
  over: { height: 72, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  lane: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  panel: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8 },
  vline: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  head: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF' },
  selBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(96,165,250,0.22)', borderLeftWidth: 2, borderRightWidth: 2, borderColor: BLUE },
  grip: { position: 'absolute', top: '50%', marginTop: -11, width: 12, height: 22, borderRadius: 4, backgroundColor: BLUE },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 12, paddingRight: 4, minHeight: 56, backgroundColor: '#14202E', borderWidth: 2, borderRadius: 14 },
  sheet: { width: 380, maxWidth: '92%', borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  fmt: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, top: 54, alignSelf: 'center', backgroundColor: '#E8EAED', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14 },
});
