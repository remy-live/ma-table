// Mes enregistrements : écouter un aperçu sans ouvrir (▶ + petite onde), « Mix magique »
// d'un seul geste, et trier / supprimer plusieurs essais d'un coup.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Theme } from '../ui/theme';
import { Bar, bars, Blank, blankIsCut, buildMix, decodeB64, Edit, emptyMix, engineParams, findBlanks, keptSegments, lin, mergePeaks } from '../xair/listen';
import { fmtTime, parseMeta, RecMeta } from '../xair/recorder';
import { SessEntry, SessFile, usbListen } from '../xair/usbAudio';
import { Tick } from './RecPrep';

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.round(b / 1e6)} Mo`);
const isExport = (n: string) => n.startsWith('Mix') || n.startsWith('Extrait');
export const MAGIC_FILE = 'Mix du concert.m4a';

interface Loaded { meta: RecMeta | null; tracks: { key: string; name: string; pan: number; path: string }[]; facade: SessFile | null; peaks: Record<string, Uint8Array>; bucket: number; seconds: number; over: Bar[]; first: number; all: Uint8Array }
const cache: Record<string, Loaded> = {};

/** Les pistes d'un enregistrement et leurs ondes (gardées en mémoire pendant que l'écran reste ouvert). */
async function load(e: SessEntry): Promise<Loaded | null> {
  if (cache[e.id]) return cache[e.id];
  if (!usbListen) return null;
  const meta = parseMeta(e.meta);
  const by = (n: string) => meta?.tracks.find((x) => `${x.file}.wav` === n);
  const wavs = e.files.filter((f) => f.name.endsWith('.wav') && !isExport(f.name));
  const facade = wavs.find((f) => by(f.name)?.stereo && meta?.facade) ?? wavs.find((f) => f.name.startsWith('Façade')) ?? null;
  const tracks = wavs.filter((f) => f !== facade && !by(f.name)?.stereo).map((f) => ({ key: f.name, path: f.path, name: by(f.name)?.name ?? f.name.replace(/\.wav$/, ''), pan: by(f.name)?.pan ?? 0 }));
  const peaks: Record<string, Uint8Array> = {};
  let bucket = 0.2, seconds = meta?.seconds ?? 0;
  for (const f of [...tracks.map((x) => ({ name: x.key, path: x.path })), ...(facade ? [facade] : [])]) {
    const r = await usbListen.peaks(f.path);
    if (r.ok && r.data) { peaks[f.name] = decodeB64(r.data); bucket = r.bucket ?? bucket; seconds = Math.max(seconds, r.seconds ?? 0); }
  }
  const all = (facade && peaks[facade.name]) || mergePeaks(tracks.map((x) => peaks[x.key]));
  let first = 0;
  for (let i = 0; i < all.length; i++) if (all[i] > 40) { first = Math.max(0, i * bucket - 1); break; }
  const d: Loaded = { meta, tracks, facade, peaks, bucket, seconds, over: bars(all, bucket, 0, seconds || 1, 90, () => 1.5, [[0, seconds || 1]]), first, all };
  cache[e.id] = d;
  return d;
}

/** Les réglages du lecteur pour cet enregistrement : son mix gardé, sinon le mix magique par défaut. */
function paramsFor(d: Loaded, facade: boolean) {
  const mix = { ...emptyMix(), ...(d.meta?.mix ?? {}) };
  const total = d.seconds || 1;
  if (facade && d.facade) return { paths: [d.facade.path], params: { ...engineParams({ gains: [1], pans: [0], master: lin(mix.master), edits: mix.edits.filter((x) => x.type !== 'gain' || x.k == null), total }), limit: true }, segs: keptSegments(mix.edits, total) };
  return { paths: d.tracks.map((x) => x.path), params: buildMix(d.tracks, d.peaks, mix, null, total).params, segs: keptSegments(mix.edits, total) };
}

const Wave = React.memo(function Wave({ data, played, color, dim }: { data: Bar[]; played: number; color: string; dim: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 2, paddingVertical: 4 }]}>
      {data.map((b, i) => <View key={i} style={{ flex: 1, height: `${Math.round(b.h * 100)}%`, borderRadius: 1, backgroundColor: i / data.length < played ? color : dim }} />)}
    </View>
  );
});

export function RecList({ list, theme, liveId, wide, onOpen, reload }: { list: SessEntry[]; theme: Theme; liveId: string | null; wide: boolean; onOpen: (id: string) => void; reload: () => void }) {
  const [ready, setReady] = useState(0); // +1 à chaque onde chargée
  const [now, setNow] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [src, setSrc] = useState<'mix' | 'facade'>('mix');
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState(0);
  const [sorting, setSorting] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null); // renommer
  const [offer, setOffer] = useState<{ id: string; blanks: Blank[] } | null>(null); // blancs trouvés après un mix magique
  const nowRef = useRef<string | null>(null);
  nowRef.current = now;

  // les petites ondes arrivent une par une
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const e of list) {
        if (dead) return;
        if (e.id === liveId || cache[e.id]) continue;
        await load(e).catch(() => null);
        if (!dead) setReady((n) => n + 1);
      }
    })();
    return () => { dead = true; };
  }, [list, liveId]);

  useEffect(() => {
    const a = usbListen?.addListener('onPlay', (e) => { if (!nowRef.current) return; setT(e.t); if (e.ended) setNow(null); });
    const b = usbListen?.addListener('onMix', (e) => { if (!e.peaks) setProg(e.p); });
    return () => { a?.remove(); b?.remove(); usbListen?.playerClose(); };
  }, []);

  const stop = () => { usbListen?.playerClose(); setNow(null); };
  const play = async (e: SessEntry, at: number | null, source = src) => {
    const d = await load(e);
    if (!d || (!d.tracks.length && !d.facade)) { setMsg('Rien à écouter dans cet enregistrement.'); return; }
    const p = paramsFor(d, source === 'facade' || !d.tracks.length);
    const r = usbListen?.playerOpen(p.paths);
    if (r && !r.ok) { setMsg(`Lecture impossible : ${r.error}`); return; }
    usbListen?.playerSet(p.params);
    const start = at ?? d.first;
    usbListen?.playerSeek(start);
    usbListen?.playerPlay(true);
    setT(start); setNow(e.id); setMsg('');
  };
  /** Les blancs pas encore coupés de cet enregistrement. */
  const blanksOf = (d: Loaded) => findBlanks(d.all, d.bucket, d.seconds || 1).filter((bl) => !blankIsCut(d.meta?.mix?.edits ?? [], bl));
  /** Après « oui » : on note les coupes avec l'enregistrement et on refait le mix. */
  const cutBlanks = async (e: SessEntry, blanks: Blank[]) => {
    const d = cache[e.id];
    if (!d || !usbListen) return;
    const base: RecMeta = d.meta ?? { name: e.id, startedAt: 0, tracks: [], markers: [{ t: 0, label: 'Début' }], facade: false };
    const cuts: Edit[] = blanks.map((bl) => ({ type: 'cut', a: bl.a, b: bl.b }));
    const meta: RecMeta = { ...base, mix: { ...emptyMix(), ...(base.mix ?? {}), edits: [...(base.mix?.edits ?? []), ...cuts] } };
    usbListen.metaSave(e.id, JSON.stringify(meta));
    d.meta = meta;
    setOffer(null);
    const old = e.files.find((f) => f.name === MAGIC_FILE);
    if (old) usbListen.fileDelete(old.path);
    await magic({ ...e, files: e.files.filter((f) => f.name !== MAGIC_FILE) }, true);
  };
  const magic = async (e: SessEntry, again = false) => {
    if (!usbListen || busy) return;
    const done = e.files.find((f) => f.name === MAGIC_FILE);
    if (done) { const ok = await usbListen.share(done.path).catch(() => false); if (!ok) setMsg('Le mix est dans Musique › Ma table.'); return; }
    stop();
    setBusy(e.id); setProg(0);
    const d = await load(e);
    if (!d || !d.tracks.length) { setBusy(null); setMsg('Pas de piste séparée à mixer dans cet enregistrement.'); return; }
    const p = paramsFor(d, false);
    const r = await usbListen.mixExport({ ...p.params, paths: p.paths, out: `${e.dir}/${MAGIC_FILE}`, m4a: true });
    setBusy(null);
    if (!r.ok) { setMsg(`Mix impossible : ${r.error ?? ''}`); return; }
    reload();
    const left = again ? [] : blanksOf(d);
    setOffer(left.length ? { id: e.id, blanks: left } : null);
    setMsg(again ? 'Mix refait sans les blancs.' : 'Mix magique prêt : niveaux, nettoyage de chaque piste, finition.');
  };
  const rename = () => {
    if (!ren || !usbListen) return;
    const name = ren.name.trim();
    if (!name || name === ren.id) { setRen(null); return; }
    stop();
    const got = usbListen.sessRename(ren.id, name);
    if (!got) { setMsg('Impossible de renommer : ce nom existe déjà, ou le dossier est utilisé.'); setRen(null); return; }
    delete cache[ren.id];
    setRen(null); setMsg('');
    reload();
  };
  const del = () => {
    const ids = list.filter((e) => picked[e.id]).map((e) => e.id);
    if (!ids.length) return;
    Alert.alert(`Supprimer ${ids.length} enregistrement${ids.length > 1 ? 's' : ''} ?`, 'Tous leurs fichiers seront effacés de la tablette.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { stop(); ids.forEach((id) => { usbListen?.sessDelete(id); delete cache[id]; }); setPicked({}); setSorting(false); reload(); } },
    ]);
  };

  const total = list.reduce((a, e) => a + e.files.reduce((x, f) => x + f.size, 0), 0);
  const pickedList = list.filter((e) => picked[e.id]);
  const nowEntry = list.find((e) => e.id === now) ?? null;
  void ready;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={{ flex: 1, color: theme.muted, fontSize: 12 }}>{list.length} enregistrement{list.length > 1 ? 's' : ''} · {gb(total)} · dans Musique › Ma table</Text>
        {list.length > 0 && (
          <Pressable onPress={() => { setSorting(!sorting); setPicked({}); }} accessibilityState={{ selected: sorting }} style={[styles.btn, { borderWidth: 1, borderColor: sorting ? '#DC2626' : theme.line2, backgroundColor: sorting ? '#2A1010' : 'transparent' }]}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{sorting ? 'Terminé' : 'Trier · supprimer'}</Text>
          </Pressable>
        )}
      </View>
      {!!msg && <Text style={{ color: '#FCD34D', fontSize: 13, marginBottom: 6 }}>{msg}</Text>}

      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 150 }}>
        {!list.length && <Text style={{ color: theme.muted, fontSize: 14 }}>Pas encore d’enregistrement.</Text>}
        {list.map((e) => {
          const m = parseMeta(e.meta), d = cache[e.id], live = liveId === e.id, playing = now === e.id, on = !!picked[e.id];
          const size = e.files.reduce((a, f) => a + f.size, 0);
          const dur = d?.seconds || m?.seconds || 0;
          const hasMix = e.files.some((f) => f.name === MAGIC_FILE), mixing = busy === e.id;
          const nTracks = e.files.filter((f) => f.name.endsWith('.wav') && !isExport(f.name)).length;
          return (
            <View key={e.id} style={[styles.row, { borderColor: live ? '#DC2626' : playing ? theme.accent : on ? '#DC2626' : theme.line, backgroundColor: theme.panel }]}>
              {sorting && !live && (
                <Pressable onPress={() => setPicked((p) => ({ ...p, [e.id]: !on }))} accessibilityState={{ checked: on }} accessibilityLabel={`Cocher ${e.id}`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Tick on={on} theme={theme} /></Pressable>
              )}
              <Pressable disabled={live} onPress={() => (playing ? stop() : play(e, null))} accessibilityLabel={playing ? `Arrêter ${e.id}` : `Écouter un aperçu de ${e.id}`} style={[styles.play, { backgroundColor: playing ? theme.accent : theme.line, opacity: live ? 0.4 : 1 }]}>
                <Text style={{ color: playing ? theme.onAccent : theme.text, fontSize: 20, fontWeight: '900' }}>{playing ? '❚❚' : '▶'}</Text>
              </Pressable>
              <View style={{ width: wide ? 250 : undefined, flex: wide ? undefined : 1, minWidth: 0 }}>
                <Pressable disabled={live} onPress={() => setRen({ id: e.id, name: e.id })} accessibilityLabel={`Renommer ${e.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.text, fontSize: 16, fontWeight: '800' }}>{live ? '⏺ ' : ''}{e.id}</Text>
                  {!live && <Text style={{ color: theme.muted, fontSize: 14 }}>✎</Text>}
                </Pressable>
                <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12 }}>{live ? 'en cours…' : `${dur ? fmtTime(dur) + ' · ' : ''}${m ? `${m.markers.length} morceau${m.markers.length > 1 ? 'x' : ''} · ` : ''}${nTracks} piste${nTracks > 1 ? 's' : ''} · ${gb(size)}`}</Text>
                {!live && <Text style={{ color: hasMix ? '#34D399' : theme.muted, fontSize: 11, fontWeight: '700' }}>{mixing ? `Je mixe… ${Math.round(prog * 100)} %` : hasMix ? 'Mix magique prêt' : 'Pas encore mixé'}</Text>}
              </View>
              {wide && (
                <View
                  style={[styles.wave, { borderColor: theme.line, backgroundColor: theme.deep }]}
                  onStartShouldSetResponder={() => !live && !!d}
                  onResponderRelease={(ev: GestureResponderEvent) => { if (!d) return; const w = waveW.current[e.id] || 1; play(e, Math.max(0, Math.min(1, ev.nativeEvent.locationX / w)) * (d.seconds || 1)); }}
                  onLayout={(ev) => { waveW.current[e.id] = ev.nativeEvent.layout.width; }}
                  accessibilityLabel={`Toucher pour écouter ${e.id} à cet endroit`}
                >
                  {d ? <Wave data={d.over} played={playing && d.seconds ? t / d.seconds : 0} color={theme.accent} dim={theme.muted} /> : <Text style={{ color: theme.muted, fontSize: 11, alignSelf: 'center', marginTop: 20 }}>{live ? '' : 'onde en préparation…'}</Text>}
                  {playing && d && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF', left: `${Math.min(100, (t / (d.seconds || 1)) * 100)}%` }} />}
                </View>
              )}
              {!live && !sorting && (
                <Pressable disabled={!!busy} onPress={() => magic(e)} style={[styles.btn, { minHeight: 52, backgroundColor: hasMix ? '#14532D' : theme.accent, opacity: busy && !mixing ? 0.5 : 1 }]}>
                  <Text style={{ color: hasMix ? '#BBF7D0' : theme.onAccent, fontSize: 13, fontWeight: '900' }}>{mixing ? 'Je mixe…' : hasMix ? 'Partager le mix' : '✨ Mix magique'}</Text>
                </Pressable>
              )}
              {!live && !sorting && (
                <Pressable onPress={() => { stop(); onOpen(e.id); }} accessibilityLabel={`Ouvrir ${e.id} dans le studio`} style={[styles.btn, { minHeight: 52, borderWidth: 1, borderColor: theme.line2 }]}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Studio ›</Text>
                </Pressable>
              )}
              {offer?.id === e.id && !mixing && (() => {
                const edge = offer.blanks.filter((bl) => bl.where !== 'milieu'), mid = offer.blanks.filter((bl) => bl.where === 'milieu');
                const secs = (l: Blank[]) => Math.round(l.reduce((a, bl) => a + bl.b - bl.a, 0));
                return (
                  <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 8 }}>
                    <Text style={{ flex: 1, minWidth: 200, color: theme.text, fontSize: 13 }}>J’ai trouvé des blancs. Je les enlève ?</Text>
                    {edge.length > 0 && <Pressable onPress={() => cutBlanks(e, edge)} style={[styles.btn, { borderWidth: 1.5, borderColor: '#34D399', backgroundColor: '#10291F' }]}><Text style={{ color: '#BBF7D0', fontSize: 13, fontWeight: '800' }}>Début et fin · {secs(edge)} s</Text></Pressable>}
                    {mid.length > 0 && <Pressable onPress={() => cutBlanks(e, mid)} style={[styles.btn, { borderWidth: 1.5, borderColor: '#34D399', backgroundColor: '#10291F' }]}><Text style={{ color: '#BBF7D0', fontSize: 13, fontWeight: '800' }}>Entre les morceaux · {mid.length} · {secs(mid)} s</Text></Pressable>}
                    {edge.length > 0 && mid.length > 0 && <Pressable onPress={() => cutBlanks(e, offer.blanks)} style={[styles.btn, { backgroundColor: '#34D399' }]}><Text style={{ color: '#06281A', fontSize: 13, fontWeight: '900' }}>Tous</Text></Pressable>}
                    <Pressable onPress={() => setOffer(null)} style={[styles.btn]}><Text style={{ color: theme.muted, fontSize: 13, fontWeight: '700' }}>Non, garder</Text></Pressable>
                  </View>
                );
              })()}
            </View>
          );
        })}
      </ScrollView>

      {nowEntry && (
        <View style={[styles.bar, { bottom: sorting ? 76 : 8, borderColor: theme.accent, backgroundColor: theme.deep }]}>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.accent, fontSize: 13, fontWeight: '800' }}>Aperçu · {nowEntry.id} · {fmtTime(t)}</Text>
          {cache[nowEntry.id]?.facade && cache[nowEntry.id]?.tracks.length ? (
            <View style={{ flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, backgroundColor: theme.panel }}>
              {([['mix', 'Mix automatique'], ['facade', 'Façade']] as const).map(([id, l]) => (
                <Pressable key={id} onPress={() => { setSrc(id); play(nowEntry, t, id); }} accessibilityState={{ selected: src === id }} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center', backgroundColor: src === id ? theme.accent : 'transparent' }}>
                  <Text style={{ color: src === id ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '800' }}>{l}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {(parseMeta(nowEntry.meta)?.markers.length ?? 0) > 1 && (
            <Pressable onPress={() => { const mk = parseMeta(nowEntry.meta)?.markers ?? []; const nx = mk.find((x) => x.t > t + 1); play(nowEntry, nx ? nx.t : mk[0]?.t ?? 0); }} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Morceau suivant</Text></Pressable>
          )}
          <Pressable onPress={stop} accessibilityLabel="Arrêter l’aperçu" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.accent, fontSize: 18, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      )}

      {ren && (
        <Pressable onPress={() => setRen(null)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', paddingTop: 40 }]}>
          <Pressable onPress={() => {}} style={{ width: 460, maxWidth: '94%', borderWidth: 1, borderColor: theme.line2, borderRadius: 18, padding: 16, gap: 10, backgroundColor: theme.panel }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>Renommer l’enregistrement</Text>
            <TextInput value={ren.name} onChangeText={(name) => setRen({ id: ren.id, name })} autoFocus selectTextOnFocus onSubmitEditing={rename} returnKeyType="done" accessibilityLabel="Nouveau nom" style={{ minHeight: 48, borderWidth: 1, borderColor: theme.line2, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: theme.text, backgroundColor: theme.deep }} />
            <Text style={{ color: theme.muted, fontSize: 12 }}>Le dossier dans Musique › Ma table prend le même nom.</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Pressable onPress={() => setRen(null)} style={[styles.btn]}><Text style={{ color: theme.muted, fontSize: 14, fontWeight: '700' }}>Annuler</Text></Pressable>
              <Pressable onPress={rename} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900' }}>Renommer</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}

      {sorting && (
        <View style={[styles.bar, { bottom: 8, borderColor: '#DC2626', backgroundColor: '#2A1010' }]}>
          <Text style={{ flex: 1, color: '#FCA5A5', fontSize: 14, fontWeight: '800' }}>{pickedList.length ? `${pickedList.length} coché${pickedList.length > 1 ? 's' : ''} · ${gb(pickedList.reduce((a, e) => a + e.files.reduce((x, f) => x + f.size, 0), 0))} à libérer` : 'Coche les enregistrements à supprimer'}</Text>
          <Pressable onPress={() => setPicked(Object.fromEntries(list.filter((e) => e.id !== liveId && (parseMeta(e.meta)?.seconds ?? 9999) < 300 && !e.files.some((f) => f.name === MAGIC_FILE)).map((e) => [e.id, true])))} style={[styles.btn, { borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Cocher les essais de moins de 5 min</Text></Pressable>
          <Pressable onPress={del} style={[styles.btn, { backgroundColor: '#DC2626' }]}><Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Supprimer</Text></Pressable>
        </View>
      )}
    </View>
  );
}
const waveW: { current: Record<string, number> } = { current: {} };
/** À appeler quand un enregistrement a changé (retouches gardées) : son aperçu sera recalculé. */
export const forgetPreview = (id: string) => { delete cache[id]; };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, minWidth: 0, height: 56, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, flexWrap: 'wrap' },
});
