import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from '../src/osc/osc';
import { eqPath } from '../src/xair/addresses';
import { copySettings } from '../src/xair/clipboard';
import { copyMix } from '../src/xair/groups';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const near = (a: unknown, b: number) => Math.abs(Number(a) - b) < 0.01;

test('Copier les réglages : une voie vers plusieurs, plusieurs voies appariées dans l’ordre', async () => {
  const port = 10394;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    c.set(eqPath(1, 2, 'g'), f(0.9));
    c.set(eqPath(2, 2, 'g'), f(0.2));
    await sleep(150);
    // une voie → deux voies
    assert.ok((await copySettings(c, [1], [5, 6], ['eq'])) > 0);
    await sleep(150);
    assert.ok(near(c.get(eqPath(5, 2, 'g')), 0.9) && near(c.get(eqPath(6, 2, 'g')), 0.9));
    // deux voies → deux autres, dans l'ordre
    await copySettings(c, [1, 2], [7, 8], ['eq']);
    await sleep(150);
    assert.ok(near(c.get(eqPath(7, 2, 'g')), 0.9), 'la 1re va sur la 1re');
    assert.ok(near(c.get(eqPath(8, 2, 'g')), 0.2), 'la 2e va sur la 2e');
    // nombre différent : refusé, rien ne bouge
    await assert.rejects(() => copySettings(c, [1, 2], [9], ['eq']));
  } finally { c.close(); sim.stop(); }
});

test('Copier un mix : le public vers un retour, pour toutes les voies ou une sélection', async () => {
  const port = 10395;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    const main = { kind: 'main' } as const;
    const bus3 = { kind: 'bus', n: 3 } as const;
    c.set('/ch/01/mix/fader', f(0.7));
    c.set('/ch/02/mix/fader', f(0.4));
    c.set('/ch/01/mix/03/level', f(0));
    c.set('/ch/02/mix/03/level', f(0));
    await sleep(150);
    copyMix(c, main, bus3, [1]);
    await sleep(150);
    assert.ok(near(c.get('/ch/01/mix/03/level'), 0.7));
    assert.ok(near(c.get('/ch/02/mix/03/level'), 0), 'la voie non cochée ne bouge pas');
    copyMix(c, main, bus3);
    await sleep(150);
    assert.ok(near(c.get('/ch/02/mix/03/level'), 0.4));
  } finally { c.close(); sim.stop(); }
});
