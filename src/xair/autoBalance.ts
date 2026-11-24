// Balance automatique : l'appli dit qui doit jouer (à l'écran et à voix haute),
// écoute les vumètres, et en déduit gain, gate, compresseur, faders, retours.
// Rien de magique : c'est une base solide, à finir à l'oreille.
//
// Garde-fous : jamais de 48 V, gain changé de 18 dB au plus par passage,
// faders plafonnés à 0 dB, et l'écran propose « Annuler tout ».

import { f, i } from '../osc/osc';
import {
  BUS_COUNT, busNamePath, CH_COUNT, chLevelPath, chNamePath, compDbToF, dynOnPath, dynThrPath, fToGainDb, gainDbToF, gateDbToF, gateOnPath,
  gateThrPath, headampGainPath, MAIN, meterIndex,
} from './addresses';
import { hasPreamp } from './guide';
import { dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';
import { EqBand, guessRole, tailorEq } from './listen';
import { eqGainToF, eqOnPath, eqPath, EQ_TYPES, hzToF, qToF } from './addresses';
import { recognize } from './smartName';
import { applyPreset, PRESETS } from './presets';

export type StepKind = 'silence' | 'solo' | 'tutti';
export type Mode = 'complet' | 'express';

export interface AutoStep {
  kind: StepKind;
  ch?: number; // pour un solo
  who: string; // « Batteur »
  what: string; // « Kick »
  say: string; // la consigne affichée en gros
  speak: string; // la phrase dite à voix haute
  seconds: number;
}

export const TARGET_PEAK = -12; // dB : pic visé sur l'entrée (marge avant saturation)
export const MAX_GAIN_STEP = 18; // dB par passage
export const DRUM_MARGIN = 3; // dB de marge en plus pour la batterie
export const BIG_JUMP = 15; // dB : au-delà, on prévient (test trop doux ?)
export const VOICE_MAX_GAIN = 45; // dB : plafond automatique pour une voix
export const DRUM_MAX_GAIN = 40; // dB : la batterie est forte et prise de près
export const OTHER_MAX_GAIN = 52; // dB : guitare acoustique au micro, etc.
export const SILENT = -55; // en dessous : on n'a rien entendu
export const PLAYING = -45; // au-dessus : « ça joue », l'écoute démarre
export const LR_KEY = 0; // clé des mesures de la façade dans Samples

interface Role {
  keys: string[];
  who: string;
  say: string; // {n} = nom de la voie
  mix: number; // place dans le mix, en dB par rapport à la voix (0)
  order: number; // ordre de passage
  drum?: boolean;
}

// Batterie : un passage par élément, du bas vers le haut, comme un vrai sondier.
const ROLES: Role[] = [
  { keys: ['kick', 'grosse caisse', 'gc', 'bd'], who: 'Batteur', say: 'Grosse caisse seule : un coup par seconde, fort', mix: -3, order: 1, drum: true },
  { keys: ['caisse', 'snare', 'cc', 'sn'], who: 'Batteur', say: 'Caisse claire seule : des coups francs, comme dans un refrain, puis quelques ghost notes', mix: -4, order: 2, drum: true },
  { keys: ['charley', 'hihat', 'hh', 'hi-hat'], who: 'Batteur', say: 'Charley seul : fermé en croches, puis ouvert', mix: -12, order: 3, drum: true },
  { keys: ['tom'], who: 'Batteur', say: '{n} seul : des coups forts, laisse sonner', mix: -6, order: 4, drum: true },
  { keys: ['ride'], who: 'Batteur', say: 'Ride seule : en croches, puis la cloche', mix: -10, order: 5, drum: true },
  { keys: ['overhead', 'oh', 'cymbale', 'crash'], who: 'Batteur', say: '{n} : crash et ride, fort', mix: -10, order: 6, drum: true },
  { keys: ['batterie', 'drum'], who: 'Batteur', say: 'Joue un rythme de refrain, toute la batterie', mix: -4, order: 7, drum: true },
  { keys: ['cajon'], who: 'Percussionniste', say: 'Cajon : graves au centre puis claques sur le bord', mix: -4, order: 8, drum: true },
  { keys: ['percu', 'conga', 'bongo'], who: 'Percussionniste', say: 'Joue fort, comme au concert', mix: -8, order: 9, drum: true },
  { keys: ['basse', 'bass'], who: 'Bassiste', say: 'Joue fort, avec des notes graves et des aiguës', mix: -3, order: 10 },
  { keys: ['guitare élec', 'guitare elec', 'elec', 'électrique'], who: 'Guitariste', say: 'Ton son le plus fort : refrain ou solo', mix: -5, order: 20 },
  { keys: ['guitare', 'gtr', 'acou'], who: 'Guitariste', say: 'Gratte fort, comme dans un refrain', mix: -5, order: 21 },
  { keys: ['clavier', 'piano', 'synth', 'orgue', 'keys'], who: 'Claviériste', say: 'Ton son le plus fort, à deux mains', mix: -6, order: 30 },
  { keys: ['ordi', 'lecteur', 'bande', 'pc', 'mac', 'playback'], who: 'Ordi', say: 'Lance le passage le plus fort de la bande son', mix: -6, order: 35 },
  { keys: ['choeur', 'chœur', 'backing'], who: 'Choriste', say: 'Chante fort, la bouche près du micro', mix: -6, order: 40 },
  { keys: ['voix', 'chant', 'lead', 'micro'], who: 'Chanteur', say: 'Chante le refrain aussi fort qu’en concert, la bouche près du micro', mix: 0, order: 50 },
];

const OTHER: Role = { keys: [], who: 'Musicien', say: 'Joue comme au concert, ton passage le plus fort', mix: -6, order: 45 };

export function roleOf(name: string): Role {
  const t = name.trim().toLowerCase();
  if (!t) return OTHER;
  return ROLES.find((r) => r.keys.some((k) => t === k || t.startsWith(k) || t.includes(' ' + k) || (k.length > 3 && t.includes(k)))) ?? OTHER;
}

const named = (client: XAirClient) =>
  Array.from({ length: CH_COUNT }, (_, k) => k + 1)
    .map((ch) => ({ ch, name: String(client.get(chNamePath(ch)) ?? '') }))
    .filter((x) => x.name);

/** Le déroulé. Complet : silence, chaque voie nommée (batterie élément par élément d'abord, voix en dernier), tous ensemble. Express : tous ensemble. */
/** Ce que la balance automatique a le droit de régler. */
export interface What { gain: boolean; gate: boolean; comp: boolean; fader: boolean; preset?: boolean; eq?: boolean }
export const WHAT_ALL: What = { gain: true, gate: true, comp: true, fader: true, preset: false, eq: true };

/** Préréglage de l'instrument (égaliseur, coupe-bas, comp) d'après le nom de la voie.
 *  Posé AVANT la mesure : l'égaliseur et le compresseur changent le niveau. Rend les voies touchées. */
export function applyInstrumentPresets(client: XAirClient, chans: Iterable<number>): number[] {
  const done: number[] = [];
  for (const ch of chans) {
    const rec = recognize(String(client.get(chNamePath(ch)) ?? ''));
    const p = rec?.preset ? PRESETS.find((x) => x.name === rec.preset) : undefined;
    if (p) { applyPreset(client, ch, p); done.push(ch); }
  }
  return done;
}

/** Les voies nommées (celles qu'on peut appeler). */
export const namedChannels = (client: XAirClient) => named(client).map((n) => n.ch);

/** only : les voies à faire passer (par défaut toutes les voies nommées). */
export function buildSteps(client: XAirClient, mode: Mode = 'complet', only?: Set<number>): AutoStep[] {
  const list = named(client).filter((n) => !only || only.has(n.ch)).sort((a, b) => roleOf(a.name).order - roleOf(b.name).order || a.ch - b.ch);
  const tutti: AutoStep = { kind: 'tutti', who: 'Tout le monde', what: 'Le groupe', say: 'Jouez un refrain ensemble, comme au concert', speak: 'Maintenant tout le monde ensemble : un refrain, comme au concert.', seconds: mode === 'express' ? 20 : 25 };
  if (mode === 'express') return list.length ? [tutti] : [];
  const steps: AutoStep[] = [{ kind: 'silence', who: 'Tout le monde', what: 'Silence', say: 'Personne ne joue, personne ne parle', speak: 'Silence s’il vous plaît, personne ne joue.', seconds: 5 }];
  for (const n of list) {
    const r = roleOf(n.name);
    const say = r.say.replace('{n}', n.name);
    steps.push({ kind: 'solo', ch: n.ch, who: r.who, what: n.name, say, speak: `${r.who}. ${say}.`, seconds: r.drum ? 7 : 8 });
  }
  if (list.length) steps.push(tutti);
  return steps;
}

/** Valeur au rang p (0..1) d'une liste de mesures en dB. */
export function percentile(xs: number[], p: number): number {
  const v = xs.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return -Infinity;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
}

/** Mesures d'un passage : voie → échantillons (dB). Clé LR_KEY = façade. */
export type StepSamples = Map<number, number[]>;
export type Samples = Map<number, StepSamples>;

export function addSample(samples: Samples, step: number, meters: ArrayLike<number>) {
  let m = samples.get(step);
  if (!m) samples.set(step, (m = new Map()));
  for (let c = 1; c <= CH_COUNT; c++) {
    let a = m.get(c);
    if (!a) m.set(c, (a = []));
    a.push(meters[c - 1] ?? -90);
  }
  let lr = m.get(LR_KEY);
  if (!lr) m.set(LR_KEY, (lr = []));
  lr.push(Math.max(meters[meterIndex.lrL] ?? -90, meters[meterIndex.lrR] ?? -90));
}

export const peakOf = (m: StepSamples | undefined, ch: number) => percentile(m?.get(ch) ?? [], 0.97);

/** « Ça joue » : le signal attendu dépasse PLAYING (n'importe quelle voie nommée pour « tous ensemble »). */
export function isPlaying(meters: ArrayLike<number>, step: AutoStep, chans: number[]): boolean {
  const list = step.kind === 'solo' && step.ch ? [step.ch] : chans;
  return list.some((c) => (meters[c - 1] ?? -90) > PLAYING);
}

/** Erreur de prise : on attendait la voie `ch`, mais le son arrive nettement plus fort ailleurs. */
export function wrongPlug(m: StepSamples | undefined, ch: number): number | null {
  const mine = peakOf(m, ch);
  let best = ch;
  let bestPeak = mine;
  for (let c = 1; c <= CH_COUNT; c++) {
    const p = peakOf(m, c);
    if (p > bestPeak) {
      best = c;
      bestPeak = p;
    }
  }
  if (best === ch || bestPeak < PLAYING) return null;
  return bestPeak - (isFinite(mine) ? mine : -90) >= 10 ? best : null;
}

export interface Bleed {
  ch: number; // le micro qui entend trop
  from: number; // ce qu'il entend
  diff: number; // dB d'écart avec la source
}

/** Micros qui entendent trop leurs voisins. Normal (ignoré) : entre micros de batterie. */
export function bleeds(client: XAirClient, m: StepSamples | undefined, src: number): Bleed[] {
  const sp = peakOf(m, src);
  if (!isFinite(sp) || sp < PLAYING) return [];
  const srcDrum = !!roleOf(String(client.get(chNamePath(src)) ?? '')).drum;
  const out: Bleed[] = [];
  for (const n of named(client)) {
    if (n.ch === src) continue;
    if (srcDrum && roleOf(n.name).drum) continue;
    const p = peakOf(m, n.ch);
    if (p > -40 && p > sp - 12) out.push({ ch: n.ch, from: src, diff: Math.round(sp - p) });
  }
  return out;
}

export interface ChResult {
  ch: number;
  name: string;
  noise?: number;
  peak?: number;
  gainFrom?: number;
  gainTo?: number;
  heard?: boolean;
  gate?: number;
  comp?: number;
  faderFrom?: number;
  fader?: number;
  /** égalisation proposée d'après le spectre écouté pendant le passage seul (4 bandes au plus) */
  eq?: EqBand[];
  note?: string;
}

/** Résultat d'un solo (gain) — calculé tout de suite, pour que la suite soit mesurée au bon niveau. */
export function soloResult(client: XAirClient, ch: number, m: StepSamples | undefined): ChResult {
  const r: ChResult = { ch, name: String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}` };
  const peak = peakOf(m, ch);
  r.peak = peak;
  r.heard = isFinite(peak) && peak > SILENT;
  if (!r.heard) {
    r.note = 'Rien entendu : câble, micro, ou mauvaise prise ?';
    return r;
  }
  if (hasPreamp(ch)) {
    const cur = fToGainDb(Number(client.get(headampGainPath(ch)) ?? 0.5));
    const role = roleOf(r.name);
    // la batterie tape toujours plus fort en concert qu'à la balance : 3 dB de marge en plus
    const target = role.drum ? TARGET_PEAK - DRUM_MARGIN : TARGET_PEAK;
    const delta = Math.max(-MAX_GAIN_STEP, Math.min(MAX_GAIN_STEP, target - peak));
    r.gainFrom = Math.round(cur * 2) / 2;
    let to = Math.max(-12, Math.min(60, cur + delta));
    if (Math.abs(target - peak) > MAX_GAIN_STEP) r.note = 'Très loin du bon niveau : refais un passage pour affiner';
    // gros saut vers le haut : souvent un test joué trop doucement
    if (delta >= BIG_JUMP) r.note = `Force du micro (gain) montée de ${Math.round(delta)} dB : le test était peut-être trop doux. Refais-le en jouant fort, comme au concert.`;
    // plafond selon la source : au-delà, c'est presque toujours un test trop doux ou un micro mal placé
    const isVoice = role.who === 'Chanteur' || role.who === 'Choriste';
    const cap = role.drum ? DRUM_MAX_GAIN : isVoice ? VOICE_MAX_GAIN : OTHER_MAX_GAIN;
    if (to > cap && to > cur) {
      to = Math.max(cur, cap);
      r.note = `Limité à +${cap} dB pour ${role.drum ? 'la batterie' : isVoice ? 'une voix' : 'cet instrument'} : rapproche le micro ou joue plus fort, ou monte à la main si c’est voulu.`;
    }
    r.gainTo = Math.round(to * 2) / 2;
    if (peak > -1) r.note = 'Saturait pendant le test : gain baissé';
  } else if (peak < TARGET_PEAK - 12) r.note = 'Entrée ligne faible : monte le volume sur l’instrument';
  else if (peak > -3) r.note = 'Entrée ligne trop forte : baisse le volume sur l’instrument';
  return r;
}

export function applyGainNow(client: XAirClient, r: ChResult) {
  if (r.gainTo !== undefined && hasPreamp(r.ch)) client.set(headampGainPath(r.ch), f(gainDbToF(r.gainTo)));
}

/** Calcule le reste (gate, compresseur, faders) à partir des solos déjà faits et des mesures. */
export function compute(client: XAirClient, steps: AutoStep[], samples: Samples, solos: Map<number, ChResult>): ChResult[] {
  const res = new Map<number, ChResult>();
  for (const [ch, r] of solos) res.set(ch, { ...r });
  const get = (ch: number) => {
    let r = res.get(ch);
    if (!r) res.set(ch, (r = { ch, name: String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}` }));
    return r;
  };
  for (const n of named(client)) get(n.ch);
  const shiftOf = (ch: number) => {
    const r = res.get(ch);
    return r && r.gainTo !== undefined && r.gainFrom !== undefined ? r.gainTo - r.gainFrom : 0;
  };
  const sIdx = steps.findIndex((s) => s.kind === 'silence');
  const tIdx = steps.findIndex((s) => s.kind === 'tutti');

  // Silence (mesuré AVANT les corrections de gain) → bruit de fond → seuil de gate si la gate est en service
  if (sIdx >= 0) {
    const m = samples.get(sIdx);
    for (const r of res.values()) {
      r.noise = percentile(m?.get(r.ch) ?? [], 0.9) + shiftOf(r.ch);
      if (Number(client.get(gateOnPath(r.ch)) ?? 0) === 1 && r.heard) {
        const peakAfter = (r.peak ?? -20) + shiftOf(r.ch);
        const thr = Math.max((isFinite(r.noise) ? r.noise : -80) + 6, Math.min(peakAfter - 20, -30));
        r.gate = Math.round(Math.max(-80, Math.min(-10, thr)));
      }
    }
  }

  // Compresseur : seuil ~10 dB sous le pic visé (seulement s'il est en service)
  for (const r of res.values()) {
    if (r.heard && Number(client.get(dynOnPath(r.ch)) ?? 0) === 1) r.comp = TARGET_PEAK - 10;
  }

  // Tous ensemble (gains déjà corrigés) : faders selon le rôle de chacun, le plus fort plafonné à 0 dB
  if (tIdx >= 0) {
    const m = samples.get(tIdx);
    const rows: { r: ChResult; lvl: number; want: number }[] = [];
    for (const r of res.values()) {
      if (r.heard === false) continue;
      const lvl = percentile(m?.get(r.ch) ?? [], 0.5);
      if (!isFinite(lvl) || lvl < SILENT) continue;
      rows.push({ r, lvl, want: roleOf(r.name).mix });
    }
    if (rows.length) {
      const k = -Math.max(...rows.map((x) => x.want - x.lvl));
      for (const x of rows) {
        x.r.faderFrom = Math.round(faderToDb(Number(client.get(chLevelPath(x.r.ch, MAIN)) ?? 0)) * 2) / 2;
        x.r.fader = Math.round(Math.max(-40, Math.min(0, x.want - x.lvl + k)) * 2) / 2;
      }
    }
  }
  return [...res.values()].sort((a, b) => a.ch - b.ch);
}

/** Envoie gate, compresseur et faders (les gains sont déjà envoyés pendant le test). */
export function applyResults(client: XAirClient, results: ChResult[], what: What = WHAT_ALL, only?: Set<number>) {
  for (const r of results) {
    if (only && !only.has(r.ch)) continue;
    if (what.gate && r.gate !== undefined) client.set(gateThrPath(r.ch), f(gateDbToF(r.gate)));
    if (what.comp && r.comp !== undefined) client.set(dynThrPath(r.ch), f(compDbToF(r.comp)));
    if (what.eq && r.eq?.length) applyEq(client, r.ch, r.eq);
    if (what.fader && r.fader !== undefined) client.set(chLevelPath(r.ch, MAIN), f(dbToFader(r.fader)));
  }
}

/** Refaire une voie : on garde l'ancien résultat et on remplace ce que le nouveau passage a mesuré. */
export function mergeResult(old: ChResult | undefined, fresh: ChResult): ChResult {
  if (!old) return fresh;
  const out: ChResult = { ...old };
  for (const [k, v] of Object.entries(fresh)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}

// ---------- Retours ----------

export interface ReturnPlan {
  bus: number;
  name: string;
  owners: number[]; // ses voies à lui
  empty: boolean; // le retour n'envoyait rien avant : on le fait d'office
  sends: Record<number, number>; // voie → dB
}

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Qui écoute ce retour ? Par son nom (« Bassiste », « Batteur », « Rémy »…) comparé aux voies et aux rôles. */
export function ownersOf(client: XAirClient, busName: string): number[] {
  const b = norm(busName);
  if (!b) return [];
  return named(client)
    .filter((n) => {
      const who = norm(roleOf(n.name).who);
      const nm = norm(n.name);
      return b.includes(who) || who.includes(b) || b.includes(nm) || nm.includes(b) || (b.startsWith('chant') && who === 'chanteur');
    })
    .map((n) => n.ch);
}

/** Premier mix de chaque retour nommé : la façade −2 dB, ses voies +6 dB, la voix toujours audible. */
export function planReturns(client: XAirClient, results: ChResult[]): ReturnPlan[] {
  const plans: ReturnPlan[] = [];
  const fader = (ch: number) => results.find((r) => r.ch === ch)?.fader ?? faderToDb(Number(client.get(chLevelPath(ch, MAIN)) ?? 0));
  for (let b = 1; b <= BUS_COUNT; b++) {
    const name = String(client.get(busNamePath(b)) ?? '');
    if (!name) continue;
    const owners = ownersOf(client, name);
    const empty = named(client).every((n) => Number(client.get(chLevelPath(n.ch, { kind: 'bus', n: b })) ?? 0) <= 0);
    const sends: Record<number, number> = {};
    for (const n of named(client)) {
      const base = fader(n.ch);
      if (!isFinite(base)) continue;
      let db = base - 2;
      if (owners.includes(n.ch)) db = Math.min(0, base + 6);
      if (roleOf(n.name).mix === 0) db = Math.max(db, -6); // tout le monde entend le chanteur
      sends[n.ch] = Math.round(Math.max(-40, Math.min(0, db)) * 2) / 2;
    }
    plans.push({ bus: b, name, owners, empty, sends });
  }
  return plans;
}

export function applyReturn(client: XAirClient, p: ReturnPlan) {
  for (const [ch, db] of Object.entries(p.sends)) client.set(chLevelPath(Number(ch), { kind: 'bus', n: p.bus }), f(dbToFader(db)));
}

// ---------- Volume général ----------

export interface MasterAdvice {
  level: number; // niveau médian de la façade pendant « tous ensemble »
  lowerBy: number; // dB à enlever au master (0 = rien à faire)
}

export function masterAdvice(samples: Samples, steps: AutoStep[]): MasterAdvice | null {
  const t = steps.findIndex((s) => s.kind === 'tutti');
  const xs = t >= 0 ? samples.get(t)?.get(LR_KEY) : undefined;
  if (!xs?.length) return null;
  const level = percentile(xs, 0.5);
  if (!isFinite(level)) return null;
  return { level: Math.round(level), lowerBy: level > -8 ? Math.round(level + 12) : 0 };
}

export function applyMaster(client: XAirClient, a: MasterAdvice) {
  if (!a.lowerBy) return;
  const cur = faderToDb(Number(client.get('/lr/mix/fader') ?? 0.75));
  client.set('/lr/mix/fader', f(dbToFader((isFinite(cur) ? cur : 0) - a.lowerBy)));
}

/** Après un échange de prises, les passages suivants suivent l'instrument. */
export function swapInSteps(steps: AutoStep[], from: number, a: number, b: number): AutoStep[] {
  return steps.map((s, k) => (k < from || !s.ch ? s : { ...s, ch: s.ch === a ? b : s.ch === b ? a : s.ch }));
}


// ---------- Égalisation d'après le spectre ----------

/** Le spectre de la table (100 bandes de 20 Hz à 20 kHz, puissances cumulées sur n mesures) → 27 bandes de tiers d'octave en dB. */
export function rtaToBands(sum: ArrayLike<number>, n: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < 27; b++) {
    const fc = 40 * Math.pow(2, b / 3);
    let acc = 0, k = 0;
    for (let i = 0; i < sum.length; i++) {
      const hz = 20 * Math.pow(1000, i / (sum.length - 1));
      if (hz >= fc / 1.1225 && hz < fc * 1.1225) { acc += sum[i]; k++; }
    }
    out.push(k && n && acc > 0 ? 10 * Math.log10(acc / k / n) : -120);
  }
  return out;
}
/** L'égalisation à proposer pour une voie : les 4 corrections les plus utiles (la table a 4 bandes). */
export function spectrumEq(name: string, sum: ArrayLike<number>, n: number, hasVoice = false): EqBand[] {
  if (n < 10) return [];
  const bands = rtaToBands(sum, n);
  if (Math.max(...bands) < -80) return [];
  const role = guessRole(name);
  return tailorEq(role, { bands, hist: [], rmsDb: 0, peakDb: 0, crestDb: 15, active: 1 }, hasVoice && role !== 'Voix').sort((x, y) => Math.abs(y.db) - Math.abs(x.db)).slice(0, 4).sort((x, y) => x.f - y.f);
}
/** Envoie l'égalisation à la table : les bandes non utilisées sont remises à plat. */
export function applyEq(client: XAirClient, ch: number, eq: EqBand[]) {
  client.set(eqOnPath(ch), i(1));
  for (let b = 1; b <= 4; b++) {
    const e = eq[b - 1];
    if (!e) { client.set(eqPath(ch, b, 'g'), f(eqGainToF(0))); continue; }
    client.set(eqPath(ch, b, 'type'), i(e.type === 0 ? EQ_TYPES.lshv : e.type === 2 ? EQ_TYPES.hshv : EQ_TYPES.peq));
    client.set(eqPath(ch, b, 'f'), f(hzToF(e.f)));
    client.set(eqPath(ch, b, 'g'), f(eqGainToF(e.db)));
    client.set(eqPath(ch, b, 'q'), f(qToF(e.q)));
  }
}
