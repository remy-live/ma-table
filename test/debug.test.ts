import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDiagnostic } from '../src/debug/diagnostic';
import { clearLog, getEntries, traffic } from '../src/debug/log';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

test('Diagnostic complet contre le simulateur', async () => {
  clearLog();
  const sim = await startSimulator({ port: 10150 });
  const c = new XAirClient(new NodeUdpTransport(), 10150);
  try {
    await c.connect('127.0.0.1');
    const r = await runDiagnostic(c, 'test', undefined, 300);
    for (const part of ['--- Table ---', '--- Réseau ---', '--- Effets', 'FX1 type=', 'Coupe-bas  brut=', 'IN 01 :', 'IN 12 : pas de préampli', '--- Vumètres ---', '=== FIN ===']) {
      assert.ok(r.includes(part), 'manque : ' + part);
    }
    assert.ok(/\d+ blocs reçus/.test(r));
    const ents = getEntries();
    assert.ok(ents.some((e) => e.msg.startsWith('Table : XR16-SIMU')), 'entrées : ' + ents.length + ' ' + JSON.stringify(ents.slice(0, 3)));
    assert.ok((traffic.out.get('/xinfo') ?? 0) >= 1 && (traffic.in.get('/xinfo') ?? 0) >= 1);
  } finally {
    c.close();
    sim.stop();
  }
});
