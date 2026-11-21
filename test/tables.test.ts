import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromX32, toX32 } from '../src/xair/x32Wire';
import { uiDbToFader, uiFaderToDb, uiToXair, xairToUi } from '../src/xair/uiTransport';
import { i } from '../src/osc/osc';

test('X32 : traduction aller-retour des adresses', () => {
  const cases: [string, string][] = [
    ['/lr/mix/fader', '/main/st/mix/fader'],
    ['/bus/3/config/name', '/bus/03/config/name'],
    ['/headamp/05/gain', '/headamp/004/gain'],
    ['/ch/07/mix/lr', '/ch/07/mix/st'],
    ['/ch/02/mix/fader', '/ch/02/mix/fader'],
  ];
  for (const [xa, x32] of cases) {
    assert.equal(toX32(xa, [])!.path, x32);
    assert.equal(fromX32(x32, [])!.path, xa);
  }
  assert.equal(toX32('/ch/05/config/insrc', [i(6)])!.args[0].v, 7);
  assert.equal(fromX32('/ch/05/config/source', [7])!.args[0], 6);
});

test('Soundcraft Ui : adresses et loi des faders', () => {
  assert.equal(xairToUi('/ch/01/mix/fader', 'ui24')!.key, 'i.0.mix');
  assert.equal(xairToUi('/ch/04/mix/03/level', 'ui24')!.key, 'i.3.aux.2.value');
  assert.equal(xairToUi('/ch/04/mix/11/level', 'ui24')!.key, 'i.3.fx.0.value');
  assert.equal(xairToUi('/headamp/02/gain', 'ui24')!.key, 'hw.1.gain');
  assert.equal(xairToUi('/headamp/02/gain', 'ui16')!.key, 'i.1.gain');
  assert.equal(uiToXair('a.2.name', 'ui24')!.path, '/bus/3/config/name');
  // 0 dB = 0,7647 sur une Ui (valeur de la bibliothèque soundcraft-ui-connection)
  assert.ok(Math.abs(uiDbToFader(0) - 0.76470588) < 1e-6);
  assert.ok(Math.abs(uiFaderToDb(uiDbToFader(-20)) + 20) < 0.01);
});

test('groupe replié : la prise isolée reste à sa place', async () => {
  const { foldCore } = await import('../src/xair/wiring');
  assert.deepEqual(foldCore([5, 9, 10, 11, 12, 13, 14, 15, 16]), [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(foldCore([1, 2, 4]), [1, 2]);
  assert.deepEqual(foldCore([1, 9]), [1, 9]);
});
