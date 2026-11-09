// Effets intégrés de la XR16 : 4 emplacements FX1..FX4.
//  - /fx/K/type        numéro de l'effet (liste ci-dessous, ordre de la doc X Air)
//  - /fx/K/par/01..    paramètres de l'effet, de 0 à 1
//  - /rtn/K/mix/fader  niveau du retour d'effet dans la façade
//  - /ch/NN/mix/07..10/level  envoi de chaque voie vers FX1..FX4
//
// ⚠ À VÉRIFIER avec le rapport de débogage : l'ordre des effets après le n° 26,
// le rôle de chaque paramètre et les échelles (temps de delay surtout).

import { f, i } from '../osc/osc';
import { CH_COUNT, chLevelPath, FX_COUNT } from './addresses';
import { ch2, dbToFader } from './levels';
import { XAirClient } from './XAirClient';

export type FxFamily = 'Réverbes' | 'Delays' | 'Modulation' | 'Combinés' | 'Spéciaux';
export type FxKind = 'reverb' | 'delay' | 'mod' | 'combo' | 'other';

export interface FxType {
  n: number;
  name: string; // nom de la table
  fr: string; // nom clair
  family: FxFamily;
  kind: FxKind;
  hint: string;
}

const T = (n: number, name: string, fr: string, family: FxFamily, kind: FxKind, hint: string): FxType => ({ n, name, fr, family, kind, hint });

export const FX_TYPES: FxType[] = [
  T(0, 'Hall Reverb', 'Grande salle', 'Réverbes', 'reverb', 'Voix de ballade, ambiance large'),
  T(1, 'Ambience', 'Ambiance', 'Réverbes', 'reverb', 'Juste un peu d’air, presque invisible'),
  T(2, 'Rich Plate', 'Plaque riche', 'Réverbes', 'reverb', 'Voix pop, brillante et dense'),
  T(3, 'Room', 'Pièce', 'Réverbes', 'reverb', 'Batterie, guitare : naturel et court'),
  T(4, 'Chamber', 'Chambre', 'Réverbes', 'reverb', 'Entre la pièce et la salle'),
  T(5, 'Plate', 'Plaque', 'Réverbes', 'reverb', 'Le classique pour les voix'),
  T(6, 'Vintage Reverb', 'Réverbe vintage', 'Réverbes', 'reverb', 'Couleur années 70'),
  T(7, 'Vintage Room', 'Pièce vintage', 'Réverbes', 'reverb', 'Pièce chaleureuse'),
  T(8, 'Gated Reverb', 'Réverbe coupée', 'Réverbes', 'reverb', 'Caisse claire années 80'),
  T(9, 'Reverse Reverb', 'Réverbe inversée', 'Réverbes', 'reverb', 'Effet spécial, montée avant le son'),
  T(10, 'Stereo Delay', 'Écho stéréo', 'Delays', 'delay', 'Écho calé sur le tempo'),
  T(11, '3-Tap Delay', 'Écho 3 temps', 'Delays', 'delay', 'Trois répétitions placées'),
  T(12, 'Rhythm Delay', 'Écho rythmique', 'Delays', 'delay', 'Motif rythmique de répétitions'),
  T(13, 'Stereo Chorus', 'Chorus', 'Modulation', 'mod', 'Guitare clean, élargit'),
  T(14, 'Stereo Flanger', 'Flanger', 'Modulation', 'mod', 'Avion qui passe'),
  T(15, 'Stereo Phaser', 'Phaser', 'Modulation', 'mod', 'Tourbillon doux'),
  T(16, 'Dimensional Chorus', 'Chorus dimension', 'Modulation', 'mod', 'Chorus très subtil, voix'),
  T(17, 'Mood Filter', 'Filtre auto', 'Spéciaux', 'other', 'Wah automatique'),
  T(18, 'Rotary Speaker', 'Cabine Leslie', 'Modulation', 'mod', 'Orgue, clavier'),
  T(19, 'Stereo Tremolo', 'Trémolo', 'Modulation', 'mod', 'Volume qui ondule'),
  T(20, 'Sub Octaver', 'Octave en dessous', 'Spéciaux', 'other', 'Grossit une basse ou un kick'),
  T(21, 'Delay + Chamber', 'Écho + chambre', 'Combinés', 'combo', 'Deux effets en un'),
  T(22, 'Chorus + Chamber', 'Chorus + chambre', 'Combinés', 'combo', 'Deux effets en un'),
  T(23, 'Flanger + Chamber', 'Flanger + chambre', 'Combinés', 'combo', 'Deux effets en un'),
  T(24, 'Delay + Chorus', 'Écho + chorus', 'Combinés', 'combo', 'Guitare ambiante'),
  T(25, 'Delay + Flanger', 'Écho + flanger', 'Combinés', 'combo', 'Guitare spatiale'),
  T(26, 'Modulation Delay', 'Écho modulé', 'Combinés', 'combo', 'Écho qui ondule'),
];

export const FX_FAMILIES: FxFamily[] = ['Réverbes', 'Delays', 'Modulation', 'Combinés', 'Spéciaux'];

export const fxType = (n: number): FxType => FX_TYPES.find((t) => t.n === n) ?? T(n, `Effet n°${n}`, `Effet n°${n}`, 'Spéciaux', 'other', 'Effet non répertorié');

export const fxTypePath = (k: number) => `/fx/${k}/type`;
export const fxParPath = (k: number, p: number) => `/fx/${k}/par/${ch2(p)}`;
export const fxReturnPath = (k: number) => `/rtn/${k}/mix/fader`;
export const fxReturnOnPath = (k: number) => `/rtn/${k}/mix/on`;

/** Trois réglages « humains » par famille : un ou plusieurs paramètres de la table. */
export interface Knob {
  label: string;
  pars: number[];
  left: string;
  right: string;
}

// Ordre des paramètres tiré de la doc des effets X32/X Air (à vérifier) :
// réverbes : 1 pré-délai, 2 durée, 3 taille, 4 amortissement, 5 diffusion, 6 niveau, 7 coupe-bas, 8 coupe-haut
// écho stéréo : 1 mix, 2 temps, 3 mode, 4 facteur G, 5 facteur D, 6 décalage, 7 coupe-bas, 8 coupe-haut, 10-11 réinjection G/D
// chorus : 1 vitesse, 2-3 profondeur G/D, 4-5 délai G/D, 6 mix
export function knobsFor(kind: FxKind): Knob[] {
  if (kind === 'reverb') return [
    { label: 'Longueur', pars: [2], left: 'courte', right: 'longue' },
    { label: 'Taille', pars: [3], left: 'petite', right: 'grande' },
    { label: 'Brillance', pars: [8], left: 'sombre', right: 'brillante' },
  ];
  if (kind === 'delay') return [
    { label: 'Temps', pars: [2], left: 'court', right: 'long' },
    { label: 'Répétitions', pars: [10, 11], left: 'une', right: 'beaucoup' },
    { label: 'Mélange', pars: [1], left: 'sec', right: 'mouillé' },
  ];
  if (kind === 'mod') return [
    { label: 'Vitesse', pars: [1], left: 'lente', right: 'rapide' },
    { label: 'Profondeur', pars: [2, 3], left: 'légère', right: 'forte' },
    { label: 'Mélange', pars: [6], left: 'sec', right: 'mouillé' },
  ];
  return [
    { label: 'Réglage 1', pars: [1], left: '', right: '' },
    { label: 'Réglage 2', pars: [2], left: '', right: '' },
    { label: 'Réglage 3', pars: [3], left: '', right: '' },
  ];
}

/** Adresses à lire pour afficher le rack. */
export function rackPaths(): string[] {
  const p: string[] = [];
  for (let k = 1; k <= FX_COUNT; k++) {
    p.push(fxTypePath(k), fxReturnPath(k), fxReturnOnPath(k), `/rtn/${k}/config/name`);
    for (let n = 1; n <= 12; n++) p.push(fxParPath(k, n));
  }
  for (let c = 1; c <= CH_COUNT; c++) for (let k = 1; k <= FX_COUNT; k++) p.push(chLevelPath(c, { kind: 'fx', n: k }));
  return p;
}

/** Temps de delay : on suppose une échelle logarithmique de 1 à 3000 ms (À VÉRIFIER). */
export const DELAY_MAX_MS = 3000;
export const msToF = (ms: number) => Math.max(0, Math.min(1, Math.log(Math.max(1, ms)) / Math.log(DELAY_MAX_MS)));
export const fToMs = (v: number) => Math.round(Math.pow(DELAY_MAX_MS, v));

/** Tap tempo : moyenne des derniers intervalles (on oublie une frappe isolée après 2 s). */
export function tapTempo(taps: number[]): { ms: number; bpm: number } | null {
  const recent = taps.filter((t, k) => k === taps.length - 1 || taps[taps.length - 1] - t < 4000).slice(-5);
  if (recent.length < 2) return null;
  const gaps = recent.slice(1).map((t, k) => t - recent[k]).filter((g) => g > 150 && g < 2000);
  if (!gaps.length) return null;
  const ms = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return { ms: Math.round(ms), bpm: Math.round(60000 / ms) };
}

export interface Recipe {
  id: string;
  name: string;
  desc: string;
  type: number;
  pars: Record<number, number>; // paramètre → valeur 0..1
  returnDb: number;
  /** envois suggérés par nom de voie reconnu (mots-clés) */
  sends: [string[], number][];
}

export const RECIPES: Recipe[] = [
  { id: 'voixpop', name: 'Voix pop', desc: 'Plaque brillante, assez courte', type: 2, pars: { 1: 0.1, 2: 0.4, 3: 0.5, 8: 0.7 }, returnDb: -6, sends: [[['voix', 'chant', 'lead'], -12], [['choeur', 'chœur'], -10]] },
  { id: 'ballade', name: 'Ballade', desc: 'Grande salle longue et douce', type: 0, pars: { 1: 0.15, 2: 0.65, 3: 0.7, 8: 0.5 }, returnDb: -4, sends: [[['voix', 'chant', 'lead'], -8], [['guitare acou', 'guitare'], -14], [['piano'], -14]] },
  { id: 'piece', name: 'Petite salle', desc: 'Pièce naturelle, batterie et guitares', type: 3, pars: { 2: 0.3, 3: 0.35, 8: 0.6 }, returnDb: -8, sends: [[['caisse', 'snare'], -14], [['tom'], -16], [['overhead', 'oh'], -18], [['guitare'], -16]] },
  { id: 'caisse80', name: 'Caisse claire 80s', desc: 'Réverbe coupée, énorme', type: 8, pars: { 2: 0.4 }, returnDb: -6, sends: [[['caisse', 'snare'], -6]] },
  { id: 'slap', name: 'Slapback', desc: 'Écho très court, rockabilly', type: 10, pars: { 1: 0.5, 2: msToF(110), 10: 0.1, 11: 0.1 }, returnDb: -8, sends: [[['voix', 'chant'], -14], [['guitare élec', 'guitare elec'], -12]] },
  { id: 'echo', name: 'Écho au tempo', desc: 'Écho long, à caler au tap tempo', type: 10, pars: { 1: 0.5, 2: msToF(450), 10: 0.4, 11: 0.4 }, returnDb: -10, sends: [[['voix', 'chant'], -18]] },
  { id: 'chorus', name: 'Chorus guitare', desc: 'Guitare clean plus large', type: 13, pars: { 1: 0.3, 2: 0.4, 3: 0.4, 6: 0.5 }, returnDb: -6, sends: [[['guitare élec', 'guitare elec', 'clean'], -10]] },
  { id: 'leslie', name: 'Orgue Leslie', desc: 'Cabine tournante pour clavier', type: 18, pars: { 1: 0.4 }, returnDb: -4, sends: [[['clavier', 'orgue', 'synth'], -8]] },
];

/** Applique une recette dans un emplacement. Ne touche les envois que si `withSends`. Renvoie les voies réglées. */
export function applyRecipe(client: XAirClient, k: number, r: Recipe, withSends: boolean): number[] {
  client.set(fxTypePath(k), i(r.type));
  for (const [p, v] of Object.entries(r.pars)) client.set(fxParPath(k, Number(p)), f(v));
  client.set(fxReturnPath(k), f(dbToFader(r.returnDb)));
  client.set(fxReturnOnPath(k), i(1));
  const touched: number[] = [];
  if (!withSends) return touched;
  for (let c = 1; c <= CH_COUNT; c++) {
    const name = String(client.get(`/ch/${ch2(c)}/config/name`) ?? '').toLowerCase();
    if (!name) continue;
    const hit = r.sends.find(([keys]) => keys.some((key) => name.startsWith(key) || name.includes(key)));
    if (hit) {
      client.set(chLevelPath(c, { kind: 'fx', n: k }), f(dbToFader(hit[1])));
      touched.push(c);
    }
  }
  return touched;
}

/** Règle un bouton « humain » (plusieurs paramètres d'un coup). */
export function setKnob(client: XAirClient, k: number, knob: Knob, v: number) {
  for (const p of knob.pars) client.set(fxParPath(k, p), f(Math.max(0, Math.min(1, v))));
}
