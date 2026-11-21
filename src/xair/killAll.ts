// « Tout couper » : façade, retours et effets coupés d'un geste, sans rien perdre.
// On note ce qui était allumé avant ; « Rétablir » ne rallume que ça (un retour
// déjà coupé exprès reste coupé). Gains, niveaux et 48 V ne bougent pas.
import { i } from '../osc/osc';
import { BUS_COUNT, CH_COUNT, chOnPath, FX_COUNT, MAIN, MODEL, outOnPath } from './addresses';
import { XAirClient } from './XAirClient';

let saved: [string, number][] | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

export function killPaths(): string[] {
  const p = [outOnPath(MAIN)];
  for (let n = 1; n <= BUS_COUNT; n++) p.push(outOnPath({ kind: 'bus', n }));
  for (let n = 1; n <= FX_COUNT; n++) p.push(outOnPath({ kind: 'fx', n }));
  // Soundcraft Ui : pas de coupure générale de la façade ; on coupe aussi toutes les entrées
  if (MODEL.family === 'ui') for (let c = 1; c <= CH_COUNT; c++) p.push(chOnPath(c));
  return p;
}

export function killAll(client: XAirClient) {
  if (saved) return;
  const paths = killPaths();
  saved = paths.map((p) => [p, Number(client.get(p) ?? 1)]);
  for (const p of paths) client.set(p, i(0));
  tell();
}

export function restoreAll(client: XAirClient) {
  if (!saved) return;
  for (const [p, v] of saved) if (v) client.set(p, i(1));
  saved = null;
  tell();
}

export const isKilled = () => saved !== null;
export function onKill(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
