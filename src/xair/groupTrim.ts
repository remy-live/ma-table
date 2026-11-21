// Monter / baisser plusieurs prises ensemble sans perdre leur équilibre.
//
// Quand on descend le groupe, les prises les plus basses touchent −∞ avant les
// autres (et tout finit à zéro si on va en bas). Sans mémoire, en remontant on
// ne sait plus où elles étaient. On garde donc l'écart de chaque prise avec la
// plus forte tant que personne d'autre n'a touché ces niveaux : en remontant,
// chacune retrouve sa place.
import { dbToFader, faderToDb } from './levels';

type Mem = { top: number; off: (number | null)[] }; // off : dB sous la plus forte, null = pas reliée
const memo = new Map<string, Mem>();

const predict = (m: Mem) => m.off.map((o) => (o === null ? 0 : dbToFader(m.top + o)));
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 0.004);

/** La mémoire de ce groupe, si les niveaux n'ont pas bougé depuis. */
function current(key: string, vals: number[]): Mem | null {
  const m = memo.get(key);
  return m && same(predict(m), vals) ? m : null;
}

/** Combien de prises sont reliées (même celles descendues à −∞ par le groupe). */
export function linkedCount(key: string, vals: number[]): number {
  const m = current(key, vals);
  return m ? m.off.filter((o) => o !== null).length : vals.filter((v) => v > 0).length;
}

export type GroupBase = Mem;

/** Le point de départ d'un geste : la mémoire si elle tient encore, sinon les niveaux du moment. */
export function groupBase(key: string, vals: number[]): GroupBase | null {
  const m = current(key, vals);
  if (m) return m;
  const on = vals.filter((x) => x > 0);
  if (!on.length) return null;
  const top = Math.max(...on.map(faderToDb));
  return { top, off: vals.map((x) => (x > 0 ? faderToDb(x) - top : null)) };
}

/** Pose la plus forte à `topDb` (−∞ = tout en bas) et garde les écarts. */
export function groupAt(key: string, base: GroupBase, topDb: number): number[] {
  const next: Mem = { top: topDb <= -90 ? -Infinity : Math.min(10, topDb), off: base.off };
  memo.set(key, next);
  return predict(next);
}

/** Nouveaux niveaux (fader 0..1) quand la plus forte va à `v`. */
export function groupMove(key: string, vals: number[], v: number): number[] {
  const base = groupBase(key, vals);
  if (!base) return vals.map(() => v); // personne n'était relié : tout le monde au même niveau
  return groupAt(key, base, faderToDb(v));
}
