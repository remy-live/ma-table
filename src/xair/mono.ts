// « 1 enceinte / 2 enceintes » : la XR18 n'a pas de bouton mono sur la sortie
// Main. On centre donc tous les panoramiques (voies + retours d'effets) : les
// deux sorties L et R portent alors le même mélange. Les panoramiques d'avant
// sont gardés dans l'appli pour revenir à la stéréo d'un appui.
import { f } from '../osc/osc';
import { load, save } from '../store/persist';
import { CH_COUNT, FX_COUNT, panPath } from './addresses';
import { XAirClient } from './XAirClient';

export const fxPanPath = (k: number) => `/rtn/${k}/mix/pan`;
const KEY = 'pansStereo';

export function monoPaths(): string[] {
  return [...Array.from({ length: CH_COUNT }, (_, c) => panPath(c + 1)), ...Array.from({ length: FX_COUNT }, (_, k) => fxPanPath(k + 1))];
}

// Le choix « 1 / 2 enceintes » est gardé : des panoramiques tous au centre ne
// veulent pas dire qu'on a une seule enceinte (on peut avoir 2 enceintes et des
// sons au centre).
const FLAG = 'facadeMono';
let flag: boolean | null = null;
const subs = new Set<(m: boolean) => void>();
load<boolean | null>(FLAG, null).then((v) => { if (v !== null && flag === null) { flag = v; subs.forEach((cb) => cb(v)); } }).catch(() => {});
function setFlag(v: boolean) { flag = v; save(FLAG, v); subs.forEach((cb) => cb(v)); }
/** Prévenu quand on passe de 1 à 2 enceintes (ou l'inverse). */
export function onMonoChange(cb: (m: boolean) => void): () => void { subs.add(cb); return () => { subs.delete(cb); }; }

/** Tout est au centre (à 2 % près). */
export function allCentered(client: XAirClient): boolean {
  return monoPaths().every((p) => { const v = client.get(p); return v === undefined || Math.abs(Number(v) - 0.5) < 0.02; });
}
/** Une seule enceinte ? Le choix gardé, sinon : tout au centre. */
export function isMono(client: XAirClient): boolean {
  return flag ?? allCentered(client);
}

/** Passe en mono : garde les panoramiques puis centre tout. Renvoie le nombre de voies déplacées. */
export async function toMono(client: XAirClient): Promise<number> {
  const saved: Record<string, number> = {};
  let n = 0;
  for (const p of monoPaths()) {
    const v = client.get(p);
    if (v === undefined) continue;
    saved[p] = Number(v);
    if (Math.abs(Number(v) - 0.5) >= 0.02) { client.set(p, f(0.5)); n++; }
  }
  if (n) await save(KEY, saved);
  setFlag(true);
  return n;
}

/** Revient en stéréo : remet les panoramiques gardés. Renvoie le nombre restauré, ou -1 si rien n'était gardé. */
export async function toStereo(client: XAirClient): Promise<number> {
  setFlag(false);
  const saved = await load<Record<string, number> | null>(KEY, null);
  if (!saved) return -1;
  let n = 0;
  for (const [p, v] of Object.entries(saved)) if (Math.abs(v - 0.5) >= 0.02) { client.set(p, f(v)); n++; }
  return n;
}

// noms utilisés par MonoSwitch et le test
export const goMono = toMono;
export const goStereo = toStereo;
export async function hasSavedPans(): Promise<boolean> {
  const saved = await load<Record<string, number> | null>(KEY, null);
  return !!saved && Object.values(saved).some((v) => Math.abs(v - 0.5) >= 0.02);
}
