// Réorganiser les voies SANS toucher aux câbles.
// Sur la X Air chaque voie peut écouter n'importe quelle prise (config/insrc).
// Pour mettre « Voix » en voie 1 alors que son micro est sur la prise 7 :
// la voie 1 reçoit tous les réglages de l'ancienne voie (nom, EQ, dynamique,
// envois, groupes, fader…) et écoute la prise 7. Les gains et le 48 V restent
// sur les prises : ils appartiennent au préampli, donc au micro, qui n'a pas bougé.
import { OscValue } from '../osc/osc';
import { BUS_COUNT, channelDetailPaths, CH_COUNT, chLevelPath, chNamePath, insrcPath, MODEL } from './addresses';
import { ch2 } from './levels';
import { argFor, XAirClient } from './XAirClient';

/** Le routage par voie n'existe (sûrement) que sur les X Air. */
export const reorderSupported = () => MODEL.family === 'xair';

/** Nombre de voies qu'on range (les voies micro/ligne ; pas les entrées Aux stéréo). */
export const reorderCount = () => Math.min(CH_COUNT, 16);

/** Tout ce qui appartient à la voie (et pas à la prise). */
export function slotPaths(ch: number): string[] {
  const n = ch2(ch);
  const p = [
    ...channelDetailPaths(ch),
    `/ch/${n}/config/name`, `/ch/${n}/config/color`, `/ch/${n}/mix/fader`, `/ch/${n}/mix/on`, `/ch/${n}/mix/pan`,
    `/ch/${n}/grp/dca`, `/ch/${n}/grp/mute`, `/ch/${n}/preamp/invert`, `/ch/${n}/mix/lr`,
  ];
  for (let b = 1; b <= BUS_COUNT; b++) p.push(chLevelPath(ch, { kind: 'bus', n: b }));
  return Array.from(new Set(p));
}

const FAMILY: [RegExp, number][] = [
  [/^(voix|chant|lead|vox|vocal)/i, 0],
  [/^(ch(œ|oe)ur|back|bv)/i, 1],
  [/(guit|gtr|gt\b|acou|ukul|banjo|mando)/i, 2],
  [/(clav|piano|synth|orgue|key|nord|rhodes)/i, 3],
  [/(cuivre|sax|trompette|trombone|violon|flûte|flute|accord)/i, 4],
  [/(basse|bass|contrebasse)/i, 5],
  [/(kick|grosse|g\.? ?caisse|^gc\b|^bd\b)/i, 6],
  [/(caisse|snare|cc\b)/i, 7],
  [/(charley|hh|hi.?hat|hat)/i, 8],
  [/(tom|floor)/i, 9],
  [/(oh|overhead|over|cymb|ride)/i, 10],
  [/(batt|drum|percu|cajon)/i, 11],
];
export function familyRank(name: string): number {
  const t = name.trim();
  if (!t) return 99;
  for (const [re, k] of FAMILY) if (re.test(t)) return k;
  return 50;
}

/** Ordre proposé : voix, chœurs, guitares, claviers, basse, batterie… (voies vides à la fin). */
export function orderByFamily(client: XAirClient): number[] {
  const n = reorderCount();
  const list = Array.from({ length: n }, (_, k) => k + 1);
  const name = (c: number) => String(client.get(chNamePath(c)) ?? '');
  return [...list].sort((a, b) => familyRank(name(a)) - familyRank(name(b)) || a - b);
}

/** Les voies qui changent de place : [voie d'arrivée, voie d'origine]. */
export function moves(order: number[]): [number, number][] {
  return order.map((src, k) => [k + 1, src] as [number, number]).filter(([d, s]) => d !== s);
}

/**
 * Applique l'ordre : order[k] = la voie (actuelle) qui doit devenir la voie k+1.
 * Lit tout avant d'écrire. Rend le nombre de réglages envoyés.
 */
export async function applyOrder(client: XAirClient, order: number[]): Promise<number> {
  const mv = moves(order);
  if (!mv.length) return 0;
  const srcs = Array.from(new Set(mv.map(([, s]) => s)));
  await client.loadPaths(srcs.flatMap((s) => [...slotPaths(s), insrcPath(s)]), false);
  const saved = new Map<number, { vals: [string, OscValue][]; insrc: OscValue }>();
  for (const s of srcs) {
    const vals: [string, OscValue][] = [];
    for (const p of slotPaths(s)) {
      const v = client.get(p);
      if (v !== undefined) vals.push([p.replace(`/ch/${ch2(s)}/`, '/ch/{n}/'), v]);
    }
    saved.set(s, { vals, insrc: client.get(insrcPath(s)) ?? s - 1 });
  }
  let sent = 0;
  for (const [d, s] of mv) {
    const it = saved.get(s)!;
    for (const [t, v] of it.vals) {
      const p = t.replace('{n}', ch2(d));
      client.set(p, argFor(p, v));
      sent++;
    }
    client.set(insrcPath(d), argFor(insrcPath(d), it.insrc));
    sent++;
  }
  return sent;
}
