// Guetteur de larsen : un retour (ou la façade) qui reste très fort à un niveau
// presque constant pendant plus d'une seconde, c'est souvent un sifflement.
// On ne touche à rien tout seul : on propose de baisser.

export interface LarsenHit { idx: number; db: number }

export class LarsenWatcher {
  private hist = new Map<number, number[]>();
  private quietUntil = new Map<number, number>();
  constructor(
    private idxs: number[],
    private opts = { win: 24, minDb: -8, spread: 2.5 }, // ~1,2 s à 20 images/s
  ) {}

  /** Une trame de vumètres (dB) → l'index qui siffle, s'il y en a un. */
  push(m: ArrayLike<number>, now: number): LarsenHit | null {
    let hit: LarsenHit | null = null;
    for (const k of this.idxs) {
      const h = this.hist.get(k) ?? [];
      h.push(m[k] ?? -90);
      if (h.length > this.opts.win) h.shift();
      this.hist.set(k, h);
      if (h.length < this.opts.win || now < (this.quietUntil.get(k) ?? 0)) continue;
      const lo = Math.min(...h);
      const hi = Math.max(...h);
      if (lo >= this.opts.minDb && hi - lo <= this.opts.spread && (!hit || hi > hit.db)) hit = { idx: k, db: hi };
    }
    return hit;
  }

  /** Ne plus prévenir pour cet index pendant `ms`. */
  snooze(idx: number, now: number, ms: number) {
    this.quietUntil.set(idx, now + ms);
    this.hist.set(idx, []);
  }
}
