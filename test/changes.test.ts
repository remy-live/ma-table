import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i } from '../src/osc/osc';
import { headampGainPath, gainDbToF, outOnPath } from '../src/xair/addresses';
import { describe, record, undoChanges } from '../src/xair/changeLog';
import { isKilled, killAll, restoreAll } from '../src/xair/killAll';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Ce qui a changé : badge par prise, annuler une prise', async () => {
  const port = 10396;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await sleep(200);
    c.set(headampGainPath(3), f(gainDbToF(20)));
    c.set('/ch/05/mix/fader', f(0.5));
    await sleep(100);
    const r = record(c, 'essai');
    c.set(headampGainPath(3), f(gainDbToF(26)));
    c.set('/ch/05/mix/fader', f(0.6));
    const set = r.stop()!;
    const d = describe(c, set);
    const p3 = d.plugs.find((x) => x.plug === 3)!;
    assert.ok(p3.badges[0].startsWith('Gain +6'));
    assert.ok(d.plugs.find((x) => x.plug === 5)!.badges[0].startsWith('Fader +4'));
    undoChanges(c, set, p3.paths);
    assert.ok(Math.abs(Number(c.get(headampGainPath(3))) - gainDbToF(20)) < 0.01);
    assert.equal(Number(c.get('/ch/05/mix/fader')), 0.6); // l'autre prise ne bouge pas
  } finally { c.close(); sim.stop(); }
});

test('Tout couper : rétablir ne rallume que ce qui était allumé', async () => {
  const port = 10397;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await sleep(200);
    c.set(outOnPath({ kind: 'bus', n: 2 }), i(0)); // retour 2 déjà coupé exprès
    c.set(outOnPath({ kind: 'main' }), i(1));
    killAll(c);
    assert.ok(isKilled());
    assert.equal(Number(c.get(outOnPath({ kind: 'main' }))), 0);
    restoreAll(c);
    assert.equal(Number(c.get(outOnPath({ kind: 'main' }))), 1);
    assert.equal(Number(c.get(outOnPath({ kind: 'bus', n: 2 }))), 0);
    assert.ok(!isKilled());
  } finally { c.close(); sim.stop(); }
});
