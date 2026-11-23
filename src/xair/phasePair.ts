// Deux micros sur le même instrument (caisse claire dessus / dessous, grosse
// caisse dedans / dehors, basse DI + micro) peuvent s'annuler en partie : le son
// devient creux. On repère ces paires par leurs noms, et on compare le niveau du
// mélange avec et sans l'inversion (Ø) de l'un des deux.
import { CH_COUNT, chNamePath } from './addresses';
import { familyRank } from './reorder';
import { XAirClient } from './XAirClient';

/** Familles où deux micros sur la même source sont courants : basse, grosse caisse, caisse claire. */
const PAIRABLE = new Set([5, 6, 7]);

/** L'autre voie qui prend le même instrument que `ch`, s'il y en a une. */
export function phasePartner(client: XAirClient, ch: number): number | null {
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '');
  const r = familyRank(name(ch));
  if (!name(ch) || !PAIRABLE.has(r)) return null;
  for (let c = 1; c <= CH_COUNT; c++) if (c !== ch && name(c) && familyRank(name(c)) === r) return c;
  return null;
}

/** Niveaux moyens (dB) du mélange sans puis avec l'inversion : que garder ? */
export function phaseVerdict(normalDb: number, invertedDb: number): 'inverser' | 'garder' | 'pareil' {
  if (!isFinite(normalDb) || !isFinite(invertedDb) || Math.max(normalDb, invertedDb) < -50) return 'pareil';
  const d = invertedDb - normalDb;
  return d >= 1.5 ? 'inverser' : d <= -1.5 ? 'garder' : 'pareil';
}
