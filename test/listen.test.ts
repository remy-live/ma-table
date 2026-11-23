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
