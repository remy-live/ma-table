import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i, s } from '../src/osc/osc';
import { chLevelPath, gainDbToF, MAIN } from '../src/xair/addresses';
import {
  addSample, applyGainNow, applyResults, bleeds, buildSteps, compute, isPlaying, masterAdvice, ownersOf, planReturns, roleOf, Samples,
  soloResult, swapInSteps, TARGET_PEAK, wrongPlug,
} from '../src/xair/autoBalance';
import { faderToDb } from '../src/xair/levels';
import { saveVenue, listVenues } from '../src/store/venues';
import { XAirClient } from '../src/xair/XAirClient';
import { whoHearsPaths } from '../src/xair/whoHears';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTable(port: number, fn: (c: XAirClient, sim: Awaited<ReturnType<typeof startSimulator>>) => Promise<void>) {
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await c.loadPaths(['/headamp/01/gain', '/headamp/04/gain', '/headamp/05/gain', '/ch/05/gate/on', '/ch/05/dyn/on', '/lr/mix/fader']);
    await fn(c, sim);
  } finally {
    c.close();
    sim.stop();
  }
}

/** Fabrique des vumètres : 40 valeurs, voies données en dB, le reste à −90. */
const meters = (ch: Record<number, number>, lr = -90) => {
  const m = new Array(40).fill(-90);
  for (const [k, v] of Object.entries(ch)) m[Number(k) - 1] = v;
  m[36] = lr;
  m[37] = lr;
  return m;
};
const feed = (sm: Samples, step: number, ch: Record<number, number>, n = 40, lr = -90) => {
  for (let k = 0; k < n; k++) addSample(sm, step, meters(ch, lr));
};

test('Rôles : chaque élément de batterie est reconnu, avec sa consigne', () => {
  assert.equal(roleOf('Kick').order, 1);
  assert.equal(roleOf('Grosse caisse').order, 1);
  assert.equal(roleOf('Caisse claire').order, 2);
  assert.equal(roleOf('Charley').order, 3);
  assert.equal(roleOf('Tom 1').order, 4);
  assert.equal(roleOf('Tom basse').order, 4);
  assert.equal(roleOf('Overhead').order, 6);
  assert.equal(roleOf('Chœurs').who, 'Choriste');
  assert.equal(roleOf('Guitare élec').order, 20);
  assert.equal(roleOf('Voix').mix, 0);
});

test('Déroulé : silence, batterie élément par élément, puis les autres, voix en dernier, tous ensemble', () =>
  withTable(10180, async (c) => {
    c.set('/ch/10/config/name', s('Tom 2'));
    await sleep(60);
    const st = buildSteps(c);
    assert.equal(st[0].kind, 'silence');
    const solos = st.filter((x) => x.kind === 'solo').map((x) => x.what);
    // démo : Voix, Guitare acou, Guitare élec, Basse, Kick, Caisse claire, Charley, Toms, Overhead (+ Tom 2)
    assert.deepEqual(solos, ['Kick', 'Caisse claire', 'Charley', 'Toms', 'Tom 2', 'Overhead', 'Basse', 'Guitare élec', 'Guitare acou', 'Voix']);
    assert.equal(st[st.length - 1].kind, 'tutti');
    assert.match(st.find((x) => x.what === 'Tom 2')!.say, /Tom 2/);
    assert.equal(buildSteps(c, 'express').length, 1);
  }));

test('Détection du jeu, erreur de prise et micros voisins', () =>
  withTable(10181, async (c) => {
    const st = buildSteps(c);
    const kick = st.find((x) => x.what === 'Kick')!;
    assert.equal(isPlaying(meters({ 5: -60 }), kick, [1, 5]), false);
    assert.equal(isPlaying(meters({ 5: -30 }), kick, [1, 5]), true);
    assert.equal(isPlaying(meters({ 1: -30 }), kick, [1, 5]), false, 'pour un solo, seule sa voie compte');
    const sm: Samples = new Map();
    feed(sm, 0, { 5: -70, 6: -14 });
    assert.equal(wrongPlug(sm.get(0), 5), 6);
    feed(sm, 1, { 5: -14, 6: -30 });
    assert.equal(wrongPlug(sm.get(1), 5), null, 'les autres micros de batterie entendent un peu : normal');
    // la voix (1) qui entend fort la basse (4)
    feed(sm, 2, { 4: -12, 1: -18 });
    const b = bleeds(c, sm.get(2), 4);
    assert.equal(b.length, 1);
    assert.equal(b[0].ch, 1);
    // entre micros de batterie : ignoré
    feed(sm, 3, { 5: -12, 6: -16 });
    assert.equal(bleeds(c, sm.get(3), 5).length, 0);
    const sw = swapInSteps(st, 1, 5, 6);
    assert.equal(sw.find((x) => x.what === 'Kick')!.ch, 6);
    assert.equal(sw.find((x) => x.what === 'Caisse claire')!.ch, 5);
  }));

test('Gain : le pic va vers −12 dB, par pas de 18 dB au plus, jamais sur une entrée ligne', () =>
  withTable(10182, async (c, sim) => {
    c.set('/headamp/05/gain', f(gainDbToF(20)));
    await sleep(60);
    const sm: Samples = new Map();
    feed(sm, 0, { 5: -24 });
    const r = soloResult(c, 5, sm.get(0));
    assert.equal(r.gainFrom, 20);
    assert.equal(r.gainTo, 20 + (TARGET_PEAK - -24));
    applyGainNow(c, r);
    await sleep(80);
    assert.ok(Math.abs((sim.state.get('/headamp/05/gain')!.v as number) - gainDbToF(32)) < 1e-6);
    feed(sm, 1, { 5: -60 });
    assert.equal(soloResult(c, 5, sm.get(1)).heard, false);
    feed(sm, 2, { 5: -50 });
    assert.equal(soloResult(c, 5, sm.get(2)).gainTo! - soloResult(c, 5, sm.get(2)).gainFrom!, 18);
    feed(sm, 3, { 12: -30 });
    assert.equal(soloResult(c, 12, sm.get(3)).gainTo, undefined); // pas de préampli sur la 12
  }));

test('Calcul final : gate, compresseur, faders selon le rôle (voix devant), plafond 0 dB', () =>
  withTable(10183, async (c, sim) => {
    c.set('/ch/05/gate/on', i(1));
    c.set('/ch/05/dyn/on', i(1));
    await sleep(60);
    const steps = buildSteps(c);
    const sm: Samples = new Map();
    feed(sm, 0, { 5: -70 }); // silence
    const solos = new Map();
    solos.set(5, { ch: 5, name: 'Kick', peak: -12, heard: true, gainFrom: 30, gainTo: 30 });
    solos.set(1, { ch: 1, name: 'Voix', peak: -12, heard: true, gainFrom: 30, gainTo: 30 });
    solos.set(4, { ch: 4, name: 'Basse', peak: -12, heard: true, gainFrom: 30, gainTo: 30 });
    const t = steps.findIndex((x) => x.kind === 'tutti');
    feed(sm, t, { 1: -20, 4: -20, 5: -20 }, 40, -4);
    const res = compute(c, steps, sm, solos);
    const kick = res.find((r) => r.ch === 5)!;
    const voix = res.find((r) => r.ch === 1)!;
    const basse = res.find((r) => r.ch === 4)!;
    assert.ok(kick.gate! >= -64 && kick.gate! <= -30, `gate ${kick.gate}`);
    assert.equal(kick.comp, -22);
    assert.equal(voix.fader, 0);
    assert.equal(basse.fader, -3);
    assert.equal(kick.fader, -3);
    applyResults(c, res);
    await sleep(80);
    assert.ok(Math.abs(faderToDb(sim.state.get(chLevelPath(4, MAIN))!.v as number) - -3) < 0.1);
    const ma = masterAdvice(sm, steps)!;
    assert.equal(ma.level, -4);
    assert.equal(ma.lowerBy, 8);
  }));

test('Retours : chacun a son instrument plus fort, et tout le monde entend la voix', () =>
  withTable(10184, async (c) => {
    await c.loadPaths(whoHearsPaths());
    // démo : bus 1 « Bassiste »
    assert.deepEqual(ownersOf(c, 'Bassiste'), [4]);
    assert.deepEqual(ownersOf(c, 'Batteur'), [5, 6, 7, 8, 9]);
    const res = [
      { ch: 1, name: 'Voix', fader: -6 },
      { ch: 4, name: 'Basse', fader: -9 },
      { ch: 5, name: 'Kick', fader: -9 },
    ];
    const plans = planReturns(c, res);
    const bas = plans.find((p) => p.bus === 1)!;
    assert.equal(bas.sends[4], -3); // sa basse : fader +6
    assert.equal(bas.sends[5], -11); // le kick : fader −2
    assert.equal(bas.sends[1], -6); // la voix au moins à −6
    assert.equal(bas.empty, false); // la démo envoie déjà dans le bus 1
  }));

test('Salles enregistrées', async () => {
  await saveVenue('Salle des fêtes', { name: 'x', at: 1, values: {} });
  await saveVenue('Bar du coin', { name: 'y', at: 2, values: {} });
  await saveVenue('salle des fêtes', { name: 'z', at: 3, values: {} });
  const v = await listVenues();
  assert.equal(v.length, 2);
  assert.equal(v[0].snap.name, 'z');
});
