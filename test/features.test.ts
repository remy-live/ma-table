import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from '../src/osc/osc';
import {
  chLevelPath, eqPath, fToEqGain, fToHz, hpOnPath, inDca, MAIN, outPath, toggleDca, eqGainToF, hzToF, qToF, fToQ,
} from '../src/xair/addresses';
import { copyMainTo, moveMembers, readGroups, snapshot } from '../src/xair/groups';
import { faderToDb } from '../src/xair/levels';
import { applyPreset, PRESETS } from '../src/xair/presets';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e;

test('Adresses : façade, retours, effets', () => {
  assert.equal(chLevelPath(3, MAIN), '/ch/03/mix/fader');
  assert.equal(chLevelPath(3, { kind: 'bus', n: 2 }), '/ch/03/mix/02/level');
  assert.equal(chLevelPath(12, { kind: 'fx', n: 1 }), '/ch/12/mix/07/level');
  assert.equal(chLevelPath(12, { kind: 'fx', n: 4 }), '/ch/12/mix/10/level');
  assert.equal(outPath({ kind: 'bus', n: 2 }), '/bus/2/mix/fader');
  assert.equal(outPath({ kind: 'fx', n: 3 }), '/rtn/3/mix/fader');
});

test('Conversions EQ et masque DCA', () => {
  assert.ok(near(fToEqGain(eqGainToF(4.5)), 4.5));
  assert.ok(near(fToHz(hzToF(2500)), 2500, 0.01));
  assert.ok(near(fToQ(qToF(1.4)), 1.4));
  assert.equal(toggleDca(0, 1), 1);
  assert.equal(toggleDca(1, 3), 5);
  assert.ok(inDca(5, 3) && !inDca(5, 2));
});

async function withTable(fn: (c: XAirClient, sim: Awaited<ReturnType<typeof startSimulator>>) => Promise<void>) {
  const sim = await startSimulator({ port: 10125 });
  const c = new XAirClient(new NodeUdpTransport(), 10125);
  try {
    await c.connect('127.0.0.1');
    await fn(c, sim);
  } finally {
    c.close();
    sim.stop();
  }
}

test('Groupes : lus depuis la table (DCA 1 = Batterie, voies 5 à 9)', () =>
  withTable(async (c) => {
    const g = readGroups(c)[0];
    assert.equal(g.name, 'Batterie');
    assert.deepEqual(g.members, [5, 6, 7, 8, 9]);
  }));

test('Groupe sur un retour : les 5 voies bougent du même nombre de dB', () =>
  withTable(async (c, sim) => {
    const bus = { kind: 'bus' as const, n: 1 };
    await c.loadPaths([5, 6, 7, 8, 9].map((ch) => chLevelPath(ch, bus)));
    c.set(chLevelPath(6, bus), f(0.65)); // équilibre différent entre les voies
    await sleep(60);
    const snap = snapshot(c, [5, 6, 7, 8, 9], bus);
    moveMembers(c, snap, bus, -6);
    await sleep(80);
    for (const [ch, start] of snap) {
      const now = sim.state.get(chLevelPath(ch, bus))!.v as number;
      assert.ok(near(faderToDb(now) - faderToDb(start), -6, 0.05), `CH ${ch}`);
    }
  }));

test('Copier le mix façade vers un retour', () =>
  withTable(async (c, sim) => {
    const bus = { kind: 'bus' as const, n: 2 };
    c.set(chLevelPath(4, MAIN), f(0.42));
    copyMainTo(c, bus);
    await sleep(80);
    assert.ok(near(sim.state.get(chLevelPath(4, bus))!.v as number, 0.42));
  }));

test('Préréglage « Kick » envoyé à la table', () =>
  withTable(async (c, sim) => {
    applyPreset(c, 5, PRESETS.find((p) => p.name === 'Kick')!);
    await sleep(100);
    assert.ok(near(fToHz(sim.state.get(eqPath(5, 1, 'f'))!.v as number), 60, 0.1));
    assert.ok(near(fToEqGain(sim.state.get(eqPath(5, 2, 'g'))!.v as number), -6));
    assert.equal(sim.state.get(hpOnPath(5))!.v, 1);
    assert.equal(sim.state.get(chLevelPath(5, { kind: 'fx', n: 1 }))!.v, 0);
  }));
