// Groupes : sur la façade, on utilise les vrais groupes DCA de la table (elle
// les garde en mémoire, même si le téléphone se déconnecte). Pour les retours
// et les effets, la table n'a pas d'équivalent : l'appli déplace elle-même les
// envois de chaque membre du même nombre de dB, en gardant leur équilibre.

import { f } from '../osc/osc';
import { CH_COUNT, chDcaPath, chLevelPath, DCA_COUNT, dcaNamePath, inDca, MAIN, Target } from './addresses';
import { dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';

export interface Group {
  k: number; // numéro de DCA 1..4
  name: string;
  members: number[]; // numéros de voies
}

export function readGroups(client: XAirClient): Group[] {
  const groups: Group[] = [];
  for (let k = 1; k <= DCA_COUNT; k++) {
    const members: number[] = [];
    for (let ch = 1; ch <= CH_COUNT; ch++) {
      const mask = Number(client.get(chDcaPath(ch)) ?? 0);
      if (inDca(mask, k)) members.push(ch);
    }
    const name = String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`;
    groups.push({ k, name, members });
  }
  return groups;
}

/** Photo des niveaux des membres vers une cible, prise au début du geste. */
export function snapshot(client: XAirClient, members: number[], t: Target): Map<number, number> {
  const m = new Map<number, number>();
  for (const ch of members) m.set(ch, Number(client.get(chLevelPath(ch, t)) ?? 0));
  return m;
}

/** Décale tous les membres de deltaDb par rapport à la photo (une voie à -∞ reste à -∞). */
export function moveMembers(client: XAirClient, snap: Map<number, number>, t: Target, deltaDb: number) {
  for (const [ch, start] of snap) {
    if (start <= 0) continue;
    const db = Math.min(10, faderToDb(start) + deltaDb);
    client.set(chLevelPath(ch, t), f(dbToFader(db)));
  }
}

/** « Copier le mix façade » vers un retour : chaque envoi prend la valeur du fader façade. */
export function copyMainTo(client: XAirClient, t: Target) {
  for (let ch = 1; ch <= CH_COUNT; ch++) {
    const v = Number(client.get(chLevelPath(ch, MAIN)) ?? 0);
    client.set(chLevelPath(ch, t), f(v));
  }
}
