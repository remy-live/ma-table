// Écouter un enregistrement : les morceaux, la grande onde du concert, une onde par
// piste, un lecteur où l'on entend ses réglages tout de suite, la sélection d'un
// passage (couper, garder, niveau, fondus), l'export et le partage.
// Rien n'est modifié dans les fichiers : on garde une liste de retouches.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Theme } from '../ui/theme';
import { activeLevel, autoGainDb, Bar, bars, decodeB64, Edit, emptyMix, engineParams, firstClip, isRemoved, keptSeconds, keptSegments, lin, mixScale, MixState, regionGain } from '../xair/listen';
import { autoTrim, fmtTime, Marker, parseMeta, RecMeta } from '../xair/recorder';
import { CH_PALETTE } from '../xair/smartName';
import { SessEntry, SessFile, usbListen } from '../xair/usbAudio';

const BLUE = '#60A5FA';
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
      onResponderGrant={(e) => { x0.current = e.nativeEvent.pageX - e.nativeEvent.locationX; at(e); }}
      onResponderMove={at}
      accessibilityLabel="Glisser pour se déplacer dans l’enregistrement"
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
  const [mix, setMix] = useState<MixState>(meta0.mix ?? emptyMix());
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
  const levels = useMemo(() => tracks.map((x) => {
    const auto = autoGainDb(activeLevel(peaks[x.file.name] ?? new Uint8Array(0)));
    const trim = mix.trims[x.file.name] ?? autoTrim(x.name);
    const silenced = !!mix.mute[x.file.name] || (solo != null && solo !== x.k);
    return { auto, trim, silenced, shown: auto == null ? 0 : lin(auto + trim) };
  }), [tracks, peaks, mix.trims, mix.mute, solo]);
  const norm = useMemo(() => mixScale(tracks.map((x, i) => ({ peaks: peaks[x.file.name] ?? null, gain: mix.mute[x.file.name] ? 0 : levels[i].shown }))), [tracks, peaks, levels, mix.mute]);
  const edits = useMemo(() => (onFacade ? mix.edits.filter((e) => e.type !== 'gain' || e.k == null) : mix.edits), [mix.edits, onFacade]);
  const segs = useMemo(() => keptSegments(edits, total || 1), [edits, total]);
  const params = useMemo(() => engineParams(onFacade
    ? { gains: [1], pans: [0], master: lin(mix.master), edits, total }
    : { gains: levels.map((l) => (l.silenced ? 0 : l.shown)), pans: tracks.map((x) => x.pan), master: lin(mix.master) * norm, edits, total }), [onFacade, levels, tracks, mix.master, norm, edits, total]);
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
  const va = view === 'song' ? markers[g]?.t ?? 0 : 0;
  const vb = view === 'song' ? songEnd(g) : T;
  const vd = Math.max(0.5, vb - va);
  const go = (x: number) => { const v = Math.max(0, Math.min(T - 0.05, x)); setT(v); usbListen?.playerSeek(v); };
  const toggle = () => { usbListen?.playerPlay(!playing); setPlaying(!playing); };

  const addEdit = (e: Edit, msg: string) => { setMix((m) => ({ ...m, edits: [...m.edits, e] })); setRedo([]); if (e.type === 'cut' || e.type === 'keep') setSel(null); say(msg); };
  const undo = () => { const last = mix.edits[mix.edits.length - 1]; if (!last) return; setMix((m) => ({ ...m, edits: m.edits.slice(0, -1) })); setRedo((r) => [...r, last]); say('Retouche annulée'); };
  const doRedo = () => { const last = redo[redo.length - 1]; if (!last) return; setMix((m) => ({ ...m, edits: [...m.edits, last] })); setRedo((r) => r.slice(0, -1)); say('Retouche rétablie'); };
  const setTrim = (x: Track, d: number) => setMix((m) => ({ ...m, trims: { ...m.trims, [x.file.name]: Math.max(-24, Math.min(18, (m.trims[x.file.name] ?? autoTrim(x.name)) + d)) } }));
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
      {selBand && <View pointerEvents="none" style={[styles.selBand, selBand]} />}
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
        {facade && tracks.length > 0 && (
          <View style={[styles.segBox, { backgroundColor: theme.panel }]}>
            {([['mix', 'Mon mix'], ['facade', 'La façade']] as const).map(([id, l]) => (
              <Pressable key={id} onPress={() => setSrc(id)} accessibilityState={{ selected: src === id }} style={[styles.segBtn, seg(src === id)]}><Text style={[styles.segTxt, segFg(src === id)]}>{l}</Text></Pressable>
            ))}
          </View>
        )}
        {small('↶', undo, 'Annuler la dernière retouche')}
        {small('↷', doRedo, 'Rétablir')}
        <Pressable onPress={() => setSharing(view === 'song' && markers.length > 1 ? 'song' : 'all')} style={[styles.act, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Partager</Text></Pressable>
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
                  <Pressable key={id} onPress={() => setView(id)} accessibilityState={{ selected: view === id }} style={[styles.segBtn, seg(view === id)]}><Text style={[styles.segTxt, segFg(view === id)]}>{l}</Text></Pressable>
                ))}
              </View>
            )}
            <Pressable onPress={addMarker} style={[styles.act, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>+ Repère</Text></Pressable>
          </View>

          {/* RÈGLE DU TEMPS */}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 24 }}>
            {wide && <Text style={{ width: 382, color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{onFacade ? 'LA FAÇADE, TELLE QUE LE PUBLIC L’A ENTENDUE' : 'LES PISTES DE MON MIX'}</Text>}
            <SeekArea onSeek={(f) => go(va + f * vd)} style={{ flex: 1, height: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => <Text key={f} style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>{fmtTime(va + f * vd)}</Text>)}
            </SeekArea>
          </View>

          {/* LES PISTES */}
          {onFacade && facade ? (
            <View style={{ flex: 1, gap: 6 }}>
              <SeekArea onSeek={(f) => go(va + f * vd)} style={[styles.lane, { flex: 1, borderColor: theme.line, backgroundColor: theme.deep }]}>
                <Bars data={facadeBars} color={theme.accent} />
                {laneOverlays}
              </SeekArea>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Ici on ne dose pas les pistes : c’est le mélange de la table. Les coupes, les fondus et le volume s’appliquent quand même. Passe sur « Mon mix » pour régler chaque piste.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={wide ? { flexGrow: 1, gap: 5 } : { gap: 8, paddingBottom: 8 }}>
              {tracks.map((x, i) => {
                const L = levels[i];
                const empty = L.auto == null;
                const panel = (
                  <View style={[styles.panel, wide ? { width: 372 } : null, { borderColor: theme.line, backgroundColor: theme.panel }]}>
                    <View style={{ width: 6, alignSelf: 'stretch', marginVertical: 8, borderRadius: 3, backgroundColor: x.color }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: L.silenced || empty ? theme.muted : theme.text, fontSize: 14, fontWeight: '800' }}>{x.name}</Text>
                      <Text numberOfLines={1} style={{ color: mix.trims[x.file.name] != null && !L.silenced ? theme.accent : theme.muted, fontSize: 10, fontWeight: '600' }}>{empty ? 'piste vide' : mix.mute[x.file.name] ? 'coupée dans le mix' : L.silenced ? 'en attente (une autre est seule)' : mix.trims[x.file.name] != null ? 'retouchée à la main' : 'niveau automatique'}</Text>
                    </View>
                    {small('Seule', () => setSolo(solo === x.k ? null : x.k), `Écouter ${x.name} seule`, solo === x.k, '#FBBF24')}
                    {small('Coupe', () => setMix((m) => ({ ...m, mute: { ...m.mute, [x.file.name]: !m.mute[x.file.name] } })), `Couper ${x.name} dans le mix`, !!mix.mute[x.file.name], '#F87171')}
                    {small('−', () => setTrim(x, -2), `Moins de ${x.name}`)}
                    <Text style={{ width: 44, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{L.trim > 0 ? '+' : ''}{L.trim} dB</Text>
                    {small('+', () => setTrim(x, 2), `Plus de ${x.name}`)}
                  </View>
                );
                const lane = (
                  <SeekArea onSeek={(f) => go(va + f * vd)} style={[styles.lane, wide ? { flex: 1 } : { height: laneH }, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                    <Bars data={laneBars[i]} color={x.color} dim={L.silenced} />
                    {laneOverlays}
                  </SeekArea>
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
              <Text style={{ flex: 1, minWidth: 160, color: theme.muted, fontSize: 12 }}>{changed ? 'Tu entends tes retouches tout de suite. Les pistes d’origine ne changent jamais.' : 'Pour retoucher un passage : place-toi, puis « [ Début ici » et « Fin ici ] ».'}</Text>
              <View style={[styles.panel, { borderColor: theme.line, backgroundColor: theme.panel, paddingHorizontal: 6 }]}>
                <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', paddingHorizontal: 4 }}>Volume du mix</Text>
                {small('−', () => setMix((m) => ({ ...m, master: Math.max(-12, m.master - 1) })), 'Baisser le volume du mix')}
                <Text style={{ width: 46, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '800' }}>{mix.master > 0 ? '+' : ''}{mix.master} dB</Text>
                {small('+', () => setMix((m) => ({ ...m, master: Math.min(12, m.master + 1) })), 'Monter le volume du mix')}
              </View>
              {changed && <Pressable onPress={() => { setMix(emptyMix()); setRedo([]); setSolo(null); say('Retour au mix automatique, sans coupe ni retouche'); }} style={[styles.act, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Tout remettre à zéro</Text></Pressable>}
            </View>
          )}
        </>
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
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 12, paddingRight: 4, minHeight: 56, backgroundColor: '#14202E', borderWidth: 2, borderRadius: 14 },
  sheet: { width: 380, maxWidth: '92%', borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  fmt: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, top: 54, alignSelf: 'center', backgroundColor: '#E8EAED', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14 },
});
