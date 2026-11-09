// Détection de saturation des entrées (logique pure).
import { CH_COUNT } from './addresses';

export const CLIP_DB = -1;

/** Voies qui ont saturé dans les dernières `holdMs`. `last` garde l'heure du dernier rouge par voie. */
export function clipped(meters: ArrayLike<number>, now: number, last: Map<number, number>, holdMs = 4000): number[] {
  for (let c = 1; c <= CH_COUNT; c++) if ((meters[c - 1] ?? -90) >= CLIP_DB) last.set(c, now);
  return [...last.entries()].filter(([, t]) => now - t < holdMs).map(([c]) => c);
}
