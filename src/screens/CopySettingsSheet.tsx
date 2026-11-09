// « Copier les réglages » d'une ou plusieurs voies vers d'autres.
//   1. je prends les réglages de…   (une voie, ou plusieurs dans l'ordre)
//   2. …et je les donne à            (une voie → autant qu'on veut ; plusieurs → la 1re vers la 1re, etc.)
//   3. quoi copier                   (égaliseur, compresseur, effets…)
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { safetyBackup } from '../store/sessions';
import { readInset } from '../ui/immersive';
import { Btn, Kicker, SEM } from '../ui/kit';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath } from '../xair/addresses';
import { CATEGORIES, Category, copySettings } from '../xair/clipboard';
import { readGroups } from '../xair/groups';
import { colorOf, recognize } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';

const ALL = Array.from({ length: CH_COUNT }, (_, k) => k + 1);

export function CopySettingsSheet(props: { client: XAirClient; theme: Theme; visible: boolean; from: number | null; to?: number[]; onClose: () => void }) {
  const { client, theme } = props;
  const [srcs, setSrcs] = useState<number[]>([]);
  const [dsts, setDsts] = useState<number[]>([]);
  const [cats, setCats] = useState<Category[]>(['eq', 'dyn', 'fx']);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (props.visible) { setSrcs(props.from ? [props.from] : []); setDsts((props.to ?? []).filter((c) => c !== props.from)); } }, [props.visible, props.from]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const col = (c: number) => colorOf(Number(client.get(`/ch/${String(c).padStart(2, '0')}/config/color`) ?? 0));

  // Sélections rapides : les groupes de la table et les familles reconnues dans les noms (Voix, Batterie, Guitares…)
  const packs: { label: string; chans: number[] }[] = [];
  readGroups(client).filter((g) => g.members.length).forEach((g) => packs.push({ label: g.name, chans: g.members }));
  const fams = new Map<string, number[]>();
  ALL.forEach((c) => { const fm = recognize(String(client.get(chNamePath(c)) ?? ''))?.group; if (fm) fams.set(fm, [...(fams.get(fm) ?? []), c]); });
  fams.forEach((chans, label) => { if (!packs.some((p) => p.label.toLowerCase() === label.toLowerCase()) && chans.length > 1) packs.push({ label: `Toutes : ${label}`, chans }); });
  const pickSrc = (chans: number[]) => { setSrcs(chans); setDsts((d) => d.filter((x) => !chans.includes(x))); };
  const pickDst = (chans: number[]) => {
    const ok = chans.filter((c) => !srcs.includes(c));
    setDsts(srcs.length > 1 ? ok.slice(0, srcs.length) : ok);
  };
  const Packs = ({ onPick }: { onPick: (chans: number[]) => void }) => (packs.length ? (
    <View style={[styles.wrap, { alignItems: 'center' }]}>
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700' }}>d’un coup :</Text>
      {packs.map((p) => (
        <Pressable key={p.label} onPress={() => onPick(p.chans)} style={[styles.pack, { borderColor: theme.line2 }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{p.label} ({p.chans.length})</Text>
        </Pressable>
      ))}
    </View>
  ) : null);
  const summary = !srcs.length || !dsts.length ? '' : srcs.length > 1
    ? dsts.map((d, k) => `${name(srcs[k])} → ${name(d)}`).join('  ·  ')
    : `${name(srcs[0])} → ${dsts.map(name).join(', ')}`;

  const many = srcs.length > 1;
  const missing = many ? srcs.length - dsts.length : 0;
  const ready = srcs.length > 0 && dsts.length > 0 && cats.length > 0 && (!many || missing === 0);
  const sourceOf = (d: number) => (many ? srcs[dsts.indexOf(d)] : srcs[0]);
  const toggle = (list: number[], set: (l: number[]) => void, c: number) => set(list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);

  const go = async () => {
    setBusy(true);
    try {
      await safetyBackup(client, `avant de copier des réglages sur ${dsts.length} voie${dsts.length > 1 ? 's' : ''}`).catch(() => null);
      await copySettings(client, srcs, dsts, cats);
    } finally { setBusy(false); }
    props.onClose();
  };

  const Tile = ({ c, on, badge, sub, disabled, onPress }: { c: number; on: boolean; badge?: string; sub?: string; disabled?: boolean; onPress: () => void }) => (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }} style={[styles.tile, { borderColor: on ? col(c) : theme.line, backgroundColor: on ? theme.deep : 'transparent', opacity: disabled ? 0.2 : 1 }]}>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: col(c), marginBottom: 3 }} />
      <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{on ? '✓ ' : ''}{name(c)}</Text>
      <Text numberOfLines={1} style={{ color: on && sub ? theme.accent : theme.muted, fontSize: 10, fontWeight: on && sub ? '800' : '400' }}>{sub ?? `voie ${c}`}</Text>
      {!!badge && <View style={[styles.badge, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontSize: 10, fontWeight: '900' }}>{badge}</Text></View>}
    </Pressable>
  );

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={[styles.scrim, { paddingBottom: 16 + readInset() }]} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.accent }]} onPress={() => {}}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Copier les réglages</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            <Kicker theme={theme}>1 · JE PRENDS LES RÉGLAGES DE… (une ou plusieurs voies)</Kicker>
            <Packs onPick={pickSrc} />
            <View style={styles.wrap}>
              {ALL.map((c) => <Tile key={c} c={c} on={srcs.includes(c)} badge={many && srcs.includes(c) ? String(srcs.indexOf(c) + 1) : undefined} onPress={() => { toggle(srcs, setSrcs, c); setDsts((d) => d.filter((x) => x !== c)); }} />)}
            </View>

            <Kicker theme={theme}>{many ? `2 · …ET JE LES DONNE À ${srcs.length} VOIES, DANS LE MÊME ORDRE` : '2 · …ET JE LES DONNE À (une ou plusieurs voies)'}</Kicker>
            {srcs.length > 0 && <Packs onPick={pickDst} />}
            <View style={styles.wrap}>
              {ALL.map((c) => {
                const on = dsts.includes(c);
                const full = many && !on && dsts.length >= srcs.length;
                return <Tile key={c} c={c} on={on} disabled={srcs.includes(c) || full || !srcs.length} sub={on && sourceOf(c) ? `← ${name(sourceOf(c))}` : undefined} badge={many && on ? String(dsts.indexOf(c) + 1) : undefined} onPress={() => toggle(dsts, setDsts, c)} />;
              })}
            </View>

            <Kicker theme={theme}>3 · QUOI ?</Kicker>
            <View style={styles.wrap}>
              {CATEGORIES.filter((c) => c.id !== 'nom').map((c) => {
                const on = cats.includes(c.id);
                return (
                  <Pressable key={c.id} onPress={() => setCats((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))} accessibilityState={{ checked: on }} style={[styles.cat, { borderColor: theme.accent, backgroundColor: on ? theme.accent : 'transparent' }]}>
                    <Text style={{ color: on ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{on ? '✓ ' : ''}{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
 {!!summary && <Text numberOfLines={2} style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{summary}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn theme={theme} label="Annuler" onPress={props.onClose} style={{ flex: 1 }} />
            <Btn theme={theme} kind="primary" disabled={!ready || busy} onPress={go} style={{ flex: 2 }}
              label={busy ? '…' : !srcs.length ? 'Choisis d’où copier' : !dsts.length ? 'Choisis où coller' : missing > 0 ? `Encore ${missing} voie${missing > 1 ? 's' : ''} à choisir` : !cats.length ? 'Choisis quoi copier' : many ? `Copier ${srcs.length} voies sur ${dsts.length} autres` : `Copier ${name(srcs[0])} sur ${dsts.length} voie${dsts.length > 1 ? 's' : ''}`} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 860, maxHeight: '100%', borderWidth: 2, borderRadius: 20, padding: 14, gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tile: { width: '11.8%', minWidth: 80, minHeight: 50, borderRadius: 10, borderWidth: 2, padding: 6 },
  badge: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pack: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, justifyContent: 'center' },
  cat: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 2, justifyContent: 'center' },
});
