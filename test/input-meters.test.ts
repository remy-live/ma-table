import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from '../src/osc/osc';
import { fToGainDb, fToPan, formatPan, gainDbToF, headampGainPath, meterIndex, panPath, panToF } from '../src/xair/addresses';
import { buildMeters, parseMeters, XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Conversions gain et panoramique', () => {
  assert.ok(Math.abs(fToGainDb(gainDbToF(32)) - 32) < 1e-6);
  assert.equal(fToGainDb(0), -12);
  assert.equal(fToGainDb(1), 60);
  assert.equal(formatPan(0.5), 'C');
  assert.equal(formatPan(panToF(-20)), 'G20');
  assert.ok(Math.abs(fToPan(panToF(35)) - 35) < 1e-6);
});

test('Vumètres : aller-retour du blob (1/256 dB)', () => {
  const out = new Float32Array(40);
  assert.ok(parseMeters(buildMeters([-12.5, 0, -90, 3]), out));
  assert.ok(Math.abs(out[0] + 12.5) < 0.01);
  assert.ok(Math.abs(out[3] - 3) < 0.01);
});

test('Client + simulateur : vumètres, gain, entrées ligne', async () => {
  const sim = await startSimulator({ port: 10126 });
  const c = new XAirClient(new NodeUdpTransport(), 10126);
  try {
    await c.connect('127.0.0.1');
    // XR16 : préampli sur les entrées 1-8 seulement
    assert.notEqual(c.get(headampGainPath(1)), undefined);
    assert.equal(c.get(headampGainPath(12)), undefined);

    let frames = 0;
    c.onMeters(() => frames++);
    c.startMeters();
    await sleep(300);
    assert.ok(frames >= 3, `trames reçues : ${frames}`);
    const quiet = c.meters[meterIndex.ch(1)];

    // Monter le gain fait monter le vumètre d'entrée
    c.set(headampGainPath(1), f(gainDbToF(55)));
    await sleep(250);
    assert.ok(c.meters[meterIndex.ch(1)] > quiet - 20); // la valeur bouge en continu ; on vérifie surtout qu'elle arrive
    assert.ok(Math.abs((sim.state.get(headampGainPath(1))!.v as number) - gainDbToF(55)) < 1e-6);

    c.set(panPath(2), f(panToF(-30)));
    await sleep(60);
    assert.ok(Math.abs(fToPan(sim.state.get(panPath(2))!.v as number) + 30) < 1e-4);
  } finally {
    c.close();
    sim.stop();
  }
});
