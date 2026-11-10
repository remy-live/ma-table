// « Les faders règlent ce qu'entend : … » — le choix de la personne (ou, en
// avancé, de l'effet) avec des visages, à la place de la rangée de pastilles.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { HELP, showTip } from '../ui/tip';
import { BUS_COUNT, busNamePath, FX_COUNT, Target, targetId } from '../xair/addresses';
import { fxType, fxTypePath } from '../xair/effects';
import { XAirClient } from '../xair/XAirClient';

export const MIX_COLORS = ['#E8EAED', '#60A5FA', '#34D399', '#38BDF8', '#A3E635', '#FB923C', '#F87171'];
export const FX_COLORS = ['#C084FC', '#F472B6', '#2DD4BF', '#FBBF24'];

export interface MixInfo {
  name: string;
  ini: string;
  sub: string;
  color: string;
}

/** Nom, initiales, sous-titre et couleur d'un mix (façade, retour, effet). */
export function mixInfo(client: XAirClient, t: Target): MixInfo {
  if (t.kind === 'main') return { name: 'Le public', ini: 'PUB', sub: 'façade · MAIN L/R', color: MIX_COLORS[0] };
  if (t.kind === 'bus') {
    const raw = String(client.get(busNamePath(t.n)) ?? '').trim();
    const name = raw || `Retour ${t.n}`;
    return { name, ini: initials(name), sub: `retour · AUX ${t.n}`, color: MIX_COLORS[t.n] ?? '#9AA3AD' };
  }
  const ft = fxType(Number(client.get(fxTypePath(t.n)) ?? 0));
  return { name: `${ft.fr}`, ini: `FX${t.n}`, sub: `effet ${t.n} · envoi de chaque voie`, color: FX_COLORS[t.n - 1] };
}

export function initials(name: string): string {
  const clean = name.replace(/^retour\s*/i, '').replace(/[_\-]\d+$/, '').trim() || name;
  const parts = clean.split(/[\s_\-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 3).toUpperCase();
}

export function MixPickerButton(props: { client: XAirClient; target: Target; theme: Theme; onPress: () => void }) {
  const { theme } = props;
  const m = mixInfo(props.client, props.target);
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Les faders règlent ce qu’entend ${m.name}. Changer.`} style={[styles.btn, { borderColor: m.color, backgroundColor: theme.panel }]}>
      <View style={[styles.avatar, { backgroundColor: m.color }]}>
        <Text style={styles.avatarText}>{m.ini}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '700' }}>LES FADERS RÈGLENT CE QU’ENTEND</Text>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
          {m.name} <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>· {m.sub}</Text>
        </Text>
      </View>
      <Text style={{ color: theme.muted, fontSize: 16 }}>▾</Text>
    </Pressable>
  );
}

/** Une pastille par personne, toujours visible : un appui change de mix.
 *  La pastille choisie s'ouvre et donne le nom complet. « FX » ouvre les effets. */
export function MixChips(props: { client: XAirClient; target: Target; theme: Theme; onPick: (t: Target) => void; onMore: () => void }) {
  const { client, theme } = props;
  const people: Target[] = [{ kind: 'main' }, ...Array.from({ length: BUS_COUNT }, (_, k) => ({ kind: 'bus', n: k + 1 }) as Target)];
  const cur = targetId(props.target);
  const fxOn = props.target.kind === 'fx';
  const curInfo = fxOn ? mixInfo(client, props.target) : null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      {people.map((t) => {
        const m = mixInfo(client, t);
        const on = targetId(t) === cur;
        return (
          <Pressable key={targetId(t)} onPress={() => props.onPick(t)} onLongPress={() => showTip(`${m.name} (${m.sub}). ${HELP.mix}`)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Les faders règlent ce qu’entend ${m.name}`}
            style={[styles.chip, on ? { borderColor: m.color, backgroundColor: theme.panel, paddingRight: 14 } : { borderColor: 'transparent', paddingRight: 4 }]}>
            <View style={[styles.avatar, on ? null : { opacity: 0.85 }, { backgroundColor: m.color }]}><Text style={styles.avatarText}>{m.ini}</Text></View>
            {on && (
              <View style={{ maxWidth: 170 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{m.name}</Text>
                <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10 }}>{m.sub}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      <Pressable onPress={props.onMore} onLongPress={() => showTip(HELP.fxChip)} accessibilityRole="button" accessibilityLabel="Régler les envois vers les effets" style={[styles.chip, fxOn && curInfo ? { borderColor: curInfo.color, backgroundColor: theme.panel, paddingRight: 14 } : { borderColor: theme.line2, paddingRight: 10, paddingLeft: 10 }]}>
        {fxOn && curInfo ? (
          <>
            <View style={[styles.avatar, { backgroundColor: curInfo.color }]}><Text style={styles.avatarText}>{curInfo.ini}</Text></View>
            <View style={{ maxWidth: 160 }}>
              <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '800' }}>ENVOIS VERS L’EFFET</Text>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>{curInfo.name} ▾</Text>
            </View>
          </>
        ) : <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800' }}>FX ▾</Text>}
      </Pressable>
    </ScrollView>
  );
}

export function MixPickerSheet(props: { client: XAirClient; target: Target; theme: Theme; visible: boolean; onClose: () => void; onPick: (t: Target) => void }) {
  const { client, theme } = props;
  const people: Target[] = [{ kind: 'main' }, ...Array.from({ length: BUS_COUNT }, (_, k) => ({ kind: 'bus', n: k + 1 }) as Target)];
  const fxs: Target[] = Array.from({ length: FX_COUNT }, (_, k) => ({ kind: 'fx', n: k + 1 }) as Target);
  const cur = targetId(props.target);
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.back} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
          <Text style={[styles.kicker, { color: theme.muted }]}>QUI ÉCOUTE ?</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <View style={styles.grid}>
              {people.map((t) => {
                const m = mixInfo(client, t);
                const on = targetId(t) === cur;
                return (
                  <Pressable key={targetId(t)} onPress={() => props.onPick(t)} accessibilityState={{ selected: on }} style={[styles.tile, { borderColor: on ? m.color : theme.line, backgroundColor: on ? theme.deep : theme.bg }]}>
                    <View style={[styles.avatar, { backgroundColor: m.color, width: 34, height: 34, borderRadius: 17 }]}>
                      <Text style={[styles.avatarText, { fontSize: 11 }]}>{m.ini}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{m.name}</Text>
                    <Text style={{ color: theme.muted, fontSize: 10 }}>{m.sub.split(' · ')[1]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.kicker, { color: theme.muted, marginTop: 6 }]}>
              OU COMBIEN CHAQUE VOIE ENVOIE DANS UN EFFET <Text style={{ fontWeight: '500', letterSpacing: 0 }}>(avancé — sinon bouton FX sous la voie)</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {fxs.map((t) => {
                const m = mixInfo(client, t);
                const on = targetId(t) === cur;
                return (
                  <Pressable key={targetId(t)} onPress={() => props.onPick(t)} accessibilityState={{ selected: on }} style={[styles.fx, { borderColor: on ? m.color : theme.line, backgroundColor: on ? theme.deep : theme.bg }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11, fontWeight: '700', flexShrink: 1 }}>
                      {m.ini} · {m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingRight: 12, flex: 1 },
  chip: { height: 54, borderRadius: 27, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0B0D10', fontSize: 12, fontWeight: '800' },
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, paddingBottom: 34, maxHeight: '85%', gap: 10 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', minWidth: 100, flexGrow: 1, minHeight: 84, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 3, padding: 6 },
  fx: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
});
