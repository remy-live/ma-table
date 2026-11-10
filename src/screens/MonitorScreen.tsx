// Mode « Mon retour » : l'écran du musicien. Il ne règle QUE son bus.
// Gros boutons « Plus de moi » / « Plus des autres », groupes dépliables,
// protège-oreilles, et sa balance à lui (gardée avec le numéro du bus).
import { DragBar } from '../ui/DragBar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { f } from '../osc/osc';
import { load, save } from '../store/persist';
import { HSlider } from '../ui/HSlider';
import { Theme } from '../ui/theme';
import { formatDb } from '../xair/levels';
import {
  busFaderPath, busMeter, captureMonitor, limiterOn, MonBalance, MonConfig, monitorChanges, monitorGroups, monitorPaths,
  monitorSources, MonSource, pathsOf, plusDeMoi, plusDesAutres, restoreMonitor, setLimiter, setTo, shift, sourceDb,
} from '../xair/monitor';
import { useMeter } from '../xair/useMeter';
import { useParam } from '../xair/useParam';
import { XAirClient } from '../xair/XAirClient';

const ME = '#34D399';
const dbText = (db: number) => (!isFinite(db) || db < -40 ? 'coupé' : (db > 0 ? '+' : '') + Math.round(db) + ' dB');
const GROUP = '#F59E0B';

/** Re-dessine quand un envoi de CE bus (ou un nom, un groupe, un lien) change — au plus 20 fois/s. */
function useBusTick(client: XAirClient, bus: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const tag = `/mix/${bus < 10 ? '0' + bus : bus}/level`;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const off = client.on('*', (_v, p) => {
      if (!(p.includes(tag) || p.endsWith('/config/name') || p.endsWith('/grp/dca') || p.startsWith('/config/chlink') || p.startsWith(`/bus/${bus}/`))) return;
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        setTick((t) => t + 1);
      }, 50);
    });
    return () => {
      off();
      if (pending) clearTimeout(pending);
    };
  }, [client, bus]);
  return tick;
}

export function MonitorScreen(props: { client: XAirClient; cfg: MonConfig; theme: Theme; onExit: () => void; owner?: boolean; onWho?: () => void }) {
  const { client, cfg, theme } = props;
  const { bus, rights } = cfg;
  const tick = useBusTick(client, bus);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState('');
  const [bal, setBal] = useState<MonBalance | null>(null);
  const [eco, setEco] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busName = String(useParam<string>(client, `/bus/${bus}/config/name`, '')) || `Retour ${bus}`;
  const master = Number(useParam<number>(client, busFaderPath(bus), 0.75));
  const lim = limiterOn(client, bus);
  const [listH, setListH] = useState(0);
  const [nItems, setNItems] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const fit = (() => {
    if (!listH || !nItems) return { h: 56, two: false, scroll: false };
    const one = Math.floor(listH / nItems);
    if (one >= 40) return { h: Math.min(56, one), two: false, scroll: false };
    const two = Math.floor(listH / Math.ceil(nItems / 2));
    if (two >= 38) return { h: Math.min(60, two), two: true, scroll: false };
    return { h: 40, two: true, scroll: true };
  })();
  const meter = useMeter(client, [busMeter(bus)], eco ? 400 : 150);

  useEffect(() => {
    client.loadPaths(monitorPaths(bus));
    client.startMeters();
    load<MonBalance | null>(`retour:${bus}`, null).then((b) => setBal(b && b.bus === bus ? b : null));
  }, [client, bus]);

  const sources = useMemo(() => monitorSources(client, bus, rights.fx), [client, bus, rights.fx, tick]);
  const mine = sources.filter((s) => s.channels.some((c) => cfg.me.includes(c)));
  const others = sources.filter((s) => !mine.includes(s));
  const { groups, loose } = useMemo(() => (rights.groups ? monitorGroups(client, others) : { groups: [], loose: others }), [client, others, rights.groups]);
  const changes = bal ? monitorChanges(client, bal) : 0;

  const say = (t: string) => {
    void t; setToast('');
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 1800);
  };

  const meDb = mine.length ? Math.max(...mine.map((s) => sourceDb(client, s))) : -Infinity;

  const doSave = async () => {
    const b = captureMonitor(client, bus, sources);
    setBal(b);
    await save(`retour:${bus}`, b);
    say(`Gardé pour ${busName} (bus ${bus})`);
  };
  const doRestore = () => {
    if (!bal) return;
    Alert.alert('Revenir à ta balance ?', `${changes} réglage${changes > 1 ? 's' : ''} de ${busName} vont reprendre leur valeur.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Revenir', onPress: () => (restoreMonitor(client, bal, bus) ? say('Retour à ta balance') : say('Cette balance est celle d’un autre retour')) },
    ]);
  };
  const toggleLim = () => {
    if (lim && !rights.limiterOff) {
      Alert.alert('Protège-oreilles', 'Seul le sondier peut le couper. Il évite qu’un larsen ou un coup de caisse claire te fasse mal.');
      return;
    }
    setLimiter(client, bus, !lim);
    say(lim ? 'Protège-oreilles coupé : attention au volume' : `Protège-oreilles actif : limite ${-6} dB`);
  };
  const askExit = () =>
    Alert.alert('Quitter le mode retour ?', props.owner ? 'Tu retournes à la console complète.' : 'Le téléphone se déconnecte de la table.', [
      { text: 'Rester', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: props.onExit },
    ]);

  const lit = Math.round(meter.level * 20);
  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: '#60A5FA' }]}>
          <Text style={styles.avatarText}>{(busName || cfg.name).slice(0, 3).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>Ton retour : {busName}</Text>
          <Pressable onPress={props.onWho} disabled={!props.onWho} hitSlop={8}>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              AUX {bus}{props.onWho ? <Text style={{ color: theme.accent, fontWeight: '800' }}> · ce n’est pas moi ›</Text> : null}
            </Text>
          </Pressable>
        </View>
        <Pressable onLongPress={askExit} delayLongPress={600} onPress={() => say('Appui long pour quitter')} style={[styles.lockChip, { borderColor: theme.line, backgroundColor: theme.panel }]} accessibilityLabel={`Verrouillé sur le retour ${bus}. Appui long pour quitter.`}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>🔒 AUX {bus}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700', width: 74 }}>Dans le casque</Text>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2, height: 14 }} accessibilityLabel={`Niveau du casque ${dbText(meter.db)}`}>
            {Array.from({ length: 20 }, (_, k) => (
              <View key={k} style={{ flex: 1, borderRadius: 2, backgroundColor: k >= lit ? theme.track : k >= 18 ? (lim ? GROUP : '#EF4444') : k >= 14 ? '#FCD34D' : ME }} />
            ))}
          </View>
          <Text style={{ width: 62, textAlign: 'right', fontSize: 12, fontWeight: '800', color: lim && lit >= 18 ? GROUP : lit >= 18 ? '#EF4444' : ME }}>
            {lim && lit >= 18 ? 'limité' : lit >= 18 ? 'trop fort' : 'OK'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            disabled={!mine.length}
            onPress={() => {
              plusDeMoi(client, sources, cfg.me);
              say('Toi +2 dB dans ton casque');
            }}
            style={[styles.big, { backgroundColor: ME, opacity: mine.length ? 1 : 0.4 }]}
          >
            <Text style={styles.bigText}>Plus de moi</Text>
            <Text style={styles.bigSub}>{mine.length ? `${mine.map((s) => s.label).join(' + ')} ${dbText(meDb)}` : 'choisis tes voies'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              plusDesAutres(client, sources, cfg.me);
              say('Tout le reste +2 dB · toi, tu ne bouges pas');
            }}
            style={[styles.big, { borderColor: ME, borderWidth: 2 }]}
          >
            <Text style={[styles.bigText, { color: '#A7F3D0' }]}>Plus des autres</Text>
            <Text style={[styles.bigSub, { color: '#6EE7B7' }]}>tout le reste</Text>
          </Pressable>
        </View>
        <HSlider
          value={master}
          onChange={(v) => client.set(busFaderPath(bus), f(v))}
          label="Volume"
          valueText={formatDb(master) + ' dB'}
          color={ME}
          theme={theme}
        />
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.kicker, { color: theme.muted }]}>CE QUE J’ENTENDS</Text>
        {groups.length > 0 && <Text style={{ color: theme.muted, fontSize: 11 }}>touche un groupe pour le déplier</Text>}
      </View>
      {(() => {
        // tout tient sur l'écran : les lignes se resserrent, puis passent sur deux colonnes
        const items: React.ReactNode[] = [];
        mine.forEach((s) => items.push(<SourceRow key={s.id} client={client} s={s} theme={theme} color="#60A5FA" me h={fit.h} two={fit.two} />));
        groups.forEach((g) => {
          const isOpen = !!open[g.k];
          const all = pathsOf(g.sources);
          const db = Math.max(...g.sources.map((s) => sourceDb(client, s)));
          items.push(
            <Row key={'g' + g.k} theme={theme} name={g.name} color={GROUP} bold db={db} h={fit.h} two={fit.two}
              chev={isOpen ? '▴' : `▾ ${g.sources.length}`}
              onTap={() => setOpen((o) => ({ ...o, [g.k]: !isOpen }))}
              onDown={() => shift(client, all, -2)}
              onUp={() => shift(client, all, 2, true)}
              onSet={(t) => setTo(client, all, t)} />,
          );
          if (isOpen) g.sources.forEach((s) => items.push(<SourceRow key={'gs' + s.id} client={client} s={s} theme={theme} color="#FCD34D" indent h={fit.h} two={fit.two} />));
        });
        // les voies sans nom que tu n'entends pas sont rangées derrière un bouton
        const quiet = (s: MonSource) => /^(Voie|Entrée) /.test(s.label) && !(sourceDb(client, s) > -40);
        const hidden = loose.filter(quiet);
        loose.filter((s) => showAll || !quiet(s)).forEach((s) => items.push(<SourceRow key={s.id} client={client} s={s} theme={theme} color={s.id.startsWith('fx') ? '#C084FC' : theme.muted} h={fit.h} two={fit.two} />));
        if (hidden.length) items.push(
          <Pressable key="more" onPress={() => setShowAll((x) => !x)} style={{ height: fit.h, width: fit.two ? '48.5%' : '100%', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '800' }}>{showAll ? '▴ Ranger les voies muettes' : `▾ ${hidden.length} autre${hidden.length > 1 ? 's' : ''} voie${hidden.length > 1 ? 's' : ''} (coupée${hidden.length > 1 ? 's' : ''})`}</Text>
          </Pressable>,
        );
        if (items.length !== nItems) setTimeout(() => setNItems(items.length), 0);
        const wrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: 8, paddingHorizontal: 14 };
        return (
          <View style={{ flex: 1 }} onLayout={(e) => setListH(e.nativeEvent.layout.height)}>
            {fit.scroll
              ? <ScrollView contentContainerStyle={[wrap, { paddingBottom: 8 }]}>{items}</ScrollView>
              : <View style={wrap}>{items}</View>}
          </View>
        );
      })()}

      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 6 }}>
        <Pressable onPress={toggleLim} accessibilityRole="switch" accessibilityState={{ checked: lim }} style={[styles.foot, { borderColor: lim ? ME : '#EF4444', backgroundColor: lim ? '#13261E' : '#2A1416' }]}>
          <Text style={[styles.footText, { color: theme.text }]}>Protège-oreilles</Text>
          <Text style={{ color: theme.muted, fontSize: 11 }}>{lim ? 'actif · limite −6 dB' : 'coupé'}</Text>
        </Pressable>
        <Pressable onPress={doRestore} disabled={!bal || !changes} style={[styles.foot, { borderColor: theme.line2, backgroundColor: theme.panel, opacity: bal && changes ? 1 : 0.55 }]}>
          <Text style={[styles.footText, { color: theme.text }]}>Revenir à ma balance</Text>
          <Text style={{ color: theme.muted, fontSize: 11 }}>{!bal ? 'pas encore gardée' : changes ? `${changes} changement${changes > 1 ? 's' : ''}` : 'rien n’a bougé'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, margin: 14, marginTop: 8 }}>
        {rights.save && (
          <Pressable onPress={doSave} style={[styles.save, { backgroundColor: theme.accent, flex: 1 }]}>
            <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 14 }}>Garder comme ma balance</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setEco((e) => !e)} accessibilityRole="switch" accessibilityState={{ checked: eco }} style={[styles.save, { borderWidth: 1, borderColor: eco ? ME : theme.line2, paddingHorizontal: 12 }]}>
          <Text style={{ color: eco ? ME : theme.muted, fontWeight: '700', fontSize: 12 }}>{eco ? 'Éco ✓' : 'Éco'}</Text>
        </Pressable>
      </View>

      {!!toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function SourceRow(props: { client: XAirClient; s: MonSource; theme: Theme; color: string; me?: boolean; indent?: boolean; h?: number; two?: boolean }) {
  const { client, s } = props;
  const db = sourceDb(client, s);
  return (
    <Row
      theme={props.theme}
      name={(s.stereo && s.channels.length === 2 ? '◖◗ ' : '') + s.label}
      color={props.color}
      db={db}
      me={props.me}
      bold={props.me}
      indent={props.indent}
      h={props.h}
      two={props.two}
      onDown={() => shift(client, s.paths, -2)}
      onUp={() => shift(client, s.paths, 2, true)}
      onSet={(t) => setTo(client, s.paths, t)}
    />
  );
}

function Row(props: { theme: Theme; name: string; color: string; db: number; chev?: string; me?: boolean; bold?: boolean; indent?: boolean; onTap?: () => void; onDown: () => void; onUp: () => void; onSet?: (db: number) => void; h?: number; two?: boolean }) {
  const { theme, db } = props;
  const h = props.h ?? 56;
  const bs = props.two ? Math.max(30, Math.min(38, h - 6)) : Math.max(34, Math.min(48, h - 6)); // taille des boutons − / +
  const dbT = !isFinite(db) || db < -40 ? 'coupé' : dbText(db);
  const pct = !isFinite(db) || db < -40 ? 0 : Math.max(3, Math.round(((db + 30) / 40) * 100));
  return (
    <View style={[styles.row, { minHeight: h, height: h, gap: props.two ? 4 : 8, width: props.two ? '48.5%' : '100%' }, props.indent && { paddingLeft: props.two ? 6 : 18 }]}>
      <Pressable onPress={props.onTap} disabled={!props.onTap} accessibilityState={props.onTap ? { expanded: props.chev?.startsWith('▴') } : undefined} style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: h < 48 ? 3 : 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: props.color }} />
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: props.two ? 12 : props.indent ? 13 : 15, fontWeight: props.bold ? '800' : props.indent ? '600' : '700', flexShrink: 1 }}>
            {props.name}
          </Text>
          {!!props.chev && <Text style={{ color: theme.muted, fontSize: 11 }}>{props.chev}</Text>}
          {props.me && !props.two && (
            <View style={{ backgroundColor: ME, borderRadius: 6, paddingHorizontal: 6 }}>
              <Text style={{ color: '#052E1F', fontSize: 10, fontWeight: '800' }}>MOI</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {props.onSet ? (
            <DragBar frac={pct / 100} onFrac={(x) => props.onSet?.(x < 0.03 ? -99 : x * 40 - 30)} color={props.color} bg={theme.meterBg} barH={props.two ? 6 : 8} style={{ height: Math.max(22, Math.min(34, h / 2 - 4)) }} label={`Niveau de ${props.name}`} valueText={dbT} />
          ) : (
          <View style={{ flex: 1, height: props.two ? 6 : 8, borderRadius: 4, backgroundColor: theme.meterBg, overflow: 'hidden' }}>
            <View style={{ height: props.two ? 6 : 8, width: `${pct}%`, backgroundColor: props.color, borderRadius: 4 }} />
          </View>
          )}
          {props.two && <Text style={{ color: theme.muted, fontSize: 9.5, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{dbT}</Text>}
        </View>
      </Pressable>
      <Pressable onPress={props.onDown} accessibilityLabel={`Moins de ${props.name}`} style={[styles.pm, { width: bs, height: bs, borderColor: theme.line2, backgroundColor: theme.deep }]}>
        <Text style={[styles.pmText, { color: theme.text }]}>−</Text>
      </Pressable>
      {!props.two && <Text style={{ width: 54, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{dbT}</Text>}
      <Pressable onPress={props.onUp} accessibilityLabel={`Plus de ${props.name}`} style={[styles.pm, { width: bs, height: bs, borderColor: theme.line2, backgroundColor: theme.deep }]}>
        <Text style={[styles.pmText, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0B0D10', fontSize: 13, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '700' },
  lockChip: { height: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  card: { marginHorizontal: 14, borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  big: { flex: 1, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  bigText: { color: '#052E1F', fontSize: 17, fontWeight: '800' },
  bigSub: { color: '#052E1F', fontSize: 11, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 18, marginTop: 10, marginBottom: 2 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  pm: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pmText: { fontSize: 22, fontWeight: '800' },
  foot: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footText: { fontSize: 13, fontWeight: '800' },
  save: { height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, top: 100, backgroundColor: '#13261E', borderColor: '#1F6F4A', borderWidth: 1, borderRadius: 12, padding: 10 },
});
