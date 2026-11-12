// Essai contre l'émulateur X32 (github.com/pmaillot/X32-Behringer, programme X32) :
//   ./X32 -i 127.0.0.1   puis   npx tsx tools/x32-emu-check.ts
// Vérifie que l'appli (qui parle « X Air ») sait lire et écrire sur une X32.
import { NodeUdpTransport } from '../sim/nodeTransport';
import { XAirClient } from '../src/xair/XAirClient';
import { CH_COUNT, chLevelPath, MODEL, BUS_COUNT } from '../src/xair/addresses';
import { f, i, s } from '../src/osc/osc';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const c = new XAirClient(new NodeUdpTransport());
  const info = await c.connect('127.0.0.1');
  console.log('xinfo', info, 'famille', MODEL.family, 'voies', CH_COUNT, 'retours', BUS_COUNT);
  const checks: [string, () => void, string, unknown][] = [
    ['nom voie 20', () => c.set('/ch/20/config/name', s('Kick X32')), '/ch/20/config/name', 'Kick X32'],
    ['fader voie 32', () => c.set('/ch/32/mix/fader', f(0.6)), '/ch/32/mix/fader', 0.6],
    ['façade (/lr)', () => c.set('/lr/mix/fader', f(0.7)), '/lr/mix/fader', 0.7],
    ['nom retour 9', () => c.set('/bus/9/config/name', s('Batteur')), '/bus/9/config/name', 'Batteur'],
    ['envoi voie 3 → retour 11', () => c.set(chLevelPath(3, { kind: 'bus', n: 11 }), f(0.5)), chLevelPath(3, { kind: 'bus', n: 11 }), 0.5],
    ['envoi voie 3 → FX2 (bus 14)', () => c.set(chLevelPath(3, { kind: 'fx', n: 2 }), f(0.4)), chLevelPath(3, { kind: 'fx', n: 2 }), 0.4],
    ['gain prise 25', () => c.set('/headamp/25/gain', f(0.55)), '/headamp/25/gain', 0.55],
    ['48 V prise 1', () => c.set('/headamp/01/phantom', i(1)), '/headamp/01/phantom', 1],
    ['source voie 5 = prise 7', () => c.set('/ch/05/config/insrc', i(6)), '/ch/05/config/insrc', 6],
    ['DCA 7', () => c.set('/dca/7/fader', f(0.3)), '/dca/7/fader', 0.3],
    ['pente coupe-bas', () => c.set('/ch/02/preamp/hpslope', i(2)), '/ch/02/preamp/hpslope', 2],
    ['gate mode', () => c.set('/ch/02/gate/mode', i(3)), '/ch/02/gate/mode', 3],
  ];
  let ok = 0;
  for (const [label, act, path, want] of checks) {
    act();
    await sleep(80);
    // on oublie la valeur locale et on relit la table
    (c as unknown as { state: Map<string, unknown> }).state.delete(path);
    (c as unknown as { lastLocal: Map<string, number> }).lastLocal.delete(path);
    c.query(path);
    await sleep(120);
    const got = c.get(path);
    const good = typeof want === 'number' ? Math.abs(Number(got) - want) < 0.01 : got === want;
    if (good) ok++;
    console.log(good ? '✓' : '×', label, '→', got);
  }
  let frames = 0;
  c.onMeters(() => frames++);
  c.startMeters();
  await sleep(1500);
  console.log('vumètres reçus :', frames);
  console.log(`${ok}/${checks.length}`);
  c.close();
  process.exit(ok === checks.length ? 0 : 1);
})();
