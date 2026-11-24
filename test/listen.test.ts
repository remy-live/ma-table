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

import { tailorEq, smartGate, autoPans, loudFactor, compExtra, parseAnalysis, Analysis } from '../src/xair/listen';
const flatAn = (over: Record<number, number> = {}): Analysis => ({ bands: Array.from({ length: 27 }, (_, b) => -30 - Math.abs(b - 12) * 1.2 + (over[b] ?? 0)), hist: Array(91).fill(0), rmsDb: -28, peakDb: -6, crestDb: 15, active: 0.8 });
test('Étude : rabote une résonance et seulement elle, épargne la fondamentale de la basse', () => {
  const eq = tailorEq('Autre', flatAn({ 9: 8 }));
  assert.equal(eq.length, 1);
  assert.equal(eq[0].f, 320);
  assert.ok(eq[0].db < 0 && eq[0].db >= -6);
  assert.equal(tailorEq('Autre', flatAn()).length, 0);
  assert.ok(!tailorEq('Basse', flatAn({ 2: 9 })).some((b) => b.q === 3));
});
test('Étude : bas-médium en trop sur une voix (jamais plus de −4 dB), place pour la voix dans les guitares', () => {
  const a = flatAn(); for (let b = 6; b <= 10; b++) a.bands[b] += 14;
  const c = tailorEq('Voix', a).find((b) => b.f === 250);
  assert.ok(c && c.db < 0 && c.db >= -4);
  assert.ok(tailorEq('Guitare', flatAn(), true).some((b) => b.f === 3200 && b.db < 0));
  assert.ok(tailorEq('Voix', flatAn()).every((b) => b.db >= -4 && b.db <= 3));
});
test('Anti-repisse intelligent : seuil entre frappes et repisse, rien si tout se mélange', () => {
  const two = flatAn(); two.hist = two.hist.map((_, i) => Math.round(900 * Math.exp(-((i - 48) ** 2) / 30) + 300 * Math.exp(-((i - 74) ** 2) / 20)));
  const g = smartGate(two);
  assert.ok(g != null && g > -42 && g < -16, String(g));
  const one = flatAn(); one.hist = one.hist.map((_, i) => Math.round(600 * Math.exp(-((i - 66) ** 2) / 40)));
  assert.equal(smartGate(one), null);
});
test('Placement, volume final et compression suivent les mesures', () => {
  assert.deepEqual(autoPans(['Voix', 'Guitare', 'Basse', 'Guitare', 'Tom', 'Tom', 'Tom']), [0, 0.35, 0, -0.35, -0.3, 0, 0.3]);
  assert.ok(Math.abs(loudFactor(-23, 'std')! - 2) < 0.05);
  assert.equal(loudFactor(null, 'std'), undefined);
  assert.equal(compExtra('Voix', { ...flatAn(), crestDb: 22 }), 3);
  assert.equal(parseAnalysis('pas du json'), null);
});
