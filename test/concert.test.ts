import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i } from '../src/osc/osc';
import { chDcaPath, dcaNamePath, eqPath, headampGainPath, inDca } from '../src/xair/addresses';
import { copyChannel, pasteChannel, swapChannels } from '../src/xair/clipboard';
import { capture, changedCount, restore } from '../src/xair/snapshot';
import { applySmartName, recognize } from '../src/xair/smartName';
import { load, save } from '../src/store/persist';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTable(port: number, fn: (c: XAirClient, sim: Awaited<ReturnType<typeof startSimulator>>) => Promise<void>) {
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await fn(c, sim);
  } finally {
    c.close();
    sim.stop();
  }
}

test('Copier / coller : seulement les catégories choisies, sur plusieurs voies', () =>
  withTable(10130, async (c, sim) => {
    c.set(eqPath(5, 2, 'g'), f(0.2));
    c.set(headampGainPath(5), f(0.8));
    c.set('/ch/05/config/name', { t: 's', v: 'Kick' });
    await sleep(60);
    const clip = await copyChannel(c, 5);
    pasteChannel(c, clip, [6, 7], ['eq']);
    await sleep(100);
    assert.ok(Math.abs((sim.state.get(eqPath(6, 2, 'g'))!.v as number) - 0.2) < 1e-6);
    assert.ok(Math.abs((sim.state.get(eqPath(7, 2, 'g'))!.v as number) - 0.2) < 1e-6);
    assert.notEqual(sim.state.get(headampGainPath(6))!.v, 0.8); // entrée non cochée : pas collée
    assert.equal(sim.state.get('/ch/06/config/name')!.v, 'Caisse claire'); // nom non coché
  }));

test('Échanger deux voies', () =>
  withTable(10131, async (c, sim) => {
    await swapChannels(c, 1, 4);
    await sleep(120);
    assert.equal(sim.state.get('/ch/01/config/name')!.v, 'Basse');
    assert.equal(sim.state.get('/ch/04/config/name')!.v, 'Voix');
  }));

test('Revenir à la balance', () =>
  withTable(10132, async (c, sim) => {
    const snap = await capture(c, 'Balance');
    assert.equal(changedCount(c, snap), 0);
    c.set('/ch/01/mix/fader', f(0.2));
    c.set('/ch/02/mix/on', i(0));
    await sleep(50);
    assert.equal(changedCount(c, snap), 2);
    assert.equal(restore(c, snap), 2);
    await sleep(80);
    assert.ok(Math.abs((sim.state.get('/ch/01/mix/fader')!.v as number) - 0.7) < 1e-6);
    assert.equal(sim.state.get('/ch/02/mix/on')!.v, 1);
    assert.equal(changedCount(c, snap), 0);
  }));

test('Renommage intelligent', () =>
  withTable(10133, async (c, sim) => {
    assert.equal(recognize('grosse caisse')?.label, 'Kick');
    assert.equal(recognize('Guitare élec')?.label, 'Guitare élec');
    assert.equal(recognize('Ukulélé'), null);
    // CH 12 nommé « Chant » -> Voix, couleur magenta, groupe « Voix » créé, préréglage Voix
    applySmartName(c, 12, 'Chant', recognize('Chant'), { color: true, group: true, preset: true });
    await sleep(120);
    assert.equal(sim.state.get('/ch/12/config/name')!.v, 'Voix');
    assert.equal(sim.state.get('/ch/12/config/color')!.v, 5);
    const k = [1, 2, 3, 4].find((n) => sim.state.get(dcaNamePath(n))?.v === 'Voix')!;
    assert.ok(k > 1, 'groupe Voix créé dans un groupe libre');
    assert.ok(inDca(Number(sim.state.get(chDcaPath(12))!.v), k));
    assert.equal(sim.state.get('/ch/12/headamp')?.v, undefined); // jamais de 48 V automatique
  }));

test('Sauvegarde locale (mémoire en test)', async () => {
  await save('ordre', [3, 1, 2]);
  assert.deepEqual(await load('ordre', []), [3, 1, 2]);
  assert.deepEqual(await load('inconnu', 'défaut'), 'défaut');
});
