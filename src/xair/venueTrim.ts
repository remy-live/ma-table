// Nouvelle salle : retouches légères après un refrain tous ensemble.
export const MAX_TRIM = 3; // dB : on retouche, on ne refait pas la balance
export const LR_TARGET = -10; // dB : pic visé en façade

/** Retouche de gain pour une voie : ramène le pic vers −12, sans dépasser ±3 dB. */
export function trimFor(peak: number): number {
  if (!isFinite(peak) || peak < -55) return 0;
  if (peak > -6) return -Math.min(MAX_TRIM, peak + 12);
  if (peak < -22) return Math.min(MAX_TRIM, -12 - peak);
  return 0;
}

