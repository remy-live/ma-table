import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupMove, linkedCount } from '../src/xair/groupTrim';
import { dbToFader, faderToDb } from '../src/xair/levels';

test('groupe : descendre à zéro puis remonter rend les écarts', () => {
  const k = 'bus1|9,10,11';
  let v = [dbToFader(0), dbToFader(-6), dbToFader(-20)];
  v = groupMove(k, v, dbToFader(-80)); // la plus basse passe sous −90
  assert.equal(v[2], 0);
  assert.equal(linkedCount(k, v), 3);
  v = groupMove(k, v, 0); // tout en bas
  assert.deepEqual(v, [0, 0, 0]);
  v = groupMove(k, v, dbToFader(0));
  assert.ok(Math.abs(faderToDb(v[1]) + 6) < 0.3);
  assert.ok(Math.abs(faderToDb(v[2]) + 20) < 0.3);
});

test('groupe : un niveau touché ailleurs, on repart des niveaux du moment', () => {
  const k = 'bus2|1,2';
  let v = [dbToFader(0), dbToFader(-10)];
  v = groupMove(k, v, dbToFader(-5));
  v = [v[0], dbToFader(-3)]; // quelqu'un a monté la 2 à la main
  v = groupMove(k, v, dbToFader(0));
  assert.ok(Math.abs(faderToDb(v[1])) < 0.3); // la 2 est devenue la plus forte
  assert.ok(Math.abs(faderToDb(v[0]) + 2) < 0.3);
});

test('groupe en bas : une prise remontée seule garde les autres en mémoire', () => {
  const k = 'bus3|5,6,7';
  let v = [dbToFader(0), dbToFader(-6), dbToFader(-12)];
  v = groupMove(k, v, 0); // groupe tout en bas
  v = [v[0], dbToFader(-20), v[2]]; // on remonte la caisse claire seule
  assert.equal(linkedCount(k, v), 3);
  v = groupMove(k, v, dbToFader(0));
  assert.ok(Math.abs(faderToDb(v[0])) < 0.3);
  assert.ok(Math.abs(faderToDb(v[2]) + 12) < 0.3); // la 3 revient à sa place
  assert.ok(Math.abs(faderToDb(v[1]) + 20) < 0.3); // la 2 prend le niveau qu'on lui a donné
});

test('groupe : une prise coupée à la main sort du groupe', () => {
  const k = 'bus4|1,2';
  let v = [dbToFader(0), dbToFader(-10)];
  v = groupMove(k, v, dbToFader(-5));
  v = [v[0], 0];
  v = groupMove(k, v, dbToFader(0));
  assert.equal(v[1], 0);
});
