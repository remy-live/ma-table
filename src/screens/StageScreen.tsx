// Télécommande de scène : revenir à la balance, groupes en gros boutons,
// verrou contre les fausses manips, pause de la façade.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { i } from '../osc/osc';
import { BUS_COUNT, busNamePath, CH_COUNT, chDcaPath, dcaFaderPath, dcaNamePath, dcaOnPath, inDca, Target, targetId } from '../xair/addresses';
import { Group, moveMembers, snapshot as sendSnap } from '../xair/groups';
import { dbToFader, faderToDb } from '../xair/levels';
import { capture, changedCount, restore, Snapshot } from '../xair/snapshot';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import { Theme } from '../ui/theme';
import { MonConfig } from '../xair/monitor';
import { InviteSheet } from './InviteSheet';

const MIX_COLORS = ['#E8EAED', '#60A5FA', '#34D399', '#38BDF8', '#A3E635', '#FB923C', '#F87171'];

function useGroups(client: XAirClient): Group[] {
  const [tick, setTick] = useState(0);
  useEffect(() => client.on('*', (_v, p) => (p.endsWith('/grp/dca') || p.startsWith('/dca/')) && setTick((t) => t + 1)), [client]);
  const out: Group[] = [];
  for (let k = 1; k <= 4; k++) {
    const members = Array.from({ length: CH_COUNT }, (_, c) => c + 1).filter((ch) => inDca(Number(client.get(chDcaPath(ch)) ?? 0), k));
    if (members.length) out.push({ k, name: String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`, members });
  }
  void tick;
  return out;
}

export function StageScreen(props: { client: XAirClient; theme: Theme; locked: boolean; onToggleLock: () => void; onMonitor: (cfg: MonConfig) => void }) {
  const { client, theme } = props;
  const groups = useGroups(client);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [changed, setChanged] = useState(0);
  const [mix, setMix] = useState<Target>({ kind: 'main' });
  const [invite, setInvite] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const lrOn = Number(useParam<number>(client, '/lr/mix/on', 1)) === 1;

  useEffect(() => {
    load<Snapshot | null>('balance', null).then(setSnap);
  }, []);
  // Compte des réglages modifiés depuis la balance, recalculé chaque seconde.
  useEffect(() => {
    if (!snap) return;
    const t = setInterval(() => setChanged(changedCount(client, snap)), 1000);
    setChanged(changedCount(client, snap));
    return () => clearInterval(t);
  }, [client, snap]);

  const saveBalance = async () => {
    const s = await capture(client, 'Balance');
    setSnap(s);
    save('balance', s);
  };
  const askRestore = () => {
    if (!snap) return;
    Alert.alert('Revenir à la balance ?', `${changed} réglage${changed > 1 ? 's' : ''} vont reprendre leur valeur de ${hhmm(snap.at)}.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Revenir', onPress: () => restore(client, snap) },
    ]);
  };

  const mixes: Target[] = [{ kind: 'main' }, ...Array.from({ length: BUS_COUNT }, (_, n) => ({ kind: 'bus', n: n + 1 }) as Target)];
  const mixName = (t: Target) => (t.kind === 'main' ? 'Façade' : String(client.get(busNamePath((t as { n: number }).n)) ?? '') || `Retour ${(t as { n: number }).n}`);

  const nudge = (g: Group, db: number) => {
    if (mix.kind === 'main') {
      const cur = faderToDb(Number(client.get(dcaFaderPath(g.k)) ?? 0.75));
      client.set(dcaFaderPath(g.k), { t: 'f', v: dbToFader((isFinite(cur) ? cur : -30) + db) });
    } else {
      moveMembers(client, sendSnap(client, g.members, mix), mix, db);
      const key = targetId(mix) + g.k;
      setOffsets((o) => ({ ...o, [key]: (o[key] ?? 0) + db }));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text, flex: 1 }]}>Sur scène</Text>
        <Pressable
          onPress={props.onToggleLock}
          accessibilityRole="switch"
          accessibilityState={{ checked: props.locked }}
          style={[styles.lock, props.locked ? { backgroundColor: theme.accent } : { borderColor: theme.line2, borderWidth: 1 }]}
        >
          <Text style={{ color: props.locked ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{props.locked ? 'Verrouillé' : 'Déverrouillé'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <Text style={[styles.kicker, { color: theme.muted }]}>RÉGLAGE DU CONCERT</Text>
          {snap ? (
            <>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Balance de {hhmm(snap.at)}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{changed ? `${changed} réglage${changed > 1 ? 's' : ''} modifié${changed > 1 ? 's' : ''} depuis` : 'Identique à la balance'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <Pressable onPress={askRestore} disabled={!changed} style={[styles.btn, { borderColor: theme.accent, borderWidth: 1, opacity: changed ? 1 : 0.5 }]}>
                  <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 14 }}>Revenir à la balance</Text>
                </Pressable>
                <Pressable onPress={saveBalance} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1, flex: 0.8 }]}>
                  <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>Remplacer</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={{ color: theme.text, fontSize: 14 }}>Une fois la balance finie, garde ce réglage pour pouvoir y revenir d’un geste.</Text>
              <Pressable onPress={saveBalance} style={[styles.btn, { backgroundColor: theme.accent, marginTop: 6 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Enregistrer la balance</Text>
              </Pressable>
            </>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {mixes.map((t, k) => {
            const on = targetId(t) === targetId(mix);
            const c = MIX_COLORS[k] ?? theme.text;
            return (
              <Pressable key={targetId(t)} onPress={() => setMix(t)} accessibilityState={{ selected: on }} style={[styles.mix, on ? { backgroundColor: c } : { backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1 }]}>
                <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 14 }}>{mixName(t)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {groups.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Crée des groupes (bouton Groupes sur la table) pour les piloter ici en gros boutons.</Text>}
        <View style={styles.grid}>
          {groups.map((g) => (
            <GroupTile key={g.k} client={client} g={g} mix={mix} offset={offsets[targetId(mix) + g.k] ?? 0} theme={theme} onNudge={(d) => nudge(g, d)} />
          ))}
        </View>

        <Pressable onPress={() => setInvite(true)} style={[styles.card, { backgroundColor: '#13261E', borderColor: '#1F6F4A' }]}>
          <Text style={{ color: '#A7F3D0', fontSize: 16, fontWeight: '800' }}>Inviter un musicien</Text>
          <Text style={{ color: '#6EE7B7', fontSize: 12 }}>QR code : il règle son retour depuis son téléphone, et rien d’autre.</Text>
        </Pressable>

        <Pressable
          onPress={() => client.set('/lr/mix/on', i(lrOn ? 0 : 1))}
          style={[styles.pause, { borderColor: '#EF4444', backgroundColor: lrOn ? 'transparent' : '#EF4444' }]}
        >
          <Text style={{ color: lrOn ? '#FCA5A5' : '#1A0505', fontWeight: '800', fontSize: 15 }}>{lrOn ? 'Pause : couper la façade' : 'Reprendre le son'}</Text>
          <Text style={{ color: lrOn ? theme.muted : '#1A0505', fontSize: 11 }}>Les retours ne sont pas coupés</Text>
        </Pressable>
      </ScrollView>
      <InviteSheet client={client} theme={theme} visible={invite} onClose={() => setInvite(false)} onTryHere={(cfg) => { setInvite(false); props.onMonitor(cfg); }} />
    </View>
  );
}

function GroupTile(props: { client: XAirClient; g: Group; mix: Target; offset: number; theme: Theme; onNudge: (db: number) => void }) {
  const { client, g, mix, theme } = props;
  const fader = Number(useParam<number>(client, dcaFaderPath(g.k), 0.75));
  const on = Number(useParam<number>(client, dcaOnPath(g.k), 1)) === 1;
  const isMain = mix.kind === 'main';
  const db = isMain ? faderToDb(fader) : props.offset;
  const text = !on && isMain ? 'COUPÉ' : `${db > 0 ? '+' : ''}${isFinite(db) ? db.toFixed(0) : '-∞'} dB`;
  return (
    <View style={[styles.tile, { backgroundColor: !on && isMain ? '#2A1414' : theme.panel, borderColor: !on && isMain ? '#7F1D1D' : theme.line }]}>
      <Pressable
        onPress={() => isMain && client.set(dcaOnPath(g.k), i(on ? 0 : 1))}
        accessibilityRole="button"
        accessibilityLabel={isMain ? (on ? `Couper ${g.name}` : `Réactiver ${g.name}`) : g.name}
        style={styles.tileHead}
      >
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>
          {g.name}
        </Text>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{text}</Text>
      </Pressable>
      <Text style={{ color: theme.muted, fontSize: 11 }}>{isMain ? `${g.members.length} voies · toucher le nom pour couper` : `${g.members.length} voies · décalage dans ce retour`}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => props.onNudge(-2)} accessibilityLabel={`Baisser ${g.name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>−</Text>
        </Pressable>
        <Pressable onPress={() => props.onNudge(2)} accessibilityLabel={`Monter ${g.name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  lock: { height: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 2 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mix: { height: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.6%', borderRadius: 16, borderWidth: 1, padding: 10, gap: 6 },
  tileHead: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 6 },
  big: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pause: { borderWidth: 2, borderRadius: 14, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
