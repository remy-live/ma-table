// « Réglage de la balance » : une photo de la table qu'on peut rappeler d'un geste.
// La XR16 ne garde pas de scènes : c'est l'appli qui les stocke.

import { f, i, OscArg, OscValue, s } from '../osc/osc';
import { CATEGORIES, pathsFor } from './clipboard';
import { CH_COUNT } from './addresses';
import { XAirClient } from './XAirClient';

export interface Snapshot {
  name: string;
  at: number; // horodatage
  values: Record<string, OscValue>;
}

/** Tout ce qu'une photo contient : voies complètes, sorties, groupes, retours. */
export function snapshotPaths(): string[] {
  const p: string[] = [];
  for (let ch = 1; ch <= CH_COUNT; ch++) p.push(...pathsFor(ch, CATEGORIES.map((c) => c.id)), `/ch/${String(ch).padStart(2, '0')}/mix/fader`, `/ch/${String(ch).padStart(2, '0')}/mix/on`);
  p.push('/lr/mix/fader', '/lr/mix/on');
  for (let k = 1; k <= 4; k++) p.push(`/dca/${k}/fader`, `/dca/${k}/on`, `/rtn/${k}/mix/fader`);
  for (let b = 1; b <= 6; b++) p.push(`/bus/${b}/mix/fader`, `/bus/${b}/mix/on`);
  return p;
}

const argFor = (path: string, v: OscValue): OscArg =>
  typeof v === 'string' ? s(v) : /\/(on|type|phantom|invert|hpon|color|dca)$/.test(path) ? i(Number(v)) : f(Number(v));

export async function capture(client: XAirClient, name: string): Promise<Snapshot> {
  const paths = snapshotPaths();
  await client.loadPaths(paths, false);
  const values: Record<string, OscValue> = {};
  for (const p of paths) {
    const v = client.get(p);
    if (v !== undefined) values[p] = v;
  }
  return { name, at: Date.now(), values };
}

/** Nombre de réglages qui ont bougé depuis la photo (tolérance pour les flottants). */
export function changedCount(client: XAirClient, snap: Snapshot): number {
  let n = 0;
  for (const [p, v] of Object.entries(snap.values)) {
    const cur = client.get(p);
    if (cur === undefined) continue;
    if (typeof v === 'number' && typeof cur === 'number' ? Math.abs(v - cur) > 0.004 : v !== cur) n++;
  }
  return n;
}

/** Remet la table comme sur la photo (seulement ce qui a changé). */
export function restore(client: XAirClient, snap: Snapshot): number {
  let n = 0;
  for (const [p, v] of Object.entries(snap.values)) {
    const cur = client.get(p);
    const same = typeof v === 'number' && typeof cur === 'number' ? Math.abs(v - cur) <= 0.004 : v === cur;
    if (!same) {
      client.set(p, argFor(p, v));
      n++;
    }
  }
  return n;
}
