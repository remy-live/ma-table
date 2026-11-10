// Détection de saturation des entrées (logique pure).
import { CH_COUNT } from './addresses';

export const CLIP_DB = -1;

/** Voies qui ont saturé dans les dernières `holdMs`. `last` garde l'heure du dernier rouge par voie. */
export function clipped(meters: ArrayLike<number>, now: number, last: Map<number, number>, holdMs = 4000): number[] {
  for (let c = 1; c <= CH_COUNT; c++) if ((meters[c - 1] ?? -90) >= CLIP_DB) last.set(c, now);
  return [...last.entries()].filter(([, t]) => now - t < holdMs).map(([c]) => c);
}

/** Historique de la soirée : combien de fois chaque voie a saturé, et quand la dernière fois.
 *  Un « coup » = la voie passe au rouge après au moins 3 s sans rouge. */
export interface ClipEvent { ch: number; count: number; last: number }
const history = new Map<number, ClipEvent>();
const lastRed = new Map<number, number>();
const listeners = new Set<() => void>();
export function recordClips(meters: ArrayLike<number>, now: number) {
  let changed = false;
  for (let c = 1; c <= CH_COUNT; c++) {
    if ((meters[c - 1] ?? -90) < CLIP_DB) continue;
    const prev = lastRed.get(c) ?? 0;
    lastRed.set(c, now);
    if (now - prev < 3000) continue;
    const e = history.get(c) ?? { ch: c, count: 0, last: 0 };
    history.set(c, { ch: c, count: e.count + 1, last: now });
    changed = true;
  }
  if (changed) listeners.forEach((l) => l());
}
export const clipHistory = (): ClipEvent[] => [...history.values()].sort((a, b) => b.count - a.count);
export function clearClipHistory() { history.clear(); listeners.forEach((l) => l()); }
export function onClipHistory(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
