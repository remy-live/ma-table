// Courbe de l'égaliseur, dessinée à partir des 4 bandes (approximation
// visuelle : cloches gaussiennes en log(f), plateaux pour les bandes 1 et 4).
import { EQ_TYPES } from './addresses';

export interface Band {
  type: number; // EQ_TYPES
  hz: number;
  db: number;
  q: number;
}

const LOG_RATIO = Math.log(1000); // 20 Hz → 20 kHz

/** Position x (0..1) d'une fréquence sur l'axe log 20 Hz – 20 kHz. */
export const xOf = (hz: number) => Math.max(0, Math.min(1, Math.log(Math.max(20, hz) / 20) / LOG_RATIO));
export const hzAt = (x: number) => 20 * Math.pow(1000, Math.max(0, Math.min(1, x)));

/** Gain (dB) apporté par une bande à la fréquence f. */
export function bandGainAt(b: Band, hz: number): number {
  const d = Math.log(hz / b.hz);
  if (b.type === EQ_TYPES.lcut) return hz < b.hz ? -24 * Math.min(1, Math.log(b.hz / hz) / Math.log(2)) : 0;
  if (b.type === EQ_TYPES.hcut) return hz > b.hz ? -24 * Math.min(1, Math.log(hz / b.hz) / Math.log(2)) : 0;
  if (b.type === EQ_TYPES.lshv) return b.db * (1 / (1 + Math.exp(d * 3)));
  if (b.type === EQ_TYPES.hshv) return b.db * (1 / (1 + Math.exp(-d * 3)));
  const w = 0.9 / Math.max(0.3, b.q); // plus le Q est grand, plus la cloche est étroite
  return b.db * Math.exp(-(d * d) / (2 * w * w));
}

/** Points (x 0..1, gain dB) de la courbe complète, `n` points. */
export function curvePoints(bands: Band[], on: boolean, hpfHz: number | null, n = 64): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const x = k / n;
    const hz = hzAt(x);
    let g = 0;
    if (on) for (const b of bands) g += bandGainAt(b, hz);
    if (hpfHz) g += bandGainAt({ type: EQ_TYPES.lcut, hz: hpfHz, db: 0, q: 1 }, hz);
    out.push([x, Math.max(-24, Math.min(18, g))]);
  }
  return out;
}

/** Chemin SVG (viewBox w×h, 0 dB au milieu, ±18 dB = bords). */
export function curvePath(points: [number, number][], w: number, h: number): string {
  const y = (g: number) => h / 2 - (g / 18) * (h / 2);
  return points.map(([x, g], k) => `${k ? 'L' : 'M'}${(x * w).toFixed(1)} ${y(g).toFixed(1)}`).join(' ');
}

export const yOfDb = (g: number, h: number) => h / 2 - (Math.max(-18, Math.min(18, g)) / 18) * (h / 2);

/** Nom lisible d'une bande selon sa fréquence. */
export function bandName(hz: number): string {
  if (hz < 150) return 'Graves';
  if (hz < 600) return 'Bas-médiums';
  if (hz < 2500) return 'Médiums';
  if (hz < 6000) return 'Présence';
  return 'Brillance';
}
