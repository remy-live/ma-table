import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i, s } from '../src/osc/osc';
import { chLevelPath, MAIN } from '../src/xair/addresses';
import { clipped } from '../src/xair/clip';
import { applyRecipe, fToMs, fxParPath, fxReturnPath, fxType, fxTypePath, knobsFor, msToF, rackPaths, RECIPES, setKnob, tapTempo } from '../src/xair/effects';
import { applyNeed, currentNeed, gainAdvice, nudgeGain } from '../src/xair/guide';
import { dbToFader, faderToDb } from '../src/xair/levels';
import { applyPreset, FAMILIES, LIBRARY, presetFromChannel, presetPaths } from '../src/xair/presets';
import { destinations, levelPaths, shares, sources, whoHearsPaths } from '../src/xair/whoHears';
import { addAuto, AUTO_MAX, listAutos } from '../src/store/sessions';
import { XAirClient } from '../src/xair/XAirClient';
import { wiringPaths } from '../src/xair/wiring';
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
    applyPreset(c, 3, LIBRARY.find((p) => p.name === 'Basse · Ronde')!);
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
    assert.equal(d.length, 5); // XR16 : façade + 4 retours
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
  for (let k = 0; k < AUTO_MAX + 2; k++) await addAuto({ name: 'x', at: k, values: { '/lr/mix/fader': dbToFader(0) } }, 'test');
  const l = await listAutos();
  assert.equal(l.length, AUTO_MAX);
  assert.equal(l[0].at, AUTO_MAX + 1); // la plus récente d'abord
});

test('Branchements : prises, sorties, fils, relier et enlever', () =>
  withTable(10174, wiringPaths(), async (c, sim) => {
    const w = await import('../src/xair/wiring');
    const P = w.plugs(c);
    assert.equal(P.length, 16); // le simulateur est une XR16 : 16 prises, pas de LINE 17/18
    assert.deepEqual(P[0].chans, [1]); // prise 1 → voie 1 par défaut
    assert.equal(P[0].name, 'Voix');
    assert.ok(P.every((p) => !p.usb));
    const O = w.outlets(c);
    assert.equal(O.length, 5); // AUX 1-4 + façade
    assert.equal(O[0].label, 'AUX 1');
    assert.equal(O[0].name, 'Bassiste');
    const before = w.wires(c);
    assert.ok(before.some((x) => x.plug === 1 && x.out === 'main'));
    assert.ok(!before.some((x) => x.plug === 1 && x.out === 'bus3'));
    w.connect(c, P[0], { kind: 'bus', n: 3 });
    await sleep(80);
    assert.ok(Math.abs(faderToDb(sim.state.get(chLevelPath(1, { kind: 'bus', n: 3 }))!.v as number) - -6) < 0.1);
    w.nudge(c, w.wirePaths(P[0], { kind: 'bus', n: 3 }), 2);
    await sleep(80);
    assert.ok(Math.abs(faderToDb(sim.state.get(chLevelPath(1, { kind: 'bus', n: 3 }))!.v as number) - -4) < 0.1);
    w.disconnect(c, P[0], { kind: 'bus', n: 3 });
    await sleep(80);
    assert.equal(sim.state.get(chLevelPath(1, { kind: 'bus', n: 3 }))!.v, 0);
    const n = w.toAllReturns(c, P[3]); // basse → retours nommés (1 Bassiste, 2 Mon retour) ; déjà dans le 1
    assert.equal(n, 1);
    assert.match(w.wireD(1, 'main'), /^M80 110 C/);
    assert.ok(w.wireWidth(0) > w.wireWidth(-30));
  }));

test('Courbe EQ : plateaux, cloches, chemin SVG', async () => {
  const e = await import('../src/xair/eqCurve');
  const bands = [{ type: 1, hz: 100, db: -6, q: 1 }, { type: 2, hz: 1000, db: 4, q: 1 }, { type: 2, hz: 3000, db: 0, q: 1 }, { type: 4, hz: 10000, db: 3, q: 1 }];
  assert.ok(e.bandGainAt(bands[0], 30) < -4); // plateau grave bien en dessous
  assert.ok(Math.abs(e.bandGainAt(bands[1], 1000) - 4) < 0.01); // cloche au centre
  assert.ok(e.bandGainAt(bands[1], 100) < 0.5);
  assert.ok(e.bandGainAt(bands[3], 18000) > 2.5);
  const pts = e.curvePoints(bands, true, 100);
  assert.equal(pts.length, 65);
  assert.ok(pts[0][1] < -6, 'coupe-bas + plateau en bas');
  assert.ok(e.curvePoints(bands, false, null).every(([, g]) => g === 0));
  assert.match(e.curvePath(pts, 330, 150), /^M0\.0 /);
  assert.equal(e.bandName(80), 'Graves');
  assert.equal(e.bandName(4000), 'Présence');
});

test('Soirées : en cours, enregistrer, nouvelle, reprendre, export/import, table', () =>
  withTable(10175, [], async (c, sim) => {
    const S = await import('../src/store/sessions');
    const cur = await S.current();
    assert.match(cur.name, /^Soirée du/);
    await S.renameCurrent('Répèt chez Seb');
    const saved = await S.saveCurrentSession(c);
    assert.equal(saved.name, 'Répèt chez Seb');
    assert.ok(Object.keys(saved.snap.values).length > 50);
    // nouvelle soirée depuis une table vide : noms effacés, gains intacts
    const g = sim.state.get('/headamp/01/gain')!.v;
    const n = await S.startNewSession(c, 'blank');
    await sleep(150);
    assert.notEqual(n.id, cur.id);
    assert.equal(sim.state.get('/ch/01/config/name')!.v, '');
    assert.equal(sim.state.get('/ch/01/mix/fader')!.v, 0);
    assert.equal(sim.state.get('/headamp/01/gain')!.v, g);
    // reprendre l'ancienne
    const list = await S.listSessions();
    assert.equal(list[0].name, 'Répèt chez Seb');
    const { restore } = await import('../src/xair/snapshot');
    restore(c, list[0].snap);
    await sleep(200);
    assert.equal(sim.state.get('/ch/01/config/name')!.v, 'Voix');
    // export / import
    const txt = await S.exportSession(list[0]);
    assert.ok(txt.length > 1000);
    await S.deleteSession(list[0].id);
    assert.equal((await S.listSessions()).filter((x) => x.name === 'Répèt chez Seb').length, 0);
    const r = await S.importText(txt);
    assert.ok(r.restored.some((x) => x.includes('Répèt chez Seb')));
    assert.throws(() => JSON.parse('nope'));
    // snapshot interne de la table : nom + commande
    S.saveToTable(c, 3, 'Salle des fêtes 2026');
    await sleep(80);
    assert.equal(sim.state.get('/-snap/03/name')!.v, 'Salle des fê');
  }));

test('Journal : regroupe les gestes rapprochés, distingue moi / autre, phrases en clair', () =>
  withTable(10176, ['/headamp/01/gain', ...Array.from({ length: 6 }, (_, k) => `/bus/${k + 1}/mix/fader`)], async (c, sim) => {
    const { Journal } = await import('../src/store/journal');
    const j = new Journal();
    j.entries = [];
    const off = c.onChange((p, v, b, who) => j.record(c, p, v, b, who, Date.now()));
    c.set('/ch/01/mix/fader', f(0.8));
    c.set('/ch/01/mix/fader', f(0.85));
    c.set('/ch/01/mix/fader', f(0.9));
    assert.equal(j.entries.length, 1, 'trois gestes rapides = une ligne');
    assert.match(j.entries[0].text, /^Voix : façade/);
    assert.match(j.entries[0].text, /\+6\.0 dB$/);
    assert.equal(j.entries[0].who, 'moi');
    c.set('/ch/04/mix/on', i(0));
    assert.match(j.entries[0].text, /Basse : coupée/);
    // changement venu d'un autre appareil : le simulateur pousse une valeur (après l'écho de 300 ms)
    await sleep(350);
    sim.externalSet('/headamp/01/gain', f(0.6));
    await sleep(120);
    assert.equal(j.entries[0].who, 'autre');
    assert.match(j.entries[0].text, /Prise 1 : gain/);
    off();
    const { rescue, unrescue, checklist } = await import('../src/xair/rescue');
    const before = sim.state.get('/bus/1/mix/fader')!.v;
    const st = rescue(c);
    await sleep(80);
    assert.ok(faderToDb(sim.state.get('/bus/1/mix/fader')!.v as number) < faderToDb(before as number) - 5);
    unrescue(c, st);
    await sleep(80);
    assert.equal(sim.state.get('/bus/1/mix/fader')!.v, before);
    const ck = checklist(c, { balanceSaved: false, sessionSaved: true, wifiClient: true, limiters: 0, namedReturns: 1 });
    assert.equal(ck.find((x) => x.id === 'balance')!.ok, false);
    assert.equal(ck.find((x) => x.id === 'link')!.ok, true);
  }));
