import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCable, EMPTY, fromChannels, gear, guessKind, moveZone, removeObj, smartType, Stage, syncWithTable, zoneTableCables } from '../src/store/stage';

test('scène : le bon câble par défaut', () => {
  const st: Stage = { objs: [{ id: 'v', kind: 'voix', x: 0, y: 0, name: 'Voix' }, { id: 'g', kind: 'guitare', x: 0, y: 0, name: 'G' }, { id: 'p', kind: 'pedalboard', x: 0, y: 0, name: 'P' }, { id: 'd', kind: 'di', x: 0, y: 0, name: 'DI' }, { id: 'r', kind: 'retour', x: 0, y: 0, name: 'R' }], cables: [] };
  assert.equal(smartType(st, { o: 'v' }, { plug: 1 }), 'xlr');
  assert.equal(smartType(st, { o: 'g' }, { o: 'p' }), 'jack');
  assert.equal(smartType(st, { o: 'd' }, { plug: 4 }), 'xlr');
  assert.equal(smartType(st, { out: 'aux1' }, { o: 'r' }), 'xlr');
  assert.equal(smartType(st, { o: 'g' }, { plug: 3 }), 'jack');
});

test('scène : plusieurs câbles, retrait d’un objet, matériel compté', () => {
  let st: Stage = { objs: [{ id: 'g', kind: 'guitare', x: 0, y: 0, name: 'G' }, { id: 'p', kind: 'pedalboard', x: 0, y: 0, name: 'P' }, { id: 'm', kind: 'micro', x: 0, y: 0, name: 'M' }], cables: [] };
  st = addCable(st, { o: 'g' }, { o: 'p' });
  st = addCable(st, { o: 'p' }, { plug: 3 }, 'jack');
  st = addCable(st, { o: 'p' }, { plug: 4 }, 'jack'); // stéréo : 2 câbles du même pédalier
  st = addCable(st, { o: 'm' }, { plug: 5 });
  st = addCable(st, { plug: 1 }, { plug: 2 }); // refusé : table vers table
  assert.equal(st.cables.length, 4);
  const g = Object.fromEntries(gear(st).map((x) => [x.key, x.n]));
  assert.equal(g.jack, 3);
  assert.equal(g.xlr, 1);
  assert.equal(g.micros, 1);
  assert.equal(g.pieds, 1);
  st = removeObj(st, 'p');
  assert.equal(st.cables.length, 1);
});

test('scène : remplie d’après les voies et les retours', () => {
  assert.equal(guessKind('Voix Rémy'), 'voix');
  assert.equal(guessKind('Basse'), 'basse');
  assert.equal(guessKind('Guitare élec'), 'guitare');
  assert.equal(guessKind('Guitare acou'), 'acoustique');
  assert.equal(guessKind('Kick'), 'kick');
  assert.equal(guessKind('Caisse claire'), 'snare');
  assert.equal(guessKind('Sax alto'), 'sax');
  const st = fromChannels([{ plug: 1, name: 'Voix' }, { plug: 3, name: 'Guitare élec' }, { plug: 4, name: 'Basse' }, { plug: 5, name: 'Kick' }, { plug: 6, name: 'Caisse claire' }], [{ n: 1, name: 'Bassiste' }]);
  const kinds = st.objs.map((o) => o.kind);
  for (const k of ['voix', 'guitare', 'pedalboard', 'ampli', 'micro', 'basse', 'di', 'kick', 'snare', 'retour']) assert.ok(kinds.includes(k as never), k);
  // chaque prise nommée est câblée, et le retour part de AUX 1
  for (const n of [1, 3, 4, 5, 6]) assert.ok(st.cables.some((c) => ('plug' in c.b && c.b.plug === n) || ('plug' in c.a && c.a.plug === n)), `prise ${n}`);
  assert.ok(st.cables.some((c) => 'out' in c.a && c.a.out === 'aux1'));
  assert.deepEqual(gear(EMPTY), []);
});

test('scène : cadres, faisceau, déplacement en bloc, synchro avec la table', () => {
  let st = fromChannels([{ plug: 1, name: 'Voix' }, { plug: 5, name: 'Kick' }, { plug: 6, name: 'Caisse claire' }, { plug: 7, name: 'Charley' }], []);
  const drums = st.zones!.find((z) => z.drums)!;
  assert.ok(drums.bundled, 'batterie en faisceau');
  assert.equal(zoneTableCables(st, drums.id).length, 3);
  const g = Object.fromEntries(gear(st).map((x) => [x.key, x.n]));
  assert.equal(g.xlr, 1); // la voix ; la batterie part en multipaire
  assert.ok(gear(st).some((x) => x.key.startsWith('snake-')));
  const before = st.objs.filter((o) => o.zone === drums.id).map((o) => o.x);
  st = moveZone(st, drums.id, -0.05, 0);
  const after = st.objs.filter((o) => o.zone === drums.id).map((o) => o.x);
  after.forEach((x, k) => assert.ok(Math.abs(x - (before[k] - 0.05)) < 1e-9));
  const r = syncWithTable(st, [{ plug: 1, name: 'Voix' }, { plug: 9, name: 'Sax' }]);
  assert.equal(r.added, 1);
  assert.ok(r.st.cables.some((c) => 'plug' in c.b && c.b.plug === 9));
});
