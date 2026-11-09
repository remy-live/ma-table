// Les 4 emplacements d'effets, vus comme 4 effets nommés et colorés.
// Un effet est PARTAGÉ : le régler change le son de toutes les voies qui y
// envoient. Chaque voie dose seulement combien elle envoie.
import { f, i } from '../osc/osc';
import { load, save } from '../store/persist';
import { CH_COUNT, chLevelPath, chNamePath, FX_COUNT } from './addresses';
import { fxParPath, fxReturnOnPath, fxReturnPath, fxType, fxTypePath } from './effects';
import { faderToDb } from './levels';
import { XAirClient } from './XAirClient';

export const SLOT_COLORS = ['#C084FC', '#F59E0B', '#38BDF8', '#2DD4BF'];
export const PAR_COUNT = 12;

export const sendPath = (ch: number, k: number) => chLevelPath(ch, { kind: 'fx', n: k });

/** Voies qui envoient dans l'effet k (1..4). */
export function users(client: XAirClient, k: number): number[] {
  return Array.from({ length: CH_COUNT }, (_, c) => c + 1).filter((c) => Number(client.get(sendPath(c, k)) ?? 0) > 0);
}
export const chName = (client: XAirClient, c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;

// ---------- noms des effets (gardés dans l'appli) ----------
export type FxNames = Record<number, string>;
export async function loadFxNames(): Promise<FxNames> {
  return (await load<FxNames>('fxNoms', {})) ?? {};
}
export async function saveFxNames(n: FxNames) {
  await save('fxNoms', n);
}
/** Nom affiché : celui donné par l'utilisateur, sinon le type de l'effet. */
export function fxLabel(client: XAirClient, names: FxNames, k: number): string {
  return names[k] || fxType(Number(client.get(fxTypePath(k)) ?? 0)).fr;
}

/** Texte « partagé avec… » pour une voie donnée. */
export function shareText(client: XAirClient, k: number, ch?: number): string {
  const u = users(client, k);
  if (!u.length) return 'libre';
  const others = ch ? u.filter((c) => c !== ch) : u;
  if (ch && !u.includes(ch)) return 'pas utilisé';
  if (!others.length) return ch ? 'rien que pour cette voie' : `rien que pour ${chName(client, u[0])}`;
  return `${ch ? 'partagé avec' : 'partagé'} · ${others.map((c) => chName(client, c)).join(', ')}`;
}

/** Photo des réglages d'un effet. */
export interface FxPreset {
  name: string;
  type: number;
  pars: number[]; // 12 paramètres
  ret?: number;
}
export function snapFx(client: XAirClient, k: number, name = ''): FxPreset {
  return {
    name,
    type: Number(client.get(fxTypePath(k)) ?? 0),
    pars: Array.from({ length: PAR_COUNT }, (_, p) => Number(client.get(fxParPath(k, p + 1)) ?? 0.5)),
    ret: Number(client.get(fxReturnPath(k)) ?? 0.75),
  };
}
export function applyFx(client: XAirClient, k: number, p: FxPreset, withReturn = false) {
  client.set(fxTypePath(k), i(p.type));
  p.pars.forEach((v, n) => client.set(fxParPath(k, n + 1), f(v)));
  if (withReturn && p.ret !== undefined) client.set(fxReturnPath(k), f(p.ret));
}

/** Premier emplacement que personne n'utilise (autre que `except`), ou null. */
export function freeSlot(client: XAirClient, except?: number): number | null {
  for (let k = 1; k <= FX_COUNT; k++) if (k !== except && users(client, k).length === 0) return k;
  return null;
}

/**
 * « Donner son propre effet » : copie l'effet k dans un emplacement libre,
 * y bascule la voie `ch` (même dose), et la retire de k. Renvoie l'emplacement, ou null.
 */
export function splitOff(client: XAirClient, k: number, ch: number, names: FxNames): { slot: number; names: FxNames } | null {
  const slot = freeSlot(client, k);
  if (!slot) return null;
  applyFx(client, slot, snapFx(client, k), true);
  client.set(fxReturnOnPath(slot), i(1));
  const dose = Number(client.get(sendPath(ch, k)) ?? 0);
  client.set(sendPath(ch, slot), f(dose));
  client.set(sendPath(ch, k), f(0));
  const nn = { ...names, [slot]: `${fxLabel(client, names, k)} · ${chName(client, ch)}`.slice(0, 28) };
  return { slot, names: nn };
}

// ---------- Mes effets ----------
export async function loadMyFx(): Promise<FxPreset[]> {
  return (await load<FxPreset[]>('mesEffets', [])) ?? [];
}
export async function saveMyFx(list: FxPreset[]) {
  await save('mesEffets', list.slice(0, 60));
}

export function fxPaths(): string[] {
  const p: string[] = [];
  for (let k = 1; k <= FX_COUNT; k++) {
    p.push(fxTypePath(k), fxReturnPath(k), fxReturnOnPath(k));
    for (let n = 1; n <= PAR_COUNT; n++) p.push(fxParPath(k, n));
  }
  for (let c = 1; c <= CH_COUNT; c++) {
    p.push(chNamePath(c));
    for (let k = 1; k <= FX_COUNT; k++) p.push(sendPath(c, k));
  }
  return p;
}

export const doseDb = (v: number) => faderToDb(v);

// ---------- jeux d'effets : les 4 effets d'un coup ----------
export interface FxSet { name: string; at: number; slots: FxPreset[]; names: FxNames }
export async function loadFxSets(): Promise<FxSet[]> {
  return (await load<FxSet[]>('jeuxEffets', [])) ?? [];
}
export async function saveFxSets(list: FxSet[]) {
  await save('jeuxEffets', list.slice(0, 40));
}
export function snapAll(client: XAirClient, names: FxNames, name: string): FxSet {
  return { name, at: Date.now(), names: { ...names }, slots: Array.from({ length: FX_COUNT }, (_, k) => snapFx(client, k + 1, names[k + 1] ?? '')) };
}
/** Recharge les 4 effets (réglages + retours). Les envois des voies ne changent pas. */
export function applyAll(client: XAirClient, set: FxSet): FxNames {
  set.slots.forEach((p, k) => applyFx(client, k + 1, p, true));
  return { ...set.names };
}
