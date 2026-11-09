// Rack d'effets de la XR16 : 4 emplacements, catalogue par famille, recettes,
// 3 réglages clairs, tap tempo pour les échos, et « qui l'utilise ».
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { f, i } from '../osc/osc';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import { CH_COUNT, chLevelPath, chNamePath, FX_COUNT } from '../xair/addresses';
import {
  applyRecipe, FX_FAMILIES, FX_TYPES, FxFamily, fxParPath, fxReturnOnPath, fxReturnPath, fxType, fxTypePath, fToMs, knobsFor,
  msToF, rackPaths, RECIPES, setKnob, tapTempo,
} from '../xair/effects';
import { formatDb } from '../xair/levels';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';

const SLOT_COLORS = ['#C084FC', '#38BDF8', '#2DD4BF', '#F472B6'];

export function EffectsScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; startSlot?: number }) {
  const { client, theme } = props;
  const [k, setK] = useState(props.startSlot ?? 1);
  useEffect(() => {
    if (props.visible) client.loadPaths(rackPaths());
  }, [client, props.visible]);
  useEffect(() => {
    if (props.startSlot) setK(props.startSlot);
  }, [props.startSlot]);

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Effets de la table</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>4 emplacements · les voies y envoient leur son</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: FX_COUNT }, (_, n) => n + 1).map((s) => (
            <SlotTab key={s} client={client} k={s} active={s === k} theme={theme} onPress={() => setK(s)} />
          ))}
        </View>
        <SlotBody key={k} client={client} k={k} theme={theme} />
      </View>
    </Modal>
  );
}

function SlotTab(props: { client: XAirClient; k: number; active: boolean; theme: Theme; onPress: () => void }) {
  const { client, k, theme } = props;
  const type = Number(useParam<number>(client, fxTypePath(k), 0));
  const ret = Number(useParam<number>(client, fxReturnPath(k), 0));
  const c = SLOT_COLORS[k - 1];
  return (
    <Pressable onPress={props.onPress} accessibilityState={{ selected: props.active }} style={[styles.slot, { borderColor: props.active ? c : theme.line, backgroundColor: props.active ? theme.panel : theme.deep }]}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '800' }}>FX{k}</Text>
      <Text numberOfLines={2} style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{fxType(type).fr}</Text>
      <Text style={{ color: theme.muted, fontSize: 10 }}>{formatDb(ret)} dB</Text>
    </Pressable>
  );
}

function SlotBody(props: { client: XAirClient; k: number; theme: Theme }) {
  const { client, k, theme } = props;
  const c = SLOT_COLORS[k - 1];
  const type = fxType(Number(useParam<number>(client, fxTypePath(k), 0)));
  const ret = Number(useParam<number>(client, fxReturnPath(k), 0));
  const retOn = Number(useParam<number>(client, fxReturnOnPath(k), 1)) === 1;
  const [catalog, setCatalog] = useState(false);
  const [fam, setFam] = useState<FxFamily>(type.family);
  const [allCh, setAllCh] = useState(false);
  const taps = useRef<number[]>([]);
  const [tap, setTap] = useState<{ ms: number; bpm: number } | null>(null);
  const knobs = knobsFor(type.kind);

  const recipe = (r: (typeof RECIPES)[number]) =>
    Alert.alert(`Recette « ${r.name} » dans FX${k}`, 'Régler aussi les envois des voies reconnues par leur nom (Voix, Guitare…) ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effet seul', onPress: () => applyRecipe(client, k, r, false) },
      {
        text: 'Effet + envois',
        onPress: () => {
          const t = applyRecipe(client, k, r, true);
          if (!t.length) Alert.alert('Aucune voie reconnue', 'Renomme tes voies (Voix, Guitare…) ou règle les envois en bas.');
        },
      },
    ]);

  const doTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 4000), now];
    const r = tapTempo(taps.current);
    if (r) {
      setTap(r);
      client.set(fxParPath(k, 2), f(msToF(r.ms)));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 40 }}>
      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: c }]}>
        <Text style={{ color: c, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>FX{k} · {type.family.toUpperCase()}</Text>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>{type.fr}</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          {type.hint} · sur la table : {type.name}
        </Text>
        <Pressable onPress={() => setCatalog((x) => !x)} style={[styles.btn, { borderColor: theme.line2 }]}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{catalog ? 'Fermer le catalogue' : 'Changer d’effet'}</Text>
        </Pressable>
        {catalog && (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {FX_FAMILIES.map((fa) => (
                <Pressable key={fa} onPress={() => setFam(fa)} style={[styles.chip, fa === fam ? { backgroundColor: c, borderColor: c } : { borderColor: theme.line2 }]}>
                  <Text style={{ color: fa === fam ? '#0B0D10' : theme.text, fontWeight: '700', fontSize: 13 }}>{fa}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {FX_TYPES.filter((t) => t.family === fam).map((t) => (
              <Pressable
                key={t.n}
                onPress={() => {
                  client.set(fxTypePath(k), i(t.n));
                  setTimeout(() => client.loadPaths(Array.from({ length: 12 }, (_, n) => fxParPath(k, n + 1))), 300);
                  setCatalog(false);
                }}
                style={[styles.typeRow, { borderColor: t.n === type.n ? c : theme.line, backgroundColor: theme.deep }]}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t.fr}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{t.hint}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.kicker, { color: theme.muted }]}>RECETTES PRÊTES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {RECIPES.map((r) => (
          <Pressable key={r.id} onPress={() => recipe(r)} style={[styles.recipe, { borderColor: theme.line2, backgroundColor: theme.panel }]}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{r.name}</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }}>{r.desc}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
        <Text style={[styles.kicker, { color: theme.muted }]}>CARACTÈRE</Text>
        {knobs.map((kn) => (
          <KnobRow key={kn.label} client={client} k={k} knob={kn} color={c} theme={theme} isTime={type.kind === 'delay' && kn.label === 'Temps'} />
        ))}
        {type.kind === 'delay' && (
          <Pressable onPress={doTap} style={[styles.tap, { backgroundColor: c }]} accessibilityLabel="Taper le tempo">
            <Text style={{ color: '#0B0D10', fontWeight: '800', fontSize: 18 }}>TAP</Text>
            <Text style={{ color: '#0B0D10', fontSize: 12, fontWeight: '700' }}>{tap ? `${tap.bpm} BPM · ${tap.ms} ms` : 'tape le tempo 3 ou 4 fois'}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.kicker, { color: theme.muted, flex: 1 }]}>RETOUR DANS LA FAÇADE</Text>
          <Pressable onPress={() => client.set(fxReturnOnPath(k), i(retOn ? 0 : 1))} style={[styles.mute, { backgroundColor: retOn ? 'transparent' : theme.mute, borderColor: theme.mute }]}>
            <Text style={{ color: retOn ? theme.mute : theme.onMute, fontWeight: '800', fontSize: 12 }}>{retOn ? 'Couper' : 'Coupé'}</Text>
          </Pressable>
        </View>
        <HSlider value={ret} onChange={(v) => client.set(fxReturnPath(k), f(v))} label="Niveau de l’effet" valueText={`${formatDb(ret)} dB`} color={c} theme={theme} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.kicker, { color: theme.muted, flex: 1 }]}>QUI L’UTILISE</Text>
          <Pressable onPress={() => setAllCh((x) => !x)} style={{ padding: 6 }}>
            <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '700' }}>{allCh ? 'Seulement celles qui envoient' : 'Toutes les voies'}</Text>
          </Pressable>
        </View>
        {Array.from({ length: CH_COUNT }, (_, n) => n + 1).map((ch) => (
          <SendRow key={ch} client={client} ch={ch} k={k} color={c} theme={theme} showZero={allCh} />
        ))}
      </View>
      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>
        Rôle exact des réglages et échelle du temps d’écho : à confirmer avec le rapport de débogage sur ta table.
      </Text>
    </ScrollView>
  );
}

function KnobRow(props: { client: XAirClient; k: number; knob: ReturnType<typeof knobsFor>[number]; color: string; theme: Theme; isTime: boolean }) {
  const { client, k, knob } = props;
  const v = Number(useParam<number>(client, fxParPath(k, knob.pars[0]), 0.5));
  const text = props.isTime ? `${fToMs(v)} ms` : `${Math.round(v * 100)} %${knob.left ? ` · ${v < 0.35 ? knob.left : v > 0.65 ? knob.right : 'moyen'}` : ''}`;
  return <HSlider value={v} onChange={(x) => setKnob(client, k, knob, x)} label={knob.label} valueText={text} color={props.color} theme={props.theme} />;
}

function SendRow(props: { client: XAirClient; ch: number; k: number; color: string; theme: Theme; showZero: boolean }) {
  const { client, ch, k } = props;
  const path = chLevelPath(ch, { kind: 'fx', n: k });
  const v = Number(useParam<number>(client, path, 0));
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  if (!props.showZero && v <= 0) return null;
  return <HSlider value={v} onChange={(x) => client.set(path, f(x))} label={`${ch} · ${name}`} valueText={formatDb(v)} color={props.color} theme={props.theme} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  slot: { flex: 1, minHeight: 72, borderRadius: 14, borderWidth: 1, padding: 8, gap: 2 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  btn: { height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  typeRow: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 52, gap: 2 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  recipe: { width: 150, minHeight: 70, borderRadius: 14, borderWidth: 1, padding: 10, gap: 3 },
  tap: { height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mute: { height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});
