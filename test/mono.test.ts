import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from '../src/osc/osc';
import { panPath } from '../src/xair/addresses';
import { goMono, goStereo, isMono, monoPaths } from '../src/xair/mono';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Mono : tout au centre, puis retour en stéréo avec les panoramiques gardés', async () => {
  const port = 10392;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await c.loadPaths(monoPaths());
    c.set(panPath(1), f(0.1));
    c.set(panPath(2), f(0.9));
    await sleep(120);
    assert.equal(isMono(c), false);
    await goMono(c);
    await sleep(120);
    assert.equal(isMono(c), true);
    const n = await goStereo(c);
    await sleep(120);
    assert.equal(n, 2);
    assert.ok(Math.abs(Number(c.get(panPath(1))) - 0.1) < 0.01);
    assert.ok(Math.abs(Number(c.get(panPath(2))) - 0.9) < 0.01);
  } finally {
    c.close();
    sim.stop();
  }
});
