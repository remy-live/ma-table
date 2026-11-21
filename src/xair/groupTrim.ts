// Monter / baisser plusieurs prises ensemble sans perdre leur équilibre,
// comme un vrai groupe (DCA) de table.
//
// L'appli retient, pour chaque prise, son niveau « de référence » et, pour le
// groupe, un décalage commun g (en dB, −∞ = groupe tout en bas) :
//     niveau de la prise = référence + g
// Descendre le groupe jusqu'en bas puis remonter rend donc à chacune sa place.
// Si on retouche une prise seule, seule SA référence change : les autres gardent
// la leur. Une prise remontée seule pendant que le groupe est en bas reprend sa
// place dans le groupe dès qu'on le remonte. Une prise coupée à la main sort du groupe.
import { dbToFader, faderToDb } from './levels';

type Mem = { ref: (number | null)[]; g: number };
const memo = new Map<string, Mem>();

const close = (a: number, b: number) => Math.abs(a - b) < 0.004;
const predict = (m: Mem) => m.ref.map((r) => (r === null ? 0 : dbToFader(r + m.g)));
const maxRef = (m: Mem) => Math.max(...m.ref.filter((r): r is number => r !== null));

export type GroupBase = Mem;

/** L'état du groupe, recalé sur les niveaux du moment (les retouches à la main sont prises en compte). */
export function groupBase(key: string, vals: number[]): GroupBase | null {
  const old = memo.get(key);
  let m: Mem;
  if (old && old.ref.length === vals.length) {
    const pred = predict(old);
    const ref = old.ref.map((r, k) => {
      if (close(pred[k], vals[k])) return r;
      if (vals[k] <= 0) return null; // coupée à la main : elle sort du groupe
      // retouchée à la main : seule sa référence change
      return faderToDb(vals[k]) - (isFinite(old.g) ? old.g : 0);
    });
    m = { ref, g: old.g };
  } else {
    m = { ref: vals.map((v) => (v > 0 ? faderToDb(v) : null)), g: 0 };
  }
  if (!m.ref.some((r) => r !== null)) return null;
  memo.set(key, m);
  return m;
}

/** Combien de prises sont reliées (même celles descendues à −∞ par le groupe). */
export function linkedCount(key: string, vals: number[]): number {
  const m = groupBase(key, vals);
  return m ? m.ref.filter((r) => r !== null).length : 0;
}

/** Où est le groupe (fader 0..1 de la plus forte) : 0 quand il est tout en bas. */
export function groupTop(key: string, vals: number[]): number {
  const m = groupBase(key, vals);
  return m ? dbToFader(maxRef(m) + m.g) : 0;
}

/** Pose la plus forte à `topDb` (−90 ou moins = tout en bas) et garde les écarts. */
export function groupAt(key: string, base: GroupBase, topDb: number): number[] {
  const top = Math.min(10, topDb);
  const next: Mem = { ref: base.ref, g: top <= -90 ? -Infinity : top - maxRef(base) };
  memo.set(key, next);
  return predict(next);
}

/** Nouveaux niveaux (fader 0..1) quand la plus forte va à `v`. */
export function groupMove(key: string, vals: number[], v: number): number[] {
  const base = groupBase(key, vals);
  if (!base) return vals.map(() => v); // personne n'était relié : tout le monde au même niveau
  return groupAt(key, base, faderToDb(v));
}
