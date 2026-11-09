// Réglages d'entrée d'une voie : gain du préampli, 48 V, phase, panoramique.
// Le vumètre en direct aide à régler le gain pendant la balance.
import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { f, i } from '../osc/osc';
import {
  chNamePath, fToGainDb, formatPan, headampGainPath, invertPath, meterIndex, panPath, panToF, phantomPath,
} from '../xair/addresses';
import { useParam, useParamOpt } from '../xair/useParam';
import { useMeter } from '../xair/useMeter';
import { XAirClient } from '../xair/XAirClient';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';

export function InputSheet({ client, ch, theme, onClose }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void }) {
  return (
    <Modal visible={ch !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {ch !== null && <Body client={client} ch={ch} theme={theme} onClose={onClose} />}
      </View>
    </Modal>
  );
}

function Body({ client, ch, theme, onClose }: { client: XAirClient; ch: number; theme: Theme; onClose: () => void }) {
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
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{name}</Text>
        </View>
        <Pressable onPress={onClose} style={[styles.ok, { backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>OK</Text>
        </Pressable>
      </View>

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
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ok: { height: 44, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  hmeter: { height: 14, borderRadius: 7, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: 4, opacity: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, minHeight: 56, borderRadius: 14, padding: 10, justifyContent: 'center' },
});
