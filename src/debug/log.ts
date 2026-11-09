// Journal de débogage : garde les derniers événements en mémoire pour pouvoir
// les envoyer d'un geste (écran Débogage › Envoyer le rapport).

export type Level = 'info' | 'warn' | 'error' | 'out' | 'in';

export interface Entry {
  t: number; // horodatage ms
  level: Level;
  msg: string;
}

const MAX = 1500;
const entries: Entry[] = [];
const listeners = new Set<() => void>();

// Compteurs de trafic par adresse (les vumètres sont seulement comptés).
export const traffic = { out: new Map<string, number>(), in: new Map<string, number>(), meterFrames: 0, firstMeterHex: '' };

export function log(level: Level, msg: string) {
  entries.push({ t: Date.now(), level, msg });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  listeners.forEach((l) => l());
}

export const info = (m: string) => log('info', m);
export const warn = (m: string) => log('warn', m);
export const error = (m: string) => log('error', m);

export function getEntries(): Entry[] {
  return entries.slice();
}

export function onLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearLog() {
  entries.length = 0;
  traffic.out.clear();
  traffic.in.clear();
  traffic.meterFrames = 0;
  listeners.forEach((l) => l());
}

/** Trafic OSC : on compte tout, on journalise sans les vumètres ni les rafales de fader. */
let lastLogged = new Map<string, number>();
export function oscTraffic(dir: 'out' | 'in', address: string, args: unknown[]) {
  const map = dir === 'out' ? traffic.out : traffic.in;
  map.set(address, (map.get(address) ?? 0) + 1);
  if (address.startsWith('/meters')) return;
  if (dir === 'out' && args.length === 0) return; // les simples lectures sont seulement comptées
  const now = Date.now();
  const key = dir + address;
  if (now - (lastLogged.get(key) ?? 0) < 400) return; // pas plus de 2-3 lignes par seconde et par adresse
  lastLogged.set(key, now);
  if (lastLogged.size > 2000) lastLogged = new Map();
  const shown = args.map((a) => (a instanceof Uint8Array ? `blob(${a.length})` : typeof a === 'number' ? +a.toFixed(4) : JSON.stringify(a))).join(' ');
  log(dir, `${address} ${shown}`.trim());
}

export const hex = (b: Uint8Array, n = 24) =>
  Array.from(b.slice(0, n))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join(' ');

export const stamp = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
