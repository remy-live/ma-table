import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auxLabel, explain, setLevel, word, words2 } from '../src/ui/words';

test('Les mots : simple + technique, technique seul, simple seul', () => {
  setLevel({ words: 'double' });
  assert.equal(word('gate'), 'Anti-bruit · gate');
  assert.deepEqual(words2('phantom'), { main: 'Alimentation du micro', sub: '48 V · phantom' });
  assert.equal(auxLabel(2, 'Seb'), 'Retour de Seb · AUX 2');
  assert.equal(word('phantom', { narrow: true }), '48V'); // bouton étroit : le sigle
  setLevel({ words: 'technique' });
  assert.equal(word('gate'), 'gate');
  assert.equal(auxLabel(2, 'Seb'), 'AUX 2 · Seb');
  setLevel({ words: 'simple' });
  assert.equal(word('gate'), 'Anti-bruit');
  assert.equal(auxLabel(3, ''), 'Retour 3');
  assert.match(explain('phase'), /Ø · phase/);
  setLevel({ words: 'double' });
});

test('Ø : on garde la position la plus pleine, sinon on ne change rien', async () => {
  const { phaseVerdict } = await import('../src/xair/phasePair');
  assert.equal(phaseVerdict(-20, -16), 'inverser');
  assert.equal(phaseVerdict(-16, -20), 'garder');
  assert.equal(phaseVerdict(-18, -17.5), 'pareil');
  assert.equal(phaseVerdict(-80, -70), 'pareil'); // personne ne jouait
});
