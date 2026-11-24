// « Parler au public » : toutes les voies se coupent sauf le ou les micros choisis
// (annonce, discours, présentation des musiciens). « Tout rouvrir » remet chaque
// voie exactement comme elle était : une voie déjà coupée exprès reste coupée.
import { i } from '../osc/osc';
import { CH_COUNT, chOnPath } from './addresses';
import { XAirClient } from './XAirClient';

let saved: [string, number][] | null = null;
let kept: number[] = [];
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

export function speakOn(client: XAirClient, keep: number[]) {
  if (saved || !keep.length) return;
  const chans = Array.from({ length: CH_COUNT }, (_, k) => k + 1);
  saved = chans.map((c) => [chOnPath(c), Number(client.get(chOnPath(c)) ?? 1)]);
  kept = keep.slice();
  for (const c of chans) client.set(chOnPath(c), i(keep.includes(c) ? 1 : 0));
  tell();
}

export function speakOff(client: XAirClient) {
  if (!saved) return;
  for (const [p, v] of saved) client.set(p, i(v ? 1 : 0));
  saved = null; kept = [];
  tell();
}

export const isSpeaking = () => saved !== null;
export const speakKept = () => kept;
export function onSpeak(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
