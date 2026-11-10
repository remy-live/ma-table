// « Préparer chez moi » : on règle l'appli sans table (noms, couleurs, groupes,
// qui entend quoi, effets), puis on envoie tout à la vraie table en arrivant.
// Les gains et le 48 V ne sont jamais envoyés : ils dépendent des vrais micros.
import { capture, restore, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from './persist';

export interface Prepared { snap: Snapshot; savedAt: number; sent?: number }
const KEY = 'preparation';

export async function savePrepared(client: XAirClient): Promise<Prepared> {
  const snap = await capture(client, 'Préparé chez moi');
  const p: Prepared = { snap, savedAt: Date.now() };
  await save(KEY, p);
  return p;
}
export const loadPrepared = () => load<Prepared | null>(KEY, null);
export async function markSent() {
  const p = await loadPrepared();
  if (p) await save(KEY, { ...p, sent: Date.now() });
}
/** Envoie la préparation à la table, sans gains ni 48 V. Renvoie le nombre de réglages changés. */
export function sendPrepared(client: XAirClient, p: Prepared): number {
  const values = Object.fromEntries(Object.entries(p.snap.values).filter(([k]) => !k.startsWith('/headamp/')));
  return restore(client, { ...p.snap, values });
}
