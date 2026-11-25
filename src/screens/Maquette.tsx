// La maquette : on coche des morceaux dans ses enregistrements, l'appli les mixe un par un
// (même son, même volume, sans blanc avant ni après) et en fait des fichiers à faire écouter.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Theme } from '../ui/theme';
import { bestExcerpt, buildMix, emptyMix, fileSafe, loudFactor, songEdits, songsOf, SongSpan } from '../xair/listen';
import { fmtTime, parseMeta } from '../xair/recorder';
import { SessEntry, usbListen } from '../xair/usbAudio';
import { load, Loaded } from './RecList';

interface Row extends SongSpan { key: string; id: string }

export function Maquette({ list, theme, onClose }: { list: SessEntry[]; theme: Theme; onClose: () => void }) {
  const [data, setData] = useState<Record<string, Loaded>>({});
  const [loading, setLoading] = useState('');
  const [order, setOrder] = useState<string[]>([]); // les morceaux cochés, dans l'ordre de la maquette
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [name, setName] = useState(`Maquette ${new Date().toISOString().slice(0, 10)}`);
  const [each, setEach] = useState(true);
  const [full, setFull] = useState(true);
  const [cut, setCut] = useState(0); // 0 = morceaux entiers ; sinon la durée des extraits, en secondes
  const [prog, setProg] = useState<number | null>(null);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<{ path: string; dir: string } | null>(null);

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
  const chosen = (order.map((k) => byKey[k]).filter(Boolean) as Row[]).map((r) => (cut ? { ...r, ...bestExcerpt(data[r.id]?.all, data[r.id]?.bucket ?? 0.2, r, cut) } : r));
  const secs = chosen.reduce((n, r) => n + r.b - r.a, 0);
  const titleOf = (r: Row) => titles[r.key] ?? r.label;
  const toggle = (k: string) => setOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const move = (k: string, d: number) => setOrder((o) => { const i = o.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const make = async () => {
    if (!usbListen || !chosen.length || prog != null) return;
    setMsg(''); setDone(null); setProg(0);
    const dir = usbListen.albumDir(fileSafe(name));
    const songs = [];
    for (let i = 0; i < chosen.length; i++) {
      const r = chosen[i], d = data[r.id];
      setStep(`Je règle « ${titleOf(r)} »… ${i + 1} / ${chosen.length}`);
      const mix0 = { ...emptyMix(), ...(d.meta?.mix ?? {}) };
      const mix = { ...mix0, edits: songEdits(mix0.edits, r, !!cut) };
      const paths = d.tracks.map((x) => x.path);
      // même volume pour tous : chaque morceau est mesuré, puis calé sur le même niveau
      const flat = buildMix(d.tracks, d.peaks, mix, null, d.seconds || 1, false, { an: d.an, loud: 1 }).params;
      const m = await usbListen.mixMeasure({ ...flat, paths, from: r.a, to: r.b }).catch(() => null);
      const params = buildMix(d.tracks, d.peaks, mix, null, d.seconds || 1, false, { an: d.an, loud: loudFactor(m?.ok ? m.rmsDb : null, 'std') }).params;
      songs.push({ ...params, paths, from: r.a, to: r.b, out: each ? `${dir}/${String(i + 1).padStart(2, '0')} ${fileSafe(titleOf(r))}.mp3` : undefined });
    }
    setStep('Je fabrique les fichiers…');
    const res = await usbListen.mixAlbum({ songs, full: full || !each ? `${dir}/${fileSafe(name)}.mp3` : undefined, gap: cut ? 0.6 : 1.5 });
    setProg(null); setStep('');
    if (!res.ok || !res.path) { setMsg(`Maquette impossible : ${res.error ?? ''}`); return; }
    setDone({ path: res.path, dir });
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
                <View key={r.key} style={[styles.row, box(on)]}>
                  <Pressable onPress={() => toggle(r.key)} accessibilityState={{ checked: on }} accessibilityLabel={`${on ? 'Retirer' : 'Ajouter'} ${titleOf(r)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 48 }}>
                    <View style={[styles.num, { borderColor: on ? theme.accent : theme.muted, backgroundColor: on ? theme.accent : 'transparent' }]}>{on && <Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: '900' }}>{n + 1}</Text>}</View>
                    {on
                      ? <TextInput value={titleOf(r)} onChangeText={(v) => setTitles((x) => ({ ...x, [r.key]: v }))} accessibilityLabel="Titre du morceau" selectTextOnFocus style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '800', paddingVertical: 6 }} />
                      : <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' }}>{r.label}</Text>}
                    <Text style={{ color: theme.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{on && cut ? (() => { const x = bestExcerpt(data[r.id]?.all, data[r.id]?.bucket ?? 0.2, r, cut); return `${fmtTime(x.a)} → ${fmtTime(x.b)}`; })() : fmtTime(r.b - r.a)}</Text>
                  </Pressable>
                  {on && order.length > 1 && (
                    <>
                      <Pressable onPress={() => move(r.key, -1)} accessibilityLabel="Plus tôt dans la maquette" style={styles.arrow}><Text style={{ color: theme.text, fontSize: 16 }}>↑</Text></Pressable>
                      <Pressable onPress={() => move(r.key, 1)} accessibilityLabel="Plus tard dans la maquette" style={styles.arrow}><Text style={{ color: theme.text, fontSize: 16 }}>↓</Text></Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '700' }}>Je garde :</Text>
        {([[0, 'les morceaux entiers'], [30, 'un extrait de 30 s'], [45, '45 s'], [60, '1 min']] as const).map(([v, l]) => (
          <Pressable key={v} onPress={() => setCut(v)} accessibilityState={{ selected: cut === v }} style={[styles.btn, box(cut === v)]}><Text style={{ color: cut === v ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{l}</Text></Pressable>
        ))}
        {!!cut && <Text style={{ color: theme.muted, fontSize: 12, flexBasis: '100%' }}>Dans chaque morceau, l’appli choisit toute seule le passage où ça joue le plus (souvent le refrain), avec un fondu au début et à la fin.</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <TextInput value={name} onChangeText={setName} accessibilityLabel="Nom de la maquette" style={{ flexGrow: 1, minWidth: 200, minHeight: 46, color: theme.text, fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: theme.line2, borderRadius: 12, paddingHorizontal: 12 }} />
        <Pressable onPress={() => setEach(!each)} accessibilityState={{ checked: each }} style={[styles.btn, box(each)]}><Text style={{ color: each ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{each ? '✓ ' : ''}Un MP3 par morceau</Text></Pressable>
        <Pressable onPress={() => setFull(!full)} accessibilityState={{ checked: full }} style={[styles.btn, box(full)]}><Text style={{ color: full ? theme.text : theme.muted, fontSize: 13, fontWeight: '800' }}>{full ? '✓ ' : ''}Un seul MP3 avec tout</Text></Pressable>
      </View>
      {!!msg && <Text style={{ color: '#FCA5A5', fontSize: 13 }}>{msg}</Text>}
      {done && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, minWidth: 200, color: '#BBF7D0', fontSize: 13 }}>Maquette prête, dans Musique › Ma table › Maquettes › {fileSafe(name)}.</Text>
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
