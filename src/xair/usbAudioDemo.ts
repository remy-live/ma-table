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
const extra: Record<string, string[]> = {};
const BIN: { id: string; size: number; at: number }[] = [];
const OTHERS = ['2026-11-28 19h10 Balance (démo)', '2026-11-27 21h02 Répétition (démo)'];
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
  sessList: (): SessEntry[] => [ID, ...OTHERS].map((id, n) => ({ id, dir: '/demo/' + id, public: true, modified: Date.now() - n * 3600e3, meta: n ? meta.replace(ID, id) : meta, files: [...files, ...(extra['/demo/' + id] ?? [])].map((name) => ({ name, path: `/demo/${id}/${name}`, size: /\.(m4a|mp3)$/.test(name) ? 38e6 : name.startsWith('Façade') ? 460e6 : 230e6 })) })),
  metaSave: (id, json) => { if (id === ID) meta = json; return true; },
  sessDelete: () => false,
  sessTrash: (id) => { const k = OTHERS.indexOf(id); if (k < 0) return false; OTHERS.splice(k, 1); BIN.push({ id, size: 310e6, at: Date.now() }); return true; },
  trashList: () => [...BIN],
  trashRestore: (id) => { const k = BIN.findIndex((b) => b.id === id); if (k < 0) return ''; BIN.splice(k, 1); OTHERS.push(id); return id; },
  trashEmpty: (ids) => { const n = BIN.length; for (let k = BIN.length - 1; k >= 0; k--) if (!ids.length || ids.includes(BIN[k].id)) BIN.splice(k, 1); return n - BIN.length; },
  sessRename: (id, name) => { const k = OTHERS.indexOf(id); if (k < 0 || !name.trim()) return ''; OTHERS[k] = name.trim(); return OTHERS[k]; },
  fileDelete: (path) => { const d = path.slice(0, path.lastIndexOf('/')); extra[d] = (extra[d] ?? []).filter((n) => `${d}/${n}` !== path); return true; },
  share: async () => true,
  peaks: async (path) => {
    const k = files.findIndex((n) => path.endsWith(n));
    return { ok: true, data: peaksB64(k >= 0 && k < TR.length ? k : -1), bucket: 0.2, seconds: TOTAL, channels: k === TR.length ? 2 : 1 };
  },
  // fausse étude : un spectre plausible selon le nom de la piste, avec une résonance
  analyze: async (path) => {
    const n = (path.split('/').pop() ?? '').toLowerCase();
    const drum = /caisse|tom|kick|snare/.test(n), low = /basse|grosse/.test(n);
    const bump = /voix/.test(n) ? 8 : /guit/.test(n) ? 9 : drum ? 7 : 12; // n° de bande qui résonne
    const bands = Array.from({ length: 27 }, (_, b) => -30 - Math.abs(b - (low ? 3 : 12)) * (low ? 2.2 : 1.6) + (b === bump ? 7 : 0) + (/voix/.test(n) && b >= 6 && b <= 10 ? 4 : 0));
    const hist = Array.from({ length: 91 }, (_, i) => (drum ? Math.round(900 * Math.exp(-((i - 48) ** 2) / 30) + 300 * Math.exp(-((i - 74) ** 2) / 20)) : Math.round(600 * Math.exp(-((i - 66) ** 2) / 90))));
    return { ok: true, json: JSON.stringify({ bands, hist, rmsDb: -28, peakDb: -6, crestDb: drum ? 23 : 15, active: 0.8, rate: 48000 }) };
  },
  mixMeasure: async () => ({ ok: true, rmsDb: -21.5, peakDb: -3 }),
  mixAlbum: (o) => new Promise((resolve) => {
    let p = 0;
    const t = setInterval(() => { p += 0.08; fire('onMix', { p: Math.min(1, p) }); if (p >= 1) { clearInterval(t); resolve({ ok: true, path: o.full ?? o.songs[0]?.out ?? '', seconds: 600 }); } }, 120);
  }),
  albumDir: (name) => `/demo/Maquettes/${name}`,
  sessPack: async (o) => ({ ok: true, path: `/demo/${o.name}.matable.zip`, size: 280e6 }),
  sessImport: async () => ({ ok: false, error: 'pas dans la démonstration' }),
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
      if (p >= 1) { clearInterval(t); const name = o.out.split('/').pop() ?? 'Mix.wav', d = o.out.slice(0, o.out.lastIndexOf('/')); if (!(extra[d] ??= []).includes(name)) extra[d].push(name); resolve({ ok: true, path: o.out, seconds: 60 }); }
    }, 120);
  }),
  mixCancel: () => {},
  addListener: ((ev: string, cb: Cb) => { (subs[ev] ??= new Set()).add(cb); return { remove: () => { subs[ev].delete(cb); } }; }) as ListenNative['addListener'],
};
export type { RecEvent };
