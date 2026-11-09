// Sauvegarde automatique : à chaque connexion, une photo complète de la table
// est gardée (les 5 dernières). Si quelqu'un a tout déréglé, on revient en arrière.
import { capture, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from './persist';

export const AUTO_KEY = 'autos';
export const AUTO_MAX = 5;

export async function listAutos(): Promise<Snapshot[]> {
  return (await load<Snapshot[]>(AUTO_KEY, [])) ?? [];
}

export async function addAuto(snap: Snapshot): Promise<Snapshot[]> {
  const list = [snap, ...(await listAutos())].slice(0, AUTO_MAX);
  await save(AUTO_KEY, list);
  return list;
}

export async function autoBackup(client: XAirClient): Promise<Snapshot | null> {
  if (client.hostAddress === 'demo') return null;
  const snap = await capture(client, `Connexion à ${client.info?.name ?? 'la table'}`);
  if (Object.keys(snap.values).length < 10) return null; // table muette : rien à garder
  await addAuto(snap);
  return snap;
}
