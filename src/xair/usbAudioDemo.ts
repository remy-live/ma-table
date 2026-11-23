// Démo (web) : un faux concert enregistré, pour essayer l'écran d'écoute sans table.
// Les ondes sont inventées, le lecteur avance sans son.
import type { ListenNative, RecEvent, SessEntry } from './usbAudio';

const TOTAL = 1600;
const SONGS = [0, 150, 420, 700, 985, 1290];
const TR: [string, number][] = [['Voix Rémy', 0.5], ['Chœurs', 0.2], ['Guitare', 0.6], ['Basse', 0.35], ['Grosse caisse', 0.7], ['Caisse claire', 0.55], ['Overhead', 0.3]];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const rnd = (i: number, seed: number) => { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };

function env(k: number, t: number): number {
  let g = 0;
  SONGS.forEach((a, i) => { if (t >= a) g = i; });
  const end = g + 1 < SONGS.length ? SONGS[g + 1] : TOTAL;
  if (end - t < 14 || t - SONGS[g] < 2) return 0.002 + 0.004 * rnd(Math.floor(t / 3), k);
  if (k < 0) return 0.5 * (0.5 + 0.5 * rnd(Math.floor(t * 1.7), 9));
  let v = TR[k][1] * (0.5 + 0.5 * rnd(Math.floor(t * 1.7), k + 3)) * (0.7 + 0.3 * rnd(Math.floor(t / 22), k + 11));
  if (k === 0) v *= rnd(Math.floor(t / 9), 5) > 0.3 ? 1 : 0.05;
  if (k === 1) v *= rnd(Math.floor(t / 30), 7) > 0.55 ? 1 : 0.03;
  if (k === 2 && t > 1066 && t < 1080) v = 1;
  return v;
}

function peaksB64(k: number): string {
  const n = TOTAL * 5;
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = env(k, i / 5); bytes[i] = v >= 0.999 ? 255 : Math.min(254, Math.floor(Math.sqrt(v) * 254)); }
  let out = '';
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, c = i + 2 < n ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < n ? B64[c & 63] : '=');
  }
  return out;
}

const ID = '2026-11-28 20h30 Concert (démo)';
const DIR = '/demo/' + ID;
const files = [...TR.map(([n], k) => `${String(k + 1).padStart(2, '0')} ${n}.wav`), 'Façade (stéréo).wav'];
let extra: string[] = [];
let meta = JSON.stringify({
  name: ID, startedAt: Date.now() - 3600e3, facade: true, seconds: TOTAL, rate: 48000, holes: 0, maxGapMs: 9,
  tracks: [...TR.map(([n], k) => ({ ch: k, name: n, file: files[k].replace('.wav', ''), pan: [0, -0.3, 0.4, 0, 0, 0.1, 0][k] })), { ch: 16, name: 'Façade', file: 'Façade (stéréo)', stereo: true, pan: 0 }],
  markers: SONGS.map((t, i) => ({ t, label: `Morceau ${i + 1}` })),
});

type Cb = (e: never) => void;
const subs: Record<string, Set<Cb>> = {};
const fire = (ev: string, e: unknown) => subs[ev]?.forEach((cb) => (cb as (x: unknown) => void)(e));
let pos = 0, playing = false, iv: ReturnType<typeof setInterval> | null = null;
let recT = 0, recIv: ReturnType<typeof setInterval> | null = null;

export const demoUsb: ListenNative = {
  // faux enregistrement : le temps avance, les barres bougent, rien n'est écrit
  recStart: async (o) => {
    recT = 0;
    if (recIv) clearInterval(recIv);
    recIv = setInterval(() => {
      recT += 0.25;
      const peaks = Array.from({ length: 18 }, (_, k) => (k < 7 || k > 15 ? -60 + 50 * rnd(Math.floor(recT * 4), k) : -120));
      fire('onRec', { t: recT, peaks, clips: Array(18).fill(0), usbErrors: 0, writeErrors: 0, alive: true, free: 96e9 } as RecEvent);
    }, 250);
    return { ok: true, error: '', id: o.name + ' (démo)', dir: '/demo/' + o.name, public: true, channels: 18, bits: 24, rate: 48000, files: [] };
  },
  recStop: async () => {
    if (recIv) clearInterval(recIv);
    recIv = null;
    fire('onRec', { ended: true } as RecEvent);
    return null;
  },
  recFree: () => ({ free: 96e9, public: true }),
  sessList: (): SessEntry[] => [{ id: ID, dir: DIR, public: true, modified: Date.now(), meta, files: [...files, ...extra].map((name) => ({ name, path: `${DIR}/${name}`, size: name.endsWith('.m4a') ? 38e6 : name.startsWith('Façade') ? 460e6 : 230e6 })) }],
  metaSave: (id, json) => { if (id === ID) meta = json; return true; },
  sessDelete: () => false,
  fileDelete: (path) => { extra = extra.filter((n) => `${DIR}/${n}` !== path); return true; },
  share: async () => true,
  peaks: async (path) => {
    const k = files.findIndex((n) => path.endsWith(n));
    return { ok: true, data: peaksB64(k >= 0 && k < TR.length ? k : -1), bucket: 0.2, seconds: TOTAL, channels: k === TR.length ? 2 : 1 };
  },
  playerOpen: () => ({ ok: true, rate: 48000, seconds: TOTAL }),
  playerSet: () => true,
  playerPlay: (on) => {
    playing = on;
    if (iv) clearInterval(iv);
    iv = on ? setInterval(() => { pos += 0.1; if (pos >= TOTAL) { pos = TOTAL; playing = false; if (iv) clearInterval(iv); } fire('onPlay', { t: pos, playing, ended: !playing }); }, 100) : null;
    if (!on) fire('onPlay', { t: pos, playing: false, ended: false });
    return true;
  },
  playerSeek: (sec) => { pos = sec; return true; },
  playerClose: () => { playing = false; if (iv) clearInterval(iv); iv = null; return true; },
  mixExport: (o) => new Promise((resolve) => {
    let p = 0;
    const t = setInterval(() => {
      p += 0.1;
      fire('onMix', { p: Math.min(1, p) });
      if (p >= 1) { clearInterval(t); const name = o.out.split('/').pop() ?? 'Mix.wav'; if (!extra.includes(name)) extra.push(name); resolve({ ok: true, path: o.out, seconds: 60 }); }
    }, 120);
  }),
  mixCancel: () => {},
  addListener: ((ev: string, cb: Cb) => { (subs[ev] ??= new Set()).add(cb); return { remove: () => { subs[ev].delete(cb); } }; }) as ListenNative['addListener'],
};
export type { RecEvent };
