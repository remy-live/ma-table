// La maquette : on coche des morceaux dans ses enregistrements, l'appli les mixe un par un
// (même son, même volume, sans blanc avant ni après) et en fait des fichiers à faire écouter.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Theme } from '../ui/theme';
import { bars, bestExcerpt, buildMix, emptyMix, fileSafe, loudFactor, songEdits, songsOf, SongSpan } from '../xair/listen';
import { fmtTime, parseMeta } from '../xair/recorder';
import { SessEntry, usbListen } from '../xair/usbAudio';
import { load, Loaded } from './RecList';

interface Row extends SongSpan { key: string; id: string }

/** La bande sonore d'un morceau, avec la fenêtre de l'extrait : on pose le doigt et on la fait glisser. */
/**
 * La bande sonore d'un morceau, avec la fenêtre de l'extrait.
 * Au milieu : on fait glisser la fenêtre. Sur les bords : deux manettes pour raccourcir ou allonger.
 */
const GRIP = 30; // largeur où l'on attrape une manette (px)
const MIN_LEN = 5;
function Strip({ all, bucket, song, a, b, t, theme, onChange }: { all: Uint8Array | null | undefined; bucket: number; song: SongSpan; a: number; b: number; t: number | null; theme: Theme; onChange: (start: number, len: number, done: boolean) => void }) {
  const w = useRef(1), x0 = useRef(0);
  const grab = useRef<{ mode: 'move' | 'a' | 'b'; off: number; a: number; b: number }>({ mode: 'move', off: 0, a, b });
  const span = Math.max(1, song.b - song.a), len = b - a;
  const data = useMemo(() => bars(all ?? null, bucket, song.a, song.b, 140, () => 1, [[song.a, song.b]]), [all, bucket, song.a, song.b]);
  const xOfT = (x: number) => ((x - song.a) / span) * w.current;
  const tOf = (e: GestureResponderEvent) => song.a + Math.max(0, Math.min(1, (e.nativeEvent.pageX - x0.current) / w.current)) * span;
  const put = (e: GestureResponderEvent, done: boolean) => {
    const g = grab.current, at = tOf(e);
    if (g.mode === 'a') { const na = Math.max(song.a, Math.min(g.b - MIN_LEN, at)); onChange(na, g.b - na, done); }
    else if (g.mode === 'b') { const nb = Math.min(song.b, Math.max(g.a + MIN_LEN, at)); onChange(g.a, nb - g.a, done); }
    else { const L = g.b - g.a; onChange(Math.max(song.a, Math.min(song.b - L, at - g.off)), L, done); }
  };
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - song.a) / span) * 100))}%` as const;
  const grip = (left: boolean) => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 18, marginLeft: left ? -9 : -9, left: pct(left ? a : b), borderRadius: 6, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 2, height: 22, borderRadius: 1, backgroundColor: theme.onAccent, opacity: 0.8 }} />
    </View>
  );
  return (
    <View
      onLayout={(e) => { w.current = Math.max(1, e.nativeEvent.layout.width); }}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        x0.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const x = e.nativeEvent.locationX, xa = xOfT(a), xb = xOfT(b), at = tOf(e);
        // la manette la plus proche, si on est dessus ; sinon on déplace la fenêtre
        const da = Math.abs(x - xa), db = Math.abs(x - xb);
        const mode: 'move' | 'a' | 'b' = Math.min(da, db) <= GRIP ? (da < db ? 'a' : 'b') : 'move';
        grab.current = { mode, off: at >= a && at <= b ? at - a : len / 2, a, b };
        if (mode === 'move') put(e, false);
      }}
      onResponderMove={(e) => put(e, false)} onResponderRelease={(e) => put(e, true)}
      accessibilityLabel="Bande sonore du morceau : glisse la fenêtre pour choisir l’extrait, ou ses bords pour le raccourcir ou l’allonger"
      style={{ height: 64, borderRadius: 10, backgroundColor: theme.meterBg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }}
    >
      {data.map((d, i) => { const tm = song.a + ((i + 0.5) / data.length) * span, inside = tm >= a && tm <= b; return <View key={i} pointerEvents="none" style={{ flex: 1, marginHorizontal: 0.5, height: `${Math.round(d.h * 92)}%`, borderRadius: 1, backgroundColor: inside ? theme.accent : theme.muted, opacity: inside ? 1 : 0.4 }} />; })}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(a), width: `${(len / span) * 100}%`, borderTopWidth: 2, borderBottomWidth: 2, borderColor: theme.accent, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      {grip(true)}{grip(false)}
      {t != null && t >= song.a && t <= song.b && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(t), width: 2, backgroundColor: '#FFFFFF' }} />}
    </View>
  );
}

export function Maquette({ list, theme, onClose }: { list: SessEntry[]; theme: Theme; onClose: () => void }) {
  const [data, setData] = useState<Record<string, Loaded>>({});
  const [loading, setLoading] = useState('');
  const [order, setOrder] = useState<string[]>([]); // les morceaux cochés, dans l'ordre de la maquette
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [name, setName] = useState(`Maquette ${new Date().toISOString().slice(0, 10)}`);
  const [each, setEach] = useState(true);
  const [full, setFull] = useState(true);
  const [cut, setCut] = useState(0); // 0 = morceaux entiers ; sinon la durée des extraits, en secondes
  const [xfade, setXfade] = useState(2); // fondu enchaîné entre les extraits, en secondes (0 = un petit silence)
  const [starts, setStarts] = useState<Record<string, number>>({}); // extraits placés à la main (début, en secondes)
  const [lens, setLens] = useState<Record<string, number>>({});     // durée propre à un morceau
  const [play, setPlay] = useState<{ key: string; t: number } | null>(null);
  const playRef = useRef<{ key: string; end: number } | null>(null);
  const stopPlay = () => { if (playRef.current) usbListen?.playerClose(); playRef.current = null; setPlay(null); };
  useEffect(() => {
    const s = usbListen?.addListener('onPlay', (e) => {
      const p = playRef.current;
      if (!p) return;
      if (e.ended || e.t >= p.end) stopPlay(); else setPlay({ key: p.key, t: e.t });
    });
    return () => { s?.remove(); if (playRef.current) usbListen?.playerClose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [prog, setProg] = useState<number | null>(null);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<{ path: string; dir: string; note: string } | null>(null);

  // on prépare chaque enregistrement (ondes + étude des pistes) : rapide s'il a déjà été ouvert
  useEffect(() => {
    let dead = false;
    (async () => {
      const got: Record<string, Loaded> = {};
      for (let i = 0; i < list.length; i++) {
        if (dead) return;
        setLoading(`Je regarde tes enregistrements… ${i + 1} / ${list.length}`);
        const d = await load(list[i]).catch(() => null);
        if (d && d.tracks.length) got[list[i].id] = d;
      }
      if (!dead) { setData(got); setLoading(''); }
    })();
    return () => { dead = true; };
  }, [list]);
  useEffect(() => { const s = usbListen?.addListener('onMix', (e) => { if (!e.peaks) setProg(e.p); }); return () => s?.remove(); }, []);

  const groups = useMemo(() => list.filter((e) => data[e.id]).map((e) => {
    const d = data[e.id];
    const rows: Row[] = songsOf(parseMeta(e.meta)?.markers ?? [], d.seconds || 1, d.all, d.bucket).map((s, i) => ({ ...s, key: `${e.id}|${i}`, id: e.id }));
    return { e, rows };
  }).filter((x) => x.rows.length), [list, data]);
  const byKey = useMemo(() => Object.fromEntries(groups.flatMap((x) => x.rows.map((r) => [r.key, r]))), [groups]);
  // en extraits : l'appli garde, dans chaque morceau, le passage où ça joue le plus
  // le fondu : seulement entre des extraits (les morceaux entiers gardent un petit silence entre eux)
  const xfadeNow = cut ? xfade : 0;
  const excerpt = (r: Row): SongSpan => {
    if (!cut) return r;
    const len = Math.min(r.b - r.a, lens[r.key] ?? cut);
    if (starts[r.key] == null) return bestExcerpt(data[r.id]?.all, data[r.id]?.bucket ?? 0.2, r, len);
    const a = Math.max(r.a, Math.min(r.b - len, starts[r.key]));
    return { label: r.label, a, b: a + len };
  };
  const chosen = (order.map((k) => byKey[k]).filter(Boolean) as Row[]).map((r) => ({ ...r, ...excerpt(r) }));
  /** Écouter un extrait (avec son mix), ou l'arrêter. */
  const listen = (r: Row, from?: number) => {
    if (!usbListen) return;
    if (playRef.current?.key === r.key && from == null) { stopPlay(); return; }
    const d = data[r.id], x = excerpt(r);
    const mix = { ...emptyMix(), ...(d.meta?.mix ?? {}) };
    const opened = usbListen.playerOpen(d.tracks.map((t) => t.path));
    if (!opened?.ok) { setMsg(`Écoute impossible : ${opened?.error ?? ''}`); return; }
    usbListen.playerSet(buildMix(d.tracks, d.peaks, mix, null, d.seconds || 1, false, { an: d.an }).params);
    const a = from ?? x.a;
    usbListen.playerSeek(a);
    usbListen.playerPlay(true);
    playRef.current = { key: r.key, end: a + (x.b - x.a) };
    setPlay({ key: r.key, t: a });
  };
  const secs = chosen.reduce((n, r) => n + r.b - r.a, 0);
  const titleOf = (r: Row) => titles[r.key] ?? r.label;
  const toggle = (k: string) => setOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const move = (k: string, d: number) => setOrder((o) => { const i = o.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const make = async () => {
    if (!usbListen || !chosen.length || prog != null) return;
    stopPlay();
    setMsg(''); setDone(null); setProg(0);
    const dir = usbListen.albumDir(fileSafe(name));
    const fadeLen = full || !each ? xfadeNow : 0;
    const songs = [];
    for (let i = 0; i < chosen.length; i++) {
      const r = chosen[i], d = data[r.id];
      setStep(`Je règle « ${titleOf(r)} »… ${i + 1} / ${chosen.length}`);
      const mix0 = { ...emptyMix(), ...(d.meta?.mix ?? {}) };
      const mix = { ...mix0, edits: songEdits(mix0.edits, r, !!cut, fadeLen) };
      const paths = d.tracks.map((x) => x.path);
      // même volume pour tous : chaque morceau est mesuré, puis calé sur le même niveau
      const flat = buildMix(d.tracks, d.peaks, mix, null, d.seconds || 1, false, { an: d.an, loud: 1 }).params;
      const m = await usbListen.mixMeasure({ ...flat, paths, from: r.a, to: r.b }).catch(() => null);
      const params = buildMix(d.tracks, d.peaks, mix, null, d.seconds || 1, false, { an: d.an, loud: loudFactor(m?.ok ? m.rmsDb : null, 'std') }).params;
      songs.push({ ...params, paths, from: r.a, to: r.b, out: each ? `${dir}/${String(i + 1).padStart(2, '0')} ${fileSafe(titleOf(r))}.mp3` : undefined });
    }
    setStep('Je fabrique les fichiers…');
    const res = await usbListen.mixAlbum({ songs, full: full || !each ? `${dir}/${fileSafe(name)}.mp3` : undefined, gap: cut ? 0.6 : 1.5, xfade: full || !each ? xfadeNow : 0 });
    setProg(null); setStep('');
    if (!res.ok || !res.path) { setMsg(`Maquette impossible : ${res.error ?? ''}`); return; }
    setDone({ path: res.path, dir, note: res.note ?? '' });
  };

  const box = (on: boolean) => ({ borderWidth: 1.5, borderColor: on ? theme.accent : theme.line2, backgroundColor: on ? theme.deep : 'transparent' });
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.panel, padding: 14, gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: theme.text, fontSize: 19, fontWeight: '900' }}>🎬 Maquette</Text>
        <Pressable onPress={() => { if (prog != null) usbListen?.mixCancel(); onClose(); }} style={[styles.btn, { borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Fermer</Text></Pressable>
      </View>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>Coche les morceaux à faire écouter, dans l’ordre voulu. Chacun est mixé tout seul, au même volume que les autres, sans blanc avant ni après.</Text>
      {!!loading && <Text style={{ color: '#FCD34D', fontSize: 13 }}>{loading}</Text>}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
        {!loading && !groups.length && <Text style={{ color: theme.muted, fontSize: 14 }}>Aucun enregistrement en pistes séparées pour l’instant.</Text>}
        {groups.map(({ e, rows }) => (
          <View key={e.id} style={{ gap: 6 }}>
            <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 6 }}>{e.id.toUpperCase()}</Text>
            {rows.map((r) => {
              const n = order.indexOf(r.key), on = n >= 0;
              return (
                <View key={r.key} style={[{ borderRadius: 12, paddingHorizontal: 10 }, box(on)]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Pressable onPress={() => toggle(r.key)} accessibilityState={{ checked: on }} accessibilityLabel={`${on ? 'Retirer' : 'Ajouter'} ${titleOf(r)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 48 }}>
                    <View style={[styles.num, { borderColor: on ? theme.accent : theme.muted, backgroundColor: on ? theme.accent : 'transparent' }]}>{on && <Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900' }}>{n + 1}</Text>}</View>
                    {on
                      ? <TextInput value={titleOf(r)} onChangeText={(v) => setTitles((x) => ({ ...x, [r.key]: v }))} accessibilityLabel="Titre du morceau" selectTextOnFocus style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '800', paddingVertical: 6 }} />
                      : <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' }}>{r.label}</Text>}
                    <Text style={{ color: theme.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{fmtTime(r.b - r.a)}</Text>
                  </Pressable>
                  {on && order.length > 1 && (
                    <>
                      <Pressable onPress={() => move(r.key, -1)} accessibilityLabel="Plus tôt dans la maquette" style={styles.arrow}><Text style={{ color: theme.text, fontSize: 16 }}>↑</Text></Pressable>
                      <Pressable onPress={() => move(r.key, 1)} accessibilityLabel="Plus tard dans la maquette" style={styles.arrow}><Text style={{ color: theme.text, fontSize: 16 }}>↓</Text></Pressable>
                    </>
                  )}
                </View>
                {on && !!cut && r.b - r.a > 12 && (() => {
                  const x = excerpt(r), len = x.b - x.a, mine = starts[r.key] != null || lens[r.key] != null;
                  const setLen = (v: number) => setLens((o) => ({ ...o, [r.key]: Math.max(5, Math.min(Math.floor(r.b - r.a), v)) }));
                  return (
                    <View style={{ gap: 6, paddingBottom: 10 }}>
                      <Strip all={data[r.id]?.all} bucket={data[r.id]?.bucket ?? 0.2} song={r} a={x.a} b={x.b} t={play?.key === r.key ? play.t : null} theme={theme}
                        onChange={(st, ln, done) => { setStarts((o) => ({ ...o, [r.key]: st })); setLens((o) => ({ ...o, [r.key]: Math.round(ln) })); if (done && playRef.current?.key === r.key) listen(r, st); }} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Pressable onPress={() => listen(r)} accessibilityLabel={play?.key === r.key ? 'Arrêter' : 'Écouter cet extrait'} style={[styles.btn, { minHeight: 44, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 13, fontWeight: '900' }}>{play?.key === r.key ? '■ Arrêter' : '▶ Écouter'}</Text></Pressable>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtTime(x.a)} → {fmtTime(x.b)}</Text>
                        <View style={{ flex: 1 }} />
                        <Pressable onPress={() => setLen(len - 5)} accessibilityLabel="Extrait plus court de 5 secondes" style={[styles.arrow, { borderWidth: 1, borderColor: theme.line2, borderRadius: 10 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>−</Text></Pressable>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', minWidth: 46, textAlign: 'center' }}>{Math.round(len)} s</Text>
                        <Pressable onPress={() => setLen(len + 5)} accessibilityLabel="Extrait plus long de 5 secondes" style={[styles.arrow, { borderWidth: 1, borderColor: theme.line2, borderRadius: 10 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>+</Text></Pressable>
                        {mine && <Pressable onPress={() => { setStarts((o) => { const n = { ...o }; delete n[r.key]; return n; }); setLens((o) => { const n = { ...o }; delete n[r.key]; return n; }); }} style={[styles.btn, { minHeight: 44, borderWidth: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800' }}>↺ Choix automatique</Text></Pressable>}
                      </View>
                    </View>
                  );
                })()}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '700' }}>Je garde :</Text>
        <Pressable onPress={() => { stopPlay(); setCut(0); }} accessibilityState={{ selected: !cut }} style={[styles.btn, box(!cut)]}><Text style={{ color: !cut ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>les morceaux entiers</Text></Pressable>
        <Pressable onPress={() => setCut(cut || 30)} accessibilityState={{ selected: !!cut }} style={[styles.btn, box(!!cut)]}><Text style={{ color: cut ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>des extraits</Text></Pressable>
        {!!cut && (
          <>
            <Pressable onPress={() => setCut(Math.max(10, cut - 5))} accessibilityLabel="Extraits plus courts de 5 secondes" style={[styles.arrow, { borderWidth: 1, borderColor: theme.line2, borderRadius: 10 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>−</Text></Pressable>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', minWidth: 64, textAlign: 'center' }}>{cut >= 60 ? `${Math.floor(cut / 60)} min${cut % 60 ? ` ${cut % 60}` : ''}` : `${cut} s`}</Text>
            <Pressable onPress={() => setCut(Math.min(300, cut + 5))} accessibilityLabel="Extraits plus longs de 5 secondes" style={[styles.arrow, { borderWidth: 1, borderColor: theme.line2, borderRadius: 10 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>+</Text></Pressable>
            {[20, 30, 45, 60, 90].map((v) => <Pressable key={v} onPress={() => setCut(v)} style={[styles.btn, { minHeight: 44, paddingHorizontal: 10 }, box(cut === v)]}><Text style={{ color: cut === v ? theme.text : theme.muted, fontSize: 12, fontWeight: '800' }}>{v >= 60 ? `${v / 60 === 1 ? '1 min' : '1 min 30'}` : `${v} s`}</Text></Pressable>)}
          </>
        )}
        {!!cut && (
          <View style={{ flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '700' }}>Entre les extraits :</Text>
            {([[0, 'un petit silence'], [1, 'fondu 1 s'], [2, 'fondu 2 s'], [3, 'fondu 3 s'], [5, 'fondu 5 s']] as const).map(([v, l]) => (
              <Pressable key={v} onPress={() => setXfade(v)} accessibilityState={{ selected: xfade === v }} style={[styles.btn, { minHeight: 44, paddingHorizontal: 12 }, box(xfade === v)]}><Text style={{ color: xfade === v ? theme.text : theme.muted, fontSize: 12, fontWeight: '800' }}>{l}</Text></Pressable>
            ))}
            {!full && each && <Text style={{ color: theme.muted, fontSize: 11 }}>(le fondu ne sert que dans « Un seul MP3 avec tout »)</Text>}
          </View>
        )}
        {!!cut && <Text style={{ color: theme.muted, fontSize: 12, flexBasis: '100%' }}>L’appli propose le passage où ça joue le plus. Sous chaque morceau coché : glisse la fenêtre sur la bande sonore pour choisir toi-même, tire ses deux manettes pour raccourcir ou allonger, et écoute.</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <TextInput value={name} onChangeText={setName} accessibilityLabel="Nom de la maquette" style={{ flexGrow: 1, minWidth: 200, minHeight: 46, color: theme.text, fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: theme.line2, borderRadius: 12, paddingHorizontal: 12 }} />
        <Pressable onPress={() => setEach(!each)} accessibilityState={{ checked: each }} style={[styles.btn, box(each)]}><Text style={{ color: each ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{each ? '✓ ' : ''}Un MP3 par morceau</Text></Pressable>
        <Pressable onPress={() => setFull(!full)} accessibilityState={{ checked: full }} style={[styles.btn, box(full)]}><Text style={{ color: full ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{full ? '✓ ' : ''}Un seul MP3 avec tout</Text></Pressable>
      </View>
      {!!msg && <Text style={{ color: '#FCA5A5', fontSize: 13 }}>{msg}</Text>}
      {done && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, minWidth: 200, color: '#BBF7D0', fontSize: 13 }}>Maquette prête, dans Musique › Ma table › Maquettes › {fileSafe(name)}.{done.note ? ` ${done.note}` : ''}</Text>
          <Pressable onPress={() => usbListen?.share(done.path)} style={[styles.btn, { backgroundColor: '#34D399' }]}><Text style={{ color: '#06281A', fontSize: 14, fontWeight: '900' }}>Partager</Text></Pressable>
        </View>
      )}
      {prog != null ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{step} {step.startsWith('Je fabrique') ? `${Math.round(prog * 100)} %` : ''}</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.deep, overflow: 'hidden' }}><View style={{ width: `${Math.round(prog * 100)}%`, height: 8, backgroundColor: theme.accent }} /></View>
        </View>
      ) : (
        <Pressable onPress={make} disabled={!chosen.length || (!each && !full)} style={[styles.btn, { minHeight: 56, backgroundColor: theme.accent, opacity: chosen.length ? 1 : 0.4 }]}>
          <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '900' }}>{chosen.length ? `Créer la maquette · ${chosen.length} morceau${chosen.length > 1 ? 'x' : ''} · ${fmtTime(secs)}` : 'Coche au moins un morceau'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 46, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 10 },
  num: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
