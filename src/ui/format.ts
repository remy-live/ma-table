// Écritures communes des niveaux.
import { faderToDb } from '../xair/levels';

/** « −6 dB », « +3 dB », ou le texte donné quand il n'y a rien. */
export function dbLabel(v: number, none = '—', digits = 0): string {
  const d = faderToDb(v);
  if (!isFinite(d) || v <= 0) return none;
  const r = digits ? d.toFixed(digits) : String(Math.round(d));
  return `${d > 0 ? '+' : ''}${r === '-0' ? '0' : r} dB`;
}
/** Remplissage 0..100 d'une barre de niveau (−40 dB → 0, 0 dB → 100). */
export function dbPct(v: number, floor = -40): number {
  const d = faderToDb(v);
  if (!isFinite(d) || v <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round(((d - floor) / -floor) * 100)));
}
