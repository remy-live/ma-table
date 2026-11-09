// Branchements : les « fils » entre une PRISE (1-18) et une SORTIE (AUX 1-6,
// MAIN). Sur la X Air, un fil = le niveau d'envoi de la voie qui écoute cette
// prise vers ce bus (ou son fader façade). Enlever un fil = niveau à zéro.
import { f } from '../osc/osc';
import { BUS_COUNT, busNamePath, CH_COUNT, chLevelPath, chNamePath, insrcPath, insrcPlug, MAIN, Target, targetId } from './addresses';
import { dbToFader, faderToDb } from './levels';
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
}

export interface Wire {
  plug: number;
  out: string; // targetId
  db: number;
  paths: string[];
}

/** Les 18 prises, avec la ou les voies qui les écoutent. */
export function plugs(client: XAirClient): Plug[] {
  const out: Plug[] = [];
  for (let n = 1; n <= 18; n++) {
    const chans = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)) === n);
    out.push({ n, chans, name: chans.length ? String(client.get(chNamePath(chans[0])) ?? '') : '', usb: n > 16 });
  }
  return out;
}

export function outlets(client: XAirClient): Outlet[] {
  const o: Outlet[] = [];
  for (let b = 1; b <= BUS_COUNT; b++) {
    const t: Target = { kind: 'bus', n: b };
    o.push({ t, id: targetId(t), label: `AUX ${b}`, name: String(client.get(busNamePath(b)) ?? '') || `Retour ${b}` });
  }
  o.push({ t: MAIN, id: 'main', label: 'MAIN L/R', name: 'Le public' });
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
    p.push(insrcPath(c), chNamePath(c), chLevelPath(c, MAIN));
    for (let b = 1; b <= BUS_COUNT; b++) p.push(chLevelPath(c, { kind: 'bus', n: b }));
    for (let k = 1; k <= 4; k++) p.push(chLevelPath(c, { kind: 'fx', n: k }));
  }
  for (let b = 1; b <= BUS_COUNT; b++) p.push(busNamePath(b));
  for (let k = 1; k <= 4; k++) p.push(`/fx/${k}/type`);
  return p;
}

// ---------- Géométrie de la face arrière (viewBox 1000 × 300) ----------
export const PANEL_W = 1000;
export const PANEL_H = 300;
export function plugXY(n: number): { x: number; y: number } {
  if (n <= 16) return { x: 95 + ((n - 1) % 8) * 72, y: n <= 8 ? 110 : 185 };
  return { x: n === 17 ? 708 : 748, y: 180 };
}
export function outletXY(id: string): { x: number; y: number } {
  if (id === 'main') return { x: 95 + 6.5 * 72, y: 252 };
  const b = Number(id.replace('bus', ''));
  return { x: 95 + (b - 1) * 72, y: 252 };
}
export function wireD(plug: number, out: string): string {
  const a = plugXY(plug);
  const b = outletXY(out);
  return `M${a.x} ${a.y} C ${a.x} ${a.y + 60}, ${b.x} ${b.y - 70}, ${b.x} ${b.y}`;
}
/** Épaisseur du fil selon le niveau. */
export const wireWidth = (db: number) => Math.max(2, 2 + ((Math.max(-40, db) + 40) / 50) * 6);

/** Couleur d'affichage d'une prise : la couleur de sa voie dans la table ; si elle n'en a pas, une teinte par numéro. */
const PLUG_PALETTE = ['#F59E0B', '#34D399', '#60A5FA', '#F472B6', '#2DD4BF', '#A78BFA', '#FB923C', '#A3E635'];
export function plugColor(client: XAirClient, p: Plug, tableColor: (idx: number) => string): string {
  if (!p.chans.length) return '#5B636D';
  const idx = Number(client.get(`/ch/${String(p.chans[0]).padStart(2, "0")}/config/color`) ?? 0) & 7;
  return idx ? tableColor(idx) : PLUG_PALETTE[(p.n - 1) % PLUG_PALETTE.length];
}
