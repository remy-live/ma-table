// Écouter un enregistrement : les calculs (ondes, niveaux automatiques, passages
// coupés, niveaux par passage). Rien n'est jamais modifié dans les fichiers : on
// garde une liste de retouches, appliquée à l'écoute et à l'export.

export type Edit =
  | { type: 'cut'; a: number; b: number }
  | { type: 'keep'; a: number; b: number }
  | { type: 'gain'; a: number; b: number; db: number; k: number | null }
  | { type: 'fadeIn'; a: number; b: number }
  | { type: 'fadeOut'; a: number; b: number };

export type Role = 'Voix' | 'Chœurs' | 'Guitare' | 'Basse' | 'Grosse caisse' | 'Caisse claire' | 'Tom' | 'Cymbales' | 'Clavier' | 'Autre';
/** Par instrument : coupe-bas (Hz), taux de compression, anti-repisse (pour les fûts), niveau de départ (dB). */
export const ROLES: Record<Role, { hp: number; ratio: number; gate: boolean; trim: number }> = {
  'Voix': { hp: 90, ratio: 3, gate: false, trim: 3 },
  'Chœurs': { hp: 100, ratio: 3, gate: false, trim: 0 },
  'Guitare': { hp: 80, ratio: 2.5, gate: false, trim: -2 },
  'Basse': { hp: 35, ratio: 4, gate: false, trim: 0 },
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
  if (/basse|bass/.test(n)) return 'Basse';
  if (/guit|gtr|acoust|elec|folk/.test(n)) return 'Guitare';
  if (/clav|piano|synth|key|orgue/.test(n)) return 'Clavier';
  return 'Autre';
}

export type FxKind = 'hp' | 'comp' | 'gate';
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
}
export const emptyMix = (): MixState => ({ trims: {}, mute: {}, master: 0, edits: [], roles: {}, off: {}, pans: {}, force: 1, eq: true, glue: true, loud: 'std' });

export interface Proc { hp: number; thr: number; slope: number; makeup: number; gate: number; redDb: number }
/** Le nettoyage d'une piste, calculé d'après son niveau « quand ça joue ». */
export function procFor(role: Role, level: number | null, force: number, off: (k: FxKind) => boolean): Proc {
  const R = ROLES[role];
  if (level == null) return { hp: 0, thr: 0, slope: 0, makeup: 1, gate: 0, redDb: 0 };
  const depth = [5, 8, 11][Math.max(0, Math.min(2, force))];
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
export interface Level { role: Role; auto: number | null; trim: number; silenced: boolean; shown: number; proc: Proc; pan: number }
/**
 * Tout le mix d'un coup : pour chaque piste son rôle, son niveau et son nettoyage, puis la finition.
 * `raw` = écouter « avant » : niveaux automatiques seulement, sans nettoyage ni finition.
 */
export function buildMix(tracks: MixTrack[], peaks: Record<string, Uint8Array>, mix: MixState, solo: number | null, total: number, raw = false) {
  const force = mix.force ?? 1;
  const levels: Level[] = tracks.map((x, k) => {
    const role = mix.roles?.[x.key] ?? guessRole(x.name);
    const level = activeLevel(peaks[x.key] ?? new Uint8Array(0));
    const auto = autoGainDb(level);
    const trim = mix.trims[x.key] ?? ROLES[role].trim;
    const silenced = !!mix.mute[x.key] || (solo != null && solo !== k);
    const proc = raw ? procFor(role, null, force, () => true) : procFor(role, level, force, (f) => !!mix.off?.[`${x.key}:${f}`]);
    return { role, auto, trim, silenced, shown: auto == null ? 0 : lin(auto + trim), proc, pan: mix.pans?.[x.key] ?? x.pan };
  });
  const norm = mixScale(tracks.map((x, i) => ({ peaks: peaks[x.key] ?? null, gain: mix.mute[x.key] ? 0 : levels[i].shown })));
  const loud = raw ? 1 : { nat: 1, std: 1.5, fort: 2.2 }[mix.loud ?? 'std'];
  const params = {
    ...engineParams({ gains: levels.map((l) => (l.silenced ? 0 : l.shown)), pans: levels.map((l) => l.pan), master: lin(mix.master) * norm * loud, edits: mix.edits, total }),
    hp: levels.map((l) => l.proc.hp), thr: levels.map((l) => l.proc.thr), slope: levels.map((l) => l.proc.slope), makeup: levels.map((l) => l.proc.makeup), gate: levels.map((l) => l.proc.gate),
    eq: !raw && mix.eq !== false, glue: !raw && mix.glue !== false, limit: true,
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
