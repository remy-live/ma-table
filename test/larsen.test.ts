import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LarsenWatcher } from '../src/xair/larsenWatch';

const frame = (k: number, db: number) => { const a = new Array(40).fill(-90); a[k] = db; return a; };

test('un niveau fort et constant est signalé', () => {
  const w = new LarsenWatcher([26, 36]);
  let hit: { idx: number } | null = null;
  for (let t = 0; t < 30; t++) hit = w.push(frame(26, -3 + (t % 2) * 0.3), t * 50) ?? hit;
  assert.equal(hit?.idx, 26);
});

test('de la musique qui bouge ne déclenche rien', () => {
  const w = new LarsenWatcher([26]);
  let hit: { idx: number } | null = null;
  for (let t = 0; t < 60; t++) hit = w.push(frame(26, -6 - (t % 5) * 3), t * 50) ?? hit;
  assert.equal(hit, null);
});

test('après « non, ça va », plus d’alerte pendant la pause', () => {
  const w = new LarsenWatcher([36]);
  for (let t = 0; t < 30; t++) w.push(frame(36, -2), t * 50);
  w.snooze(36, 1500, 60000);
  let hit: { idx: number } | null = null;
  for (let t = 30; t < 90; t++) hit = w.push(frame(36, -2), t * 50) ?? hit;
  assert.equal(hit, null);
});
