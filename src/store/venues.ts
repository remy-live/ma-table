// Balances gardées par salle : « Salle des fêtes », « Bar du coin »…
import { Snapshot } from '../xair/snapshot';
import { load, save } from './persist';

export interface Venue {
  name: string;
  at: number;
  snap: Snapshot;
}

export async function listVenues(): Promise<Venue[]> {
  return (await load<Venue[]>('salles', [])) ?? [];
}

export async function saveVenue(name: string, snap: Snapshot): Promise<Venue[]> {
  const list = [{ name, at: Date.now(), snap }, ...(await listVenues()).filter((v) => v.name.toLowerCase() !== name.toLowerCase())].slice(0, 30);
  await save('salles', list);
  return list;
}

export async function deleteVenue(name: string): Promise<Venue[]> {
  const list = (await listVenues()).filter((v) => v.name !== name);
  await save('salles', list);
  return list;
}
