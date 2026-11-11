import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setModel } from '../src/xair/addresses';
import { makePlan } from '../src/xair/magicPlan';

const band = [
  { name: 'Rémy', kinds: ['voix', 'guitareAcou'] as const, retour: true },
  { name: 'Bassiste', kinds: ['basse', 'choeurs'] as const, retour: true },
  { name: 'Batteur', kinds: ['batterie3'] as const, retour: true },
].map((m) => ({ ...m, kinds: [...m.kinds] }));

test('baguette XR18 : voix d’abord, batterie à la suite, un retour chacun', () => {
  setModel('XR18');
  const p = makePlan(band);
  assert.deepEqual(p.plugs.map((x) => x.label), ['Voix', 'Chœurs', 'Guitare acou', 'Basse', 'Kick', 'Caisse claire', 'Overhead']);
  assert.equal(p.plugs[0].plug, 1);
  assert.deepEqual(p.retours.map((r) => r.name), ['Rémy', 'Bassiste', 'Batteur']);
  const batteur = p.retours[2].mix;
  const basse = p.plugs.find((x) => x.label === 'Basse')!.plug;
  assert.equal(batteur.find((m) => m.plug === basse)?.need, 'moyen');
  const remy = p.retours[0].mix;
  assert.equal(remy.find((m) => m.plug === 1)?.need, 'fort');
  assert.equal(p.warnings.length, 0);
});

test('baguette XR12 : micros sur 1-4, sources ligne sur les jacks, pas assez d’AUX', () => {
  setModel('XR12');
  const p = makePlan(band);
  const mics = p.plugs.filter((x) => x.mic);
  assert.ok(mics.slice(0, 4).every((x) => x.plug <= 4));
  assert.ok(p.plugs.filter((x) => !x.mic).every((x) => x.plug > 4));
  assert.equal(p.retours.length, 2);
  assert.ok(p.warnings.some((w) => /AUX/.test(w)));
  setModel('XR18');
});
