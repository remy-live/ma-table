// « Qui entend quoi » : le routage de la XR16 vu comme des personnes qui
// entendent des sources. Sur la XR16 rien ne se rebranche : la prise n°5 va
// toujours sur la voie 5 ; on règle seulement QUI entend QUOI, et combien.

import { BUS_COUNT, busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, DCA_COUNT, dcaNamePath, FX_COUNT, inDca, MAIN, Target, targetId } from './addresses';
import { fxRtnSendPath } from './monitor';
import { fxType, fxTypePath } from './effects';
import { faderToDb } from './levels';
import { XAirClient } from './XAirClient';

export interface Dest {
  t: Target;
  id: string;
  name: string;
  sub: string;
}

export interface Src {
  id: string;
  label: string;
  kind: 'group' | 'ch' | 'fx';
  channels: number[]; // voies (groupe : ses membres)
  fx?: number;
  members?: Src[];
}

export function destinations(client: XAirClient): Dest[] {
  const out: Dest[] = [{ t: MAIN, id: 'main', name: 'Le public', sub: 'Façade · les enceintes' }];
  for (let b = 1; b <= BUS_COUNT; b++) {
    const n = String(client.get(busNamePath(b)) ?? '');
    out.push({ t: { kind: 'bus', n: b }, id: `bus${b}`, name: n || `Retour ${b}`, sub: `Prise AUX ${b}` });
  }
  return out;
}

const chLabel = (client: XAirClient, c: number) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`;

/** Sources : les groupes (dépliables), puis les voies hors groupe, puis les effets. */
export function sources(client: XAirClient, onlyNamed = true): Src[] {
  const used = new Set<number>();
  const out: Src[] = [];
  for (let k = 1; k <= DCA_COUNT; k++) {
    const members = Array.from({ length: CH_COUNT }, (_, c) => c + 1).filter((c) => !used.has(c) && inDca(Number(client.get(chDcaPath(c)) ?? 0), k));
    if (!members.length) continue;
    members.forEach((c) => used.add(c));
    out.push({
      id: `g${k}`, label: String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`, kind: 'group', channels: members,
      members: members.map((c) => ({ id: `ch${c}`, label: chLabel(client, c), kind: 'ch', channels: [c] })),
    });
  }
  for (let c = 1; c <= CH_COUNT; c++) {
    if (used.has(c)) continue;
    const named = !!String(client.get(chNamePath(c)) ?? '');
    if (onlyNamed && !named && Number(client.get(chLevelPath(c, MAIN)) ?? 0) <= 0) continue;
    out.push({ id: `ch${c}`, label: chLabel(client, c), kind: 'ch', channels: [c] });
  }
  for (let k = 1; k <= FX_COUNT; k++) {
    out.push({ id: `fx${k}`, label: `${fxType(Number(client.get(fxTypePath(k)) ?? 0)).fr} (FX${k})`, kind: 'fx', channels: [], fx: k });
  }
  return out;
}

/** Adresses de niveau d'une source vers une destination. */
export function levelPaths(s: Src, t: Target): string[] {
  if (s.kind === 'fx' && s.fx) return [t.kind === 'main' ? `/rtn/${s.fx}/mix/fader` : t.kind === 'bus' ? fxRtnSendPath(s.fx, t.n) : `/rtn/${s.fx}/mix/fader`];
  return s.channels.map((c) => chLevelPath(c, t));
}

export function levelDb(client: XAirClient, paths: string[]): number {
  return paths.length ? Math.max(...paths.map((p) => faderToDb(Number(client.get(p) ?? 0)))) : -Infinity;
}

/** Part de chaque source dans ce qu'entend une destination (en puissance, pour la barre). */
export function shares(client: XAirClient, list: Src[], t: Target): { src: Src; share: number; db: number }[] {
  const rows = list.map((s) => {
    const paths = levelPaths(s, t);
    const lin = paths.reduce((a, p) => {
      const d = faderToDb(Number(client.get(p) ?? 0));
      return a + (isFinite(d) ? Math.pow(10, d / 10) : 0);
    }, 0);
    return { src: s, lin, db: levelDb(client, paths) };
  });
  const tot = rows.reduce((a, r) => a + r.lin, 0) || 1;
  return rows.map((r) => ({ src: r.src, share: r.lin / tot, db: r.db }));
}

/** Toutes les adresses utiles à cet écran. */
export function whoHearsPaths(): string[] {
  const p: string[] = [];
  for (let b = 1; b <= BUS_COUNT; b++) p.push(busNamePath(b));
  for (let c = 1; c <= CH_COUNT; c++) {
    p.push(chNamePath(c), chDcaPath(c), chLevelPath(c, MAIN));
    for (let b = 1; b <= BUS_COUNT; b++) p.push(chLevelPath(c, { kind: 'bus', n: b }));
  }
  for (let k = 1; k <= FX_COUNT; k++) {
    p.push(fxTypePath(k), `/rtn/${k}/mix/fader`);
    for (let b = 1; b <= BUS_COUNT; b++) p.push(fxRtnSendPath(k, b));
  }
  for (let k = 1; k <= DCA_COUNT; k++) p.push(dcaNamePath(k));
  return p;
}

export const destKey = (t: Target) => targetId(t);
