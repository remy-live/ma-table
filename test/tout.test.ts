import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, s } from '../src/osc/osc';
import { chLevelPath, MAIN } from '../src/xair/addresses';
import { clipped } from '../src/xair/clip';
import { applyRecipe, fToMs, fxParPath, fxReturnPath, fxType, fxTypePath, knobsFor, msToF, rackPaths, RECIPES, setKnob, tapTempo } from '../src/xair/effects';
import { applyNeed, currentNeed, gainAdvice, nudgeGain } from '../src/xair/guide';
import { dbToFader, faderToDb } from '../src/xair/levels';
import { applyPreset, FAMILIES, LIBRARY, presetFromChannel, presetPaths } from '../src/xair/presets';
import { destinations, levelPaths, shares, sources, whoHearsPaths } from '../src/xair/whoHears';
import { addAuto, AUTO_MAX, listAutos } from '../src/store/autoBackup';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTable(port: number, paths: string[], fn: (c: XAirClient, sim: Awaited<ReturnType<typeof startSimulator>>) => Promise<void>) {
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await c.loadPaths(paths);
    await fn(c, sim);
  } finally {
    c.close();
    sim.stop();
  }
}

test('Effets : catalogue, réglages, tap tempo', () => {
  assert.equal(fxType(0).fr, 'Grande salle');
  assert.equal(fxType(10).kind, 'delay');
  assert.match(fxType(55).fr, /n°55/);
  assert.equal(knobsFor('reverb').length, 3);
  assert.ok(Math.abs(fToMs(msToF(450)) - 450) <= 2);
  const r = tapTempo([1000, 1500, 2000, 2500])!;
  assert.equal(r.bpm, 120);
  assert.equal(r.ms, 500);
  assert.equal(tapTempo([1000]), null);
});

test('Recette : type, paramètres, retour, et envois des voies reconnues', () =>
  withTable(10170, rackPaths(), async (c, sim) => {
    const rec = RECIPES.find((r) => r.id === 'voixpop')!;
    const touched = applyRecipe(c, 1, rec, true);
    await sleep(100);
    assert.equal(sim.state.get(fxTypePath(1))!.v, 2);
    assert.ok(Math.abs((sim.state.get(fxParPath(1, 2))!.v as number) - 0.4) < 1e-6);
    assert.ok(Math.abs(faderToDb(sim.state.get(fxReturnPath(1))!.v as number) - -6) < 0.1);
    assert.deepEqual(touched, [1]); // « Voix » en démo
    assert.ok(Math.abs(faderToDb(sim.state.get(chLevelPath(1, { kind: 'fx', n: 1 }))!.v as number) - -12) < 0.1);
    setKnob(c, 1, knobsFor('delay')[1], 0.3);
    await sleep(80);
    assert.ok(Math.abs((sim.state.get(fxParPath(1, 10))!.v as number) - 0.3) < 1e-6);
    assert.ok(Math.abs((sim.state.get(fxParPath(1, 11))!.v as number) - 0.3) < 1e-6);
  }));

test('Bibliothèque : familles valides, « Mes réglages » survit à la sauvegarde', () =>
  withTable(10171, presetPaths(3), async (c, sim) => {
    for (const p of LIBRARY) assert.ok(FAMILIES.includes(p.family!), p.name);
    assert.ok(LIBRARY.filter((p) => p.family === 'Voix').length >= 4);
    applyPreset(c, 3, LIBRARY.find((p) => p.name === 'Basse ronde')!);
    await sleep(100);
    const mine = presetFromChannel(c, 3, 'Ma basse');
    assert.equal(mine.lowCut, 30);
    assert.equal(mine.comp, -14);
    const viaJson = JSON.parse(JSON.stringify(mine)); // comme AsyncStorage
    applyPreset(c, 4, viaJson);
    await sleep(100);
    assert.equal(sim.state.get(chLevelPath(4, { kind: 'fx', n: 1 }))!.v, 0, '−∞ reste −∞ après sauvegarde');
  }));

test('Mode guidé : besoins par personne et conseil de gain', () =>
  withTable(10172, whoHearsPaths(), async (c, sim) => {
    const bus = { kind: 'bus', n: 3 } as const;
    applyNeed(c, bus, [5, 6, 7], 'moyen');
    await sleep(80);
    assert.ok(Math.abs(faderToDb(sim.state.get(chLevelPath(6, bus))!.v as number) - -8) < 0.1);
    assert.equal(currentNeed(c, bus, [5, 6, 7]), 'moyen');
    applyNeed(c, bus, [5], 'rien');
    await sleep(80);
    assert.equal(sim.state.get(chLevelPath(5, bus))!.v, 0);
    assert.equal(gainAdvice(-12).tone, 'ok');
    assert.equal(gainAdvice(-35).tone, 'low');
    assert.equal(gainAdvice(-2).tone, 'high');
    c.set('/headamp/01/gain', f(0.5));
    nudgeGain(c, 1, 3);
    await sleep(80);
    assert.ok(Math.abs((sim.state.get('/headamp/01/gain')!.v as number) - (0.5 + 3 / 72)) < 1e-6);
  }));

test('Qui entend quoi : groupes, voies, effets, parts', () =>
  withTable(10173, whoHearsPaths(), async (c) => {
    const d = destinations(c);
    assert.equal(d.length, 7);
    assert.equal(d[1].name, 'Bassiste');
    const src = sources(c);
    const g = src.find((x) => x.kind === 'group')!;
    assert.equal(g.label, 'Batterie');
    assert.equal(g.members!.length, 5);
    assert.ok(src.some((x) => x.kind === 'fx'));
    const fx = src.find((x) => x.kind === 'fx')!;
    assert.deepEqual(levelPaths(fx, { kind: 'bus', n: 2 }), ['/rtn/1/mix/02/level']);
    const sh = shares(c, src, MAIN);
    assert.ok(Math.abs(sh.reduce((a, r) => a + r.share, 0) - 1) < 1e-6);
    c.set('/ch/12/config/name', s('Clavier'));
    await sleep(60);
    assert.ok(sources(c).some((x) => x.label === 'Clavier'));
  }));

test('Alerte saturation et sauvegardes automatiques', async () => {
  const last = new Map<number, number>();
  const m = new Array(40).fill(-30);
  m[2] = 0;
  assert.deepEqual(clipped(m, 1000, last), [3]);
  m[2] = -30;
  assert.deepEqual(clipped(m, 3000, last), [3]); // reste affiché un moment
  assert.deepEqual(clipped(m, 6000, last), []);
  for (let k = 0; k < AUTO_MAX + 2; k++) await addAuto({ name: 'x', at: k, values: { '/lr/mix/fader': dbToFader(0) } });
  const l = await listAutos();
  assert.equal(l.length, AUTO_MAX);
  assert.equal(l[0].at, AUTO_MAX + 1); // la plus récente d'abord
});
