import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IS, readWifiClient, sweep, writeWifiClient } from '../src/xair/network';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Enregistrer le Wi-Fi à rejoindre dans la table', async () => {
  const sim = await startSimulator({ port: 10140 });
  const c = new XAirClient(new NodeUdpTransport(), 10140);
  try {
    await c.connect('127.0.0.1');
    writeWifiClient(c, 'iPhone de Rémy', 'motdepasse123');
    await sleep(80);
    assert.equal(sim.state.get(IS.ssid)!.v, 'iPhone de Rémy');
    assert.equal(sim.state.get(IS.key)!.v, 'motdepasse123');
    assert.equal(sim.state.get(IS.security)!.v, 3);
    assert.equal(sim.state.get(IS.mode)!.v, 0);
    const back = await readWifiClient(c);
    assert.equal(back.ssid, 'iPhone de Rémy');
  } finally {
    c.close();
    sim.stop();
  }
});

test('Balayer un réseau pour retrouver la table (sans diffusion)', async () => {
  const sim = await startSimulator({ port: 10141 });
  try {
    const found = await sweep(new NodeUdpTransport(), ['127.0.0'], 400, 10141);
    assert.ok(found.length >= 1, 'table trouvée');
    assert.equal(found[0].name, 'XR16-SIMU');
  } finally {
    sim.stop();
  }
});
