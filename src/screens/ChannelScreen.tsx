// Écran « EQ · FX » d'une voie : préréglages par instrument en haut,
// puis égaliseur, coupe-bas, gate, compresseur et envois vers les 4 effets.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { f, i } from '../osc/osc';
import {
  channelDetailPaths, chLevelPath, chNamePath, dynOnPath, dynThrPath, eqGainToF, eqOnPath, eqPath,
  formatHz, fToCompDb, fToEqGain, fToGateDb, fToHpfHz, fToHz, FX_COUNT, gateOnPath, gateThrPath,
  hpfPath, hpOnPath,
} from '../xair/addresses';
import { formatDb } from '../xair/levels';
import { applyPreset, PRESETS } from '../xair/presets';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import { fxType, fxTypePath } from '../xair/effects';
import { EffectsScreen } from './EffectsScreen';
import { PresetsSheet } from './PresetsSheet';

const FX_COLORS = ['#C084FC', '#F472B6', '#2DD4BF', '#FBBF24'];
const BAND_NAMES = ['Grave', 'Bas-médium', 'Médium', 'Aigu'];

export function ChannelScreen({ client, ch, theme, onClose }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void }) {
  return (
    <Modal visible={ch !== null} animationType="slide" onRequestClose={onClose}>
      {ch !== null && <ChannelBody client={client} ch={ch} theme={theme} onClose={onClose} />}
    </Modal>
  );
}

function ChannelBody({ client, ch, theme, onClose }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void }) {
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const [preset, setPreset] = useState<string | null>(null);
  const [lib, setLib] = useState(false);
  const [fxOpen, setFxOpen] = useState<number | null>(null);

  useEffect(() => {
    client.loadPaths(channelDetailPaths(ch));
  }, [client, ch]);

  const num = (p: string, fb: number) => Number(useParam<number>(client, p, fb));
  const eqOn = num(eqOnPath(ch), 0) === 1;
  const hpOn = num(hpOnPath(ch), 0) === 1;
  const hpf = num(hpfPath(ch), 0.3);
  const gateOn = num(gateOnPath(ch), 0) === 1;
  const gateThr = num(gateThrPath(ch), 0.5);
  const dynOn = num(dynOnPath(ch), 0) === 1;
  const dynThr = num(dynThrPath(ch), 0.6);
  const bands = [1, 2, 3, 4].map((b) => ({ b, g: num(eqPath(ch, b, 'g'), 0.5), fr: num(eqPath(ch, b, 'f'), 0.5) }));
  const sends = Array.from({ length: FX_COUNT }, (_, k) => num(chLevelPath(ch, { kind: 'fx', n: k + 1 }), 0));

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} accessibilityLabel="Retour à la table" style={[styles.back, { backgroundColor: theme.panel }]}>
          <Text style={{ color: theme.text, fontSize: 20 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>CH {ch}</Text>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>{name}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.section, { color: theme.muted }]}>PRÉRÉGLAGE INSTRUMENT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PRESETS.map((p) => {
            const on = preset === p.name;
            return (
              <Pressable
                key={p.name}
                onPress={() => {
                  applyPreset(client, ch, p);
                  setPreset(p.name);
                }}
                accessibilityState={{ selected: on }}
                style={[styles.chip, on ? { backgroundColor: theme.accent } : { borderColor: theme.line2, borderWidth: 1, backgroundColor: theme.panel }]}
              >
                <Text style={{ color: on ? theme.onAccent : theme.text, fontWeight: on ? '700' : '500', fontSize: 14 }}>{p.name}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setLib(true)} style={[styles.chip, { borderColor: theme.accent, borderWidth: 1 }]}>
            <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 14 }}>Bibliothèque…</Text>
          </Pressable>
        </ScrollView>
        {preset && <Text style={{ color: theme.muted, fontSize: 12 }}>Point de départ « {preset} » appliqué : ajuste à l'oreille.</Text>}

        <Card theme={theme} title="Égaliseur" on={eqOn} onToggle={() => client.set(eqOnPath(ch), i(eqOn ? 0 : 1))}>
          {bands.map(({ b, g, fr }) => (
            <HSlider
              key={b}
              label={`${BAND_NAMES[b - 1]} · ${formatHz(fToHz(fr))}`}
              value={g}
              center
              valueText={`${fToEqGain(g) > 0 ? '+' : ''}${fToEqGain(g).toFixed(1)} dB`}
              onChange={(v) => client.set(eqPath(ch, b, 'g'), f(v))}
              color={theme.accent}
              theme={theme}
            />
          ))}
          <Pressable onPress={() => [1, 2, 3, 4].forEach((b) => client.set(eqPath(ch, b, 'g'), f(eqGainToF(0))))}>
            <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 8 }}>Remettre l'EQ à plat</Text>
          </Pressable>
        </Card>

        <Card theme={theme} title="Coupe-bas" on={hpOn} onToggle={() => client.set(hpOnPath(ch), i(hpOn ? 0 : 1))}>
          <HSlider label="Fréquence" value={hpf} valueText={formatHz(fToHpfHz(hpf))} onChange={(v) => client.set(hpfPath(ch), f(v))} color="#60A5FA" theme={theme} />
        </Card>

        <Card theme={theme} title="Gate" on={gateOn} onToggle={() => client.set(gateOnPath(ch), i(gateOn ? 0 : 1))}>
          <HSlider label="Seuil" value={gateThr} valueText={`${fToGateDb(gateThr).toFixed(0)} dB`} onChange={(v) => client.set(gateThrPath(ch), f(v))} color={theme.ok} theme={theme} />
        </Card>

        <Card theme={theme} title="Compresseur" on={dynOn} onToggle={() => client.set(dynOnPath(ch), i(dynOn ? 0 : 1))}>
          <HSlider label="Seuil" value={dynThr} valueText={`${fToCompDb(dynThr).toFixed(0)} dB`} onChange={(v) => client.set(dynThrPath(ch), f(v))} color={theme.ok} theme={theme} />
        </Card>

        <Card theme={theme} title="Effets de la table">
          {sends.map((v, k) => (
            <HSlider
              key={k}
              label={`FX${k + 1} · ${fxType(Number(client.get(fxTypePath(k + 1)) ?? 0)).fr}`}
              value={v}
              valueText={formatDb(v)}
              onChange={(x) => client.set(chLevelPath(ch, { kind: 'fx', n: k + 1 }), f(x))}
              color={FX_COLORS[k]}
              theme={theme}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map((k) => (
              <Pressable key={k} onPress={() => setFxOpen(k)} style={[styles.chip, { borderColor: FX_COLORS[k - 1], borderWidth: 1, backgroundColor: theme.panel }]}>
                <Text style={{ color: FX_COLORS[k - 1], fontWeight: '700', fontSize: 13 }}>Régler FX{k}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
        <View style={{ height: 40 }} />
      </ScrollView>
      <PresetsSheet client={client} theme={theme} visible={lib} ch={ch} onClose={() => setLib(false)} />
      <EffectsScreen client={client} theme={theme} visible={fxOpen !== null} startSlot={fxOpen ?? 1} onClose={() => setFxOpen(null)} />
    </View>
  );
}

function Card(props: { theme: Theme; title: string; on?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  const { theme } = props;
  return (
    <View style={[styles.card, { backgroundColor: theme.panel }]}>
      <View style={styles.cardHead}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{props.title}</Text>
        {props.onToggle && (
          <Pressable
            onPress={props.onToggle}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!props.on }}
            style={[styles.toggle, props.on ? { backgroundColor: theme.ok } : { borderColor: theme.line2, borderWidth: 1 }]}
          >
            <Text style={{ color: props.on ? '#0B0D10' : theme.muted, fontWeight: '700', fontSize: 12 }}>{props.on ? 'ACTIF' : 'COUPÉ'}</Text>
          </Pressable>
        )}
      </View>
      {props.children}
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  card: { borderRadius: 16, padding: 12, gap: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  toggle: { height: 32, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
});
