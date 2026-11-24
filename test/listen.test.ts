import test from 'node:test';
import assert from 'node:assert/strict';
import { activeLevel, autoGainDb, bars, decodeB64, engineParams, keptSeconds, keptSegments, mixScale, regionGain } from '../src/xair/listen';

test('coupes : ce qui reste du concert', () => {
  assert.deepEqual(keptSegments([], 100), [[0, 100]]);
  assert.deepEqual(keptSegments([{ type: 'cut', a: 10, b: 20 }], 100), [[0, 10], [20, 100]]);
  assert.deepEqual(keptSegments([{ type: 'cut', a: 10, b: 20 }, { type: 'keep', a: 5, b: 50 }], 100), [[5, 10], [20, 50]]);
  assert.equal(keptSeconds(keptSegments([{ type: 'cut', a: 0, b: 30 }, { type: 'cut', a: 20, b: 40 }], 100)), 60);
});

test('niveau par passage : toutes les pistes ou une seule, fondus', () => {
  const e = [{ type: 'gain' as const, a: 10, b: 20, db: 6, k: 2 }, { type: 'fadeOut' as const, a: 90, b: 100 }];
  assert.ok(Math.abs(regionGain(e, 2, 15) - 1.995) < 0.01);
  assert.equal(regionGain(e, 1, 15), 1);
  assert.equal(regionGain(e, 2, 25), 1);
  assert.ok(Math.abs(regionGain(e, 0, 95) - 0.5) < 1e-9);
});

test('niveau automatique : une piste faible est remontée, une vide est laissée', () => {
  const quiet = new Uint8Array(100).fill(60), loud = new Uint8Array(100).fill(230), empty = new Uint8Array(100).fill(3);
  const gq = autoGainDb(activeLevel(quiet))!, gl = autoGainDb(activeLevel(loud))!;
  assert.ok(gq > gl + 15);
  assert.equal(autoGainDb(activeLevel(empty)), null);
  assert.ok(mixScale([{ peaks: loud, gain: 4 }, { peaks: loud, gain: 4 }]) < 0.3);
});

test('ondes, base64, réglages du lecteur', () => {
  assert.deepEqual(Array.from(decodeB64('AQID/w==')), [1, 2, 3, 255]);
  const p = new Uint8Array([0, 254, 255, 100]);
  const b = bars(p, 1, 0, 4, 4, () => 1, [[0, 3]]);
  assert.equal(b[1].h, 1);
  assert.equal(b[2].clip, true);
  assert.equal(b[3].gone, true);
  const ep = engineParams({ gains: [1], pans: [0], master: 1, total: 100, edits: [{ type: 'cut', a: 10, b: 20 }, { type: 'gain', a: 1, b: 2, db: -6, k: null }, { type: 'fadeIn', a: 0, b: 1 }] });
  assert.deepEqual(ep.kept, [0, 10, 20, 100]);
  assert.equal(ep.regs[0].k, -1);
  assert.equal(ep.fades[0].rising, true);
  assert.deepEqual(engineParams({ gains: [], pans: [], master: 1, total: 100, edits: [] }).kept, []);
});

import { buildMix, emptyMix, findBlanks, guessRole, procFor } from '../src/xair/listen';

test('instrument deviné au nom de la voie, même tronqué', () => {
  assert.equal(guessRole('Voix_41'), 'Voix');
  assert.equal(guessRole('Voix 2_41'), 'Chœurs');
  assert.equal(guessRole('09 Grosse ca_3'), 'Grosse caisse');
  assert.equal(guessRole('C. claire_4'), 'Caisse claire');
  assert.equal(guessRole('Tom floor_8'), 'Tom');
  assert.equal(guessRole('Oh droite_10'), 'Cymbales');
  assert.equal(guessRole('Basse_18'), 'Basse');
  assert.equal(guessRole('Guitare E_17'), 'Guitare');
  assert.equal(guessRole('Acoustic_17'), 'Guitare');
  assert.equal(guessRole('Truc'), 'Autre');
});

test('nettoyage : débrayable, et plus fort = plus de compression', () => {
  const soft = procFor('Voix', -20, 0, () => false), hard = procFor('Voix', -20, 2, () => false);
  assert.ok(hard.redDb > soft.redDb && hard.thr < soft.thr);
  assert.equal(procFor('Voix', -20, 1, (k) => k === 'comp').thr, 0);
  assert.equal(procFor('Voix', -20, 1, () => false).gate, 0);
  assert.ok(procFor('Tom', -20, 1, () => false).gate > 0);
  assert.equal(procFor('Tom', null, 1, () => false).hp, 0);
});

test('blancs : début, milieu, fin', () => {
  const p = new Uint8Array(500).fill(200);
  p.fill(5, 0, 50); p.fill(5, 200, 260); p.fill(5, 300, 310); p.fill(5, 450, 500);
  const b = findBlanks(p, 0.2, 100);
  assert.deepEqual(b.map((x) => x.where), ['début', 'milieu', 'fin']);
  assert.ok(b[1].a > 40 && b[1].b < 52);
});

test('mix complet : « avant » enlève nettoyage et finition', () => {
  const tr = [{ key: 'a', name: 'Voix', pan: 0 }, { key: 'b', name: 'Basse', pan: 0 }];
  const pk = { a: new Uint8Array(100).fill(120), b: new Uint8Array(100).fill(160) };
  const m = buildMix(tr, pk, emptyMix(), null, 20), raw = buildMix(tr, pk, emptyMix(), null, 20, true);
  assert.ok(m.params.eq && m.params.glue && m.params.thr[0] > 0 && m.params.hp[1] === 35);
  assert.ok(!raw.params.eq && raw.params.thr[0] === 0 && raw.params.hp[0] === 0);
  assert.equal(buildMix(tr, pk, emptyMix(), 1, 20).params.gains[0], 0);
});
