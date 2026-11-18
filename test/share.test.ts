import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bundle, QrCollector, qrFrames, parseBundle } from '../src/store/share';

const big: Bundle = {
  app: 'Ma table', version: 3, date: '2026-11-18', from: { model: 'XR18' },
  snap: { name: 'x', at: 1, values: Object.fromEntries(Array.from({ length: 900 }, (_, k) => [`/ch/${String((k % 16) + 1).padStart(2, '0')}/eq/${k}/g`, Math.round(Math.random() * 1000) / 1000])) },
  keys: { scene: { objs: Array.from({ length: 30 }, (_, k) => ({ id: 'o' + k, kind: 'mic', x: k, y: k, name: 'Voix ' + k })) }, soirees: [{ id: 'a', name: 'Fête' }] },
};

test('QR animé : on reconstitue le paquet, morceaux dans le désordre et en double', () => {
  const frames = qrFrames(big);
  assert.ok(frames.length > 3 && frames.length < 60, `images : ${frames.length}`);
  const c = new QrCollector();
  const order = [...frames].reverse().concat(frames.slice(0, 2));
  let out: Bundle | undefined;
  for (const f of order) { const r = c.add(f); assert.ok(r); if (r!.bundle) { out = r!.bundle; break; } }
  assert.deepEqual(out, big);
  assert.equal(c.add('https://autre-chose'), null);
});

test('ancien export (version 2) accepté', () => {
  const b = parseBundle(JSON.stringify({ app: 'Ma table', version: 2, date: 'd', session: { id: 's', name: 'Soirée' }, balance: null }));
  assert.equal((b.keys.soirees as { name: string }[])[0].name, 'Soirée');
});
