// Télécommande de scène : revenir à la balance, groupes en gros boutons,
// verrou contre les fausses manips, pause de la façade.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { f, i } from '../osc/osc';
import { chColorOf, colorOf } from '../xair/smartName';
import { GROUP_COLORS } from './GroupsSheet';
import { Btn, Card, ScreenHeader, SEM, Segmented } from '../ui/kit';
import { Current, current, safetyBackup, saveCurrentSession } from '../store/sessions';
import { SessionsScreen } from './SessionsScreen';
import { MIX_COLORS } from './MixPicker';
import { useAnyTick } from '../ui/useTick';
import { BUS_COUNT, busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, dcaFaderPath, dcaNamePath, dcaOnPath, inDca, Target, targetId } from '../xair/addresses';
import { Group, moveMembers, snapshot as sendSnap } from '../xair/groups';
import { dbToFader, faderToDb } from '../xair/levels';
import { changedCount, restore, Snapshot } from '../xair/snapshot';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';
import { load } from '../store/persist';
import { Theme } from '../ui/theme';
import { MonConfig } from '../xair/monitor';
import { InviteSheet } from './InviteSheet';
import { ChecklistSheet, ClipHistoryCard, JournalSheet, RescueButton } from './ConcertExtras';
import { InputSheet } from './InputSheet';
import { StagePlanSheet } from './StagePlanSheet';


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
  useAnyTick(client, 150);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [changed, setChanged] = useState(0);
  const [mix, setMix] = useState<Target>({ kind: 'main' });
  const [invite, setInvite] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [openG, setOpenG] = useState<number[]>([]);
  const [gainCh, setGainCh] = useState<number | null>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [cur, setCur] = useState<Current | null>(null);
  const [sessOpen, setSessOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lrOn = Number(useParam<number>(client, '/lr/mix/on', 1)) === 1;

  const reload = () => { load<Snapshot | null>('balance', null).then(setSnap); current().then(setCur); };
  useEffect(reload, []);
  // Compte des réglages modifiés depuis la balance, recalculé chaque seconde.
  useEffect(() => {
    if (!snap) return;
    const t = setInterval(() => setChanged(changedCount(client, snap)), 1000);
    setChanged(changedCount(client, snap));
    return () => clearInterval(t);
  }, [client, snap]);

  // Un seul geste : enregistrer la soirée fixe aussi le point de retour.
  const saveNow = async () => {
    setBusy(true);
    try { const sess = await saveCurrentSession(client); setSnap(sess.snap); } finally { setBusy(false); }
  };
  const askRestore = () => {
    if (!snap) return;
    Alert.alert('Revenir à l’enregistrement ?', `${changed} réglage${changed > 1 ? 's' : ''} vont reprendre leur valeur de ${hhmm(snap.at)}.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Revenir', onPress: () => { safetyBackup(client, 'avant de revenir à l’enregistrement').catch(() => {}); restore(client, snap); } },
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

  const wide = useWindowDimensions().width >= 900;
  const grouped = new Set(groups.flatMap((g) => g.members));
  const solos = Array.from({ length: CH_COUNT }, (_, c) => c + 1).filter((c) => !grouped.has(c) && !!String(client.get(chNamePath(c)) ?? ''));
  const mixColor = (t: Target) => MIX_COLORS[mixes.findIndex((m) => targetId(m) === targetId(t))] ?? theme.text;
  const nudgeCh = (c: number, db: number) => {
    const p = chLevelPath(c, mix);
    const v = Number(client.get(p) ?? 0);
    const d = faderToDb(v);
    const n = (isFinite(d) && v > 0 ? d : -30) + db;
    client.set(p, f(n < -50 ? 0 : dbToFader(Math.min(10, n))));
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader theme={theme} title="Concert" sub="Ta soirée et la télécommande : gros boutons, l’essentiel seulement">
        <Segmented theme={theme} value={props.locked ? 'concert' : 'balance'} onChange={(v) => { if ((v === 'concert') !== props.locked) props.onToggleLock(); }} options={[['balance', '🎚 Balance', 'je règle tout'], ['concert', '🔒 Concert', 'pas de fausse manip']] as const} />
      </ScreenHeader>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
          {/* 1. MA SOIRÉE : enregistrer, revenir, changer */}
          <Card theme={theme} style={{ flex: 1 }}>
            <Step n={1} title="Ma soirée" theme={theme} />
            <Pressable onPress={() => setSessOpen(true)} accessibilityLabel="Renommer, changer de soirée, sauvegardes">
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{cur?.name ?? '…'} <Text style={{ color: theme.muted, fontSize: 13 }}>✎</Text></Text>
            </Pressable>
            <Text style={{ color: !snap ? theme.muted : changed ? SEM.warnSoft : theme.ok, fontSize: 12, fontWeight: '700' }}>
              {!snap ? 'Pas encore enregistrée. Quand le son est bon, enregistre : tu pourras y revenir d’un geste.' : changed ? `Enregistrée à ${hhmm(snap.at)} · ${changed} réglage${changed > 1 ? 's' : ''} bougé${changed > 1 ? 's' : ''} depuis` : `✓ Enregistrée à ${hhmm(snap.at)} · rien n’a bougé`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn theme={theme} kind={!snap || changed ? 'primary' : 'outline'} icon="💾" label={busy ? '…' : 'Enregistrer'} onPress={saveNow} style={{ flex: 1 }} />
              <Btn theme={theme} icon="↺" label="Revenir" a11y="Revenir à l’enregistrement" disabled={!snap || !changed} onPress={askRestore} style={{ flex: 1 }} />
            </View>
            <Btn theme={theme} kind="ghost" small label="Nouvelle soirée · anciennes soirées · sauvegardes ›" onPress={() => setSessOpen(true)} />
          </Card>
          {/* 3. URGENCES */}
          <View style={[styles.card, { flex: 1, backgroundColor: theme.panel, borderColor: '#7F1D1D' }]}>
            <Step n="!" title="En cas de problème" theme={theme} color="#EF4444" />
            <RescueButton client={client} theme={theme} />
            <Pressable onPress={() => client.set('/lr/mix/on', i(lrOn ? 0 : 1))} style={[styles.pause, { borderColor: '#EF4444', backgroundColor: lrOn ? 'transparent' : '#EF4444' }]}>
              <Text style={{ color: lrOn ? '#FCA5A5' : '#1A0505', fontWeight: '800', fontSize: 15 }}>{lrOn ? '⏸ Pause : couper la façade' : '▶ Remettre le son'}</Text>
              <Text style={{ color: lrOn ? theme.muted : '#1A0505', fontSize: 11 }}>les retours des musiciens continuent</Text>
            </Pressable>
          </View>
        </View>

        <ClipHistoryCard client={client} theme={theme} onOpen={setGainCh} />

        {/* 2. PENDANT */}
        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: mixColor(mix) }]}>
          <Step n={2} title="Pendant : plus fort / moins fort" theme={theme} />
          <Text style={{ color: theme.muted, fontSize: 12 }}>D’abord : pour qui ?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {mixes.map((t, k) => {
              const on = targetId(t) === targetId(mix);
              const c = MIX_COLORS[k] ?? theme.text;
              return (
                <Pressable key={targetId(t)} onPress={() => setMix(t)} accessibilityState={{ selected: on }} style={[styles.mix, on ? { backgroundColor: c, borderColor: c } : { backgroundColor: theme.deep, borderColor: c }]}>
                  <Text style={{ color: on ? '#0B0D10' : theme.text, fontWeight: '800', fontSize: 14 }}>{t.kind === 'main' ? '👥 Le public' : `🎧 ${mixName(t)}`}</Text>
                  <Text style={{ color: on ? '#0B0D10' : theme.muted, fontSize: 10 }}>{t.kind === 'main' ? 'façade' : `retour ${(t as { n: number }).n}`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Puis : quoi ? <Text style={{ color: theme.muted, fontWeight: '600', fontSize: 12 }}>(chaque appui = 2 dB)</Text></Text>
          {groups.length === 0 && solos.length === 0 && <Text style={{ color: theme.muted, fontSize: 13 }}>Nomme tes voies ou crée des groupes (Table › Groupes) pour les voir ici.</Text>}
          <View style={styles.grid}>
            {groups.map((g) => (
              <React.Fragment key={'g' + g.k}>
                <GroupTile client={client} g={g} mix={mix} theme={theme} wide={wide} onNudge={(d) => nudge(g, d)} open={openG.includes(g.k)} onToggle={() => setOpenG((o) => (o.includes(g.k) ? o.filter((x) => x !== g.k) : [...o, g.k]))} />
                {/* groupe déplié : chaque voie du groupe se règle à part */}
                {openG.includes(g.k) && g.members.map((c) => <ChTile key={'gm' + c} client={client} ch={c} mix={mix} theme={theme} wide={wide} onNudge={(d) => nudgeCh(c, d)} />)}
              </React.Fragment>
            ))}
            {solos.map((c) => <ChTile key={c} client={client} ch={c} mix={mix} theme={theme} wide={wide} onNudge={(d) => nudgeCh(c, d)} />)}
          </View>
        </View>

        {/* 4. OUTILS */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable onPress={() => setInvite(true)} style={[styles.card, styles.tool, { backgroundColor: '#13261E', borderColor: '#1F6F4A' }]}>
            <Text style={{ color: '#A7F3D0', fontSize: 15, fontWeight: '800' }}>📱 Inviter un musicien</Text>
            <Text style={{ color: '#6EE7B7', fontSize: 11 }}>QR code : il règle son retour lui-même</Text>
          </Pressable>
          <Pressable onPress={() => setCheckOpen(true)} style={[styles.card, styles.tool, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>✅ Check-list</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }}>tout est prêt avant de jouer ?</Text>
          </Pressable>
          <Pressable onPress={() => setPlanOpen(true)} style={[styles.card, styles.tool, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>🗺 Plan de scène</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }}>qui est branché où · à partager</Text>
          </Pressable>
          <Pressable onPress={() => setJournalOpen(true)} style={[styles.card, styles.tool, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>📓 Journal</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }}>qui a changé quoi, et quand</Text>
          </Pressable>
        </View>
      </ScrollView>
      <SessionsScreen client={client} theme={theme} visible={sessOpen} onClose={() => { setSessOpen(false); reload(); }} />
      <ChecklistSheet client={client} theme={theme} visible={checkOpen} onClose={() => setCheckOpen(false)} />
      <JournalSheet theme={theme} visible={journalOpen} onClose={() => setJournalOpen(false)} />
      <InputSheet client={client} ch={gainCh} theme={theme} onClose={() => setGainCh(null)} />
      <StagePlanSheet client={client} theme={theme} visible={planOpen} onClose={() => setPlanOpen(false)} />
      <InviteSheet client={client} theme={theme} visible={invite} onClose={() => setInvite(false)} onTryHere={(cfg) => { setInvite(false); props.onMonitor(cfg); }} />
    </View>
  );
}

function Step({ n, title, theme, color }: { n: number | string; title: string; theme: Theme; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color ?? theme.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#0B0B0F', fontWeight: '900' }}>{n}</Text></View>
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function Level({ v, color, theme }: { v: number; color: string; theme: Theme }) {
  const d = faderToDb(v);
  const pct = !isFinite(d) || v <= 0 ? 0 : Math.max(3, Math.min(100, ((d + 50) / 60) * 100));
  return (
    <View style={{ height: 12, borderRadius: 6, backgroundColor: theme.meterBg, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 12, backgroundColor: color }} />
    </View>
  );
}

function ChTile(props: { client: XAirClient; ch: number; mix: Target; theme: Theme; wide: boolean; onNudge: (db: number) => void }) {
  const { client, ch, mix, theme } = props;
  const v = Number(useParam<number>(client, chLevelPath(ch, mix), 0));
  const name = String(useParam<string>(client, chNamePath(ch), '')) || `Voie ${ch}`;
  const col = chColorOf(Number(useParam<number>(client, `/ch/${String(ch).padStart(2, '0')}/config/color`, 0)), ch);
  const d = faderToDb(v);
  return (
    <View style={[styles.tile, { width: props.wide ? '24%' : '48.6%', backgroundColor: theme.deep, borderColor: col }]}>
      <View style={styles.tileHead}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{!isFinite(d) || v <= 0 ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(0)} dB`}</Text>
      </View>
      <Level v={v} color={col} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => props.onNudge(-2)} accessibilityLabel={`Baisser ${name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.panel }]}><Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>−</Text></Pressable>
        <Pressable onPress={() => props.onNudge(2)} accessibilityLabel={`Monter ${name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.panel }]}><Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>+</Text></Pressable>
      </View>
    </View>
  );
}

function GroupTile(props: { client: XAirClient; g: Group; mix: Target; theme: Theme; wide: boolean; onNudge: (db: number) => void; open?: boolean; onToggle?: () => void }) {
  const { client, g, mix, theme } = props;
  const fader = Number(useParam<number>(client, dcaFaderPath(g.k), 0.75));
  const on = Number(useParam<number>(client, dcaOnPath(g.k), 1)) === 1;
  const isMain = mix.kind === 'main';
  // pour un retour : niveau moyen des membres dans ce retour
  const sends = g.members.map((c) => Number(client.get(chLevelPath(c, mix)) ?? 0)).filter((x) => x > 0);
  const avg = sends.length ? sends.reduce((a, b) => a + b, 0) / sends.length : 0;
  const v = isMain ? fader : avg;
  const d = faderToDb(v);
  const gc = GROUP_COLORS[g.k - 1] ?? '#F59E0B';
  const text = !on && isMain ? 'COUPÉ' : !isFinite(d) || v <= 0 ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(0)} dB`;
  return (
    <View style={[styles.tile, { width: props.wide ? '24%' : '48.6%', backgroundColor: !on && isMain ? '#2A1414' : theme.deep, borderColor: !on && isMain ? '#7F1D1D' : gc, borderWidth: 2 }]}>
      <View style={styles.tileHead}>
        <Text style={{ color: gc, fontWeight: '900', fontSize: 10 }}>GROUPE</Text>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>{g.name}</Text>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{text}</Text>
      </View>
      <Level v={v} color={gc} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => props.onNudge(-2)} accessibilityLabel={`Baisser ${g.name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.panel }]}><Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>−</Text></Pressable>
        <Pressable onPress={() => props.onNudge(2)} accessibilityLabel={`Monter ${g.name}`} style={[styles.big, { borderColor: theme.line2, backgroundColor: theme.panel }]}><Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>+</Text></Pressable>
        {isMain && (
          <Pressable onPress={() => client.set(dcaOnPath(g.k), i(on ? 0 : 1))} style={[styles.big, { flex: 0.8, borderColor: on ? theme.line2 : theme.mute, backgroundColor: on ? theme.panel : theme.mute }]}>
            <Text style={{ color: on ? theme.text : theme.onMute, fontSize: 12, fontWeight: '800' }}>{on ? 'Couper' : 'Coupé'}</Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={props.onToggle} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: !!props.open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30 }}>
        <Text style={{ color: gc, fontSize: 13, fontWeight: '900' }}>{props.open ? '◂ Replier' : 'Déplier ▸'}</Text>
        <Text style={{ color: theme.muted, fontSize: 11 }}>{g.members.length} voies{props.open ? ' · chacune se règle à part' : isMain ? '' : ' · toutes bougent ensemble'}</Text>
      </Pressable>
    </View>
  );
}

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
  segBtn: { minHeight: 48, paddingHorizontal: 14, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tool: { flexGrow: 1, flexBasis: 220 },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mix: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.6%', borderRadius: 16, borderWidth: 1, padding: 10, gap: 6 },
  tileHead: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 6 },
  big: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pause: { borderWidth: 2, borderRadius: 14, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
