// Groupes : sur la façade, on utilise les vrais groupes DCA de la table (elle
// les garde en mémoire, même si le téléphone se déconnecte). Pour les retours
// et les effets, la table n'a pas d'équivalent : l'appli déplace elle-même les
// envois de chaque membre du même nombre de dB, en gardant leur équilibre.

import { f } from '../osc/osc';
import { CH_COUNT, chDcaPath, chLevelPath, DCA_COUNT, dcaNamePath, inDca, MAIN, Target, targetId } from './addresses';
import { groupAt, GroupBase, groupBase } from './groupTrim';
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

const bases = new WeakMap<Map<number, number>, { key: string; base: GroupBase | null }>();

/** Photo des niveaux des membres vers une cible, prise au début du geste. */
export function snapshot(client: XAirClient, members: number[], t: Target): Map<number, number> {
  const m = new Map<number, number>();
  for (const ch of members) m.set(ch, Number(client.get(chLevelPath(ch, t)) ?? 0));
  const key = `${targetId(t)}|${[...m.keys()].join(',')}`;
  bases.set(m, { key, base: groupBase(key, [...m.values()]) });
  return m;
}

/** Décale tous les membres de deltaDb par rapport à la photo. Une voie descendue à −∞ par le
 *  groupe retrouve sa place en remontant ; une voie qui n'était pas reliée reste à −∞. */
export function moveMembers(client: XAirClient, snap: Map<number, number>, t: Target, deltaDb: number) {
  const b = bases.get(snap);
  if (!b?.base) return;
  const r = b.base.ref.filter((x): x is number => x !== null);
  const top = isFinite(b.base.g) ? Math.max(...r) + b.base.g : -90;
  const next = groupAt(b.key, b.base, top + deltaDb);
  [...snap.keys()].forEach((ch, k) => client.set(chLevelPath(ch, t), f(next[k])));
}

/** « Copier le mix façade » vers un retour : chaque envoi prend la valeur du fader façade. */
export function copyMainTo(client: XAirClient, t: Target) {
  for (let ch = 1; ch <= CH_COUNT; ch++) {
    const v = Number(client.get(chLevelPath(ch, MAIN)) ?? 0);
    client.set(chLevelPath(ch, t), f(v));
  }
}

/** Copie ce qu'entend `src` vers `dst`, pour les voies données (toutes par défaut). Renvoie le nombre de voies copiées. */
export function copyMix(client: XAirClient, src: Target, dst: Target, channels?: number[]): number {
  const list = channels ?? Array.from({ length: CH_COUNT }, (_, k) => k + 1);
  let n = 0;
  for (const ch of list) {
    const v = client.get(chLevelPath(ch, src));
    if (v === undefined) continue;
    client.set(chLevelPath(ch, dst), f(Number(v)));
    n++;
  }
  return n;
}
