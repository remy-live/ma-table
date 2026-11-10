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
  element?: string; // batterie : Kick, Caisse claire…
  desc?: string;
}

export type Family = 'Voix' | 'Guitares' | 'Basse' | 'Batterie' | 'Claviers' | 'Vents & cordes' | 'Mes réglages';
export const FAMILIES: Family[] = ['Voix', 'Guitares', 'Basse', 'Batterie', 'Claviers', 'Vents & cordes', 'Mes réglages'];

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
const ELEM: Record<string, string> = { Kick: 'Kick', 'Caisse claire': 'Caisse claire', Charley: 'Charley', Toms: 'Toms', Overhead: 'Overheads' };

/** Éléments de batterie, pour les retrouver vite. */
export const DRUM_PARTS = ['Kick', 'Caisse claire', 'Charley', 'Toms', 'Overheads', 'Ride', 'Ambiance', 'Percus'];

type P = Omit<Preset, 'eq' | 'fx'> & { eq: [number, number, number][]; fx: [number, number, number, number] };
const v = (family: Family, variant: string, desc: string, eq: [number, number, number][], lowCut: number | null, gate: number | null, comp: number | null, fx: [number, number, number, number], element?: string): P =>
  ({ name: `${element ?? family} · ${variant}`, family, variant, desc, eq, lowCut, gate, comp, fx, element });

/** Bibliothèque : les préréglages de base + des variantes par instrument. */
export const LIBRARY: Preset[] = [
  ...PRESETS.map((p) => ({ ...p, family: FAM[p.name], variant: FAM[p.name] === 'Batterie' ? 'Standard' : p.name === 'Voix' || p.name === 'Basse' ? 'Standard' : p.name.replace('Guitare a', 'A').replace('Guitare é', 'É') + ' · standard', desc: 'Point de départ équilibré', element: ELEM[p.name] })),
  // VOIX
  v('Voix', 'Voix d’homme', 'Moins de boum, plus de présence', [[150, -3, 1], [350, -2, 1.4], [3000, 3, 1.2], [10000, 1, 1]], 100, null, -18, [-12, -20, OFF, OFF]),
  v('Voix', 'Voix de femme', 'Douce dans les aigus, sans dureté', [[200, -2, 1], [500, -1, 1.4], [3500, 2, 1.4], [11000, 2, 1]], 120, null, -18, [-11, -20, OFF, OFF]),
  v('Voix', 'Rock', 'Présence, compresseur plus ferme', [[120, -3, 1], [400, -3, 1.2], [3500, 4, 1.2], [10000, 1, 1]], 120, null, -24, [-16, -16, OFF, OFF]),
  v('Voix', 'Ballade', 'Moins d’aigus, plus de réverbe', [[120, -2, 1], [300, -2, 1.4], [2500, 1, 1.2], [9000, 0, 1]], 90, null, -20, [-8, -18, OFF, OFF]),
  v('Voix', 'Rap / slam', 'Mots bien clairs, sec, compresseur fort', [[120, -1, 1], [300, -3, 1.4], [3000, 3, 1.2], [9000, 1, 1]], 90, null, -26, [-24, OFF, OFF, OFF]),
  v('Voix', 'Chœurs', 'Plus légers derrière la voix principale', [[150, -4, 1], [350, -3, 1.4], [3000, 1, 1.2], [10000, 2, 1]], 140, null, -20, [-10, OFF, OFF, OFF]),
  v('Voix', 'Chanteur guitariste', 'Coupe le bruit de la guitare dans le micro', [[180, -4, 1], [400, -3, 1.4], [3000, 3, 1.2], [10000, 1, 1]], 150, null, -18, [-12, OFF, OFF, OFF]),
  v('Voix', 'Parole', 'Annonces entre les chansons, sans effet', [[120, -3, 1], [250, -2, 1.4], [3000, 2, 1.2], [8000, 0, 1]], 120, null, -16, [OFF, OFF, OFF, OFF]),
  // GUITARES
  v('Guitares', 'Acou · arpèges', 'Brillante, détaillée', [[100, -5, 1], [250, -2, 1.4], [3000, 2, 1.2], [10000, 3, 1]], 100, null, -22, [-12, OFF, OFF, OFF]),
  v('Guitares', 'Acou · rythmique', 'Moins de boum, laisse la place à la voix', [[120, -6, 1], [300, -3, 1.4], [2000, -1, 1.2], [8000, 2, 1]], 120, null, -18, [-18, OFF, OFF, OFF]),
  v('Guitares', 'Classique (nylon)', 'Chaude, un peu d’air', [[100, -3, 1], [250, -1, 1.4], [2500, 1, 1.2], [9000, 2, 1]], 80, null, -24, [-12, OFF, OFF, OFF]),
  v('Guitares', 'Élec · clean', 'Claire, un peu de chorus et de réverbe', [[100, -2, 1], [400, -1, 1.4], [2500, 2, 1.2], [9000, 1, 1]], 80, null, -22, [-14, OFF, -14, OFF]),
  v('Guitares', 'Élec · crunch', 'Moins de bas-médiums, garde le mordant', [[100, -1, 1], [350, -3, 1.2], [1800, 2, 1.4], [7000, -1, 1]], 90, null, null, [-20, -18, OFF, OFF]),
  v('Guitares', 'Élec · saturée', 'Gros son sans boue ni aigus qui piquent', [[100, -2, 1], [300, -3, 1.2], [1500, 2, 1.4], [6000, -3, 1]], 90, null, null, [-22, OFF, OFF, OFF]),
  v('Guitares', 'Élec · solo', 'Passe devant, avec de l’écho', [[100, -2, 1], [500, -1, 1.4], [2000, 3, 1.2], [7000, 0, 1]], 100, null, -24, [-16, -12, OFF, OFF]),
  v('Guitares', 'Élec · funk', 'Claquante et sèche', [[120, -4, 1], [400, -2, 1.4], [3000, 3, 1.2], [9000, 2, 1]], 120, null, -20, [OFF, OFF, OFF, OFF]),
  // BASSE
  v('Basse', 'Ronde', 'Doigts, grosse fondamentale', [[70, 4, 1], [250, -2, 1.4], [800, 1, 1.2], [4000, -4, 1]], 30, null, -14, [OFF, OFF, OFF, OFF]),
  v('Basse', 'Claquante', 'Slap ou médiator, plus d’attaque', [[80, 2, 1], [300, -4, 1.2], [1200, 3, 1.4], [6000, 2, 1]], 35, null, -20, [OFF, OFF, OFF, OFF]),
  v('Basse', 'Boîtier direct (DI)', 'Branchée sans ampli', [[60, 2, 1], [250, -3, 1.4], [1000, 2, 1.2], [5000, -2, 1]], 35, null, -16, [OFF, OFF, OFF, OFF]),
  v('Basse', 'Contrebasse', 'Boisée, sans résonance qui gronde', [[90, 2, 1], [200, -3, 1.4], [1500, 2, 1.2], [6000, 0, 1]], 40, null, -18, [-24, OFF, OFF, OFF]),
  // BATTERIE
  v('Batterie', 'Rock', 'Clic marqué, grave serré', [[60, 4, 1], [400, -8, 1], [4000, 5, 1.4], [10000, 0, 1]], 35, -30, -16, [OFF, OFF, OFF, OFF], 'Kick'),
  v('Batterie', 'Jazz', 'Naturel, résonnant', [[70, 2, 1], [300, -2, 1.4], [2500, 1, 1.2], [9000, 0, 1]], 35, null, null, [OFF, OFF, OFF, OFF], 'Kick'),
  v('Batterie', 'Métal', 'Très claquant, très serré', [[55, 3, 1], [350, -9, 1], [5000, 6, 1.4], [10000, 1, 1]], 40, -28, -18, [OFF, OFF, OFF, OFF], 'Kick'),
  v('Batterie', 'Pop', 'Rond et propre', [[65, 4, 1], [300, -5, 1.2], [3000, 2, 1.4], [9000, 0, 1]], 35, -34, -16, [OFF, OFF, OFF, OFF], 'Kick'),
  v('Batterie', 'Sèche', 'Sans réverbe, gate serré', [[180, 2, 1], [500, -3, 1.4], [4000, 3, 1.2], [9000, 1, 1]], 90, -34, -14, [OFF, OFF, OFF, OFF], 'Caisse claire'),
  v('Batterie', 'Grasse', 'Plus de corps, réverbe', [[200, 3, 1], [600, -2, 1.4], [3000, 2, 1.2], [9000, 1, 1]], 80, -38, -16, [-12, OFF, OFF, OFF], 'Caisse claire'),
  v('Batterie', 'Brillante', 'Timbre bien présent', [[200, 0, 1], [450, -3, 1.4], [5000, 4, 1.2], [10000, 3, 1]], 100, -36, -16, [-16, OFF, OFF, OFF], 'Caisse claire'),
  v('Batterie', 'Doux', 'Moins d’aigus qui piquent', [[300, -6, 1], [800, -2, 1.4], [6000, -2, 1.2], [12000, 1, 1]], 300, null, null, [OFF, OFF, OFF, OFF], 'Charley'),
  v('Batterie', 'Tom basse', 'Grave profond', [[80, 4, 1], [350, -5, 1.4], [3500, 2, 1.2], [9000, 0, 1]], 50, -38, -18, [-18, OFF, OFF, OFF], 'Toms'),
  v('Batterie', 'Tom aigu', 'Attaque nette', [[120, 2, 1], [450, -4, 1.4], [4500, 3, 1.2], [9000, 0, 1]], 80, -38, -18, [-18, OFF, OFF, OFF], 'Toms'),
  v('Batterie', 'Jazz', 'Toute la batterie, naturelle', [[120, -1, 1], [400, -1, 1.4], [4000, 0, 1.2], [11000, 2, 1]], 100, null, null, [-22, OFF, OFF, OFF], 'Overheads'),
  v('Batterie', 'Cymbales seules', 'Juste le brillant, pas de fûts', [[300, -6, 1], [800, -2, 1.4], [5000, 1, 1.2], [12000, 3, 1]], 300, null, null, [-22, OFF, OFF, OFF], 'Overheads'),
  v('Batterie', 'Standard', 'Le ping sans le grondement', [[250, -4, 1], [700, -2, 1.4], [4000, 1, 1.2], [11000, 2, 1]], 250, null, null, [-24, OFF, OFF, OFF], 'Ride'),
  v('Batterie', 'Standard', 'Micro d’ambiance, à doser fin', [[100, -2, 1], [400, -3, 1.4], [3000, 0, 1.2], [9000, -2, 1]], 80, null, -26, [OFF, OFF, OFF, OFF], 'Ambiance'),
  v('Batterie', 'Cajon', 'Grave rond + claque', [[80, 3, 1], [350, -4, 1.2], [3000, 3, 1.4], [9000, 0, 1]], 40, null, -18, [-20, OFF, OFF, OFF], 'Percus'),
  v('Batterie', 'Congas / djembé', 'Peau chaude, claque nette', [[100, 2, 1], [400, -3, 1.4], [3500, 2, 1.2], [9000, 1, 1]], 60, null, -20, [-18, OFF, OFF, OFF], 'Percus'),
  v('Batterie', 'Batterie électronique', 'Déjà mixée : on n’y touche presque pas', [[80, 0, 1], [400, 0, 1.4], [3000, 0, 1.2], [10000, 0, 1]], null, null, null, [OFF, OFF, OFF, OFF], 'Percus'),
  // CLAVIERS
  v('Claviers', 'Piano', 'Moins de boue, un peu d’air', [[100, -2, 1], [300, -2, 1.4], [3000, 1, 1.2], [10000, 2, 1]], 60, null, -22, [-16, OFF, OFF, OFF]),
  v('Claviers', 'Piano électrique', 'Chaud et rond, un peu de chorus', [[100, -1, 1], [350, -2, 1.4], [2500, 1, 1.2], [8000, 0, 1]], 60, null, -22, [-18, OFF, -16, OFF]),
  v('Claviers', 'Orgue', 'Pas trop de grave, pas trop d’aigu', [[120, -3, 1], [500, -1, 1.4], [3000, 1, 1.2], [8000, -2, 1]], 80, null, null, [-18, OFF, OFF, OFF]),
  v('Claviers', 'Synthé nappe', 'Discret, laisse la place', [[150, -4, 1], [500, -2, 1.4], [3000, -1, 1.2], [9000, 1, 1]], 120, null, null, [-14, OFF, OFF, OFF]),
  v('Claviers', 'Synthé lead', 'Passe devant, avec de l’écho', [[150, -2, 1], [600, -1, 1.4], [2500, 2, 1.2], [8000, 0, 1]], 100, null, -24, [-18, -14, OFF, OFF]),
  v('Claviers', 'Ordi / lecteur', 'Bande son : neutre, sans effet', [[100, 0, 1], [400, 0, 1.4], [3000, 0, 1.2], [10000, 0, 1]], null, null, null, [OFF, OFF, OFF, OFF]),
  // VENTS & CORDES
  v('Vents & cordes', 'Saxophone', 'Moins nasal, plus doux', [[150, -2, 1], [800, -3, 1.4], [3000, 1, 1.2], [9000, 1, 1]], 100, null, -20, [-14, OFF, OFF, OFF]),
  v('Vents & cordes', 'Trompette', 'Sans dureté dans les aigus', [[200, -2, 1], [1000, -1, 1.4], [3500, -2, 1.4], [9000, 0, 1]], 150, null, -22, [-16, OFF, OFF, OFF]),
  v('Vents & cordes', 'Flûte', 'Souffle léger', [[300, -3, 1], [700, -1, 1.4], [4000, 1, 1.2], [11000, 2, 1]], 200, null, -24, [-12, OFF, OFF, OFF]),
  v('Vents & cordes', 'Violon', 'Moins de grincement, plus d’air', [[250, -2, 1], [600, -1, 1.4], [3000, -2, 1.4], [10000, 2, 1]], 180, null, -22, [-12, OFF, OFF, OFF]),
  v('Vents & cordes', 'Violoncelle', 'Boisé, sans grondement', [[100, 1, 1], [250, -2, 1.4], [2000, 1, 1.2], [8000, 0, 1]], 60, null, -22, [-14, OFF, OFF, OFF]),
  v('Vents & cordes', 'Accordéon', 'Moins de médiums qui saturent', [[150, -2, 1], [600, -3, 1.4], [3000, 1, 1.2], [9000, 0, 1]], 100, null, -20, [-16, OFF, OFF, OFF]),
  v('Vents & cordes', 'Harmonica', 'Sans aigus qui piquent', [[200, -3, 1], [800, 1, 1.4], [3000, -2, 1.4], [8000, -2, 1]], 200, null, -20, [-18, OFF, OFF, OFF]),
  v('Vents & cordes', 'Ukulélé / mandoline', 'Brillant sans être aigrelet', [[150, -4, 1], [400, -2, 1.4], [3000, 1, 1.2], [10000, 2, 1]], 150, null, -22, [-14, OFF, OFF, OFF]),
];

/** Ce que l'appli devine d'un nom de voie : la famille (et l'élément de batterie). */
export function guessFamily(name: string): { family: Family; element?: string } | null {
  const t = name.trim().toLowerCase();
  if (!t) return null;
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  if (has('kick', 'grosse caisse', 'bd')) return { family: 'Batterie', element: 'Kick' };
  if (has('caisse claire', 'snare', 'cc', 'sn')) return { family: 'Batterie', element: 'Caisse claire' };
  if (has('charley', 'hihat', 'hi-hat', 'hh')) return { family: 'Batterie', element: 'Charley' };
  if (has('tom', 'floor')) return { family: 'Batterie', element: 'Toms' };
  if (has('overhead', 'oh', 'cymbale', 'crash')) return { family: 'Batterie', element: 'Overheads' };
  if (has('ride')) return { family: 'Batterie', element: 'Ride' };
  if (has('room', 'ambiance')) return { family: 'Batterie', element: 'Ambiance' };
  if (has('cajon', 'conga', 'djemb', 'percu', 'batterie')) return { family: 'Batterie', element: 'Percus' };
  if (has('voix', 'chant', 'choeur', 'chœur', 'lead', 'vocal', 'micro', 'parole', 'annonce')) return { family: 'Voix' };
  if (has('contrebasse', 'basse', 'bass')) return { family: 'Basse' };
  if (has('guit', 'gtr', 'acou', 'élec', 'elec', 'nylon')) return { family: 'Guitares' };
  if (has('piano', 'clavier', 'synth', 'orgue', 'keys', 'rhodes', 'ordi', 'pc', 'usb', 'lecteur')) return { family: 'Claviers' };
  if (has('sax', 'trompette', 'flûte', 'flute', 'violon', 'cello', 'accord', 'harmonica', 'ukul', 'mandol', 'banjo')) return { family: 'Vents & cordes' };
  return null;
}

/** Les préréglages à proposer pour une voie (d'après son nom). */
export function suggestFor(name: string): Preset[] {
  const g = guessFamily(name);
  if (!g) return [];
  const list = LIBRARY.filter((p) => p.family === g.family && (!g.element || p.element === g.element));
  // les plus proches du nom d'abord (ex. « Voix rock » → Rock)
  const t = name.toLowerCase();
  return list.slice().sort((a, b) => Number(t.includes((b.variant ?? '').toLowerCase())) - Number(t.includes((a.variant ?? '').toLowerCase())));
}

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
