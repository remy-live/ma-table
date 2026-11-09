// Mode guidé : la logique (testable sans téléphone).
import { f } from '../osc/osc';
import { chLevelPath, fToGainDb, gainDbToF, headampGainPath, MODEL, Target } from './addresses';
import { dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';

/** Ce qu'on peut brancher sur une prise (les noms sont reconnus par le renommage intelligent). */
export const INSTRUMENTS = ['Voix', 'Chœurs', 'Guitare acou', 'Guitare élec', 'Basse', 'Kick', 'Caisse claire', 'Charley', 'Toms', 'Overhead', 'Clavier', 'Ordi'];

export type Need = 'rien' | 'bas' | 'moyen' | 'fort';
export const NEEDS: { id: Need; label: string; db: number }[] = [
  { id: 'rien', label: 'Rien', db: -Infinity },
  { id: 'bas', label: 'Un peu', db: -15 },
  { id: 'moyen', label: 'Moyen', db: -8 },
  { id: 'fort', label: 'Fort', db: -2 },
];

/** Règle ce qu'une personne (un retour, ou la façade) entend d'une source. */
export function applyNeed(client: XAirClient, t: Target, channels: number[], need: Need) {
  const db = NEEDS.find((n) => n.id === need)!.db;
  for (const c of channels) client.set(chLevelPath(c, t), f(isFinite(db) ? dbToFader(db) : 0));
}

/** Besoin le plus proche du niveau actuel (pour allumer le bon bouton). */
export function currentNeed(client: XAirClient, t: Target, channels: number[]): Need {
  const db = Math.max(...channels.map((c) => faderToDb(Number(client.get(chLevelPath(c, t)) ?? 0))));
  if (!isFinite(db) || db < -30) return 'rien';
  if (db < -11.5) return 'bas';
  if (db < -5) return 'moyen';
  return 'fort';
}

export interface Advice {
  text: string;
  tone: 'low' | 'ok' | 'high' | 'none';
}

/** Conseil de gain d'après le vumètre d'entrée pendant que le musicien joue fort. */
export function gainAdvice(db: number): Advice {
  if (!isFinite(db) || db < -55) return { text: 'Rien n’arrive : joue, ou vérifie le câble', tone: 'none' };
  if (db < -30) return { text: 'Trop faible : monte le gain', tone: 'low' };
  if (db < -18) return { text: 'Un peu faible : monte un peu', tone: 'low' };
  if (db <= -6) return { text: 'Parfait', tone: 'ok' };
  return { text: 'Trop fort : baisse le gain', tone: 'high' };
}

/** Gain d'un préampli : +/- en dB. */
export function nudgeGain(client: XAirClient, ch: number, db: number) {
  const cur = fToGainDb(Number(client.get(headampGainPath(ch)) ?? 0.5));
  client.set(headampGainPath(ch), f(gainDbToF(Math.max(-12, Math.min(60, cur + db)))));
}

export const hasPreamp = (ch: number) => ch >= 1 && ch <= MODEL.preamps;
