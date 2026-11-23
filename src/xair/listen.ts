// Écouter un enregistrement : les calculs (ondes, niveaux automatiques, passages
// coupés, niveaux par passage). Rien n'est jamais modifié dans les fichiers : on
// garde une liste de retouches, appliquée à l'écoute et à l'export.

export type Edit =
  | { type: 'cut'; a: number; b: number }
  | { type: 'keep'; a: number; b: number }
  | { type: 'gain'; a: number; b: number; db: number; k: number | null }
  | { type: 'fadeIn'; a: number; b: number }
  | { type: 'fadeOut'; a: number; b: number };

export interface MixState { trims: Record<string, number>; mute: Record<string, boolean>; master: number; edits: Edit[] }
export const emptyMix = (): MixState => ({ trims: {}, mute: {}, master: 0, edits: [] });

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
