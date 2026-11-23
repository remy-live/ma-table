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

test('Invitation : niveaux de droits dans le lien', async () => {
  const { inviteLink, parseInvite, rightsFor, levelOf, DEFAULT_RIGHTS } = await import('../src/xair/monitor');
  const r = rightsFor('voies', DEFAULT_RIGHTS);
  const back = parseInvite(inviteLink({ host: '192.168.1.5', bus: 2, name: 'Seb', me: [4], rights: r }))!;
  assert.equal(levelOf(back.rights), 'voies');
  assert.ok(back.rights.chans && back.rights.fx && !back.rights.full);
  assert.equal(levelOf(parseInvite(inviteLink({ host: 'x', bus: 1, name: 'a', me: [], rights: rightsFor('tout', DEFAULT_RIGHTS) }))!.rights), 'tout');
});

test('Sans l’appli : la page ne règle que le retour invité', async () => {
  const { handleRemote } = await import('../src/web/remoteApi');
  const { DEFAULT_RIGHTS, sendPath } = await import('../src/xair/monitor');
  const port = 10398;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await sleep(200);
    c.set('/ch/01/config/name', { t: 's', v: 'Voix' });
    const inv = new Map([['abc', { host: 'x', bus: 2, name: 'Seb', me: [1], rights: DEFAULT_RIGHTS }]]);
    assert.ok(JSON.parse(handleRemote(c, inv, 'GET', '/api/state?k=zzz').body).ok === false); // mauvaise clé
    const st = JSON.parse(handleRemote(c, inv, 'GET', '/api/state?k=abc').body);
    assert.equal(st.bus, 2);
    const k = st.sources.findIndex((s: { label: string }) => s.label === 'Voix');
    handleRemote(c, inv, 'POST', `/api/do?k=abc&a=set&i=${k}&db=-6`);
    assert.ok(Math.abs(Number(c.get(sendPath(1, 2))) - 0.6) < 0.02); // −6 dB dans le bus 2
    const before = c.get('/headamp/01/gain');
    handleRemote(c, inv, 'POST', '/api/do?k=abc&a=gain&ch=1&db=3'); // pas le droit : rien ne bouge
    assert.equal(c.get('/headamp/01/gain'), before);
    assert.match(handleRemote(c, inv, 'GET', '/').body, /Mon retour/);
  } finally { c.close(); sim.stop(); }
});

test('Réorganiser : la voix passe en 1, les réglages et la prise la suivent', async () => {
  const { applyOrder, orderByFamily } = await import('../src/xair/reorder');
  const port = 10399;
  const sim = await startSimulator({ port });
  const c = new XAirClient(new NodeUdpTransport(), port);
  try {
    await c.connect('127.0.0.1');
    await sleep(200);
    c.set('/ch/01/config/name', { t: 's', v: 'Kick' });
    c.set('/ch/07/config/name', { t: 's', v: 'Voix' });
    c.set('/ch/07/eq/1/g', f(0.8));
    c.set('/ch/07/mix/02/level', f(0.6));
    await sleep(100);
    const order = orderByFamily(c);
    assert.equal(order[0], 7);
    await applyOrder(c, order);
    await sleep(100);
    assert.equal(c.get('/ch/01/config/name'), 'Voix');
    assert.ok(Math.abs(Number(c.get('/ch/01/eq/1/g')) - 0.8) < 0.01);
    assert.ok(Math.abs(Number(c.get('/ch/01/mix/02/level')) - 0.6) < 0.01);
    assert.equal(Number(c.get('/ch/01/config/insrc')), 6); // la voie 1 écoute la prise 7
    const kickAt = Array.from({ length: 16 }, (_, k) => k + 1).find((ch) => c.get(`/ch/${String(ch).padStart(2, '0')}/config/name`) === 'Kick')!;
    assert.equal(Number(c.get(`/ch/${String(kickAt).padStart(2, '0')}/config/insrc`)), 0); // le kick écoute toujours la prise 1
  } finally { c.close(); sim.stop(); }
});

test('Nouvelle salle : retouches de gain plafonnées à ±3 dB', async () => {
  const { trimFor } = await import('../src/xair/venueTrim');
  assert.equal(trimFor(-12), 0);
  assert.equal(trimFor(-2), -3); // trop fort ici
  assert.equal(trimFor(-7), 0);
  assert.equal(trimFor(-40), 3);
  assert.equal(trimFor(-70), 0); // rien entendu : on ne touche pas
});

test('Effets conseillés selon l’instrument', async () => {
  const { adviseFor } = await import('../src/xair/fxAdvice');
  assert.equal(adviseFor('Voix').slot, 1);
  assert.equal(adviseFor('Grosse caisse').slot, null);
  assert.equal(adviseFor('Caisse claire').slot, 2);
  assert.equal(adviseFor('Basse').slot, null);
});
