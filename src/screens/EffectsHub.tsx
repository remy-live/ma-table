// Section Effets : les 4 effets de la table, nommés et colorés.
//  - Par effet : 4 cartes, avec qui l'utilise
//  - Par voie : chaque voie et ses 4 doses
//  - Tableau : voies × effets en bulles
// Toucher un effet ouvre son écran unique (EffectDetail).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { f } from '../osc/osc';
import { FxVisual } from '../ui/FxVisual';
import { Theme } from '../ui/theme';
import { CH_COUNT, FX_COUNT } from '../xair/addresses';
import { fxParPath, fxType, fxTypePath, knobsFor } from '../xair/effects';
import { chName, FxNames, fxLabel, fxPaths, loadFxNames, saveFxNames, sendPath, shareText, SLOT_COLORS, users } from '../xair/fxSlots';
import { dbToFader, faderToDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { EffectDetail } from './EffectDetail';
import { FxSaveSheet, SaveMode } from './FxSaveSheet';
import { useAnyTick } from '../ui/useTick';

type V = 'fx' | 'ch' | 'grid';
const SLOTS = Array.from({ length: FX_COUNT }, (_, k) => k + 1);
const dbText = (v: number) => { const d = faderToDb(v); return !isFinite(d) || v <= 0 ? '—' : (d > 0 ? '+' : '') + Math.round(d) + ' dB'; };
const pct = (v: number) => { const d = faderToDb(v); return !isFinite(d) || v <= 0 ? 0 : Math.max(4, Math.round(((d + 40) / 40) * 100)); };

export function EffectsHub({ client, theme }: { client: XAirClient; theme: Theme }) {
  const tick = useAnyTick(client);
  const [view, setView] = useState<V>('fx');
  const [names, setNames] = useState<FxNames>({});
  const [open, setOpen] = useState<number | null>(null);
  const [selCh, setSelCh] = useState(1);
  const [adding, setAdding] = useState<number | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { client.loadPaths(fxPaths()); loadFxNames().then(setNames); }, [client]);
  const setNamesSave = (n: FxNames) => { setNames(n); saveFxNames(n); };

  const named = useMemo(() => Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(`/ch/${String(c).padStart(2, '0')}/config/name`) ?? '') || users(client, 1).includes(c) || users(client, 2).includes(c) || users(client, 3).includes(c) || users(client, 4).includes(c)), [client, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const bump = (c: number, k: number, d: number) => {
    const v = Number(client.get(sendPath(c, k)) ?? 0);
    const db = faderToDb(v);
    const n = (isFinite(db) && v > 0 ? db : -30) + d;
    client.set(sendPath(c, k), f(n < -40 ? 0 : dbToFader(Math.min(0, n))));
  };
  const vis = (k: number, w: number, h: number) => {
    const t = fxType(Number(client.get(fxTypePath(k)) ?? 0));
    const kn = knobsFor(t.kind);
    const g = (n: number) => Number(client.get(fxParPath(k, kn[n].pars[0])) ?? 0.5);
    return <FxVisual kind={t.kind} color={SLOT_COLORS[k - 1]} a={g(0)} b={g(1)} c={g(2)} width={w} height={h} bg={theme.meterBg} />;
  };
  const cardW = Math.max(200, Math.floor((width - (width >= 900 ? 96 : 0) - 28 - 3 * 12) / 4));

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Effets</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>4 effets pour toute la table · chaque voie choisit combien elle envoie dans chacun</Text>
        </View>
        <Pressable onPress={() => setSaveMode({ kind: 'all' })} style={[styles.saveAll, { backgroundColor: theme.accent }]} accessibilityLabel="Enregistrer ou charger les 4 effets">
          <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 13 }}>💾 Enregistrer · Charger les 4</Text>
        </Pressable>
        <View style={[styles.seg, { borderColor: theme.line2 }]}>
          {([['fx', 'Par effet'], ['ch', 'Par voie'], ['grid', 'Tableau']] as [V, string][]).map(([id, l]) => (
            <Pressable key={id} onPress={() => setView(id)} accessibilityState={{ selected: view === id }} style={[styles.segBtn, view === id && { backgroundColor: theme.accent }]}>
              <Text style={{ color: view === id ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === 'fx' && (
        <ScrollView horizontal={width < 900} contentContainerStyle={{ flexDirection: 'row', gap: 12, padding: 14, paddingTop: 4 }}>
          {SLOTS.map((k) => {
            const c = SLOT_COLORS[k - 1];
            const u = users(client, k);
            return (
              <View key={k} style={[styles.card, { width: cardW, backgroundColor: theme.panel, borderColor: u.length ? c : theme.line, opacity: u.length ? 1 : 0.75 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c }} />
                  <Text style={{ color: c, fontSize: 11, fontWeight: '800' }}>FX{k}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{u.length ? `${u.length} voie${u.length > 1 ? 's' : ''}` : 'libre'}</Text>
                </View>
                <Pressable onPress={() => setOpen(k)} accessibilityLabel={`Régler ${fxLabel(client, names, k)}`}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{fxLabel(client, names, k)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{fxType(Number(client.get(fxTypePath(k)) ?? 0)).fr} · toucher pour régler ›</Text>
                </Pressable>
                <Pressable onPress={() => setOpen(k)}>{vis(k, cardW - 26, 60)}</Pressable>
                <Text style={[styles.kicker, { color: theme.muted }]}>QUI L’UTILISE</Text>
                <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 4 }}>
                  {u.map((ch) => {
                    const v = Number(client.get(sendPath(ch, k)) ?? 0);
                    return (
                      <View key={ch} style={styles.user}>
                        <Text numberOfLines={1} style={{ width: 70, color: theme.text, fontSize: 12, fontWeight: '700' }}>{chName(client, ch)}</Text>
                        <Pressable onPress={() => bump(ch, k, -2)} accessibilityLabel="Moins" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>−</Text></Pressable>
                        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.meterBg, overflow: 'hidden' }}><View style={{ width: `${pct(v)}%`, height: 10, backgroundColor: c }} /></View>
                        <Pressable onPress={() => bump(ch, k, 2)} accessibilityLabel="Plus" style={[styles.pm, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>+</Text></Pressable>
                        <Pressable onPress={() => client.set(sendPath(ch, k), f(0))} accessibilityLabel="Retirer" style={[styles.pm, { borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 11 }}>✕</Text></Pressable>
                      </View>
                    );
                  })}
                  {!u.length && <Text style={{ color: theme.muted, fontSize: 12 }}>Emplacement libre : personne n’y envoie.</Text>}
                </ScrollView>
                <Pressable onPress={() => setAdding(adding === k ? null : k)} style={[styles.add, { borderColor: c }]}>
                  <Text style={{ color: c, fontWeight: '800', fontSize: 12 }}>+ Ajouter une voie</Text>
                </Pressable>
                {adding === k && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {named.filter((ch) => !u.includes(ch)).map((ch) => (
                      <Pressable key={ch} onPress={() => { client.set(sendPath(ch, k), f(dbToFader(-14))); setAdding(null); }} style={[styles.cand, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{chName(client, ch)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {view === 'ch' && (
        <View style={{ flex: 1, flexDirection: width >= 900 ? 'row' : 'column', gap: 12, padding: 14, paddingTop: 4 }}>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0, flexShrink: 1 }}>
            {named.map((ch) => {
              const on = ch === selCh;
              return (
                <Pressable key={ch} onPress={() => setSelCh(ch)} accessibilityState={{ selected: on }} style={[styles.strip, { borderColor: on ? '#FFFFFF' : theme.line, backgroundColor: on ? theme.deep : theme.panel }]}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{chName(client, ch)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>voie {ch}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, width: 80, marginTop: 6 }}>
                    {SLOTS.map((k) => {
                      const v = Number(client.get(sendPath(ch, k)) ?? 0);
                      return (
                        <View key={k} style={{ width: 37, height: 30, borderRadius: 8, borderWidth: 2, borderColor: SLOT_COLORS[k - 1], backgroundColor: theme.meterBg, overflow: 'hidden', opacity: v > 0 ? 1 : 0.35 }}>
                          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct(v)}%`, backgroundColor: SLOT_COLORS[k - 1] }} />
                        </View>
                      );
                    })}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[styles.detail, { backgroundColor: theme.panel, borderColor: theme.line, width: width >= 900 ? 380 : undefined }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{chName(client, selCh)} · ses effets</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Combien cette voie envoie dans chaque effet. L’effet lui-même est partagé.</Text>
            {SLOTS.map((k) => {
              const v = Number(client.get(sendPath(selCh, k)) ?? 0);
              const c = SLOT_COLORS[k - 1];
              const st = shareText(client, k, selCh);
              return (
                <View key={k} style={[styles.dose, { borderColor: v > 0 ? c : theme.line, backgroundColor: theme.deep }]}>
                  <Pressable onPress={() => setOpen(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {vis(k, 64, 28)}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{fxLabel(client, names, k)}</Text>
                      <Text numberOfLines={1} style={{ color: st.startsWith('partagé') ? '#FCD34D' : theme.muted, fontSize: 10 }}>{st}</Text>
                    </View>
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable onPress={() => bump(selCh, k, -2)} style={[styles.pm, { borderColor: theme.line2, width: 38, height: 38 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>−</Text></Pressable>
                    <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: theme.panel, overflow: 'hidden' }}><View style={{ width: `${pct(v)}%`, height: 12, backgroundColor: c }} /></View>
                    <Pressable onPress={() => bump(selCh, k, 2)} style={[styles.pm, { borderColor: theme.line2, width: 38, height: 38 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>+</Text></Pressable>
                    <Text style={{ width: 48, textAlign: 'right', color: theme.text, fontSize: 11, fontWeight: '800' }}>{dbText(v)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {view === 'grid' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 4 }}>
          <ScrollView horizontal>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ width: 160 }} />
                {SLOTS.map((k) => (
                  <Pressable key={k} onPress={() => setOpen(k)} style={[styles.gridHead, { borderColor: SLOT_COLORS[k - 1], backgroundColor: theme.panel }]}>
                    {vis(k, 168, 28)}
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{fxLabel(client, names, k)}</Text>
                    <Text style={{ color: theme.muted, fontSize: 10 }}>FX{k} · {users(client, k).length || 'libre'}{users(client, k).length ? ' voies' : ''}</Text>
                  </Pressable>
                ))}
              </View>
              {named.map((ch) => (
                <View key={ch} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <View style={[styles.rowHead, { backgroundColor: theme.panel, borderColor: theme.line }]}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{chName(client, ch)}</Text>
                    <Text style={{ color: theme.muted, fontSize: 10 }}>voie {ch}</Text>
                  </View>
                  {SLOTS.map((k) => {
                    const v = Number(client.get(sendPath(ch, k)) ?? 0);
                    const on = v > 0;
                    const size = on ? Math.round(12 + (pct(v) / 100) * 30) : 0;
                    return (
                      <Pressable key={k} onPress={() => { const d = faderToDb(v); client.set(sendPath(ch, k), f(!on ? dbToFader(-16) : d >= -4 ? 0 : dbToFader(Math.min(0, d + 4)))); }} accessibilityLabel={`${chName(client, ch)} dans ${fxLabel(client, names, k)} : ${dbText(v)}`} style={[styles.cell, { backgroundColor: on ? theme.panel : theme.deep }]}>
                        {on && <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: SLOT_COLORS[k - 1] }} />}
                        <Text style={{ position: 'absolute', right: 8, bottom: 4, color: theme.muted, fontSize: 10, fontWeight: '800' }}>{on ? dbText(v) : ''}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10 }}>Une ligne par voie, une colonne par effet · grosse bulle = beaucoup d’effet · touche une case : +4 dB, encore = retirer.</Text>
        </ScrollView>
      )}

      <FxSaveSheet client={client} theme={theme} mode={saveMode} names={names} onNames={setNamesSave} onClose={() => setSaveMode(null)} />
      <EffectDetail client={client} theme={theme} slot={open} names={names} onNames={setNamesSave} onClose={() => setOpen(null)} onOpen={setOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 48, paddingHorizontal: 14, paddingBottom: 10, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: '700' },
  saveAll: { height: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segBtn: { height: 40, paddingHorizontal: 14, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 2, borderRadius: 20, padding: 12, gap: 10 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  pm: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  add: { height: 40, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cand: { height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, justifyContent: 'center' },
  strip: { width: 104, borderRadius: 16, borderWidth: 2, padding: 10, alignItems: 'center', gap: 2 },
  detail: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  dose: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  gridHead: { width: 190, borderWidth: 2, borderRadius: 14, padding: 8, gap: 4 },
  rowHead: { width: 160, height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, justifyContent: 'center' },
  cell: { width: 190, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
