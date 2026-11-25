// Écouter un enregistrement : les calculs (ondes, niveaux automatiques, passages
// coupés, niveaux par passage). Rien n'est jamais modifié dans les fichiers : on
// garde une liste de retouches, appliquée à l'écoute et à l'export.

export type Edit =
  | { type: 'cut'; a: number; b: number }
  | { type: 'keep'; a: number; b: number }
  | { type: 'gain'; a: number; b: number; db: number; k: number | null }
  | { type: 'fadeIn'; a: number; b: number }
  | { type: 'fadeOut'; a: number; b: number };

export type Role = 'Voix' | 'Chœurs' | 'Guitare' | 'Ampli' | 'Basse' | 'Batterie entière' | 'Grosse caisse' | 'Caisse claire' | 'Tom' | 'Cymbales' | 'Clavier' | 'Autre';
/** Par instrument : coupe-bas (Hz), taux de compression, anti-repisse (pour les fûts), niveau de départ (dB). */
export const ROLES: Record<Role, { hp: number; ratio: number; gate: boolean; trim: number }> = {
  'Voix': { hp: 90, ratio: 3, gate: false, trim: 3 },
  'Chœurs': { hp: 100, ratio: 3, gate: false, trim: 0 },
  'Guitare': { hp: 80, ratio: 2.5, gate: false, trim: -2 },
  // un micro devant un ampli : pas d'anti-repisse, on garde le corps
  'Ampli': { hp: 70, ratio: 2.5, gate: false, trim: -2 },
  'Basse': { hp: 35, ratio: 4, gate: false, trim: 0 },
  // UN seul micro pour toute la batterie : surtout pas d'anti-repisse ni de coupe-bas haut (grosse caisse ET cymbales dedans)
  'Batterie entière': { hp: 30, ratio: 2, gate: false, trim: 0 },
  'Grosse caisse': { hp: 30, ratio: 3, gate: true, trim: -1 },
  'Caisse claire': { hp: 90, ratio: 3, gate: true, trim: -1 },
  'Tom': { hp: 60, ratio: 3, gate: true, trim: -4 },
  'Cymbales': { hp: 200, ratio: 2, gate: false, trim: -5 },
  'Clavier': { hp: 50, ratio: 2, gate: false, trim: -2 },
  'Autre': { hp: 60, ratio: 2.5, gate: false, trim: -2 },
};
export const ROLE_NAMES = Object.keys(ROLES) as Role[];

/** L'instrument, deviné au nom de la voie (« Grosse ca_3 », « C. claire_4 », « Oh droite_10 »…). */
export function guessRole(name: string): Role {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\d+\s+/, '').replace(/_\d+$/, '');
  if (/ch(o|oe|œ)ur|back|voix ?[2-9]|vox ?[2-9]/.test(n)) return 'Chœurs';
  if (/voix|vox|vocal|chant|lead|micro/.test(n)) return 'Voix';
  if (/grosse|kick|\bgc\b|\bbd\b/.test(n)) return 'Grosse caisse';
  if (/claire|snare|\bcc\b/.test(n)) return 'Caisse claire';
  if (/tom/.test(n)) return 'Tom';
  if (/\boh\b|overhead|cymb|charl|hi.?hat|\bhh\b|ride/.test(n)) return 'Cymbales';
  if (/batt|drum|kit\b/.test(n)) return 'Batterie entière';
  if (/ampli|\bamp\b|cab/.test(n)) return 'Ampli';
  if (/basse|bass/.test(n)) return 'Basse';
  if (/guit|gtr|acoust|elec|folk/.test(n)) return 'Guitare';
  if (/clav|piano|synth|key|orgue/.test(n)) return 'Clavier';
  return 'Autre';
}

export type FxKind = 'hp' | 'comp' | 'gate' | 'eq' | 'rev';
export interface MixState {
  trims: Record<string, number>; mute: Record<string, boolean>; master: number; edits: Edit[];
  /** rôle corrigé à la main, par piste */
  roles?: Record<string, Role>;
  /** réglage retiré à la main : clé « fichier:hp », « fichier:comp », « fichier:gate » */
  off?: Record<string, boolean>;
  /** panoramique corrigé à la main (−1..1) */
  pans?: Record<string, number>;
  /** force du nettoyage : 0 léger, 1 normal, 2 fort */
  force?: number;
  /** finition : équilibre, colle ; volume final */
  eq?: boolean; glue?: boolean; loud?: 'nat' | 'std' | 'fort';
  /** un peu de salle (réverbération), la voix devant, le placement gauche-droite automatique */
  rev?: boolean; front?: boolean; wide?: boolean;
  /** l'égaliseur réglé à la main, piste par piste (4 points) */
  ueq?: Record<string, UserBand[]>;
}
/** Un point de l'égaliseur à la main : type 1 = plateau grave, 2 = cloche, 4 = plateau aigu (comme sur la table). */
export interface UserBand { type: number; hz: number; db: number; q: number }
export const userEqDefault = (): UserBand[] => [{ type: 1, hz: 100, db: 0, q: 0.7 }, { type: 2, hz: 400, db: 0, q: 1.2 }, { type: 2, hz: 2500, db: 0, q: 1.2 }, { type: 4, hz: 8000, db: 0, q: 0.7 }];
/** Le spectre mesuré d'une piste, mis à l'échelle du graphe de l'égaliseur (100 bandes de 20 Hz à 20 kHz, le plus fort vers −12 dB). */
export function spectrumForGraph(a: Analysis | null | undefined): Float32Array | null {
  if (!a) return null;
  const top = Math.max(...a.bands);
  const out = new Float32Array(100);
  for (let k = 0; k < 100; k++) {
    const hz = 20 * Math.pow(1000, k / 99);
    const b = 3 * Math.log2(hz / 40);
    if (b < -1 || b > 27) { out[k] = -90; continue; }
    const i = Math.max(0, Math.min(25, Math.floor(b))), f = Math.max(0, Math.min(1, b - i));
    out[k] = Math.max(-90, a.bands[i] * (1 - f) + a.bands[i + 1] * f - top - 12);
  }
  return out;
}
export const emptyMix = (): MixState => ({ trims: {}, mute: {}, master: 0, edits: [], roles: {}, off: {}, pans: {}, force: 1, eq: true, glue: true, loud: 'std', rev: true, front: true, wide: true });

export interface Proc { hp: number; thr: number; slope: number; makeup: number; gate: number; redDb: number }
/** Le nettoyage d'une piste, calculé d'après son niveau « quand ça joue ». */
export function procFor(role: Role, level: number | null, force: number, off: (k: FxKind) => boolean, an?: Analysis | null): Proc {
  const R = ROLES[role];
  if (level == null) return { hp: 0, thr: 0, slope: 0, makeup: 1, gate: 0, redDb: 0 };
  const f = Math.max(0, Math.min(2, force));
  // une piste très « nerveuse » (grands écarts entre crêtes et moyenne) est tenue plus fort, une piste déjà régulière moins
  const depth = [5, 8, 11][f] + (an ? compExtra(role, an) : 0);
  if (an && R.gate && !off('gate')) {
    const g = smartGate(an);
    const comp = !off('comp');
    const redDb = comp ? depth * (1 - 1 / R.ratio) : 0;
    return { hp: off('hp') ? 0 : R.hp, thr: comp ? lin(level - depth) : 0, slope: 1 / R.ratio - 1, makeup: lin(redDb * 0.6), gate: g == null ? 0 : lin(g + [-3, 0, 3][f]), redDb };
  }
  const comp = !off('comp');
  const redDb = comp ? depth * (1 - 1 / R.ratio) : 0; // ce que la compression enlève sur une crête typique
  return {
    hp: off('hp') ? 0 : R.hp,
    thr: comp ? lin(level - depth) : 0, slope: 1 / R.ratio - 1, makeup: lin(redDb * 0.6),
    gate: R.gate && !off('gate') ? lin(level - [26, 22, 18][Math.max(0, Math.min(2, force))]) : 0,
    redDb,
  };
}

export interface MixTrack { key: string; name: string; pan: number }
export interface Level { role: Role; auto: number | null; trim: number; silenced: boolean; shown: number; proc: Proc; pan: number; eq: EqBand[]; rev: number; ueq: UserBand[] }
/**
 * Tout le mix d'un coup : pour chaque piste son rôle, son niveau et son nettoyage, puis la finition.
 * `raw` = écouter « avant » : niveaux automatiques seulement, sans nettoyage ni finition.
 */
export function buildMix(tracks: MixTrack[], peaks: Record<string, Uint8Array>, mix: MixState, solo: number | null, total: number, raw = false, extra: { an?: Record<string, Analysis | null | undefined>; loud?: number } = {}) {
  const force = mix.force ?? 1;
  const roles = tracks.map((x) => mix.roles?.[x.key] ?? guessRole(x.name));
  const hasVoice = roles.some((r, k) => r === 'Voix' && !mix.mute[tracks[k].key]);
  const auto = mix.wide !== false && !raw ? autoPans(roles) : null;
  const levels: Level[] = tracks.map((x, k) => {
    const role = roles[k];
    const an = raw ? null : extra.an?.[x.key] ?? null;
    const off = (f: FxKind) => !!mix.off?.[`${x.key}:${f}`];
    const level = activeLevel(peaks[x.key] ?? new Uint8Array(0));
    const autoDb = autoGainDb(level);
    const trim = mix.trims[x.key] ?? ROLES[role].trim;
    const silenced = !!mix.mute[x.key] || (solo != null && solo !== k);
    const proc = raw ? procFor(role, null, force, () => true) : procFor(role, level, force, off, an);
    const eq = an && !off('eq') && level != null ? tailorEq(role, an, hasVoice && role !== 'Voix') : [];
    const rev = raw || mix.rev === false || off('rev') ? 0 : REV[role] ?? 0;
    return { role, auto: autoDb, trim, silenced, shown: autoDb == null ? 0 : lin(autoDb + trim), proc, pan: mix.pans?.[x.key] ?? (auto && x.pan === 0 ? auto[k] : x.pan), eq, rev, ueq: raw ? [] : (mix.ueq?.[x.key] ?? []).filter((b) => Math.abs(b.db) >= 0.25) };
  });
  const norm = mixScale(tracks.map((x, i) => ({ peaks: peaks[x.key] ?? null, gain: mix.mute[x.key] ? 0 : levels[i].shown })));
  const loud = raw ? 1 : extra.loud ?? { nat: 1, std: 1.5, fort: 2.2 }[mix.loud ?? 'std'];
  // la voix devant : quand ça chante, guitares et claviers s'effacent de 2 dB
  const front = !raw && mix.front !== false && hasVoice;
  const voiceLevels = tracks.map((x, k) => (roles[k] === 'Voix' && !levels[k].silenced ? activeLevel(peaks[x.key] ?? new Uint8Array(0)) : null)).filter((v): v is number => v != null);
  const duckOn = front && voiceLevels.length > 0;
  const params = {
    ...engineParams({ gains: levels.map((l) => (l.silenced ? 0 : l.shown)), pans: levels.map((l) => l.pan), master: lin(mix.master) * norm * loud, edits: mix.edits, total }),
    hp: levels.map((l) => l.proc.hp), thr: levels.map((l) => l.proc.thr), slope: levels.map((l) => l.proc.slope), makeup: levels.map((l) => l.proc.makeup), gate: levels.map((l) => l.proc.gate),
    eq: !raw && mix.eq !== false, glue: !raw && mix.glue !== false, limit: true,
    teq: levels.map((l) => [...l.eq.flatMap((b) => [b.type, b.f, b.db, b.q]), ...l.ueq.flatMap((b) => [b.type === 1 ? 0 : b.type === 4 ? 2 : 1, b.hz, b.db, b.q])]),
    rev: levels.some((l) => l.rev > 0) ? levels.map((l) => l.rev) : [],
    key: duckOn ? levels.map((l) => (l.role === 'Voix' && !l.silenced ? 1 : 0)) : [],
    duck: duckOn ? levels.map((l) => (l.role === 'Guitare' || l.role === 'Ampli' || l.role === 'Clavier' ? 1 : 0)) : [],
    duckThr: duckOn ? lin(Math.max(...voiceLevels) - 14) : 0, duckGain: lin(-2),
  };
  return { levels, norm, params };
}

/** Les crêtes de toutes les pistes réunies (le plus fort à chaque instant). */
export function mergePeaks(list: (Uint8Array | null | undefined)[]): Uint8Array {
  const len = Math.max(0, ...list.map((p) => p?.length ?? 0));
  const out = new Uint8Array(len);
  for (const p of list) if (p) for (let i = 0; i < p.length; i++) if (p[i] > out[i]) out[i] = p[i];
  return out;
}

export interface Blank { a: number; b: number; where: 'début' | 'fin' | 'milieu' }
/** Les blancs : passages d'au moins `minLen` secondes où presque rien ne joue. On laisse un peu d'air autour. */
export function findBlanks(peaks: Uint8Array, bucket: number, total: number, minLen = 6): Blank[] {
  const QUIET = 30; // ≈ −37 dB
  const out: Blank[] = [];
  let start = -1;
  for (let i = 0; i <= peaks.length; i++) {
    const quiet = i < peaks.length && peaks[i] < QUIET;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      const a = start * bucket, b = Math.min(total, i * bucket);
      const head = start === 0, tail = i >= peaks.length;
      if (head && b - 0.8 > 2) out.push({ a: 0, b: b - 0.8, where: 'début' });
      else if (tail && b - (a + 2) > 2) out.push({ a: a + 2, b, where: 'fin' });
      else if (!head && !tail && b - a >= minLen) out.push({ a: a + 1.5, b: b - 1.2, where: 'milieu' });
      start = -1;
    }
  }
  return out;
}
/** Ce blanc est-il déjà coupé ? */
export const blankIsCut = (edits: Edit[], bl: Blank) => edits.some((e) => e.type === 'cut' && e.a <= bl.a + 0.5 && e.b >= bl.b - 0.5);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]), b = B64.indexOf(clean[i + 1]), c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1, d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** Un octet de crête → amplitude 0..1 (255 = a saturé). */
export const peakOf = (byte: number) => (byte >= 255 ? 1 : (byte / 254) ** 2);
export const db = (x: number) => (x <= 0 ? -120 : 20 * Math.log10(x));
export const lin = (d: number) => Math.pow(10, d / 20);

/** Niveau « quand ça joue » d'une piste (dB), ou null si elle est vide. */
export function activeLevel(peaks: Uint8Array): number | null {
  let sum = 0, n = 0;
  for (let i = 0; i < peaks.length; i++) { const p = peakOf(peaks[i]); if (p > 0.01) { sum += p; n++; } }
  return n >= 5 ? db(sum / n) : null;
}

/** Gain automatique (dB) qui amène la piste à un niveau cohérent ; null = piste vide, laissée de côté. */
export function autoGainDb(level: number | null): number | null {
  if (level == null) return null;
  return Math.max(-20, Math.min(36, -16 - level));
}

/** Ce qu'il reste du concert après les coupes : liste de [début, fin] en secondes. */
export function keptSegments(edits: Edit[], total: number): [number, number][] {
  let segs: [number, number][] = [[0, total]];
  for (const e of edits) {
    if (e.type === 'cut') segs = segs.flatMap(([a, b]) => (e.b <= a || e.a >= b ? [[a, b]] : [[a, Math.max(a, e.a)], [Math.min(b, e.b), b]]) as [number, number][]);
    else if (e.type === 'keep') segs = segs.map(([a, b]) => [Math.max(a, e.a), Math.min(b, e.b)] as [number, number]);
    else continue;
    segs = segs.filter(([a, b]) => b - a > 0.02);
  }
  return segs;
}
export const keptSeconds = (segs: [number, number][]) => segs.reduce((s, [a, b]) => s + b - a, 0);
export const isRemoved = (segs: [number, number][], t: number) => !segs.some(([a, b]) => t >= a && t < b);

/** Le niveau (linéaire) que les retouches donnent à la piste k à l'instant t. */
export function regionGain(edits: Edit[], k: number, t: number): number {
  let g = 1;
  for (const e of edits) {
    if (t < e.a || t >= e.b) continue;
    if (e.type === 'gain' && (e.k == null || e.k === k)) g *= lin(e.db);
    else if (e.type === 'fadeIn') g *= (t - e.a) / (e.b - e.a);
    else if (e.type === 'fadeOut') g *= (e.b - t) / (e.b - e.a);
  }
  return g;
}

export interface Bar { h: number; clip: boolean; gone: boolean }
/** n barres pour dessiner l'onde entre a et b secondes. */
export function bars(peaks: Uint8Array | null, bucket: number, a: number, b: number, n: number, gainAt: (t: number) => number, segs: [number, number][]): Bar[] {
  const out: Bar[] = [];
  const span = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const t0 = a + i * span, tm = t0 + span / 2;
    let m = 0, clip = false;
    if (peaks) {
      const i0 = Math.max(0, Math.floor(t0 / bucket)), i1 = Math.min(peaks.length, Math.max(i0 + 1, Math.ceil((t0 + span) / bucket)));
      for (let j = i0; j < i1; j++) { if (peaks[j] >= 255) clip = true; const p = peakOf(peaks[j]); if (p > m) m = p; }
    }
    const gone = isRemoved(segs, tm);
    out.push({ h: gone ? 0.03 : Math.max(0.03, Math.min(1, Math.pow(m * gainAt(tm), 0.6))), clip, gone });
  }
  return out;
}

/** Combien baisser (ou monter) l'ensemble pour que le mélange ne tape pas : d'après les crêtes des pistes. */
export function mixScale(tracks: { peaks: Uint8Array | null; gain: number }[]): number {
  const len = Math.max(0, ...tracks.map((t) => t.peaks?.length ?? 0));
  if (!len) return 1;
  const sums: number[] = [];
  const step = Math.max(1, Math.floor(len / 4000));
  for (let i = 0; i < len; i += step) {
    let s = 0;
    for (const t of tracks) if (t.peaks && t.gain > 0 && i < t.peaks.length) s += (peakOf(t.peaks[i]) * t.gain) ** 2;
    sums.push(Math.sqrt(s) * 1.4);
  }
  sums.sort((x, y) => x - y);
  const p = sums[Math.floor(sums.length * 0.995)] || 0;
  return p > 0 ? Math.max(0.05, Math.min(4, 0.85 / p)) : 1;
}

/** Première saturation d'une piste : instant en secondes, ou null. */
export function firstClip(peaks: Uint8Array | null, bucket: number): number | null {
  if (!peaks) return null;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] >= 255) return i * bucket;
  return null;
}

/** Les réglages à envoyer au lecteur / à l'export. */
export function engineParams(o: { gains: number[]; pans: number[]; master: number; edits: Edit[]; total: number }) {
  const segs = keptSegments(o.edits, o.total);
  const whole = segs.length === 1 && segs[0][0] <= 0.001 && segs[0][1] >= o.total - 0.001;
  return {
    gains: o.gains, pans: o.pans, master: o.master,
    kept: whole ? [] : segs.flat(),
    regs: o.edits.filter((e): e is Extract<Edit, { type: 'gain' }> => e.type === 'gain').map((e) => ({ a: e.a, b: e.b, g: lin(e.db), k: e.k == null ? -1 : e.k })),
    fades: o.edits.filter((e) => e.type === 'fadeIn' || e.type === 'fadeOut').map((e) => ({ a: e.a, b: e.b, rising: e.type === 'fadeIn' })),
  };
}


// ───────── Étudier une piste : spectre, dynamique, niveaux ─────────

/** Ce que la tablette mesure sur une piste : 27 bandes de tiers d'octave (40 Hz → 16 kHz, en dB), la répartition des niveaux (un compte par dB, de −90 à 0), etc. */
export interface Analysis { bands: number[]; hist: number[]; rmsDb: number; peakDb: number; crestDb: number; active: number }
export const bandHz = (b: number) => 40 * Math.pow(2, b / 3);
export function parseAnalysis(json: string | undefined | null): Analysis | null {
  try {
    const o = JSON.parse(json || '') as Analysis;
    return Array.isArray(o.bands) && o.bands.length >= 27 && Array.isArray(o.hist) && o.active > 0 ? o : null;
  } catch { return null; }
}

/** Une correction : type 0 = plateau dans le grave, 1 = cloche, 2 = plateau dans l'aigu. */
export interface EqBand { type: 0 | 1 | 2; f: number; db: number; q: number; why: string }

const ZONES = { grave: [0, 5], corps: [6, 10], medium: [11, 17], presence: [18, 21], air: [22, 26] } as const;
type Zone = keyof typeof ZONES;
const zoneDb = (a: Analysis, z: Zone) => { const [i, j] = ZONES[z]; let s = 0; for (let b = i; b <= j; b++) s += a.bands[b]; return s / (j - i + 1); };
/** Ce qu'on attend d'un instrument, zone par zone, par rapport à son médium (dB). Des repères larges : on ne corrige que les vrais écarts. */
const SHAPE: Partial<Record<Role, Partial<Record<Zone, number>>>> = {
  'Voix': { corps: 2, presence: -6, air: -13 },
  'Chœurs': { corps: 2, presence: -6, air: -13 },
  'Guitare': { corps: 2, presence: -5, air: -14 },
  'Ampli': { corps: 3, presence: -5, air: -16 },
  'Basse': { grave: 8, corps: 3, presence: -10 },
  'Grosse caisse': { grave: 10, corps: 2, presence: -8 },
  'Caisse claire': { corps: 3, presence: -3, air: -8 },
  'Tom': { grave: 3, corps: 4, presence: -6 },
  'Cymbales': { corps: -6, presence: 0, air: -2 },
  'Batterie entière': { grave: 4, corps: 2, presence: -3, air: -6 },
  'Clavier': { grave: 2, corps: 2, presence: -6, air: -13 },
};
const ZFIX: Record<Exclude<Zone, 'medium'>, { type: 0 | 1 | 2; f: number; q: number; name: string }> = {
  grave: { type: 0, f: 100, q: 0.7, name: 'grave' },
  corps: { type: 1, f: 250, q: 0.9, name: 'bas-médium' },
  presence: { type: 1, f: 3200, q: 0.9, name: 'présence' },
  air: { type: 2, f: 8000, q: 0.7, name: 'aigu' },
};
const hzText = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1).replace('.', ',')} kHz` : `${Math.round(f)} Hz`);
const dbText = (d: number) => `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.', ',')} dB`;

/**
 * L'égalisation sur mesure d'une piste, d'après son spectre :
 * 1. les résonances (une bande qui dépasse nettement ses voisines) sont rabotées par une coupe étroite ;
 * 2. l'équilibre grave / bas-médium / présence / aigu est ramené vers ce qu'on attend de l'instrument, en douceur (−4 à +3 dB) ;
 * 3. s'il y a une voix, guitares et claviers lui laissent un peu de place autour de 3 kHz.
 */
export function tailorEq(role: Role, a: Analysis, carve = false): EqBand[] {
  const out: EqBand[] = [];
  const lowKeep = role === 'Basse' || role === 'Grosse caisse' ? 4 : 0; // leur fondamentale EST une bosse : on n'y touche pas
  const lo = Math.max(lowKeep, Math.ceil(3 * Math.log2(Math.max(40, ROLES[role].hp) / 40)) + 1);
  const res: { b: number; x: number }[] = [];
  for (let b = Math.max(2, lo); b <= 23; b++) {
    const around = (a.bands[b - 2] + a.bands[b - 1] + a.bands[b + 1] + a.bands[b + 2]) / 4;
    const x = a.bands[b] - Math.max(around, (a.bands[b - 1] + a.bands[b + 1]) / 2);
    if (x >= 5 && a.bands[b] >= a.bands[b - 1] && a.bands[b] >= a.bands[b + 1]) res.push({ b, x });
  }
  res.sort((p, q) => q.x - p.x);
  for (const r of res.slice(0, 2)) {
    const cut = -Math.min(6, Math.round((r.x - 2.5) * 0.7 * 2) / 2);
    out.push({ type: 1, f: Math.round(bandHz(r.b)), db: cut, q: 3, why: `résonance à ${hzText(bandHz(r.b))} : ${dbText(cut)}` });
  }
  const shape = SHAPE[role];
  const mid = zoneDb(a, 'medium');
  let presence = 0;
  if (shape) {
    for (const z of ['grave', 'corps', 'presence', 'air'] as const) {
      const want = shape[z];
      if (want == null) continue;
      const dev = zoneDb(a, z) - mid - want;
      if (Math.abs(dev) <= 2) continue;
      const fix = Math.max(-4, Math.min(z === 'air' ? 2 : 3, -(dev - Math.sign(dev) * 2) * 0.6));
      const v = Math.round(fix * 2) / 2;
      if (!v) continue;
      if (z === 'presence') { presence = v; continue; }
      const F = ZFIX[z];
      out.push({ type: F.type, f: F.f, db: v, q: F.q, why: `${v < 0 ? `trop ${F.name === 'aigu' ? 'd’' : 'de '}` : `manque ${F.name === 'aigu' ? 'd’' : 'de '}`}${F.name} : ${dbText(v)}` });
    }
  }
  if (carve && (role === 'Guitare' || role === 'Ampli' || role === 'Clavier')) {
    const v = Math.max(-5, presence - 1.5);
    out.push({ type: 1, f: 3200, db: v, q: 0.9, why: `place pour la voix vers 3 kHz : ${dbText(v)}` });
  } else if (presence) {
    out.push({ type: 1, f: 3200, db: presence, q: 0.9, why: `${presence < 0 ? 'trop de' : 'manque de'} présence : ${dbText(presence)}` });
  }
  return out.slice(0, 6);
}

/** Compression : plus forte si la piste a de grands écarts, plus légère si elle est déjà régulière (dB en plus ou en moins). */
export function compExtra(role: Role, a: Analysis): number {
  const usual = ROLES[role].gate || role === 'Batterie entière' || role === 'Cymbales' ? 20 : role === 'Basse' ? 11 : 14;
  return Math.max(-3, Math.min(3, Math.round((a.crestDb - usual) * 0.4)));
}

/**
 * L'anti-repisse intelligent : on regarde comment se répartissent les niveaux de la piste. Sur un fût, il y a deux
 * paquets — les frappes (fort) et ce que le micro attrape des autres (moins fort). Le seuil se place entre les deux.
 * Si les deux paquets ne se séparent pas nettement, on ne ferme rien : rend null.
 */
export function smartGate(a: Analysis): number | null {
  const top = Math.min(90, Math.round(a.peakDb + 90));
  const lo = Math.max(0, top - 50);
  let n = 0, sum = 0;
  for (let i = lo; i <= top; i++) { n += a.hist[i] || 0; sum += i * (a.hist[i] || 0); }
  if (n < 50) return null;
  let best = -1, bestV = 0, w0 = 0, s0 = 0, m0b = 0, m1b = 0, w0b = 0;
  for (let t = lo; t < top; t++) {
    w0 += a.hist[t] || 0; s0 += t * (a.hist[t] || 0);
    const w1 = n - w0;
    if (!w0 || !w1) continue;
    const m0 = s0 / w0, m1 = (sum - s0) / w1;
    const v = w0 * w1 * (m1 - m0) * (m1 - m0);
    if (v > bestV) { bestV = v; best = t; m0b = m0; m1b = m1; w0b = w0 / n; }
  }
  if (best < 0 || m1b - m0b < 10 || w0b < 0.05 || w0b > 0.97) return null;
  // un peu au-dessus de la repisse, bien en dessous des frappes
  return Math.min(best + 0.5, m0b + (m1b - m0b) * 0.55) - 90;
}

/** Un peu de salle : part de chaque piste envoyée dans la réverbération. */
export const REV: Partial<Record<Role, number>> = { 'Voix': 0.16, 'Chœurs': 0.2, 'Caisse claire': 0.14, 'Tom': 0.08, 'Guitare': 0.07, 'Clavier': 0.06, 'Batterie entière': 0.04 };

/** Placement gauche-droite : voix, basse, grosse caisse et caisse claire au centre ; le reste s'écarte, en alternant les côtés. */
export function autoPans(roles: Role[]): number[] {
  const width: Partial<Record<Role, number>> = { 'Guitare': 0.35, 'Ampli': 0.35, 'Clavier': 0.3, 'Chœurs': 0.25, 'Tom': 0.3, 'Cymbales': 0.45 };
  let side = -1;
  const count: Partial<Record<Role, number>> = {};
  for (const r of roles) count[r] = (count[r] ?? 0) + 1;
  const seen: Partial<Record<Role, number>> = {};
  return roles.map((r) => {
    const w = width[r];
    if (!w) return 0;
    const i = (seen[r] = (seen[r] ?? 0) + 1) - 1;
    if (r === 'Tom' || r === 'Cymbales') { const n = count[r] ?? 1; return n === 1 ? 0 : Math.round((-w + (2 * w * i) / (n - 1)) * 100) / 100; }
    side = -side;
    return side * w;
  });
}

/** Volume final : le facteur qui amène le mix mesuré (dB moyens) au niveau voulu. */
export const LOUD_TARGET = { nat: -20, std: -17, fort: -14 } as const;
export function loudFactor(measuredDb: number | null | undefined, want: 'nat' | 'std' | 'fort'): number | undefined {
  if (measuredDb == null || measuredDb < -70) return undefined;
  return Math.max(0.4, Math.min(5, lin(LOUD_TARGET[want] - measuredDb)));
}


// ───────── Maquette : les morceaux d'un enregistrement ─────────

export interface SongSpan { label: string; a: number; b: number }
/** Les morceaux d'un enregistrement (d'un repère au suivant), resserrés sur ce qui joue vraiment : pas de blanc avant ni après. */
export function songsOf(markers: { t: number; label: string }[], total: number, all?: Uint8Array | null, bucket = 0.2): SongSpan[] {
  let mk = markers.length ? [...markers].sort((x, y) => x.t - y.t) : [{ t: 0, label: 'Tout' }];
  // pas de repères posés : on découpe tout seul aux silences (4 s ou plus) entre les morceaux
  if (mk.length <= 1 && all && all.length) {
    const cuts = findBlanks(all, bucket, total, 4).filter((x) => x.where === 'milieu').map((x) => (x.a + x.b) / 2);
    if (cuts.length) mk = [0, ...cuts].map((t, i) => ({ t, label: `Morceau ${i + 1}` }));
  }
  const out: SongSpan[] = [];
  mk.forEach((m, i) => {
    let a = Math.max(0, m.t), b = Math.min(total, mk[i + 1]?.t ?? total);
    if (all && all.length) {
      const LOUD = 30;
      let i0 = Math.floor(a / bucket), i1 = Math.min(all.length, Math.ceil(b / bucket)) - 1;
      const s0 = i0, s1 = i1;
      while (i0 < i1 && all[i0] < LOUD) i0++;
      while (i1 > i0 && all[i1] < LOUD) i1--;
      if (i1 > i0) { a = Math.max(s0 * bucket, i0 * bucket - 0.5); b = Math.min((s1 + 1) * bucket, (i1 + 1) * bucket + 2.5, total); }
    }
    if (b - a >= 5) out.push({ label: m.label, a, b });
  });
  return out;
}
/** Les retouches d'un morceau de maquette : entrée nette, sortie en fondu. */
export const songEdits = (edits: Edit[], s: SongSpan, excerpt = false, xfade = 0): Edit[] => {
  // en fondu enchaîné, l'entrée et la sortie durent le temps du fondu
  const fin = xfade > 0 ? xfade : excerpt ? 1.2 : 0.15, fout = xfade > 0 ? xfade : excerpt ? 3 : 2;
  return [...edits, { type: 'fadeIn', a: s.a, b: Math.min(s.b, s.a + fin) }, { type: 'fadeOut', a: Math.max(s.a, s.b - fout), b: s.b }];
};
/**
 * L'extrait d'un morceau : le passage de `len` secondes où ça joue le plus (souvent le refrain).
 * Le début est calé sur un petit creux tout proche, pour ne pas entrer au milieu d'un mot.
 */
export function bestExcerpt(all: Uint8Array | null | undefined, bucket: number, s: SongSpan, len: number): SongSpan {
  if (s.b - s.a <= len + 4 || !all || !all.length) return s;
  const i0 = Math.floor(s.a / bucket), i1 = Math.min(all.length, Math.floor(s.b / bucket));
  const w = Math.round(len / bucket);
  if (i1 - i0 <= w) return s;
  let sum = 0;
  for (let i = i0; i < i0 + w; i++) sum += all[i] * all[i];
  let best = sum, at = i0;
  for (let i = i0 + 1; i + w <= i1; i++) {
    sum += all[i + w - 1] * all[i + w - 1] - all[i - 1] * all[i - 1];
    if (sum > best * 1.001) { best = sum; at = i; }
  }
  // le creux le plus bas dans les 2 secondes avant ce point
  const back = Math.round(2 / bucket);
  let lo = at;
  for (let i = Math.max(i0, at - back); i <= at; i++) if (all[i] < all[lo]) lo = i;
  const a = Math.max(s.a, lo * bucket);
  return { label: s.label, a, b: Math.min(s.b, a + len) };
}
/** Un nom de fichier propre. */
export const fileSafe = (n: string) => n.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Morceau';
