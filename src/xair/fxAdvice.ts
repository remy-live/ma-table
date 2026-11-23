// Quel effet conseiller à une voie, d'après son nom.
import { familyRank } from './reorder';

/** Conseil pour une voie d'après son nom. */
export function adviseFor(name: string): { slot: number | null; db: number; why: string; extra?: { slot: number; db: number } } {
  const r = familyRank(name);
  if (r === 0) return { slot: 1, db: -12, why: 'Un peu de réverbe pour que la voix respire', extra: { slot: 3, db: -20 } };
  if (r === 1) return { slot: 1, db: -10, why: 'Les chœurs se fondent mieux avec un peu plus de réverbe' };
  if (r === 2) return /acou|folk/i.test(name) ? { slot: 2, db: -14, why: 'Une petite salle donne du corps à l’acoustique' } : { slot: 2, db: -18, why: 'Juste un soupçon : l’ampli a souvent déjà sa réverbe' };
  if (r === 3 || r === 4) return { slot: 2, db: -15, why: 'Une pièce naturelle autour de l’instrument' };
  if (r === 7) return { slot: 2, db: -14, why: 'La caisse claire sonne plus grande' };
  if (r === 9) return { slot: 2, db: -16, why: 'Les toms gagnent un peu de profondeur' };
  if (r === 10) return { slot: 2, db: -20, why: 'Très peu : les overheads captent déjà la salle' };
  if (r === 5 || r === 6 || r === 8) return { slot: null, db: 0, why: 'Mieux sec : la réverbe brouille les graves et le charley' };
  return { slot: null, db: 0, why: 'Pas de conseil pour ce nom' };
}

