// Préréglages de départ par instrument. Ce sont des points de départ à
// ajuster à l'oreille, pas des réglages définitifs.

import { f, i } from '../osc/osc';
import {
  chLevelPath, compDbToF, dynOnPath, dynThrPath, eqGainToF, eqOnPath, eqPath, EQ_TYPES, fToCompDb, fToEqGain, fToGateDb,
  fToHpfHz, fToHz, fToQ, gateDbToF, gateOnPath, gateThrPath, hpfHzToF, hpfPath, hpOnPath, hzToF, qToF,
} from './addresses';
import { dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';

export interface Preset {
  name: string;
  /** 4 bandes : [fréquence Hz, gain dB, Q]. Bande 1 en plateau grave, 4 en plateau aigu, 2-3 en cloche. */
  eq: [number, number, number][];
  lowCut: number | null; // Hz, null = coupé
  gate: number | null; // seuil dB, null = pas de gate
  comp: number | null; // seuil dB, null = pas de compresseur
  fx: [number, number, number, number]; // envois FX1..FX4 en dB (-Infinity = rien)
  family?: Family;
  variant?: string; // « Lead », « Chœurs »…
  desc?: string;
}

export type Family = 'Voix' | 'Guitares' | 'Basse' | 'Batterie' | 'Claviers' | 'Mes réglages';
export const FAMILIES: Family[] = ['Voix', 'Guitares', 'Basse', 'Batterie', 'Claviers', 'Mes réglages'];

const OFF = -Infinity;

export const PRESETS: Preset[] = [
  { name: 'Voix', eq: [[120, -2, 1], [300, -3, 1.4], [3000, 3, 1.2], [10000, 2, 1]], lowCut: 100, gate: null, comp: -18, fx: [-12, -20, OFF, OFF] },
  { name: 'Guitare acou', eq: [[100, -4, 1], [250, -2, 1.4], [2500, 1, 1.2], [9000, 3, 1]], lowCut: 90, gate: null, comp: -20, fx: [-14, OFF, OFF, OFF] },
  { name: 'Guitare élec', eq: [[100, 0, 1], [400, -2, 1.4], [2200, 2, 1.2], [8000, 0, 1]], lowCut: 80, gate: null, comp: -24, fx: [-18, -16, OFF, OFF] },
  { name: 'Basse', eq: [[80, 3, 1], [250, -3, 1.4], [900, 2, 1.2], [5000, -2, 1]], lowCut: 30, gate: null, comp: -16, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Kick', eq: [[60, 5, 1], [350, -6, 1.2], [3500, 3, 1.4], [10000, 1, 1]], lowCut: 30, gate: -35, comp: -14, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Caisse claire', eq: [[150, 1, 1], [450, -2, 1.4], [3500, 3, 1.2], [9000, 2, 1]], lowCut: 80, gate: -40, comp: -16, fx: [-16, OFF, OFF, OFF] },
  { name: 'Charley', eq: [[200, -6, 1], [600, -3, 1.4], [5000, 0, 1.2], [12000, 3, 1]], lowCut: 250, gate: null, comp: null, fx: [-24, OFF, OFF, OFF] },
  { name: 'Toms', eq: [[100, 3, 1], [400, -4, 1.4], [4000, 2, 1.2], [9000, 0, 1]], lowCut: 60, gate: -38, comp: -18, fx: [-18, OFF, OFF, OFF] },
  { name: 'Overhead', eq: [[150, -3, 1], [500, -1, 1.4], [4000, 0, 1.2], [11000, 3, 1]], lowCut: 150, gate: null, comp: -22, fx: [-20, OFF, OFF, OFF] },
];

const FAM: Record<string, Family> = {
  Voix: 'Voix', 'Guitare acou': 'Guitares', 'Guitare élec': 'Guitares', Basse: 'Basse',
  Kick: 'Batterie', 'Caisse claire': 'Batterie', Charley: 'Batterie', Toms: 'Batterie', Overhead: 'Batterie',
};

/** Bibliothèque : les préréglages de base + des variantes par instrument. */
export const LIBRARY: Preset[] = [
  ...PRESETS.map((p) => ({ ...p, family: FAM[p.name], variant: 'Standard', desc: 'Point de départ équilibré' })),
  { name: 'Voix lead douce', family: 'Voix', variant: 'Ballade', desc: 'Moins d’aigus, plus de réverbe', eq: [[120, -2, 1], [300, -2, 1.4], [2500, 1, 1.2], [9000, 0, 1]], lowCut: 90, gate: null, comp: -20, fx: [-8, -18, OFF, OFF] },
  { name: 'Voix rock', family: 'Voix', variant: 'Rock', desc: 'Présence, compresseur plus ferme', eq: [[120, -3, 1], [400, -3, 1.2], [3500, 4, 1.2], [10000, 1, 1]], lowCut: 120, gate: null, comp: -24, fx: [-16, -16, OFF, OFF] },
  { name: 'Chœurs', family: 'Voix', variant: 'Chœurs', desc: 'Plus légers derrière la voix principale', eq: [[150, -4, 1], [350, -3, 1.4], [3000, 1, 1.2], [10000, 2, 1]], lowCut: 140, gate: null, comp: -20, fx: [-10, OFF, OFF, OFF] },
  { name: 'Voix parlée', family: 'Voix', variant: 'Parole', desc: 'Annonces entre les chansons, sans effet', eq: [[120, -3, 1], [250, -2, 1.4], [3000, 2, 1.2], [8000, 0, 1]], lowCut: 120, gate: null, comp: -16, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Guitare acou arpèges', family: 'Guitares', variant: 'Arpèges', desc: 'Brillante, détaillée', eq: [[100, -5, 1], [250, -2, 1.4], [3000, 2, 1.2], [10000, 3, 1]], lowCut: 100, gate: null, comp: -22, fx: [-12, OFF, OFF, OFF] },
  { name: 'Guitare acou rythmique', family: 'Guitares', variant: 'Rythmique', desc: 'Moins de boum, laisse la place à la voix', eq: [[120, -6, 1], [300, -3, 1.4], [2000, -1, 1.2], [8000, 2, 1]], lowCut: 120, gate: null, comp: -18, fx: [-18, OFF, OFF, OFF] },
  { name: 'Guitare clean', family: 'Guitares', variant: 'Clean', desc: 'Claire, un peu de chorus et de réverbe', eq: [[100, -2, 1], [400, -1, 1.4], [2500, 2, 1.2], [9000, 1, 1]], lowCut: 80, gate: null, comp: -22, fx: [-14, OFF, -14, OFF] },
  { name: 'Guitare crunch', family: 'Guitares', variant: 'Crunch', desc: 'Moins de bas-médiums, garde le mordant', eq: [[100, -1, 1], [350, -3, 1.2], [1800, 2, 1.4], [7000, -1, 1]], lowCut: 90, gate: null, comp: null, fx: [-20, -18, OFF, OFF] },
  { name: 'Basse ronde', family: 'Basse', variant: 'Ronde', desc: 'Doigts, grosse fondamentale', eq: [[70, 4, 1], [250, -2, 1.4], [800, 1, 1.2], [4000, -4, 1]], lowCut: 30, gate: null, comp: -14, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Basse claquante', family: 'Basse', variant: 'Slap / médiator', desc: 'Plus d’attaque', eq: [[80, 2, 1], [300, -4, 1.2], [1200, 3, 1.4], [6000, 2, 1]], lowCut: 35, gate: null, comp: -20, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Kick rock', family: 'Batterie', variant: 'Kick rock', desc: 'Clic marqué', eq: [[60, 4, 1], [400, -8, 1], [4000, 5, 1.4], [10000, 0, 1]], lowCut: 35, gate: -30, comp: -16, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Kick jazz', family: 'Batterie', variant: 'Kick jazz', desc: 'Naturel, résonnant', eq: [[70, 2, 1], [300, -2, 1.4], [2500, 1, 1.2], [9000, 0, 1]], lowCut: 35, gate: null, comp: null, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Caisse claire sèche', family: 'Batterie', variant: 'Caisse sèche', desc: 'Sans réverbe, gate serré', eq: [[180, 2, 1], [500, -3, 1.4], [4000, 3, 1.2], [9000, 1, 1]], lowCut: 90, gate: -34, comp: -14, fx: [OFF, OFF, OFF, OFF] },
  { name: 'Cajon', family: 'Batterie', variant: 'Cajon', desc: 'Grave rond + claque', eq: [[80, 3, 1], [350, -4, 1.2], [3000, 3, 1.4], [9000, 0, 1]], lowCut: 40, gate: null, comp: -18, fx: [-20, OFF, OFF, OFF] },
  { name: 'Piano', family: 'Claviers', variant: 'Piano', desc: 'Moins de boue, un peu d’air', eq: [[100, -2, 1], [300, -2, 1.4], [3000, 1, 1.2], [10000, 2, 1]], lowCut: 60, gate: null, comp: -22, fx: [-16, OFF, OFF, OFF] },
  { name: 'Synthé nappe', family: 'Claviers', variant: 'Nappe', desc: 'Discret, laisse la place', eq: [[150, -4, 1], [500, -2, 1.4], [3000, -1, 1.2], [9000, 1, 1]], lowCut: 120, gate: null, comp: null, fx: [-14, OFF, OFF, OFF] },
  { name: 'Ordi / lecteur', family: 'Claviers', variant: 'Bande son', desc: 'Neutre, sans effet', eq: [[100, 0, 1], [400, 0, 1.4], [3000, 0, 1.2], [10000, 0, 1]], lowCut: null, gate: null, comp: null, fx: [OFF, OFF, OFF, OFF] },
];

/** Photo du réglage d'une voie, pour « Mes réglages ». */
export function presetFromChannel(client: XAirClient, ch: number, name: string): Preset {
  const n = (p: string, fb: number) => Number(client.get(p) ?? fb);
  return {
    name, family: 'Mes réglages', variant: name, desc: `Pris sur la voie ${ch}`,
    eq: [1, 2, 3, 4].map((b) => [Math.round(fToHz(n(eqPath(ch, b, 'f'), 0.5))), +fToEqGain(n(eqPath(ch, b, 'g'), 0.5)).toFixed(1), +fToQ(n(eqPath(ch, b, 'q'), 0.5)).toFixed(2)]) as [number, number, number][],
    lowCut: n(hpOnPath(ch), 0) ? Math.round(fToHpfHz(n(hpfPath(ch), 0.3))) : null,
    gate: n(gateOnPath(ch), 0) ? Math.round(fToGateDb(n(gateThrPath(ch), 0.5))) : null,
    comp: n(dynOnPath(ch), 0) ? Math.round(fToCompDb(n(dynThrPath(ch), 0.6))) : null,
    fx: [1, 2, 3, 4].map((k) => Math.max(-99, faderToDb(n(chLevelPath(ch, { kind: 'fx', n: k }), 0)))) as [number, number, number, number],
  };
}

/** Adresses lues par presetFromChannel. */
export function presetPaths(ch: number): string[] {
  const p = [eqOnPath(ch), hpOnPath(ch), hpfPath(ch), gateOnPath(ch), gateThrPath(ch), dynOnPath(ch), dynThrPath(ch)];
  for (let b = 1; b <= 4; b++) p.push(eqPath(ch, b, 'f'), eqPath(ch, b, 'g'), eqPath(ch, b, 'q'), eqPath(ch, b, 'type'));
  for (let k = 1; k <= 4; k++) p.push(chLevelPath(ch, { kind: 'fx', n: k }));
  return p;
}

const BAND_TYPES = [EQ_TYPES.lshv, EQ_TYPES.peq, EQ_TYPES.peq, EQ_TYPES.hshv];

export function applyPreset(client: XAirClient, ch: number, p: Preset) {
  client.set(eqOnPath(ch), i(1));
  p.eq.forEach(([hz, db, q], k) => {
    const b = k + 1;
    client.set(eqPath(ch, b, 'type'), i(BAND_TYPES[k]));
    client.set(eqPath(ch, b, 'f'), f(hzToF(hz)));
    client.set(eqPath(ch, b, 'g'), f(eqGainToF(db)));
    client.set(eqPath(ch, b, 'q'), f(qToF(q)));
  });
  client.set(hpOnPath(ch), i(p.lowCut ? 1 : 0));
  if (p.lowCut) client.set(hpfPath(ch), f(hpfHzToF(p.lowCut)));
  client.set(gateOnPath(ch), i(p.gate !== null ? 1 : 0));
  if (p.gate !== null) client.set(gateThrPath(ch), f(gateDbToF(p.gate)));
  client.set(dynOnPath(ch), i(p.comp !== null ? 1 : 0));
  if (p.comp !== null) client.set(dynThrPath(ch), f(compDbToF(p.comp)));
  // (une valeur absente ou −∞ — devenue null après sauvegarde — veut dire « rien »)
  p.fx.forEach((db, k) => client.set(chLevelPath(ch, { kind: 'fx', n: k + 1 }), f(typeof db === 'number' && isFinite(db) ? dbToFader(db) : 0)));
}
