// Conversion position de fader X Air (0..1) <-> dB.
// Courbe à 4 segments utilisée par les X Air / X32 : 0.75 = 0 dB, 1 = +10 dB.

export function faderToDb(f: number): number {
  if (f <= 0) return -Infinity;
  if (f >= 0.5) return f * 40 - 30;
  if (f >= 0.25) return f * 80 - 50;
  if (f >= 0.0625) return f * 160 - 70;
  return f * 480 - 90;
}

export function dbToFader(db: number): number {
  if (!isFinite(db) || db <= -90) return 0;
  let f: number;
  if (db >= -10) f = (db + 30) / 40;
  else if (db >= -30) f = (db + 50) / 80;
  else if (db >= -60) f = (db + 70) / 160;
  else f = (db + 90) / 480;
  return Math.max(0, Math.min(1, f));
}

export function formatDb(f: number): string {
  const d = faderToDb(f);
  if (!isFinite(d)) return '-∞';
  return (d > 0 ? '+' : '') + d.toFixed(1);
}

/** Numéro de voie sur deux chiffres, comme dans les adresses OSC : 1 -> "01". */
export const ch2 = (n: number) => String(n).padStart(2, '0');
