// Soundcraft Ui12 / Ui16 / Ui24R.
// Ces tables ne parlent pas OSC : elles se pilotent par une WebSocket
// (ws://adresse-de-la-table), en messages texte du genre « SETD^i.0.mix^0.5 ».
// Ce « transport » se met entre l'appli et la table et TRADUIT : l'appli
// continue de parler « X Air » (/ch/01/mix/fader…), il convertit vers le
// vocabulaire Ui et inversement, y compris les vumètres (message VU2).
//
// Ce qu'on sait faire avec une Ui : volumes, coupures, panoramiques, noms,
// solos, gains et 48 V, retours (aux), envois vers les effets, masters des
// retours, de la façade et des retours d'effets, vumètres.
// Pas (encore) : égaliseur, compresseur, gate, groupes, routage des prises.
//
// Protocole : d'après la bibliothèque libre soundcraft-ui-connection
// (github.com/fmalcher/soundcraft-ui, licence MIT) — messages, loi des faders
// et format des vumètres en viennent.
import { decode, encode, OscArg, OscMessage, s as oscS, f as oscF, i as oscI } from '../osc/osc';
import { buildMeters } from './XAirClient';
import { dbToFader, faderToDb } from './levels';
import { Remote, Transport } from './transport';

// ---- loi des faders Soundcraft Ui (soundcraft-ui-connection, MIT) ----
function kn(e: number) {
  return (e < 0.055 ? Math.sin(28.559933214452666 * e) : 1) * Math.exp((23.90844819639692 + (-26.23877598214595 + (12.195249692570245 - 0.4878099877028098 * e) * e) * e) * e) * 0.0002676529517952372;
}
function knd(e: number) {
  const t = (23.90844819639692 + (-26.23877598214595 + (12.195249692570245 - 0.4878099877028098 * e) * e) * e) * e;
  const n = 23.90844819639692 + (-52.4775519642919 + (36.58574907771074 - 1.9512399508112392 * e) * e) * e;
  const r = Math.exp(t);
  if (e < 0.055) { const u = 28.559933214452666 * e; return 0.0002676529517952372 * r * (28.559933214452666 * Math.cos(u) + Math.sin(u) * n); }
  return 0.0002676529517952372 * r * n;
}
/** dB → position de fader Ui (0..1). */
export function uiDbToFader(db: number): number {
  if (db <= -200 || !isFinite(db)) return 0;
  if (db >= 10) return 1;
  const t = 10 ** (db / 20);
  let n = 0.5;
  for (let k = 0; k < 30; k++) {
    const step = (kn(n) - t) / knd(n);
    n -= step;
    if (n < 0) n = 1e-10;
    if (n > 1) n = 1;
    if (Math.abs(step) < 1e-12) break;
  }
  return n;
}
/** Position de fader Ui (0..1) → dB. */
export function uiFaderToDb(v: number): number {
  const t = kn(v);
  return t < 1e-10 ? -Infinity : 20 * Math.log10(t);
}

// ---- traduction des adresses ----
export type UiModel = 'ui12' | 'ui16' | 'ui24';
export const UI_CAPS: Record<UiModel, { name: string; input: number; aux: number; fx: number }> = {
  ui12: { name: 'Ui12', input: 8, aux: 4, fx: 4 },
  ui16: { name: 'Ui16', input: 12, aux: 6, fx: 4 },
  ui24: { name: 'Ui24R', input: 24, aux: 10, fx: 4 },
};
/** Les envois vers les effets sont rangés après les 10 retours possibles : /ch/NN/mix/11..14 = FX 1..4. */
export const UI_FX_SEND_BASE = 10;

type Conv = 'fader' | 'mute' | 'raw' | 'str' | 'gain';
type Map1 = { key: string; conv: Conv };
const two = (n: number) => String(n).padStart(2, '0');

export function xairToUi(path: string, model: UiModel): Map1 | null {
  let m: RegExpMatchArray | null;
  const hw = model === 'ui24' ? 'hw' : 'i';
  if ((m = path.match(/^\/ch\/(\d\d)\/(.*)$/))) {
    const c = Number(m[1]) - 1;
    const rest = m[2];
    if (rest === 'mix/fader') return { key: `i.${c}.mix`, conv: 'fader' };
    if (rest === 'mix/on') return { key: `i.${c}.mute`, conv: 'mute' };
    if (rest === 'mix/pan') return { key: `i.${c}.pan`, conv: 'raw' };
    if (rest === 'config/name') return { key: `i.${c}.name`, conv: 'str' };
    const s = rest.match(/^mix\/(\d\d)\/level$/);
    if (s) {
      const b = Number(s[1]);
      if (b <= UI_FX_SEND_BASE) return { key: `i.${c}.aux.${b - 1}.value`, conv: 'fader' };
      if (b <= UI_FX_SEND_BASE + 4) return { key: `i.${c}.fx.${b - UI_FX_SEND_BASE - 1}.value`, conv: 'fader' };
    }
    return null;
  }
  if ((m = path.match(/^\/-stat\/solosw\/(\d\d)$/))) return { key: `i.${Number(m[1]) - 1}.solo`, conv: 'raw' };
  if ((m = path.match(/^\/headamp\/(\d\d)\/(gain|phantom)$/))) return { key: `${hw}.${Number(m[1]) - 1}.${m[2]}`, conv: m[2] === 'gain' ? 'gain' : 'raw' };
  if ((m = path.match(/^\/bus\/(\d+)\/(mix\/fader|mix\/on|config\/name)$/))) {
    const b = Number(m[1]) - 1;
    return m[2] === 'mix/fader' ? { key: `a.${b}.mix`, conv: 'fader' } : m[2] === 'mix/on' ? { key: `a.${b}.mute`, conv: 'mute' } : { key: `a.${b}.name`, conv: 'str' };
  }
  if (path === '/lr/mix/fader') return { key: 'm.mix', conv: 'fader' };
  if ((m = path.match(/^\/rtn\/(\d)\/mix\/(fader|on)$/))) return { key: `f.${Number(m[1]) - 1}.${m[2] === 'fader' ? 'mix' : 'mute'}`, conv: m[2] === 'fader' ? 'fader' : 'mute' };
  return null;
}

/** L'inverse : une clé Ui → l'adresse X Air. */
export function uiToXair(key: string, model: UiModel): Map1 & { path: string } | null {
  let m: RegExpMatchArray | null;
  const hw = model === 'ui24' ? 'hw' : 'i';
  if ((m = key.match(/^i\.(\d+)\.(mix|mute|pan|name|solo)$/))) {
    const c = two(Number(m[1]) + 1);
    const t: Record<string, [string, Conv]> = { mix: [`/ch/${c}/mix/fader`, 'fader'], mute: [`/ch/${c}/mix/on`, 'mute'], pan: [`/ch/${c}/mix/pan`, 'raw'], name: [`/ch/${c}/config/name`, 'str'], solo: [`/-stat/solosw/${c}`, 'raw'] };
    const [path, conv] = t[m[2]];
    return { path, key, conv };
  }
  if ((m = key.match(/^i\.(\d+)\.aux\.(\d+)\.value$/))) return { path: `/ch/${two(Number(m[1]) + 1)}/mix/${two(Number(m[2]) + 1)}/level`, key, conv: 'fader' };
  if ((m = key.match(/^i\.(\d+)\.fx\.(\d+)\.value$/))) return { path: `/ch/${two(Number(m[1]) + 1)}/mix/${two(UI_FX_SEND_BASE + Number(m[2]) + 1)}/level`, key, conv: 'fader' };
  if ((m = key.match(new RegExp(`^${hw}\\.(\\d+)\\.(gain|phantom)$`)))) return { path: `/headamp/${two(Number(m[1]) + 1)}/${m[2]}`, key, conv: m[2] === 'gain' ? 'gain' : 'raw' };
  if ((m = key.match(/^a\.(\d+)\.(mix|mute|name)$/))) {
    const b = Number(m[1]) + 1;
    return m[2] === 'mix' ? { path: `/bus/${b}/mix/fader`, key, conv: 'fader' } : m[2] === 'mute' ? { path: `/bus/${b}/mix/on`, key, conv: 'mute' } : { path: `/bus/${b}/config/name`, key, conv: 'str' };
  }
  if (key === 'm.mix') return { path: '/lr/mix/fader', key, conv: 'fader' };
  if ((m = key.match(/^f\.(\d)\.(mix|mute)$/))) return { path: `/rtn/${Number(m[1]) + 1}/mix/${m[2] === 'mix' ? 'fader' : 'on'}`, key, conv: m[2] === 'mix' ? 'fader' : 'mute' };
  return null;
}

// gain des préamplis : X Air −12..+60 dB ; Ui24 −6..+57 ; Ui12/16 −40..+50
const gainRange = (model: UiModel): [number, number] => (model === 'ui24' ? [-6, 57] : [-40, 50]);
export function toUiValue(conv: Conv, v: number | string, model: UiModel): number | string {
  if (conv === 'str') return String(v);
  const x = Number(v);
  if (conv === 'fader') return Math.round(uiDbToFader(faderToDb(x)) * 1e6) / 1e6;
  if (conv === 'mute') return x ? 0 : 1;
  if (conv === 'gain') { const [a, b] = gainRange(model); const db = x * 72 - 12; return Math.max(0, Math.min(1, (db - a) / (b - a))); }
  return x;
}
export function fromUiValue(conv: Conv, v: number | string, model: UiModel): OscArg {
  if (conv === 'str') return oscS(String(v));
  const x = Number(v);
  if (conv === 'fader') return oscF(dbToFader(uiFaderToDb(x)));
  if (conv === 'mute') return oscI(x ? 0 : 1);
  if (conv === 'gain') { const [a, b] = gainRange(model); const db = a + x * (b - a); return oscF(Math.max(0, Math.min(1, (db + 12) / 72))); }
  return Number.isInteger(x) ? oscI(x) : oscF(x);
}

// ---- vumètres VU2 (base64) → bloc /meters/1 façon X Air, rangé pour l'appli ----
// voies 0..23, retours (aux) 30..39, sorties L/R 44 et 45
export const UI_METER = { bus: (n: number) => 29 + n, fxsend: (n: number) => 39 + n, lrL: 44, lrR: 45 };
export function vu2ToDb(b64: string): number[] | null {
  const bin = typeof atob === 'function' ? atob(b64) : '';
  if (!bin) return null;
  const e = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const blocks: [string, number, number][] = [['input', e[0], 6], ['player', e[1], 6], ['sub', e[2], 7], ['fx', e[3], 7], ['aux', e[4], 5], ['master', e[5], 5], ['line', e[6], 6]];
  const r = 0.004167508166392142;
  const db = (v: number) => (v <= 0 ? -90 : -80 + Math.min(1, v * r) * 80);
  const out = new Array(48).fill(-90);
  let i = 8;
  for (const [k, n, size] of blocks) {
    for (let a = 0; a < (n || 0); a++) {
      if (k === 'input' && a < 30) out[a] = db(e[i]); // avant fader, comme sur les X Air
      if (k === 'aux' && a < 10) out[30 + a] = db(e[i + 1]);
      if (k === 'master' && a < 2) out[44 + a] = db(e[i + 1]);
      i += size;
    }
  }
  return out;
}

// ---- le transport ----
type WS = { send(d: string): void; close(): void; onopen: (() => void) | null; onmessage: ((ev: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: ((e: unknown) => void) | null };
const UI_REMOTE: Remote = { address: 'ui', port: 80 };

export class UiTransport implements Transport {
  private ws: WS | null = null;
  private host = '';
  private onMessage: ((b: Uint8Array, from: Remote) => void) | null = null;
  private state = new Map<string, string>();
  private model: UiModel = 'ui24';
  private open$ = false;
  private alive: ReturnType<typeof setInterval> | null = null;
  private pendingInfo = false;
  /** valeurs que la Ui ne connaît pas (couleur, prise choisie) : gardées ici le temps de la séance */
  private local = new Map<string, OscArg>();

  constructor(private makeSocket: (url: string) => WS = (url) => new (globalThis as unknown as { WebSocket: new (u: string) => WS }).WebSocket(url)) {}

  async open(onMessage: (b: Uint8Array, from: Remote) => void) {
    this.onMessage = onMessage;
  }

  private connectTo(host: string) {
    if (this.ws && this.host === host) return;
    this.host = host;
    const ws = this.makeSocket(`ws://${host}`);
    this.ws = ws;
    ws.onopen = () => {
      this.open$ = true;
      this.alive = setInterval(() => this.raw('ALIVE'), 1000);
    };
    ws.onmessage = (ev) => {
      const data = String(ev.data ?? '');
      for (const line of data.split('\n')) this.onLine(line.startsWith('3:::') ? line.slice(4) : line);
    };
    ws.onclose = () => { this.open$ = false; if (this.alive) clearInterval(this.alive); this.alive = null; };
    ws.onerror = () => {};
  }

  private raw(msg: string) {
    if (this.open$) this.ws?.send(`3:::${msg}`);
  }

  private emit(path: string, args: OscArg[]) {
    this.onMessage?.(encode(path, args), UI_REMOTE);
  }

  private onLine(line: string) {
    if (!line) return;
    if (line.startsWith('VU2^')) {
      const db = vu2ToDb(line.slice(4));
      if (db) this.emit('/meters/1', [{ t: 'b', v: buildMeters(db) }]);
      return;
    }
    if (!line.startsWith('SETD^') && !line.startsWith('SETS^')) return;
    const j = line.indexOf('^', 5);
    if (j < 0) return;
    const key = line.slice(5, j);
    const val = line.slice(j + 1);
    this.state.set(key, val);
    if (key === 'model' && (val === 'ui12' || val === 'ui16' || val === 'ui24')) this.model = val;
    if ((key === 'model' || key === 'firmware') && this.pendingInfo) this.answerInfo();
    const x = uiToXair(key, this.model);
    if (x) this.emit(x.path, [fromUiValue(x.conv, x.conv === 'str' ? val : Number(val), this.model)]);
  }

  private answerInfo() {
    if (!this.state.has('model')) return;
    this.pendingInfo = false;
    const cap = UI_CAPS[this.model];
    this.emit('/xinfo', [oscS(this.host), oscS(`Soundcraft ${cap.name}`), oscS(cap.name), oscS(this.state.get('firmware') ?? '')]);
  }

  send(bytes: Uint8Array, host: string) {
    this.connectTo(host);
    const m: OscMessage | null = decode(bytes);
    if (!m) return;
    if (m.address === '/xinfo') {
      this.pendingInfo = true;
      this.answerInfo();
      return;
    }
    if (m.address === '/xremote' || m.address === '/meters') return; // la Ui envoie tout d'elle-même
    const map = xairToUi(m.address, this.model);
    if (m.args.length === 0) {
      // lecture : on répond avec ce que la Ui a déjà envoyé
      if (map) {
        const v = this.state.get(map.key);
        if (v !== undefined) this.emit(m.address, [fromUiValue(map.conv, map.conv === 'str' ? v : Number(v), this.model)]);
      } else {
        const l = this.local.get(m.address);
        if (l) this.emit(m.address, [l]);
      }
      return;
    }
    const v = m.args[0];
    if (!map) {
      if (/\/config\/(color|insrc)$/.test(m.address)) this.local.set(m.address, typeof v === 'string' ? oscS(v) : oscI(Number(v)));
      return;
    }
    const uv = toUiValue(map.conv, v as number | string, this.model);
    this.state.set(map.key, String(uv));
    this.raw(`${map.conv === 'str' ? 'SETS' : 'SETD'}^${map.key}^${uv}`);
  }

  close() {
    if (this.alive) clearInterval(this.alive);
    this.alive = null;
    this.ws?.close();
    this.ws = null;
    this.open$ = false;
  }
}
