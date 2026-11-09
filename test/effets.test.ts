import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i } from '../src/osc/osc';
import { applyAll, sendPath, snapAll, splitOff, users } from '../src/xair/fxSlots';
import { fxParPath, fxTypePath } from '../src/xair/effects';
import { capture, restore } from '../src/xair/snapshot';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';
import { fxPaths } from '../src/xair/fxSlots';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Effets : enregistrer / charger les 4, donner son propre effet, photo de soirée avec effets', async () => {
  const port = 10391;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await c.loadPaths(fxPaths());
    c.set(fxTypePath(1), i(2));
    c.set(fxParPath(1, 2), f(0.3));
    c.set(sendPath(1, 1), f(0.5));
    c.set(sendPath(2, 1), f(0.6));
    for (let k = 2; k <= 4; k++) for (let ch = 1; ch <= 16; ch++) c.set(sendPath(ch, k), f(0));
    await sleep(150);
    const set = snapAll(c, { 1: 'Ma plaque' }, 'Concert');
    c.set(fxParPath(1, 2), f(0.9));
    c.set(fxTypePath(1), i(0));
    await sleep(100);
    const names = applyAll(c, set);
    await sleep(150);
    assert.equal(names[1], 'Ma plaque');
    assert.equal(Number(c.get(fxTypePath(1))), 2);
    assert.ok(Math.abs(Number(c.get(fxParPath(1, 2))) - 0.3) < 0.01);

    const r = splitOff(c, 1, 2, names);
    await sleep(150);
    assert.ok(r, 'un emplacement libre doit être trouvé');
    assert.deepEqual(users(c, 1), [1]);
    assert.deepEqual(users(c, r!.slot), [2]);
    assert.equal(Number(c.get(fxTypePath(r!.slot))), 2);

    const snap = await capture(c, 'soirée');
    assert.ok('/fx/1/type' in snap.values && '/fx/1/par/02' in snap.values, 'la photo contient les effets');
    c.set(fxParPath(1, 2), f(0.95));
    await sleep(100);
    await restore(c, snap);
    await sleep(200);
    assert.ok(Math.abs(Number(c.get(fxParPath(1, 2))) - 0.3) < 0.01);
  } finally {
    c.close();
    sim.stop();
  }
});
