// Réglages d'entrée d'une voie : gain du préampli, 48 V, phase, panoramique.
// Le vumètre en direct aide à régler le gain pendant la balance.
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { f, i } from '../osc/osc';
import {
  chDcaPath, chNamePath, chOnPath, DCA_COUNT, dcaNamePath, inDca, insrcLabel, insrcPath, toggleDca, fToGainDb, formatPan, headampGainPath, invertPath, meterIndex, panPath, panToF, phantomPath,
} from '../xair/addresses';
import { useParam, useParamOpt } from '../xair/useParam';
import { useMeter } from '../xair/useMeter';
import { XAirClient } from '../xair/XAirClient';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import { TABLE_COLORS } from '../xair/smartName';
import { GROUP_COLORS } from './GroupsSheet';

export interface InputActions { onRename: (ch: number) => void; onSource: (ch: number) => void; onDetail: (ch: number) => void; onPresets: (ch: number) => void; onCopy: (ch: number) => void }

export function InputSheet({ client, ch, theme, onClose, actions }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void; actions?: InputActions }) {
  return (
    <Modal visible={ch !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {ch !== null && <Body client={client} ch={ch} theme={theme} onClose={onClose} actions={actions} />}
      </View>
    </Modal>
  );
}

function Body({ client, ch, theme, onClose, actions }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void; actions?: InputActions }) {
  const wide = useWindowDimensions().width >= 900;
  const n2 = String(ch).padStart(2, '0');
  const colIdx = Number(useParam<number>(client, `/ch/${n2}/config/color`, 0)) & 7;
  const mask = Number(useParam<number>(client, chDcaPath(ch), 0));
  const insrc = Number(useParam<number>(client, insrcPath(ch), ch - 1));
  const on = Number(useParam<number>(client, chOnPath(ch), 1)) === 1;
  const gNames = Array.from({ length: DCA_COUNT }, (_, k) => String(client.get(dcaNamePath(k + 1)) ?? '') || `Groupe ${k + 1}`);
  const go = (fn?: (c: number) => void) => () => { onClose(); fn?.(ch); };
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const gain = useParamOpt(client, headampGainPath(ch));
  const phantom = Number(useParamOpt(client, phantomPath(ch)) ?? 0) === 1;
  const inv = Number(useParam<number>(client, invertPath(ch), 0)) === 1;
  const pan = Number(useParam<number>(client, panPath(ch), 0.5));
  const meter = useMeter(client, [meterIndex.ch(ch)]);
  const hasPreamp = gain !== undefined;

  const advice =
    meter.clip ? 'Ça sature : baisse le gain.' : meter.db > -6 ? 'Un peu fort : baisse légèrement.' : meter.db < -40 ? 'Joue fort pour régler…' : meter.db < -24 ? 'Trop faible : monte le gain.' : 'Bon niveau.';

  return (
    <View style={[styles.sheet, { backgroundColor: theme.panel }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>ENTRÉE · CH {ch}</Text>
          <Pressable onPress={go(actions?.onRename)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 6, height: 26, borderRadius: 3, backgroundColor: TABLE_COLORS[colIdx] }} />
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{name}</Text>
            <Text style={{ color: theme.muted, fontSize: 15 }}>✎</Text>
          </Pressable>
        </View>
        <Pressable onPress={onClose} style={[styles.ok, { backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>OK</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ flexDirection: wide ? 'row' : 'column', gap: 18 }}>
        <View style={{ flex: 1, gap: 12 }}>
      <View style={{ gap: 6 }}>
        <View style={[styles.hmeter, { backgroundColor: theme.meterBg }]}>
          <View style={{ width: `${meter.level * 100}%`, height: '100%', borderRadius: 6, backgroundColor: meter.clip ? '#EF4444' : meter.level > 0.85 ? '#EAB308' : '#22C55E' }} />
          {/* zone visée : -18 à -6 dB */}
          <View style={[styles.zone, { left: `${(42 / 60) * 100}%`, width: `${(12 / 60) * 100}%`, borderColor: theme.text }]} />
        </View>
        <Text style={{ color: meter.clip ? '#EF4444' : theme.muted, fontSize: 13 }}>
          {meter.db > -90 ? `${meter.db.toFixed(0)} dB · ` : ''}
          {advice}
        </Text>
      </View>

      {hasPreamp ? (
        <HSlider
          label="Gain"
          value={Number(gain)}
          valueText={`${fToGainDb(Number(gain)) > 0 ? '+' : ''}${fToGainDb(Number(gain)).toFixed(1)} dB`}
          onChange={(v) => client.set(headampGainPath(ch), f(v))}
          color={theme.accent}
          theme={theme}
        />
      ) : (
        <Text style={{ color: theme.muted, fontSize: 13 }}>Entrée ligne : pas de gain réglable ici. Règle le niveau à la source.</Text>
      )}

      <View style={styles.row}>
        {hasPreamp && (
          <Toggle
            on={phantom}
            label="48 V"
            sub="Micros statiques seulement"
            onColor="#DC2626"
            theme={theme}
            onPress={() =>
              phantom
                ? client.set(phantomPath(ch), i(0))
                : Alert.alert('Activer le 48 V ?', "Seulement pour un micro statique ou une DI active. Baisse le volume avant, ça peut claquer.", [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Activer', onPress: () => client.set(phantomPath(ch), i(1)) },
                  ])
            }
          />
        )}
        <Toggle on={inv} label="Phase Ø" sub="Inverser la polarité" onColor={theme.text} theme={theme} onPress={() => client.set(invertPath(ch), i(inv ? 0 : 1))} />
      </View>

      <HSlider label="Panoramique" value={pan} center valueText={formatPan(pan)} onChange={(v) => client.set(panPath(ch), f(v))} color={theme.text} theme={theme} />
      <Pressable onPress={() => client.set(panPath(ch), f(panToF(0)))}>
        <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 6 }}>Remettre au centre</Text>
      </Pressable>
        </View>
        <View style={{ flex: 1, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[styles.k, { color: theme.muted }]}>COULEUR</Text>
            {Object.keys(TABLE_COLORS).map(Number).map((k) => (
              <Pressable key={k} onPress={() => client.set(`/ch/${n2}/config/color`, i(k))} accessibilityLabel={`Couleur ${k}`} style={[styles.sw, { backgroundColor: TABLE_COLORS[k], borderColor: colIdx === k ? '#FFFFFF' : 'transparent' }]} />
            ))}
          </View>
          <Pressable onPress={go(actions?.onSource)} style={[styles.row2, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
            <Text style={[styles.k, { color: theme.muted }]}>BRANCHÉE SUR</Text>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, flex: 1 }}>{insrcLabel(insrc)}</Text>
            <Text style={{ color: theme.accent, fontWeight: '800' }}>Changer ›</Text>
          </Pressable>
          <View style={{ gap: 6 }}>
            <Text style={[styles.k, { color: theme.muted }]}>GROUPES</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {gNames.map((g, k) => {
                const inG = inDca(mask, k + 1);
                return (
                  <Pressable key={k} onPress={() => client.set(chDcaPath(ch), i(toggleDca(mask, k + 1)))} accessibilityState={{ checked: inG }} style={[styles.gchip, { borderColor: GROUP_COLORS[k], backgroundColor: inG ? GROUP_COLORS[k] : 'transparent' }]}>
                    <Text style={{ color: inG ? '#0B0B0F' : theme.text, fontWeight: '800', fontSize: 13 }}>{inG ? '✓ ' : ''}{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Act label="Égaliseur & effets" icon="〰" theme={theme} onPress={go(actions?.onDetail)} />
            <Act label="Préréglages" icon="★" theme={theme} onPress={go(actions?.onPresets)} />
            <Act label="Copier vers…" icon="⧉" theme={theme} onPress={go(actions?.onCopy)} />
            <Act label={on ? 'Couper la voie' : 'Voie coupée'} icon="⏻" theme={theme} danger={!on} onPress={() => client.set(chOnPath(ch), i(on ? 0 : 1))} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Act(props: { label: string; icon: string; theme: Theme; onPress: () => void; danger?: boolean }) {
  const { theme } = props;
  return (
    <Pressable onPress={props.onPress} style={[styles.act, { borderColor: props.danger ? theme.mute : theme.line2, backgroundColor: props.danger ? theme.mute : theme.deep }]}>
      <Text style={{ color: props.danger ? theme.onMute : theme.accent, fontSize: 18, fontWeight: '900' }}>{props.icon}</Text>
      <Text style={{ color: props.danger ? theme.onMute : theme.text, fontWeight: '800', fontSize: 13 }}>{props.label}</Text>
    </Pressable>
  );
}

function Toggle(props: { on: boolean; label: string; sub: string; onColor: string; theme: Theme; onPress: () => void }) {
  const { theme, on } = props;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={[styles.toggle, on ? { backgroundColor: props.onColor } : { borderColor: theme.line2, borderWidth: 1 }]}
    >
      <Text style={{ color: on ? (props.onColor === theme.text ? theme.bg : '#FFFFFF') : theme.text, fontWeight: '800', fontSize: 15 }}>{props.label}</Text>
      <Text style={{ color: on ? (props.onColor === theme.text ? theme.bg : '#FFE4E4') : theme.muted, fontSize: 11 }}>{props.sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, gap: 12, maxHeight: '88%' },
  k: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  sw: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  gchip: { height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 2, justifyContent: 'center' },
  act: { flexGrow: 1, flexBasis: '45%', height: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ok: { height: 44, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  hmeter: { height: 14, borderRadius: 7, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: 4, opacity: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, minHeight: 56, borderRadius: 14, padding: 10, justifyContent: 'center' },
});
