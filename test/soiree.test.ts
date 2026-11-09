import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from '../src/osc/osc';
import { load } from '../src/store/persist';
import { saveCurrentSession, startNewSession } from '../src/store/sessions';
import { changedCount, Snapshot } from '../src/xair/snapshot';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Concert : enregistrer la soirée fixe le point de retour ; « dernier enregistrement » y revient', async () => {
  const port = 10393;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    c.set('/ch/01/mix/fader', f(0.6));
    await sleep(120);
    const sess = await saveCurrentSession(c);
    const bal = await load<Snapshot | null>('balance', null);
    assert.ok(bal, 'enregistrer la soirée fixe le point de retour');
    assert.equal(bal!.at, sess.snap.at);
    assert.equal(changedCount(c, bal!), 0);

    c.set('/ch/01/mix/fader', f(0.2)); // ça bouge pendant le concert
    await sleep(120);
    assert.ok(changedCount(c, bal!) >= 1);

    await startNewSession(c, 'balance'); // nouvelle soirée depuis le dernier enregistrement
    await sleep(250);
    assert.ok(Math.abs(Number(c.get('/ch/01/mix/fader')) - 0.6) < 0.01, 'le fader revient à la valeur enregistrée, pas à celle du concert');
  } finally {
    c.close();
    sim.stop();
  }
});
