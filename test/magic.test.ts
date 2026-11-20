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

test('baguette : intras stéréo sur une paire, enceinte partagée', () => {
  setModel('XR18');
  const b = [
    { name: 'Rémy', kinds: ['voix'], retour: true, ecoute: 'wedge' },
    { name: 'Bassiste', kinds: ['basse'], retour: true, ecoute: 'iem', stereo: true },
    { name: 'Guitare', kinds: ['guitareElec', 'choeurs'], retour: true, ecoute: 'wedge', avec: 0 },
    { name: 'Batteur', kinds: ['batterie3'], retour: true },
  ] as any;
  const p = makePlan(b);
  const bass = p.retours.find((r) => r.who === 1)!;
  assert.ok(bass.stereo);
  assert.deepEqual(bass.buses, [3, 4]); // AUX 1 pris par Rémy, 2 laissé libre, paire 3-4
  const remy = p.retours.find((r) => r.who === 0)!;
  assert.deepEqual(remy.listeners, [0, 2]);
  const guit = p.plugs.find((x) => x.label === 'Guitare élec')!.plug;
  assert.equal(remy.mix.find((m) => m.plug === guit)?.need, 'moyen'); // le guitariste s'entend dans l'enceinte commune
  assert.equal(p.retours.find((r) => r.who === 3)!.bus, 2); // le trou est rempli
  assert.equal(p.retours.length, 3);
});
