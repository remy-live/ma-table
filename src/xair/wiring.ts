// Branchements : les « fils » entre une PRISE (1-18) et une SORTIE (AUX 1-6,
// MAIN). Sur la X Air, un fil = le niveau d'envoi de la voie qui écoute cette
// prise vers ce bus (ou son fader façade). Enlever un fil = niveau à zéro.
import { f } from '../osc/osc';
import { BUS_COUNT, busNamePath, CH_COUNT, MODEL, chLevelPath, chNamePath, insrcPath, insrcPlug, MAIN, panPath, Target, targetId } from './addresses';
import { isMono } from './mono';
import { dbToFader, faderToDb } from './levels';
import { chColor } from './smartName';
import { XAirClient } from './XAirClient';

export interface Plug {
  n: number; // numéro de prise 1..18
  chans: number[]; // voies qui écoutent cette prise (normalement une)
  name: string; // nom de la première voie, ou ''
  usb: boolean;
}

export interface Outlet {
  t: Target;
  id: string;
  label: string; // « AUX 1 », « MAIN L/R »
  name: string; // qui écoute : « Rémy », « Le public »
  /** en « 2 enceintes », la façade a deux sorties : L et R (le même bus, le panoramique choisit le côté) */
  side?: 'L' | 'R';
}

// ---------- la façade en stéréo : gauche, droite ou les deux ----------
const panOf = (client: XAirClient, chans: number[]) => (chans.length ? Number(client.get(panPath(chans[0])) ?? 0.5) : 0.5);
const mainOn = (client: XAirClient, chans: number[]) => chans.some((c) => { const d = faderToDb(Number(client.get(chLevelPath(c, MAIN)) ?? 0)); return isFinite(d) && d > -60; });
/** La voie part-elle de ce côté de la façade ? (au centre = des deux côtés) */
export function onSide(client: XAirClient, chans: number[], side: 'L' | 'R'): boolean {
  if (!mainOn(client, chans)) return false;
  const p = panOf(client, chans);
  return side === 'L' ? p <= 0.6 : p >= 0.4;
}
/** Relier à un côté : seule = tout à ce côté ; déjà de l'autre côté = les deux (au centre). */
export function linkSide(client: XAirClient, chans: number[], side: 'L' | 'R', db = -6) {
  if (onSide(client, chans, side)) return;
  const pan = mainOn(client, chans) ? 0.5 : side === 'L' ? 0 : 1;
  if (!mainOn(client, chans)) for (const c of chans) client.set(chLevelPath(c, MAIN), f(dbToFader(db)));
  for (const c of chans) client.set(panPath(c), f(pan));
}
/** Délier un côté : des deux côtés = il reste l'autre ; d'un seul côté = plus dans la façade. */
export function unlinkSide(client: XAirClient, chans: number[], side: 'L' | 'R') {
  if (!onSide(client, chans, side)) return;
  if (onSide(client, chans, side === 'L' ? 'R' : 'L')) { for (const c of chans) client.set(panPath(c), f(side === 'L' ? 1 : 0)); return; }
  for (const c of chans) client.set(chLevelPath(c, MAIN), f(0));
}
/** Relier / délier une prise à une sortie (gère MAIN L et MAIN R). */
export function link(client: XAirClient, plug: Plug, o: Outlet, db = -6) {
  if (o.side) linkSide(client, plug.chans, o.side, db); else connect(client, plug, o.t, db);
}
export function unlink(client: XAirClient, plug: Plug, o: Outlet) {
  if (o.side) unlinkSide(client, plug.chans, o.side); else disconnect(client, plug, o.t);
}

export interface Wire {
  plug: number;
  out: string; // targetId
  db: number;
  paths: string[];
}

/** Les prises de la table (18 sur la XR18), avec la ou les voies qui les écoutent. */
export function plugs(client: XAirClient): Plug[] {
  const out: Plug[] = [];
  // XR18 : 1-16 + LINE 17/18 ; XR16 : 1-16 ; XR12 : 1-12
  for (let n = 1; n <= MODEL.inputs; n++) {
    const chans = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)) === n);
    out.push({ n, chans, name: chans.length ? String(client.get(chNamePath(chans[0])) ?? '') : '', usb: MODEL.usbMulti && n > 16 });
  }
  return out;
}

export function outlets(client: XAirClient): Outlet[] {
  const o: Outlet[] = [];
  for (let b = 1; b <= BUS_COUNT; b++) {
    const t: Target = { kind: 'bus', n: b };
    o.push({ t, id: targetId(t), label: `AUX ${b}`, name: String(client.get(busNamePath(b)) ?? '') || `Retour ${b}` });
  }
  if (isMono(client)) o.push({ t: MAIN, id: 'main', label: 'MAIN L/R', name: 'Le public' });
  else o.push({ t: MAIN, id: 'mainL', label: 'MAIN L', name: 'Façade L', side: 'L' }, { t: MAIN, id: 'mainR', label: 'MAIN R', name: 'Façade R', side: 'R' });
  return o;
}

export function wirePaths(plug: Plug, t: Target): string[] {
  return plug.chans.map((c) => chLevelPath(c, t));
}

/** Tous les fils existants (niveau > −∞). */
export function wires(client: XAirClient): Wire[] {
  const P = plugs(client);
  const O = outlets(client);
  const out: Wire[] = [];
  for (const p of P) {
    if (!p.chans.length) continue;
    for (const o of O) {
      const paths = wirePaths(p, o.t);
      const db = Math.max(...paths.map((x) => faderToDb(Number(client.get(x) ?? 0))));
      if (o.side && !onSide(client, p.chans, o.side)) continue;
      if (isFinite(db) && db > -60) out.push({ plug: p.n, out: o.id, db, paths });
    }
  }
  return out;
}

export function connect(client: XAirClient, plug: Plug, t: Target, db = -6) {
  for (const p of wirePaths(plug, t)) client.set(p, f(dbToFader(db)));
}

export function disconnect(client: XAirClient, plug: Plug, t: Target) {
  for (const p of wirePaths(plug, t)) client.set(p, f(0));
}

export function nudge(client: XAirClient, paths: string[], delta: number) {
  for (const p of paths) {
    const cur = faderToDb(Number(client.get(p) ?? 0));
    const next = (isFinite(cur) ? cur : -30) + delta;
    client.set(p, f(next < -40 ? 0 : dbToFader(Math.min(10, next))));
  }
}

/** « Vers tous les retours nommés » : la prise part dans chaque retour qui a un nom, à `db`. */
export function toAllReturns(client: XAirClient, plug: Plug, db = -8): number {
  let n = 0;
  for (let b = 1; b <= BUS_COUNT; b++) {
    if (!String(client.get(busNamePath(b)) ?? '')) continue;
    const t: Target = { kind: 'bus', n: b };
    if (wirePaths(plug, t).every((p) => Number(client.get(p) ?? 0) <= 0)) {
      connect(client, plug, t, db);
      n++;
    }
  }
  return n;
}

/** Ce qu'une sortie reçoit devient une copie de la façade, moins `minus` dB. */
export function likeMain(client: XAirClient, t: Target, minus = 2) {
  if (t.kind === 'main') return;
  for (let c = 1; c <= CH_COUNT; c++) {
    const db = faderToDb(Number(client.get(chLevelPath(c, MAIN)) ?? 0));
    client.set(chLevelPath(c, t), f(isFinite(db) ? dbToFader(db - minus) : 0));
  }
}

/** Adresses à lire pour cet écran. */
export function wiringPaths(): string[] {
  const p: string[] = [];
  for (let c = 1; c <= CH_COUNT; c++) {
    p.push(insrcPath(c), chNamePath(c), chLevelPath(c, MAIN), `/ch/${String(c).padStart(2, '0')}/mix/pan`);
    for (let b = 1; b <= BUS_COUNT; b++) p.push(chLevelPath(c, { kind: 'bus', n: b }));
    for (let k = 1; k <= 4; k++) p.push(chLevelPath(c, { kind: 'fx', n: k }));
  }
  for (let b = 1; b <= BUS_COUNT; b++) p.push(busNamePath(b));
  for (let k = 1; k <= 4; k++) p.push(`/fx/${k}/type`);
  return p;
}

// ---------- Géométrie de la face arrière (viewBox 1000 × 300) ----------
export const PANEL_W = 1000;
export const PANEL_H = 330;
export function plugXY(n: number): { x: number; y: number } {
  if (n <= 16) return { x: 95 + ((n - 1) % 8) * 72, y: n <= 8 ? 110 : 185 };
  return { x: n === 17 ? 708 : 748, y: 180 };
}
export function outletXY(id: string): { x: number; y: number } {
  if (id === 'main') return { x: 95 + 6.5 * 72, y: 278 };
  if (id === 'mainL') return { x: 95 + 6.5 * 72 - 23, y: 278 };
  if (id === 'mainR') return { x: 95 + 6.5 * 72 + 23, y: 278 };
  const b = Number(id.replace('bus', ''));
  return { x: 95 + (b - 1) * 72, y: 278 };
}
export function wireD(plug: number, out: string): string {
  const a = plugXY(plug);
  const b = outletXY(out);
  return `M${a.x} ${a.y} C ${a.x} ${a.y + 60}, ${b.x} ${b.y - 70}, ${b.x} ${b.y}`;
}
/** Épaisseur du fil selon le niveau. */
export const wireWidth = (db: number) => Math.max(2, 2 + ((Math.max(-40, db) + 40) / 50) * 6);

/** Couleur d'affichage d'une prise : la couleur de sa voie dans la table ; si elle n'en a pas, une teinte par numéro. */
export function plugColor(client: XAirClient, p: Plug, tableColor: (idx: number) => string): string {
  if (!p.chans.length) return '#5B636D';
  void tableColor;
  return chColor(client, p.chans[0]);
}
