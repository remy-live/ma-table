// Balance automatique guidée : l'appli dit (à l'écran et à voix haute) qui doit
// jouer, détecte quand ça joue, écoute, règle, puis passe au suivant.
// Batterie élément par élément, puis les autres, puis tous ensemble.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { bottomPad } from '../ui/immersive';
import { listVenues, saveVenue, Venue } from '../store/venues';
import { canSpeak, hush, say } from '../ui/speech';
import { Theme } from '../ui/theme';
import { CH_COUNT, chNamePath, dynOnPath, gateOnPath } from '../xair/addresses';
import {
  addSample, applyGainNow, applyMaster, applyResults, applyReturn, AutoStep, Bleed, bleeds, buildSteps, ChResult, compute, isPlaying,
  masterAdvice, MasterAdvice, mergeResult, Mode, namedChannels, planReturns, ReturnPlan, Samples, soloResult, swapInSteps, What, WHAT_ALL, wrongPlug,
} from '../xair/autoBalance';
import { roleOf } from '../xair/autoBalance';
import { setDemoStage } from '../xair/tableModel';
import { swapChannels } from '../xair/clipboard';
import { capture, restore, Snapshot } from '../xair/snapshot';
import { addAuto } from '../store/sessions';
import { XAirClient } from '../xair/XAirClient';
import { whoHearsPaths } from '../xair/whoHears';

type Phase = 'intro' | 'run' | 'plug' | 'report';
type StepState = 'wait' | 'listen' | 'done';

const dbs = (x?: number) => (x === undefined || !isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${x} dB`);

export function AutoBalanceScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; only?: number[] }) {
  const { client, theme } = props;
  // quelles voies passent, et ce que l'appli a le droit de régler
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [what, setWhat] = useState<What>(WHAT_ALL);
  const [manual, setManual] = useState(false);
  const [applyOn, setApplyOn] = useState<Record<number, boolean>>({});
  const redo = useRef<number | null>(null);
  useEffect(() => {
    if (!props.visible) return;
    const nm = namedChannels(client);
    const o = (props.only ?? []).filter((c) => nm.includes(c));
    setPick(new Set(o.length ? o : nm));
    setPhase('intro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<Mode>('complet');
  const [voice, setVoice] = useState(true);
  const [steps, setSteps] = useState<AutoStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [st, setSt] = useState<StepState>('wait');
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState(-90);
  const [msg, setMsg] = useState('');
  const [plug, setPlug] = useState<{ from: number; to: number } | null>(null);
  const [results, setResults] = useState<ChResult[]>([]);
  const [bleedList, setBleedList] = useState<Bleed[]>([]);
  const [plans, setPlans] = useState<ReturnPlan[]>([]);
  const [planOn, setPlanOn] = useState<Record<number, boolean>>({});
  const [master, setMaster] = useState<MasterAdvice | null>(null);
  const [masterOn, setMasterOn] = useState(true);
  const [applied, setApplied] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueName, setVenueName] = useState('');

  const R = useRef({
    steps: [] as AutoStep[], idx: 0, st: 'wait' as StepState, start: 0, samples: new Map() as Samples,
    solos: new Map<number, ChResult>(), bleeds: [] as Bleed[], undo: null as Snapshot | null, lastUi: 0, voice: true, timer: null as ReturnType<typeof setTimeout> | null,
    spoken: false, playSince: 0, manual: false, entry: 0,
  });
  R.current.voice = voice;
  R.current.manual = manual;

  const speak = (t: string, done?: () => void) => (R.current.voice ? say(t, done) : done?.());

  useEffect(() => {
    if (!props.visible) {
      hush();
      setDemoStage(null);
      return;
    }
    setPhase('intro');
    setApplied(false);
    listVenues().then(setVenues);
  }, [props.visible]);

  const namedChans = () => Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(chNamePath(c)) ?? ''));

  // ---------- déroulé ----------
  const enterStep = (k: number) => {
    const r = R.current;
    if (r.timer) clearTimeout(r.timer);
    r.idx = k;
    r.st = 'wait';
    r.samples.delete(k);
    setIdx(k);
    setSt('wait');
    setProgress(0);
    setMsg('');
    const s = r.steps[k];
    r.spoken = false;
    r.playSince = 0;
    const entry = ++r.entry;
    setDemoStage(s.kind === 'silence' ? 'none' : s.kind === 'solo' && s.ch ? s.ch : 'all');
    const said = () => {
      if (R.current.entry !== entry) return;
      R.current.spoken = true;
      if (s.kind === 'silence' && R.current.st === 'wait') startListen();
    };
    speak(s.speak, said);
    // si la voix ne rend pas la main : on estime la durée de la phrase
    setTimeout(said, R.current.voice ? 600 + s.speak.length * 75 : 0);
    // sans voix (ou si elle ne rend pas la main) : le silence démarre seul après 3 s
    if (s.kind === 'silence') r.timer = setTimeout(() => R.current.idx === k && R.current.st === 'wait' && startListen(), 3500);
  };

  const startListen = () => {
    const r = R.current;
    if (r.st !== 'wait') return;
    r.st = 'listen';
    r.start = Date.now();
    setSt('listen');
  };

  const next = (delay = 1200) => {
    const r = R.current;
    r.timer = setTimeout(() => (r.idx + 1 < r.steps.length ? enterStep(r.idx + 1) : finishAll()), delay);
  };

  const keepSolo = (ch: number) => {
    const r = R.current;
    const m = r.samples.get(r.idx);
    const res = soloResult(client, ch, m);
    if (whatRef.current.gain) applyGainNow(client, res);
    else { res.gainTo = undefined; }
    r.solos.set(ch, res);
    r.bleeds.push(...bleeds(client, m, ch));
    const g = res.gainTo !== undefined && res.gainFrom !== undefined ? res.gainTo - res.gainFrom : 0;
    setMsg(!res.heard ? '⚠ Rien entendu' : res.gainTo !== undefined ? `✓ Gain ${g >= 0 ? '+' : ''}${g} dB` : '✓ Entendu');
    speak(res.heard ? 'Merci.' : 'Je n’entends rien. On passe.');
    next(res.heard ? 1300 : 1800);
  };

  const finishStep = () => {
    const r = R.current;
    r.st = 'done';
    setSt('done');
    const s = r.steps[r.idx];
    if (s.kind === 'solo' && s.ch) {
      const wp = wrongPlug(r.samples.get(r.idx), s.ch);
      if (wp) {
        setPlug({ from: s.ch, to: wp });
        setPhase('plug');
        speak(`Attention, le son arrive sur la prise ${wp}, pas sur la ${s.ch}.`);
        return;
      }
      keepSolo(s.ch);
      return;
    }
    setMsg('✓ Merci');
    speak(s.kind === 'silence' ? 'Merci.' : 'Merci à tous.');
    next(1000);
  };

  const finishAll = () => {
    setDemoStage(null);
    const r = R.current;
    const res = compute(client, r.steps, r.samples, r.solos);
    if (redo.current !== null) {
      // une seule voie refaite : on la remplace dans le rapport, le reste ne bouge pas
      const ch = redo.current;
      redo.current = null;
      const fresh = res.find((x) => x.ch === ch);
      if (fresh) setResults((old) => old.map((o) => (o.ch === ch ? mergeResult(o, fresh) : o)));
      setApplied(false);
      setPhase('report');
      speak('Merci.');
      return;
    }
    const pl = planReturns(client, res);
    setResults(res);
    setBleedList(r.bleeds);
    setPlans(pl);
    setPlanOn(Object.fromEntries(pl.map((p) => [p.bus, p.empty])));
    setApplyOn(Object.fromEntries(res.map((x) => [x.ch, true])));
    setMaster(masterAdvice(r.samples, r.steps));
    setPhase('report');
    speak('C’est fini. Merci à tous !');
  };

  // écoute des vumètres pendant le test
  useEffect(() => {
    if (phase !== 'run') return;
    client.startMeters();
    return client.onMeters((m) => {
      const r = R.current;
      const s = r.steps[r.idx];
      if (!s) return;
      const now = Date.now();
      // on n'écoute qu'une fois la consigne dite, et si le son tient une demi-seconde
      // (un ampli voisin qui repisse brièvement ne lance pas la mesure)
      if (r.st === 'wait' && s.kind !== 'silence' && r.spoken && !r.manual) {
        if (isPlaying(m, s, namedChans())) {
          if (!r.playSince) r.playSince = now;
          else if (now - r.playSince >= 500) startListen();
        } else r.playSince = 0;
      }
      if (r.st === 'listen') {
        addSample(r.samples, r.idx, m);
        if (now - r.start >= s.seconds * 1000) finishStep();
      }
      if (now - r.lastUi > 100) {
        r.lastUi = now;
        setLive(s.ch ? m[s.ch - 1] ?? -90 : Math.max(...namedChans().map((c) => m[c - 1] ?? -90), -90));
        if (r.st === 'listen') setProgress(Math.min(1, (now - r.start) / (s.seconds * 1000)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, client]);

  const whatRef = useRef(what);
  whatRef.current = what;
  /** Refaire une seule voie (depuis le rapport) : son passage seul, puis retour au rapport. */
  const redoOne = (ch: number) => {
    const list = buildSteps(client, 'complet', new Set([ch])).filter((x) => x.kind === 'solo');
    if (!list.length) return;
    const r = R.current;
    redo.current = ch;
    r.steps = list;
    r.samples = new Map();
    r.solos = new Map();
    r.bleeds = [];
    setSteps(list);
    setPhase('run');
    enterStep(0);
  };

  const begin = async () => {
    const list = buildSteps(client, mode, pick);
    if (!list.length) {
      Alert.alert('Aucune voie nommée', 'Dis d’abord ce qui est branché (Aide-moi › Mode guidé, étape 1), pour que l’appli sache qui appeler.');
      return;
    }
    const r = R.current;
    await client.loadPaths([...whoHearsPaths(), ...Array.from({ length: 8 }, (_, k) => `/headamp/0${k + 1}/gain`), ...Array.from({ length: CH_COUNT }, (_, k) => [gateOnPath(k + 1), dynOnPath(k + 1)]).flat()]);
    r.undo = await capture(client, 'Avant la balance automatique');
    addAuto(r.undo, 'avant balance automatique').catch(() => {});
    r.steps = list;
    r.samples = new Map();
    r.solos = new Map();
    r.bleeds = [];
    setSteps(list);
    setPhase('run');
    enterStep(0);
  };

  const stop = () => {
    const r = R.current;
    if (r.timer) clearTimeout(r.timer);
    hush();
  };

  const close = () => {
    stop();
    props.onClose();
  };

  const undoAll = () =>
    Alert.alert('Annuler tout ?', 'La table revient exactement comme avant la balance automatique (gains compris).', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler tout',
        style: 'destructive',
        onPress: () => {
          stop();
          if (R.current.undo) restore(client, R.current.undo);
          setApplied(false);
          setPhase('intro');
        },
      },
    ]);

  const applyAll = () => {
    applyResults(client, results, what, new Set(results.filter((x) => applyOn[x.ch] !== false).map((x) => x.ch)));
    plans.filter((p) => planOn[p.bus]).forEach((p) => applyReturn(client, p));
    if (master && masterOn) applyMaster(client, master);
    setApplied(true);
  };

  const step = steps[idx];
  const chName = (c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;
  const estimate = Math.max(1, Math.round(buildSteps(client, mode, pick).reduce((a, s) => a + s.seconds + 6, 0) / 60));
  const allNamed = namedChannels(client);
  const isDrum = (c: number) => !!roleOf(chName(c)).drum;
  const isVoice = (c: number) => /voix|chant|chœur|choeur|vocal/i.test(chName(c));
  const setOnly = (f: (c: number) => boolean) => setPick(new Set(allNamed.filter(f)));

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: bottomPad() }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Balance automatique</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{phase === 'run' ? `Étape ${idx + 1} sur ${steps.length}` : 'Chacun son tour, puis tous ensemble'}</Text>
          </View>
          <Pressable onPress={close} style={[styles.quit, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </View>

        {phase === 'intro' && (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
            <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>
              Pose le téléphone près de toi. Il dit à voix haute qui doit jouer, attend que ça joue, écoute quelques secondes, règle, et passe au suivant. Batterie élément par élément, puis chaque musicien, puis tous ensemble.
            </Text>
            {(['complet', 'express'] as Mode[]).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.card, { backgroundColor: theme.panel, borderColor: mode === m ? theme.accent : theme.line }]}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{m === 'complet' ? `Complète · environ ${mode === 'complet' ? estimate : '?'} min` : 'Express · 30 secondes'}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  {m === 'complet' ? 'Silence, chaque élément un par un (gain, gate, compresseur), tous ensemble (faders, retours, volume général).' : 'Tous ensemble seulement : faders, retours et volume. Les gains ne bougent pas (concert suivant, même groupe).'}
                </Text>
              </Pressable>
            ))}
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <Text style={{ color: theme.text, fontWeight: '800' }}>Quelles voies ? <Text style={{ color: theme.muted, fontWeight: '600', fontSize: 12 }}>{pick.size === allNamed.length ? 'toutes' : `${pick.size} sur ${allNamed.length}`}</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([['Tout', () => setOnly(() => true)], ['Rien', () => setOnly(() => false)], ['La batterie', () => setOnly(isDrum)], ['Les voix', () => setOnly(isVoice)], ['Sans la batterie', () => setOnly((c) => !isDrum(c))]] as [string, () => void][]).map(([l, fn]) => (
                  <Pressable key={l} onPress={fn} style={[styles.chip, { borderColor: theme.accent }]}><Text style={{ color: theme.accent, fontWeight: '800', fontSize: 12 }}>{l}</Text></Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {allNamed.map((c) => {
                  const on = pick.has(c);
                  return (
                    <Pressable key={c} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPick((p) => { const n = new Set(p); if (on) n.delete(c); else n.add(c); return n; })}
                      style={[styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                      <Text style={{ color: on ? theme.onAccent : theme.muted, fontWeight: '800', fontSize: 12 }}>{c} · {chName(c)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {mode === 'express' && <Text style={{ color: theme.muted, fontSize: 11 }}>En express tout le monde joue ensemble, mais seules les voies choisies sont réglées.</Text>}
            </View>
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <Text style={{ color: theme.text, fontWeight: '800' }}>Ce que l’appli règle</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([['gain', 'Gain'], ['gate', 'Gate'], ['comp', 'Compresseur'], ['fader', 'Volume dans la façade']] as [keyof What, string][]).map(([k, l]) => (
                  <Pressable key={k} accessibilityRole="checkbox" accessibilityState={{ checked: what[k] }} onPress={() => setWhat((w) => ({ ...w, [k]: !w[k] }))}
                    style={[styles.chip, what[k] ? { backgroundColor: theme.ok, borderColor: theme.ok } : { borderColor: theme.line2 }]}>
                    <Text style={{ color: what[k] ? '#052E1F' : theme.muted, fontWeight: '800', fontSize: 12 }}>{what[k] ? '✓ ' : ''}{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, flexDirection: 'row', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Le téléphone parle</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{canSpeak() ? 'Consignes dites à voix haute' : 'Disponible après la recompilation'}</Text>
              </View>
              <Switch value={voice && canSpeak()} disabled={!canSpeak()} onValueChange={setVoice} />
            </View>
            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, flexDirection: 'row', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Je dis quand c’est prêt</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{manual ? 'L’écoute démarre quand tu touches « Prêt »' : 'Sinon l’appli démarre seule quand ça joue'}</Text>
              </View>
              <Switch value={manual} onValueChange={setManual} />
            </View>
            <Pressable onPress={begin} disabled={pick.size === 0} style={[styles.go, { backgroundColor: theme.ok, opacity: pick.size ? 1 : 0.4 }]}>
              <Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 17 }}>{pick.size === allNamed.length ? 'Commencer' : `Commencer · ${pick.size} voie${pick.size > 1 ? 's' : ''}`}</Text>
            </Pressable>
            <Text style={{ color: theme.muted, fontSize: 12 }}>La table est photographiée avant : « Annuler tout » la remet comme avant. Le 48 V n’est jamais touché.</Text>

            {venues.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.kicker, { color: theme.muted }]}>OU REPARTIR D’UNE SALLE ENREGISTRÉE</Text>
                {venues.map((v) => (
                  <Pressable
                    key={v.name}
                    onPress={() =>
                      Alert.alert(`Reprendre « ${v.name} » ?`, `Balance du ${new Date(v.at).toLocaleDateString('fr-FR')}. Toute la table reprend ces réglages.`, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Reprendre', onPress: () => Alert.alert('Fait', `${restore(client, v.snap)} réglages repris. Fais une balance express pour ajuster à la salle.`) },
                      ])
                    }
                    style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '800' }}>{v.name}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{new Date(v.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {phase === 'run' && step && (
          <View style={{ flex: 1, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {steps.map((_, k) => (
                <View key={k} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: k < idx ? theme.ok : k === idx ? theme.accent : theme.track }} />
              ))}
            </View>
            <View style={[styles.stage, { backgroundColor: theme.panel, borderColor: st === 'listen' ? theme.ok : theme.accent }]}>
              <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>{step.who.toUpperCase()}</Text>
              <Text style={{ color: theme.text, fontSize: 30, fontWeight: '800', textAlign: 'center' }}>{step.what}</Text>
              <Text style={{ color: theme.text, fontSize: 18, textAlign: 'center', lineHeight: 25 }}>{step.say}</Text>
              {step.ch && <Text style={{ color: theme.muted, fontSize: 12 }}>Prise {step.ch}</Text>}
              <View style={{ alignSelf: 'stretch', height: 14, borderRadius: 7, backgroundColor: theme.meterBg, overflow: 'hidden', marginTop: 6 }}>
                <View style={{ width: `${Math.max(0, Math.min(100, ((live + 60) / 60) * 100))}%`, height: 14, backgroundColor: live > -3 ? theme.mute : live > -18 ? theme.ok : '#FCD34D' }} />
              </View>
              <Text style={{ color: st === 'listen' ? theme.ok : theme.muted, fontSize: 15, fontWeight: '800' }}>
                {st === 'wait' ? (step.kind === 'silence' ? 'Silence…' : manual ? 'Touche « Prêt » quand ça joue' : 'J’attends que ça joue…') : st === 'listen' ? `J’écoute… ${Math.ceil(step.seconds * (1 - progress))} s` : msg || '✓'}
              </Text>
              {st === 'listen' && (
                <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: theme.track }}>
                  <View style={{ width: `${progress * 100}%`, height: 6, borderRadius: 3, backgroundColor: theme.ok }} />
                </View>
              )}
            </View>
            {st === 'wait' && step.kind !== 'silence' && (
              <Pressable onPress={startListen} style={[styles.go, { backgroundColor: theme.accent }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 18 }}>Prêt</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => enterStep(idx)} style={[styles.small, { borderColor: theme.line2 }]}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Refaire</Text>
              </Pressable>
              <Pressable onPress={() => (idx + 1 < steps.length ? enterStep(idx + 1) : finishAll())} style={[styles.small, { borderColor: theme.line2 }]}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Passer</Text>
              </Pressable>
              <Pressable onPress={() => { stop(); finishAll(); }} style={[styles.small, { borderColor: theme.line2 }]}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Terminer</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'plug' && plug && (
          <View style={{ gap: 12 }}>
            <View style={[styles.stage, { backgroundColor: '#2A1414', borderColor: '#7F1D1D' }]}>
              <Text style={{ color: '#FCA5A5', fontSize: 14, fontWeight: '800' }}>ERREUR DE PRISE ?</Text>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
                On attendait « {chName(plug.from)} » sur la prise {plug.from}, mais le son arrive sur la prise {plug.to} ({chName(plug.to)}).
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                const r = R.current;
                await swapChannels(client, plug.from, plug.to);
                r.steps = swapInSteps(r.steps, r.idx, plug.from, plug.to);
                setSteps(r.steps);
                setPhase('run');
                keepSolo(plug.to);
              }}
              style={[styles.go, { backgroundColor: theme.accent }]}
            >
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Corriger : échanger les voies {plug.from} et {plug.to}</Text>
            </Pressable>
            <Pressable onPress={() => { setPhase('run'); enterStep(R.current.idx); }} style={[styles.go, { borderWidth: 1, borderColor: theme.line2 }]}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>J’ai rebranché : refaire</Text>
            </Pressable>
            <Pressable onPress={() => { setPhase('run'); keepSolo(plug.from); }} style={[styles.go, { borderWidth: 1, borderColor: theme.line2 }]}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>Non, c’est normal : continuer</Text>
            </Pressable>
          </View>
        )}

        {phase === 'report' && (
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }}>
            <Text style={[styles.kicker, { color: theme.muted }]}>RAPPORT VOIE PAR VOIE</Text>
            {results.map((r) => {
              const warn = !!r.note || r.heard === false || bleedList.some((b) => b.ch === r.ch);
              const parts = [
                r.gainTo !== undefined ? `Gain ${dbs(r.gainFrom)} → ${dbs(r.gainTo)}` : '',
                r.fader !== undefined ? `Fader ${dbs(r.faderFrom)} → ${dbs(r.fader)}` : '',
                r.gate !== undefined ? `Gate ${r.gate} dB` : '',
                r.comp !== undefined ? `Comp ${r.comp} dB` : '',
              ].filter(Boolean);
              return (
                <View key={r.ch} style={[styles.card, { backgroundColor: theme.panel, borderColor: warn ? '#7F1D1D' : theme.line, opacity: applyOn[r.ch] === false ? 0.55 : 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, flex: 1 }}>
                      {warn ? '⚠' : '✓'} {r.ch} · {r.name}
                    </Text>
                    {mode === 'complet' && (
                      <Pressable onPress={() => redoOne(r.ch)} style={[styles.chip, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>↻ Refaire</Text></Pressable>
                    )}
                    <Switch value={applyOn[r.ch] !== false} onValueChange={(v) => { setApplyOn((o) => ({ ...o, [r.ch]: v })); setApplied(false); }} />
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{parts.join(' · ') || 'Rien à changer'}</Text>
                  {!!r.note && <Text style={{ color: '#FCA5A5', fontSize: 12 }}>{r.note}</Text>}
                  {bleedList.filter((b) => b.ch === r.ch).map((b) => (
                    <Text key={b.from} style={{ color: '#FCD34D', fontSize: 12 }}>
                      Ce micro entend fort « {chName(b.from)} » ({b.diff} dB d’écart seulement) : rapproche-le de sa source ou tourne-le.
                    </Text>
                  ))}
                </View>
              );
            })}

            {master && (
              <View style={[styles.card, { backgroundColor: theme.panel, borderColor: master.lowerBy ? '#7F1D1D' : theme.line, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>Volume général</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{master.lowerBy ? `Façade très forte (${master.level} dB) : baisser le master de ${master.lowerBy} dB` : `Façade à ${master.level} dB : ça va`}</Text>
                </View>
                {master.lowerBy > 0 && <Switch value={masterOn} onValueChange={setMasterOn} />}
              </View>
            )}

            {plans.length > 0 && <Text style={[styles.kicker, { color: theme.muted }]}>RETOURS : UN PREMIER MIX POUR CHACUN</Text>}
            {plans.map((p) => (
              <View key={p.bus} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>
                    {p.name} · AUX {p.bus}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {p.owners.length ? `Plus fort : ${p.owners.map(chName).join(', ')}` : 'Comme la façade'} · la voix pour tout le monde{!p.empty ? ' · ⚠ remplace son réglage actuel' : ''}
                  </Text>
                </View>
                <Switch value={!!planOn[p.bus]} onValueChange={(v) => setPlanOn((o) => ({ ...o, [p.bus]: v }))} />
              </View>
            ))}
            {plans.length === 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Nomme les retours (« Bassiste », « Chanteur »…) pour que l’appli leur prépare un mix.</Text>}

            <Pressable onPress={applyAll} disabled={applied} style={[styles.go, { backgroundColor: applied ? theme.track : theme.ok }]}>
              <Text style={{ color: applied ? theme.muted : '#052E1F', fontWeight: '800', fontSize: 16 }}>{applied ? '✓ Appliqué' : `Appliquer${results.some((x) => applyOn[x.ch] === false) ? ` · ${results.filter((x) => applyOn[x.ch] !== false).length} voie(s)` : ' ces réglages'}`}</Text>
            </Pressable>
            <Pressable onPress={undoAll} style={[styles.go, { borderWidth: 1, borderColor: theme.mute }]}>
              <Text style={{ color: theme.mute, fontWeight: '800' }}>Annuler tout</Text>
            </Pressable>

            <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
              <Text style={{ color: theme.text, fontWeight: '800' }}>Garder pour cette salle</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={venueName} onChangeText={setVenueName} placeholder="ex. Salle des fêtes" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                <Pressable
                  onPress={async () => {
                    if (!venueName.trim()) return;
                    const snap = await capture(client, venueName.trim());
                    setVenues(await saveVenue(venueName.trim(), snap));
                    setVenueName('');
                    Alert.alert('Gardé', 'La prochaine fois, « Repartir d’une salle enregistrée » au début de la balance automatique.');
                  }}
                  style={[styles.small, { borderColor: theme.accent, flex: 0, paddingHorizontal: 14 }]}
                >
                  <Text style={{ color: theme.accent, fontWeight: '800' }}>Garder</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  quit: { height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  chip: { minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  go: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stage: { borderWidth: 2, borderRadius: 22, padding: 18, gap: 10, alignItems: 'center' },
  small: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
});
