import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f, i } from '../src/osc/osc';
import { dbToFader, faderToDb } from '../src/xair/levels';
import {
  captureMonitor, commonName, DEFAULT_RIGHTS, inviteLink, limiterOn, linkPath, monitorChanges, monitorGroups, monitorPaths,
  monitorSources, parseInvite, parseShortCode, plusDeMoi, plusDesAutres, restoreMonitor, sendPath, setLimiter,
} from '../src/xair/monitor';
import { qrMatrix } from '../src/ui/qrMatrix';
import { XAirClient } from '../src/xair/XAirClient';
import { NodeUdpTransport } from '../sim/nodeTransport';
import { startSimulator } from '../sim/xr16-sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db = (sim: Awaited<ReturnType<typeof startSimulator>>, p: string) => faderToDb(sim.state.get(p)!.v as number);

async function withTable(port: number, fn: (c: XAirClient, sim: Awaited<ReturnType<typeof startSimulator>>) => Promise<void>) {
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await c.loadPaths(monitorPaths(1));
    await fn(c, sim);
  } finally {
    c.close();
    sim.stop();
  }
}

test('Invitation : lien et code court aller-retour', () => {
  const link = inviteLink({ host: '172.20.10.2', bus: 1, name: 'Bassiste é', me: [4], rights: DEFAULT_RIGHTS });
  assert.match(link, /^matable:\/\/retour\?/);
  const back = parseInvite(link)!;
  assert.equal(back.host, '172.20.10.2');
  assert.equal(back.bus, 1);
  assert.equal(back.name, 'Bassiste é');
  assert.deepEqual(back.me, [4]);
  assert.deepEqual(back.rights, DEFAULT_RIGHTS);
  assert.equal(parseInvite('matable://retour?ip=1.2.3.4&bus=9'), null); // bus impossible
  assert.deepEqual(parseShortCode('172.20.10.2 · 3'), { host: '172.20.10.2', bus: 3 });
  assert.deepEqual(parseShortCode('192.168.1.5 2'), { host: '192.168.1.5', bus: 2 });
  assert.equal(parseShortCode('bonjour'), null);
  assert.ok(qrMatrix(link).length >= 25); // le QR code se calcule sans module natif
});

test('Noms stéréo', () => {
  assert.equal(commonName('Clavier G', 'Clavier D'), 'Clavier');
  assert.equal(commonName('OH 1', 'OH 2'), 'OH');
  assert.equal(commonName('Kick', 'Caisse'), 'Kick / Caisse');
});

test('Plus de moi / Plus des autres : seul le bus du musicien bouge', () =>
  withTable(10160, async (c, sim) => {
    const src = monitorSources(c, 1, false);
    const before5 = db(sim, sendPath(5, 1));
    const bus2 = sim.state.get(sendPath(4, 2))!.v;
    plusDeMoi(c, src, [4]);
    await sleep(100);
    assert.ok(Math.abs(db(sim, sendPath(4, 1)) - (faderToDb(0.55) + 2)) < 0.3, 'ma basse +2 dB');
    assert.ok(Math.abs(db(sim, sendPath(5, 1)) - before5) < 0.01, 'le kick ne bouge pas');
    plusDesAutres(c, src, [4]);
    await sleep(100);
    assert.ok(Math.abs(db(sim, sendPath(5, 1)) - (before5 + 2)) < 0.3, 'le kick +2 dB');
    assert.equal(sim.state.get(sendPath(12, 1))!.v, 0, 'une voie coupée reste coupée');
    assert.equal(sim.state.get(sendPath(4, 2))!.v, bus2, 'le retour d’un autre ne bouge pas');
  }));

test('Groupes dans le retour et voies liées en stéréo', () =>
  withTable(10161, async (c, sim) => {
    c.set(linkPath(1), i(1));
    await sleep(60);
    const src = monitorSources(c, 1, true);
    const pair = src.find((s) => s.id === 'ch1-2')!;
    assert.ok(pair && pair.stereo && pair.paths.length === 2);
    assert.ok(src.some((s) => s.id === 'fx1') && src.some((s) => s.id === 'aux'));
    const { groups } = monitorGroups(c, src);
    assert.equal(groups[0].name, 'Batterie');
    assert.equal(groups[0].sources.length, 5);
    void sim;
  }));

test('Balance du retour : gardée avec son bus, refusée sur un autre', () =>
  withTable(10162, async (c, sim) => {
    const src = monitorSources(c, 1, false);
    const bal = captureMonitor(c, 1, src);
    c.set(sendPath(3, 1), f(dbToFader(-20)));
    c.set(sendPath(3, 2), f(0.9));
    await sleep(80);
    assert.equal(monitorChanges(c, bal), 1);
    assert.equal(restoreMonitor(c, bal, 2), false, 'pas sur le retour 2');
    assert.equal(restoreMonitor(c, bal, 1), true);
    await sleep(100);
    assert.ok(Math.abs((sim.state.get(sendPath(3, 1))!.v as number) - 0.55) < 1e-6);
    assert.ok(Math.abs((sim.state.get(sendPath(3, 2))!.v as number) - 0.9) < 1e-6, 'le retour 2 garde son réglage');
  }));

test('Protège-oreilles : compresseur du bus en limiteur', () =>
  withTable(10163, async (c, sim) => {
    setLimiter(c, 1, true);
    await sleep(80);
    assert.equal(sim.state.get('/bus/1/dyn/on')!.v, 1);
    assert.equal(sim.state.get('/bus/1/dyn/ratio')!.v, 11);
    assert.ok(Math.abs((sim.state.get('/bus/1/dyn/thr')!.v as number) - 0.9) < 1e-6); // −6 dB sur −60..0
    assert.ok(limiterOn(c, 1));
    setLimiter(c, 1, false);
    await sleep(80);
    assert.equal(sim.state.get('/bus/1/dyn/on')!.v, 0);
  }));
