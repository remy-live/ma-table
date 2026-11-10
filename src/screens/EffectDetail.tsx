// Un effet = un écran. Visualisation, 3 gros boutons, comparaison A/B/C,
// Mes effets, retour, qui l'utilise, recettes. Bandeau « partagé » au
// premier réglage, avec « Donner son propre effet ».
import { DragBar } from '../ui/DragBar';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { f, i } from '../osc/osc';
import { FxVisual } from '../ui/FxVisual';
import { HSlider } from '../ui/HSlider';
import { Knob } from '../ui/Knob';
import { Theme } from '../ui/theme';
import { CH_COUNT } from '../xair/addresses';
import { applyRecipe, FX_FAMILIES, FX_TYPES, fToMs, fxParPath, fxReturnOnPath, fxReturnPath, fxType, fxTypePath, knobsFor, msToF, RECIPES, setKnob, tapTempo } from '../xair/effects';
import { applyFx, chName, FxNames, fxLabel, FxPreset, loadMyFx, saveMyFx, sendPath, shareText, SLOT_COLORS, snapFx, splitOff, users } from '../xair/fxSlots';
import { dbToFader, faderToDb, formatDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { useAnyTick } from '../ui/useTick';
import { FxSaveSheet, SaveMode } from './FxSaveSheet';

interface Props {
  client: XAirClient;
  theme: Theme;
  slot: number | null;
  names: FxNames;
  onNames: (n: FxNames) => void;
  onClose: () => void;
  onOpen: (k: number) => void;
}

const SNAP_L = ['A', 'B', 'C'];

export function EffectDetail({ client, theme, slot, names, onNames, onClose, onOpen }: Props) {
  const tick = useAnyTick(client);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [snaps, setSnaps] = useState<Record<number, (FxPreset | null)[]>>({});
  const [cur, setCur] = useState<number | null>(null);
  const [mine, setMine] = useState<FxPreset[]>([]);
  const [catalog, setCatalog] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [warned, setWarned] = useState<Record<number, boolean>>({});
  const [banner, setBanner] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null);
  const taps = useRef<number[]>([]);
  void tick;
  useEffect(() => { loadMyFx().then(setMine); }, []);
  useEffect(() => { setBanner(false); setAdding(false); setCur(null); setMsg(''); }, [slot]);
  if (slot === null) return null;
  const k = slot;
  const color = SLOT_COLORS[k - 1];
  const t = fxType(Number(client.get(fxTypePath(k)) ?? 0));
  const knobs = knobsFor(t.kind);
  const val = (n: number) => Number(client.get(fxParPath(k, knobs[n].pars[0])) ?? 0.5);
  const u = users(client, k);
  const ret = Number(client.get(fxReturnPath(k)) ?? 0.75);
  const retOn = Number(client.get(fxReturnOnPath(k)) ?? 1) === 1;
  const label = fxLabel(client, names, k);
  const ss = snaps[k] ?? [null, null, null];

  const touched = () => {
    if (u.length > 1 && !warned[k]) { setWarned({ ...warned, [k]: true }); setBanner(true); }
  };
  const turn = (n: number, v: number) => { touched(); setKnob(client, k, knobs[n], v); };
  const giveOwn = (ch: number) => {
    const r = splitOff(client, k, ch, names);
    if (!r) { setMsg('Les 4 effets sont déjà utilisés : libère-en un d’abord.'); return; }
    onNames(r.names); setBanner(false); onOpen(r.slot);
  };
  const snapTap = (n: number) => {
    const s = ss[n];
    if (!s) { const a = [...ss]; a[n] = snapFx(client, k, SNAP_L[n]); setSnaps({ ...snaps, [k]: a }); setCur(n); return; }
    applyFx(client, k, s); setCur(n);
  };
  const snapLong = (n: number) => { const a = [...ss]; a[n] = snapFx(client, k, SNAP_L[n]); setSnaps({ ...snaps, [k]: a }); setCur(n); };
  const keep = () => {
    const p = snapFx(client, k, label);
    const list = [p, ...mine.filter((m) => m.name !== label)];
    setMine(list); saveMyFx(list); setMsg(`« ${label} » gardé dans Mes effets.`);
  };
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current, now].slice(-6);
    const r = tapTempo(taps.current);
    if (r) { touched(); client.set(fxParPath(k, 2), f(msToF(r.ms))); setMsg(`${r.bpm} BPM · ${r.ms} ms`); }
  };
  const bump = (c: number, d: number) => {
    const v = Number(client.get(sendPath(c, k)) ?? 0);
    const db = faderToDb(v);
    const n = (isFinite(db) && v > 0 ? db : -30) + d;
    client.set(sendPath(c, k), f(n < -40 ? 0 : dbToFader(Math.min(0, n))));
  };
  const knobSize = wide ? 132 : Math.min(104, Math.floor((width - 60) / 3));
  const shown = (n: number) => {
    const v = val(n);
    if (t.kind === 'delay' && n === 0) return `${fToMs(v)} ms`;
    return `${Math.round(v * 100)} %`;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingBottom: bottomPad() }}>
        <View style={styles.top}>
          <Pressable onPress={onClose} style={[styles.btn, { borderColor: theme.line2 }]} accessibilityLabel="Retour"><Text style={{ color: theme.text, fontWeight: '800' }}>‹ Effets</Text></Pressable>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
          {renaming !== null ? (
            <TextInput autoFocus value={renaming} onChangeText={setRenaming} maxLength={24} onBlur={() => { onNames({ ...names, [k]: renaming.trim() }); setRenaming(null); }} onSubmitEditing={() => { onNames({ ...names, [k]: renaming.trim() }); setRenaming(null); }} style={[styles.nameIn, { color: theme.text, borderColor: color }]} />
          ) : (
            <Pressable onPress={() => setRenaming(label)} onLongPress={() => setRenaming(label)} style={{ flexShrink: 1 }} accessibilityLabel="Renommer l’effet">
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{label} <Text style={{ color: theme.muted, fontSize: 14 }}>✎</Text></Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>FX{k} · {t.fr}</Text>
            </Pressable>
          )}
          <View style={[styles.badge, { borderColor: u.length > 1 ? '#F59E0B' : theme.line2 }]}>
            <Text style={{ color: u.length > 1 ? '#FCD34D' : theme.muted, fontSize: 11, fontWeight: '800' }}>{u.length > 1 ? `partagé · ${u.length} voies` : u.length ? 'rien qu’à une voie' : 'libre'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setSaveMode({ kind: 'one', slot: k, label })} style={[styles.btn, { borderColor: color, backgroundColor: color }]} accessibilityLabel="Enregistrer ou charger cet effet"><Text style={{ color: '#0B0B0F', fontWeight: '900' }}>💾 Enregistrer · Charger</Text></Pressable>
          <Pressable onPress={() => setCatalog(true)} style={[styles.btn, { borderColor: color }]}><Text style={{ color, fontWeight: '800' }}>Changer d’effet</Text></Pressable>
          <Pressable onPress={() => client.set(fxReturnOnPath(k), i(retOn ? 0 : 1))} style={[styles.btn, { borderColor: theme.line2, backgroundColor: retOn ? 'transparent' : theme.mute }]}>
            <Text style={{ color: retOn ? theme.text : theme.onMute, fontWeight: '800' }}>{retOn ? 'Couper' : 'Coupé'}</Text>
          </Pressable>
        </View>

        {banner && (
          <View style={[styles.banner, { borderColor: '#F59E0B' }]}>
            <Text style={{ color: '#FCD34D', fontWeight: '800', flex: 1, minWidth: 220 }}>Attention : ce réglage change aussi {u.slice(1).map((c) => chName(client, c)).join(', ') || 'les autres voies'}.</Text>
            {u.map((c) => (
              <Pressable key={c} onPress={() => giveOwn(c)} style={[styles.btn, { borderColor: '#F59E0B' }]}><Text style={{ color: '#FCD34D', fontWeight: '800', fontSize: 12 }}>Donner son propre effet à {chName(client, c)}</Text></Pressable>
            ))}
            <Pressable onPress={() => setBanner(false)} style={[styles.btn, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>OK, pour tous</Text></Pressable>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
            {/* colonne principale : visuel + boutons + A/B/C */}
            <View style={[styles.panel, { flex: wide ? 1.6 : undefined, backgroundColor: theme.panel, borderColor: color }]}>
              <FxVisual kind={t.kind} color={color} a={val(0)} b={val(1)} c={val(2)} width={wide ? Math.floor((width - 96) * 0.58) : width - 56} height={wide ? 150 : 110} bg={theme.meterBg} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
                {knobs.map((kn, n) => (
                  <View key={kn.label} style={{ alignItems: 'center', gap: 4 }}>
                    <Knob value={val(n)} size={knobSize} theme={theme} color={color} onChange={(v) => turn(n, v)} />
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{kn.label}</Text>
                    <Text style={{ color, fontWeight: '800', fontSize: 13 }}>{shown(n)}</Text>
                    {!!kn.left && <Text style={{ color: theme.muted, fontSize: 10 }}>{kn.left} ↔ {kn.right}</Text>}
                  </View>
                ))}
              </View>
              {t.kind === 'delay' && (
                <Pressable onPress={tap} style={[styles.tap, { borderColor: color }]} accessibilityLabel="Tap tempo"><Text style={{ color, fontWeight: '900', fontSize: 18 }}>TAP · tape au tempo</Text></Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={[styles.kicker, { color: theme.muted }]}>COMPARER</Text>
                {SNAP_L.map((l, n) => (
                  <Pressable key={l} onPress={() => snapTap(n)} onLongPress={() => snapLong(n)} accessibilityLabel={`Photo ${l}`} style={[styles.snap, { borderColor: ss[n] ? color : theme.line2, backgroundColor: cur === n ? color : ss[n] ? theme.deep : 'transparent', borderStyle: ss[n] ? 'solid' : 'dashed' }]}>
                    <Text style={{ color: cur === n ? '#0B0B0F' : theme.text, fontWeight: '900', fontSize: 18 }}>{l}</Text>
                    <Text style={{ color: cur === n ? '#0B0B0F' : theme.muted, fontSize: 9 }}>{ss[n] ? 'rappeler' : 'photo'}</Text>
                  </Pressable>
                ))}
                <Text style={{ color: theme.muted, fontSize: 11, flex: 1, minWidth: 140 }}>Vide = prend une photo · plein = rappelle · appui long = remplace</Text>
                <Pressable onPress={keep} style={[styles.btn, { borderColor: color, backgroundColor: color }]}><Text style={{ color: '#0B0B0F', fontWeight: '900' }}>★ Garder dans Mes effets</Text></Pressable>
              </View>
              {!!msg && <Text style={{ color: theme.text, fontSize: 12 }}>{msg}</Text>}
            </View>

            {/* colonne droite : retour + qui l'utilise */}
            <View style={{ flex: wide ? 1 : undefined, gap: 12 }}>
              <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.line }]}>
                <HSlider value={ret} onChange={(v) => client.set(fxReturnPath(k), f(v))} label="Retour" valueText={formatDb(ret)} color={color} theme={theme} />
              </View>
              <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.line }]}>
                <Text style={[styles.kicker, { color: theme.muted }]}>QUI L’UTILISE · {shareText(client, k)}</Text>
                {u.map((c) => {
                  const v = Number(client.get(sendPath(c, k)) ?? 0);
                  const d = faderToDb(v);
                  return (
                    <View key={c} style={styles.user}>
                      <Text numberOfLines={1} style={{ width: 90, color: theme.text, fontWeight: '800' }}>{chName(client, c)}</Text>
                      <Pressable onPress={() => bump(c, -2)} style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>−</Text></Pressable>
                      <DragBar frac={v > 0 && isFinite(d) ? Math.max(0.04, (d + 40) / 40) : 0} onFrac={(x) => client.set(sendPath(c, k), f(x < 0.03 ? 0 : dbToFader(x * 40 - 40)))} color={color} bg={theme.meterBg} label={`Effet pour ${chName(client, c)}`} valueText={isFinite(d) ? `${Math.round(d)} dB` : 'rien'} />
                      <Pressable onPress={() => bump(c, 2)} style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>+</Text></Pressable>
                      <Text style={{ width: 52, textAlign: 'right', color: theme.muted, fontSize: 11 }}>{isFinite(d) ? `${Math.round(d)} dB` : '—'}</Text>
                      <Pressable onPress={() => client.set(sendPath(c, k), f(0))} style={[styles.pm, { borderColor: '#7F1D1D' }]} accessibilityLabel={`Retirer ${chName(client, c)}`}><Text style={{ color: '#FCA5A5', fontWeight: '800' }}>✕</Text></Pressable>
                    </View>
                  );
                })}
                <Pressable onPress={() => setAdding(!adding)} style={[styles.add, { borderColor: color }]}><Text style={{ color, fontWeight: '800' }}>+ Ajouter une voie</Text></Pressable>
                {adding && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from({ length: CH_COUNT }, (_, n) => n + 1).filter((c) => !u.includes(c)).map((c) => (
                      <Pressable key={c} onPress={() => { client.set(sendPath(c, k), f(dbToFader(-14))); setAdding(false); }} style={[styles.cand, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{chName(client, c)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* recettes + mes effets */}
          <Text style={[styles.kicker, { color: theme.muted }]}>RECETTES · un appui remplace l’effet</Text>
          <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
            {mine.map((m, n) => {
              const mt = fxType(m.type);
              return (
                <Pressable key={'m' + n} onPress={() => { applyFx(client, k, m); onNames({ ...names, [k]: m.name }); setMsg(`« ${m.name} » chargé.`); }} onLongPress={() => { const l = mine.filter((_, x) => x !== n); setMine(l); saveMyFx(l); }} style={[styles.recipe, { borderColor: color, backgroundColor: theme.panel }]}>
                  <FxVisual kind={mt.kind} color={color} a={m.pars[0] ?? 0.5} b={m.pars[1] ?? 0.5} c={m.pars[2] ?? 0.5} width={150} height={40} bg={theme.meterBg} />
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800' }}>★ {m.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>Mes effets · {mt.fr}</Text>
                </Pressable>
              );
            })}
            {RECIPES.map((r) => {
              const rt = fxType(r.type);
              return (
                <Pressable key={r.id} onPress={() => { applyRecipe(client, k, r, false); onNames({ ...names, [k]: r.name }); setMsg(`Recette « ${r.name} » chargée.`); }} style={[styles.recipe, { borderColor: theme.line2, backgroundColor: theme.panel }]}>
                  <FxVisual kind={rt.kind} color={color} a={r.pars[2] ?? r.pars[1] ?? 0.5} b={r.pars[3] ?? 0.5} c={r.pars[8] ?? r.pars[6] ?? 0.5} width={150} height={40} bg={theme.meterBg} />
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800' }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10 }}>{r.desc}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </ScrollView>

        <FxSaveSheet client={client} theme={theme} mode={saveMode} names={names} onNames={(n) => { onNames(n); setMine([]); loadMyFx().then(setMine); }} onClose={() => { setSaveMode(null); loadMyFx().then(setMine); }} />
        <Modal visible={catalog} transparent animationType="fade" onRequestClose={() => setCatalog(false)}>
          <Pressable style={styles.scrim} onPress={() => setCatalog(false)}>
            <Pressable style={[styles.cat, { backgroundColor: theme.panel, borderColor: color }]} onPress={() => {}}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Choisir l’effet de FX{k}</Text>
              <ScrollView contentContainerStyle={{ gap: 10 }}>
                {FX_FAMILIES.map((fam) => (
                  <View key={fam} style={{ gap: 6 }}>
                    <Text style={[styles.kicker, { color: theme.muted }]}>{fam.toUpperCase()}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {FX_TYPES.filter((x) => x.family === fam).map((x) => (
                        <Pressable key={x.n} onPress={() => { touched(); client.set(fxTypePath(k), i(x.n)); if (!names[k]) onNames({ ...names }); setCatalog(false); }} style={[styles.typ, { borderColor: x.n === t.n ? color : theme.line2, backgroundColor: x.n === t.n ? theme.deep : 'transparent' }]}>
                          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{x.fr}</Text>
                          <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 10 }}>{x.hint}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 40, paddingHorizontal: 14, paddingBottom: 8, flexWrap: 'wrap' },
  btn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nameIn: { minWidth: 200, height: 44, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, fontSize: 20, fontWeight: '800' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  banner: { marginHorizontal: 14, padding: 10, borderWidth: 2, borderRadius: 14, backgroundColor: 'rgba(245,158,11,0.12)', flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  panel: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 12 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tap: { height: 56, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  snap: { width: 60, height: 56, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  user: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  pm: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  add: { height: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cand: { height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  recipe: { width: 176, borderWidth: 1, borderRadius: 16, padding: 10, gap: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  cat: { width: '100%', maxWidth: 760, maxHeight: '90%', borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  typ: { width: 170, borderWidth: 1, borderRadius: 12, padding: 8, gap: 2 },
});
