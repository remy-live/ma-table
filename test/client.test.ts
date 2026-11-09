import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, f, i, s } from '../src/osc/osc';
import { dbToFader, faderToDb, formatDb } from '../src/xair/levels';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('OSC : aller-retour des types i, f, s', () => {
  const b = encode('/ch/01/config/name', [s('Caisse claire'), i(-3), f(0.75)]);
  assert.equal(b.length % 4, 0);
  const m = decode(b)!;
  assert.equal(m.address, '/ch/01/config/name');
  assert.equal(m.types, 'sif');
  assert.deepEqual(m.args, ['Caisse claire', -3, 0.75]);
});

test('OSC : message sans argument (requête)', () => {
  const m = decode(encode('/lr/mix/fader'))!;
  assert.equal(m.address, '/lr/mix/fader');
  assert.deepEqual(m.args, []);
});

test('Niveaux : 0.75 = 0 dB, aller-retour dB', () => {
  assert.equal(faderToDb(0.75), 0);
  assert.equal(faderToDb(1), 10);
  assert.equal(formatDb(0), '-∞');
  for (const db of [-60, -30, -12, -3, 0, 6]) assert.ok(Math.abs(faderToDb(dbToFader(db)) - db) < 1e-6);
});

test('Client + simulateur : connexion, lecture, envoi, réception', async () => {
  const sim = await startSimulator({ port: 10124 });
  const client = new XAirClient(new NodeUdpTransport(), 10124);
  try {
    const info = await client.connect('127.0.0.1', 16);
    assert.equal(info.name, 'XR16-SIMU');
    assert.equal(client.status, 'connecté');

    // Lecture de l'état de la table au démarrage
    assert.equal(client.get('/ch/06/config/name'), 'Caisse claire');
    assert.ok(Math.abs((client.get('/lr/mix/fader') as number) - 0.75) < 1e-6);

    // Téléphone -> table (envoi lissé : 20 gestes, la table reçoit la dernière valeur)
    for (let k = 0; k <= 20; k++) client.set('/ch/01/mix/fader', f(k / 40));
    await sleep(80);
    assert.ok(Math.abs((sim.state.get('/ch/01/mix/fader')!.v as number) - 0.5) < 1e-6);

    // Table -> téléphone (réglage fait ailleurs)
    const seen: number[] = [];
    client.on('/ch/02/mix/fader', (v) => seen.push(v as number));
    sim.externalSet('/ch/02/mix/fader', f(0.3));
    await sleep(80);
    assert.ok(Math.abs((client.get('/ch/02/mix/fader') as number) - 0.3) < 1e-6);
    assert.equal(seen.length, 1);

    // Renommer une voie
    client.set('/ch/03/config/name', s('Ukulélé'));
    await sleep(80);
    assert.equal(sim.state.get('/ch/03/config/name')!.v, 'Ukulélé');

    // Écho ignoré pendant qu'on bouge le fader
    client.set('/ch/04/mix/fader', f(0.9));
    sim.externalSet('/ch/04/mix/fader', f(0.1)); // arrive pendant le geste
    await sleep(60);
    assert.ok(Math.abs((client.get('/ch/04/mix/fader') as number) - 0.9) < 1e-6);
  } finally {
    client.close();
    sim.stop();
  }
});

test('Client : table absente -> erreur claire', async () => {
  const client = new XAirClient(new NodeUdpTransport(), 10199);
  await assert.rejects(client.connect('127.0.0.1', 16, 300), /ne répond pas/);
  client.close();
});
