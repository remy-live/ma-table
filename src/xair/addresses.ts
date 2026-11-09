// Adresses OSC X Air (XR12/XR16/XR18) et conversions de valeurs.
// Source : document « X AIR Mixer Series Remote Control Protocol » + liste des paramètres.
//  - /ch/NN/mix/01..06/level : envois vers les bus (retours) 1 à 6
//  - /ch/NN/mix/07..10/level : envois vers les effets FX1 à FX4
//  - /ch/NN/eq/1..4/{type,f,g,q} : EQ 4 bandes
//  - /ch/NN/grp/dca : masque de bits des groupes DCA 1 à 4
// À VÉRIFIER sur la vraie table (plages tirées de mémoire) : preamp/hpf, gate/thr, dyn/thr.

import { ch2 } from './levels';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const BUS_COUNT = 6;
export const FX_COUNT = 4;
export const DCA_COUNT = 4;
export const CH_COUNT = 16;

export type Target = { kind: 'main' } | { kind: 'bus'; n: number } | { kind: 'fx'; n: number };

export const MAIN: Target = { kind: 'main' };

export function targetId(t: Target): string {
  return t.kind === 'main' ? 'main' : t.kind + t.n;
}

export function allTargets(): Target[] {
  const out: Target[] = [MAIN];
  for (let n = 1; n <= BUS_COUNT; n++) out.push({ kind: 'bus', n });
  for (let n = 1; n <= FX_COUNT; n++) out.push({ kind: 'fx', n });
  return out;
}

/** Niveau d'une voie vers la cible : fader façade, envoi retour ou envoi effet. */
export function chLevelPath(ch: number, t: Target): string {
  const n = ch2(ch);
  if (t.kind === 'main') return `/ch/${n}/mix/fader`;
  if (t.kind === 'bus') return `/ch/${n}/mix/${ch2(t.n)}/level`;
  return `/ch/${n}/mix/${ch2(6 + t.n)}/level`;
}

/** Fader de sortie de la cible : master, niveau du retour, retour d'effet. */
export function outPath(t: Target): string {
  if (t.kind === 'main') return '/lr/mix/fader';
  if (t.kind === 'bus') return `/bus/${t.n}/mix/fader`;
  return `/rtn/${t.n}/mix/fader`;
}

export function outOnPath(t: Target): string {
  if (t.kind === 'main') return '/lr/mix/on';
  if (t.kind === 'bus') return `/bus/${t.n}/mix/on`;
  return `/rtn/${t.n}/mix/on`;
}

export const busNamePath = (n: number) => `/bus/${n}/config/name`;
export const chNamePath = (ch: number) => `/ch/${ch2(ch)}/config/name`;
export const chOnPath = (ch: number) => `/ch/${ch2(ch)}/mix/on`;

// Groupes DCA
export const chDcaPath = (ch: number) => `/ch/${ch2(ch)}/grp/dca`;
export const dcaFaderPath = (k: number) => `/dca/${k}/fader`;
export const dcaOnPath = (k: number) => `/dca/${k}/on`;
export const dcaNamePath = (k: number) => `/dca/${k}/config/name`;

// Entrée d'une voie
// Préamplis micro (gain + 48 V) : XR18 / MR18 → entrées 1 à 16, XR16 → 1 à 8, XR12 → 1 à 4.
// Le modèle vient de /xinfo à la connexion.
export const MODEL = { name: 'XR16', preamps: 8 };
export function setModel(model: string) {
  const m = model.toUpperCase();
  MODEL.name = model;
  MODEL.preamps = /18/.test(m) ? 16 : /12/.test(m) ? 4 : 8;
}
export const headampGainPath = (ch: number) => `/headamp/${ch2(ch)}/gain`;
export const phantomPath = (ch: number) => `/headamp/${ch2(ch)}/phantom`;
export const invertPath = (ch: number) => `/ch/${ch2(ch)}/preamp/invert`;
export const panPath = (ch: number) => `/ch/${ch2(ch)}/mix/pan`;

/** Gain du préampli : linéaire -12..+60 dB. */
export const gainDbToF = (db: number) => clamp01((db + 12) / 72);
export const fToGainDb = (f: number) => f * 72 - 12;
/** Panoramique : -100 (gauche)..+100 (droite). */
export const panToF = (p: number) => clamp01((p + 100) / 200);
export const fToPan = (f: number) => f * 200 - 100;
export function formatPan(f: number): string {
  const p = Math.round(fToPan(f));
  if (Math.abs(p) < 2) return 'C';
  return (p < 0 ? 'G' : 'D') + Math.abs(p);
}

// Vumètres (étape 5) : /meters/1 = 16 voies (avant fader), 5x2 effets/aux,
// 6 bus, 4 envois FX, 2 sortie LR (après fader), 2 moniteur. Valeurs en 1/256 dB.
export const METERS_ALL = '/meters/1';
export const meterIndex = {
  ch: (ch: number) => ch - 1,
  bus: (n: number) => 25 + n,
  fxsend: (n: number) => 31 + n,
  lrL: 36,
  lrR: 37,
};

// Traitement d'une voie
export const eqOnPath = (ch: number) => `/ch/${ch2(ch)}/eq/on`;
export const eqPath = (ch: number, band: number, p: 'type' | 'f' | 'g' | 'q') => `/ch/${ch2(ch)}/eq/${band}/${p}`;
export const hpOnPath = (ch: number) => `/ch/${ch2(ch)}/preamp/hpon`;
export const hpfPath = (ch: number) => `/ch/${ch2(ch)}/preamp/hpf`;
export const gateOnPath = (ch: number) => `/ch/${ch2(ch)}/gate/on`;
export const gateThrPath = (ch: number) => `/ch/${ch2(ch)}/gate/thr`;
export const dynOnPath = (ch: number) => `/ch/${ch2(ch)}/dyn/on`;
export const dynThrPath = (ch: number) => `/ch/${ch2(ch)}/dyn/thr`;

/** Toutes les adresses de l'écran « EQ · FX » d'une voie. */
export function channelDetailPaths(ch: number): string[] {
  const p = [eqOnPath(ch), hpOnPath(ch), hpfPath(ch), gateOnPath(ch), gateThrPath(ch), dynOnPath(ch), dynThrPath(ch)];
  for (let b = 1; b <= 4; b++) p.push(eqPath(ch, b, 'type'), eqPath(ch, b, 'f'), eqPath(ch, b, 'g'), eqPath(ch, b, 'q'));
  for (let n = 1; n <= FX_COUNT; n++) p.push(chLevelPath(ch, { kind: 'fx', n }));
  return p;
}

// ---------- conversions valeur table (0..1) <-> unité lisible ----------


/** EQ : gain linéaire -15..+15 dB. */
export const eqGainToF = (db: number) => clamp01((db + 15) / 30);
export const fToEqGain = (f: number) => f * 30 - 15;

/** EQ : fréquence logarithmique 20 Hz..20 kHz. */
export const hzToF = (hz: number) => clamp01(Math.log(hz / 20) / Math.log(1000));
export const fToHz = (f: number) => 20 * Math.pow(1000, f);

/** EQ : Q logarithmique 10 (étroit)..0.3 (large). */
export const qToF = (q: number) => clamp01(Math.log(10 / q) / Math.log(10 / 0.3));
export const fToQ = (f: number) => 10 / Math.pow(10 / 0.3, f);

/** Coupe-bas : 20..400 Hz, logarithmique. (à vérifier) */
export const hpfHzToF = (hz: number) => clamp01(Math.log(hz / 20) / Math.log(20));
export const fToHpfHz = (f: number) => 20 * Math.pow(20, f);

/** Gate : seuil -80..0 dB. Compresseur : seuil -60..0 dB. (à vérifier) */
export const gateDbToF = (db: number) => clamp01((db + 80) / 80);
export const fToGateDb = (f: number) => f * 80 - 80;
export const compDbToF = (db: number) => clamp01((db + 60) / 60);
export const fToCompDb = (f: number) => f * 60 - 60;

/** Types de bande EQ X Air. */
export const EQ_TYPES = { lcut: 0, lshv: 1, peq: 2, veq: 3, hshv: 4, hcut: 5 } as const;

export function formatHz(hz: number): string {
  if (hz >= 1000) return (hz / 1000).toFixed(hz >= 10000 ? 0 : 1).replace('.', ',') + ' kHz';
  return Math.round(hz) + ' Hz';
}

/** Bits du masque DCA. */
export const inDca = (mask: number, k: number) => ((mask >> (k - 1)) & 1) === 1;
export const toggleDca = (mask: number, k: number) => mask ^ (1 << (k - 1));

// ---------- Source d'une voie (quelle prise arrive sur cette voie) ----------
// À VÉRIFIER avec le rapport : /ch/NN/config/insrc, entier 0..17
// (0 = prise 1 … 15 = prise 16, 16 = LINE 17 / USB gauche, 17 = LINE 18 / USB droite).
export const insrcPath = (ch: number) => `/ch/${ch2(ch)}/config/insrc`;
export const INSRC_COUNT = 18;
export const insrcLabel = (i: number) => (i < 16 ? `Prise ${i + 1}` : i === 16 ? 'Ordi G (17)' : 'Ordi D (18)');
/** Numéro de prise à l'arrière (1..18) pour une valeur insrc. */
export const insrcPlug = (i: number) => i + 1;

/** Type d'entrée d'une voie, pour l'étiquette sous le numéro de prise. */
export function sourceKind(insrc: number, phantom: boolean): 'Micro' | 'Micro 48V' | 'Ligne' | 'USB' {
  if (insrc >= 16) return 'USB';
  if (insrc + 1 <= MODEL.preamps) return phantom ? 'Micro 48V' : 'Micro';
  return 'Ligne';
}

// ---------- Snapshots internes de la table (64 emplacements) ----------
// À VÉRIFIER : /-snap/save ,i N · /-snap/load ,i N · /-snap/NN/name
export const SNAP_COUNT = 64;
export const snapNamePath = (n: number) => `/-snap/${ch2(n)}/name`;
export const SNAP_SAVE = '/-snap/save';
export const SNAP_LOAD = '/-snap/load';

// ---------- Wi-Fi de la table (adresses à vérifier sur la vraie table) ----------
export const WLAN = {
  mode: '/-prefs/wlan/mode', // 0 point d'accès, 1 client (?)
  apSsid: '/-prefs/ap/ssid',
  apChannel: '/-prefs/ap/channel',
  isSsid: '/-prefs/is/ssid',
  lanMode: '/-prefs/lan/mode',
  ip: '/-prefs/lan/addr',
};
export const WLAN_PATHS = Object.values(WLAN);
