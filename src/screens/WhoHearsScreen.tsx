// « Qui entend quoi » : le routage en clair, lisible sur téléphone.
// Par personne : ce que chacun a dans les oreilles. Par source : où part un son.
// « Isoler » n'affiche qu'une seule carte.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { Target } from '../xair/addresses';
import { shift } from '../xair/monitor';
import { Dest, destinations, levelDb, levelPaths, shares, Src, sources, whoHearsPaths } from '../xair/whoHears';
import { XAirClient } from '../xair/XAirClient';

const PALETTE = ['#F472B6', '#2DD4BF', '#60A5FA', '#F59E0B', '#A3E635', '#FB923C', '#38BDF8', '#E879F9', '#FCD34D', '#94A3B8'];
const DEST_COLORS = ['#E8EAED', '#60A5FA', '#34D399', '#38BDF8', '#A3E635', '#FB923C', '#F87171'];
const dbText = (db: number) => (!isFinite(db) || db < -40 ? 'coupé' : (db > 0 ? '+' : '') + Math.round(db) + ' dB');

function useAnyChange(client: XAirClient) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = client.on('*', () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setTick((x) => x + 1);
      }, 80);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [client]);
  return tick;
}

export function WhoHearsScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const { client, theme } = props;
  useAnyChange(client);
  const [mode, setMode] = useState<'dest' | 'src'>('dest');
  const [open, setOpen] = useState<string | null>('main');
  const [iso, setIso] = useState<string | null>(null);
  const [unfold, setUnfold] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (props.visible) client.loadPaths(whoHearsPaths());
  }, [client, props.visible]);

  const dests = destinations(client);
  const srcs = sources(client);
  const colorOf = (s: Src) => (s.kind === 'fx' ? '#C084FC' : PALETTE[srcs.indexOf(s) % PALETTE.length] ?? '#94A3B8');

  const Stepper = (p: { paths: string[]; label: string; color: string; db: number; indent?: boolean; chev?: string; onTap?: () => void }) => (
    <View style={[styles.row, p.indent && { paddingLeft: 18 }]}>
      <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: p.color }} />
      <Pressable onPress={p.onTap} disabled={!p.onTap} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: p.indent ? 13 : 14, fontWeight: p.indent ? '600' : '700' }}>
          {p.label} {p.chev ? <Text style={{ color: theme.muted, fontSize: 11 }}>{p.chev}</Text> : null}
        </Text>
      </Pressable>
      <Pressable onPress={() => shift(client, p.paths, -2)} accessibilityLabel={`Moins de ${p.label}`} style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
        <Text style={[styles.pmText, { color: theme.text }]}>−</Text>
      </Pressable>
      <Text style={{ width: 56, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800' }}>{dbText(p.db)}</Text>
      <Pressable onPress={() => shift(client, p.paths, 2, true)} accessibilityLabel={`Plus de ${p.label}`} style={[styles.pm, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
        <Text style={[styles.pmText, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );

  const srcRows = (s: Src, t: Target, key: string) => {
    const paths = levelPaths(s, t);
    const isG = s.kind === 'group';
    const u = !!unfold[key + s.id];
    return (
      <View key={s.id}>
        <Stepper paths={paths} label={s.label} color={colorOf(s)} db={levelDb(client, paths)} chev={isG ? `${u ? '▴' : '▾'} ${s.channels.length} voies` : undefined} onTap={isG ? () => setUnfold((x) => ({ ...x, [key + s.id]: !u })) : undefined} />
        {isG && u && s.members!.map((m) => {
          const mp = levelPaths(m, t);
          return <Stepper key={m.id} paths={mp} label={m.label} color={colorOf(s)} db={levelDb(client, mp)} indent />;
        })}
      </View>
    );
  };

  const IsoBtn = ({ id }: { id: string }) => (
    <Pressable onPress={() => setIso(iso === id ? null : id)} style={[styles.iso, { borderColor: iso === id ? '#FBBF24' : theme.line2 }]}>
      <Text style={{ color: iso === id ? '#FBBF24' : theme.muted, fontSize: 11, fontWeight: '800' }}>{iso === id ? 'Tout voir' : 'Isoler'}</Text>
    </Pressable>
  );

  const destCard = (d: Dest, idx: number) => {
    const sh = shares(client, srcs, d.t).filter((r) => r.share > 0.005);
    const isOpen = open === d.id || iso === d.id;
    const c = DEST_COLORS[idx] ?? theme.text;
    return (
      <View key={d.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: isOpen ? c : theme.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => setOpen(isOpen ? null : d.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }} accessibilityState={{ expanded: isOpen }}>
            <View style={[styles.avatar, { backgroundColor: c }]}>
              <Text style={{ color: '#0B0D10', fontWeight: '800', fontSize: 12 }}>{d.name.slice(0, 3).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{d.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{d.sub}</Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>{isOpen ? 'Fermer ▴' : 'Régler ▾'}</Text>
          </Pressable>
          <IsoBtn id={d.id} />
        </View>
        <View style={{ flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.meterBg }}>
          {sh.map((r) => (
            <View key={r.src.id} style={{ width: `${r.share * 100}%`, backgroundColor: colorOf(r.src), borderRightWidth: 2, borderRightColor: theme.panel }} />
          ))}
        </View>
        {sh.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 12 }}>N’entend rien pour l’instant.</Text>
        ) : (
          <Text style={{ color: theme.muted, fontSize: 11 }}>{sh.sort((a, b) => b.share - a.share).slice(0, 5).map((r) => `${r.src.label} ${Math.round(r.share * 100)} %`).join(' · ')}</Text>
        )}
        {isOpen && <View style={{ borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 6 }}>{srcs.map((s) => srcRows(s, d.t, d.id))}</View>}
      </View>
    );
  };

  const srcCard = (s: Src) => {
    const isOpen = open === s.id || iso === s.id;
    const heard = dests.map((d, k) => ({ d, k, db: levelDb(client, levelPaths(s, d.t)) }));
    return (
      <View key={s.id} style={[styles.card, { backgroundColor: theme.panel, borderColor: isOpen ? colorOf(s) : theme.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => setOpen(isOpen ? null : s.id)} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
              {s.label}
              {s.kind === 'group' ? <Text style={{ color: theme.muted, fontSize: 12 }}> · groupe de {s.channels.length}</Text> : null}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{s.kind === 'ch' ? `Prise ${s.channels[0]} → voie ${s.channels[0]}` : s.kind === 'fx' ? 'Effet interne' : `Voies ${s.channels.join(', ')}`}</Text>
          </Pressable>
          <IsoBtn id={s.id} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {heard.filter((h) => isFinite(h.db) && h.db > -40).map((h) => (
            <View key={h.d.id} style={[styles.tag, { borderColor: DEST_COLORS[h.k] ?? theme.line2 }]}>
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>
                {h.d.name} {dbText(h.db)}
              </Text>
            </View>
          ))}
          {!heard.some((h) => isFinite(h.db) && h.db > -40) && <Text style={{ color: theme.muted, fontSize: 12 }}>Personne ne l’entend.</Text>}
        </View>
        {isOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 6 }}>
            {heard.map((h) => {
              const paths = levelPaths(s, h.d.t);
              return <Stepper key={h.d.id} paths={paths} label={h.d.name} color={DEST_COLORS[h.k] ?? theme.text} db={h.db} />;
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Qui entend quoi</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Le routage en clair : rien à rebrancher</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 15 }}>Terminé</Text>
          </Pressable>
        </View>
        <View style={[styles.seg, { borderColor: theme.line2 }]}>
          {(
            [
              ['dest', 'Par personne'],
              ['src', 'Par source'],
            ] as const
          ).map(([m, l]) => (
            <Pressable key={m} onPress={() => { setMode(m); setIso(null); setOpen(null); }} style={[styles.segBtn, mode === m && { backgroundColor: theme.accent }]}>
              <Text style={{ color: mode === m ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 14 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 40 }}>
          {mode === 'dest' ? dests.filter((d) => !iso || d.id === iso).map(destCard) : srcs.filter((s) => !iso || s.id === iso).map(srcCard)}
          <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>
            Sur la XR16, la prise n°5 va toujours sur la voie 5 et chaque retour sort sur sa prise AUX. Ici on choisit seulement qui entend quoi, et combien.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segBtn: { flex: 1, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  pm: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pmText: { fontSize: 20, fontWeight: '800' },
  iso: { height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  tag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
});
