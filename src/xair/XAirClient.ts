// Client pour les tables Behringer X Air (XR16) en OSC sur UDP, port 10024.
//
// Principes retenus :
//  - La table est la référence : au démarrage et à chaque reconnexion on RELIT
//    son état, on ne renvoie jamais nos anciennes valeurs.
//  - /xremote toutes les 8 s pour recevoir les changements faits ailleurs
//    (autre appli, autre téléphone). La table oublie l'abonnement au bout de ~10 s.
//  - Les gestes rapides (fader) sont lissés : au plus un envoi par adresse
//    toutes les 20 ms, toujours la dernière valeur.
//  - Pendant qu'on bouge un fader, on ignore l'écho de la table pour cette
//    adresse (sinon le fader « tremble » sous le doigt).

import { decode, encode, OscArg, OscValue, s as oscS } from '../osc/osc';
import { ch2 } from './levels';
import { setModel } from './addresses';
import { Remote, Transport } from './transport';
import * as dbg from '../debug/log';

export const XAIR_PORT = 10024;

export interface TableInfo {
  ip: string;
  name: string;
  model: string;
  firmware: string;
}

export type Status = 'déconnecté' | 'connexion' | 'connecté' | 'perdu';
export type ChangeListener = (path: string, value: OscValue, before: OscValue, origin: 'moi' | 'autre') => void;

type Listener = (value: OscValue | undefined, path: string) => void;

const KEEPALIVE_MS = 8000;
const LOST_AFTER_MS = 20000;
const FLUSH_MS = 20;
const ECHO_GUARD_MS = 300;

export class XAirClient {
  info: TableInfo | null = null;
  status: Status = 'déconnecté';

  private host = '';
  /** Adresse de la table. */
  get hostAddress() {
    return this.host;
  }
  private state = new Map<string, OscValue>();
  private changeListeners = new Set<ChangeListener>();
  /** adresses dont on attend une réponse à une lecture (pas un changement) */
  private reading = new Set<string>();
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<(s: Status) => void>();
  private pending = new Map<string, Uint8Array>();
  private lastLocal = new Map<string, number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private keepTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private infoWaiters: ((i: TableInfo) => void)[] = [];
  private extra = new Set<string>();
  private metersOn = false;
  private meterListeners = new Set<(db: Float32Array) => void>();
  /** Dernières valeurs de /meters/1, en dB. */
  meters = new Float32Array(40).fill(-90);

  constructor(private transport: Transport, private port = XAIR_PORT, private now: () => number = Date.now) {}

  // ---------- connexion ----------

  async connect(host: string, channels = 16, timeoutMs = 2500): Promise<TableInfo> {
    this.host = host;
    dbg.info(`Connexion à ${host}:${this.port}`);
    this.setStatus('connexion');
    await this.transport.open((b, from) => this.onPacket(b, from));
    const info = await this.askInfo(timeoutMs);
    dbg.info(`Table : ${info.name} · ${info.model} · firmware ${info.firmware} · ${info.ip}`);
    setModel(info.model);
    this.keepTimer = setInterval(() => this.keepAlive(channels), KEEPALIVE_MS);
    this.raw('/xremote');
    await this.loadState(channels);
    this.setStatus('connecté');
    return info;
  }

  close() {
    if (this.keepTimer) clearInterval(this.keepTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.keepTimer = this.flushTimer = null;
    this.transport.close();
    this.setStatus('déconnecté');
  }

  /** Cherche les tables sur le réseau local (diffusion de /xinfo). */
  static async discover(transport: Transport, timeoutMs = 1500, port = XAIR_PORT): Promise<TableInfo[]> {
    const found = new Map<string, TableInfo>();
    await transport.open((bytes, from) => {
      const m = decode(bytes);
      if (m && m.address === '/xinfo') {
        const inf = parseInfo(m.args, from);
        found.set(inf.ip, inf);
      }
    });
    transport.setBroadcast?.(true);
    const q = encode('/xinfo');
    transport.send(q, '255.255.255.255', port);
    await sleep(timeoutMs / 2);
    transport.send(q, '255.255.255.255', port);
    await sleep(timeoutMs / 2);
    transport.close();
    return [...found.values()];
  }

  /** Vumètres : la table envoie /meters/1 toutes les ~50 ms tant qu'on renouvelle l'abonnement. */
  startMeters() {
    this.metersOn = true;
    this.raw('/meters', [oscS('/meters/1')]);
  }

  stopMeters() {
    this.metersOn = false;
  }

  onMeters(cb: (db: Float32Array) => void): () => void {
    this.meterListeners.add(cb);
    return () => this.meterListeners.delete(cb);
  }

  /** Secondes depuis le dernier message de la table. */
  silenceSeconds(): number {
    return this.lastHeard ? Math.round((this.now() - this.lastHeard) / 1000) : -1;
  }

  /** Nombre de reconnexions réussies depuis le début. */
  reconnections = 0;

  /** Journal : chaque changement de valeur, avec son origine (moi / un autre appareil). */
  onChange(cb: ChangeListener): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  onStatus(cb: (s: Status) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  // ---------- état ----------

  get(path: string): OscValue | undefined {
    return this.state.get(path);
  }

  /** S'abonne à une adresse ('*' = toutes). Renvoie la fonction de désabonnement. */
  on(path: string, cb: Listener): () => void {
    let set = this.listeners.get(path);
    if (!set) this.listeners.set(path, (set = new Set()));
    set.add(cb);
    return () => set!.delete(cb);
  }

  /** Modifie une valeur : mise à jour locale immédiate, envoi lissé vers la table. */
  set(path: string, arg: OscArg) {
    const before = this.state.get(path);
    this.state.set(path, arg.v as OscValue);
    this.lastLocal.set(path, this.now());
    this.emit(path);
    if (before !== undefined && before !== arg.v) this.changeListeners.forEach((cb) => cb(path, arg.v as OscValue, before, 'moi'));
    this.pending.set(path, encode(path, [arg]));
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  /** Demande une valeur à la table (message sans argument). */
  query(path: string) {
    this.raw(path);
  }

  /** Relit l'état utile de la table : noms, niveaux, mutes, groupes, retours. */
  async loadState(channels = 16) {
    const paths: string[] = ['/lr/mix/fader', '/lr/mix/on'];
    for (let c = 1; c <= channels; c++) {
      const n = ch2(c);
      paths.push(
        `/ch/${n}/config/name`, `/ch/${n}/mix/fader`, `/ch/${n}/mix/on`, `/ch/${n}/grp/dca`,
        `/ch/${n}/mix/pan`, `/ch/${n}/preamp/invert`, `/headamp/${n}/gain`, `/headamp/${n}/phantom`,
        `/ch/${n}/config/color`, `/ch/${n}/eq/on`, `/ch/${n}/mix/07/level`, `/ch/${n}/mix/08/level`,
        `/ch/${n}/mix/09/level`, `/ch/${n}/mix/10/level`, `/ch/${n}/config/insrc`,
      );
    }
    for (let k = 1; k <= 4; k++) paths.push(`/dca/${k}/config/name`, `/dca/${k}/fader`, `/dca/${k}/on`);
    for (let b = 1; b <= 6; b++) paths.push(`/bus/${b}/config/name`);
    // Les paramètres déjà demandés (écran ouvert) sont relus aussi après une coupure.
    for (const p of this.extra) if (!paths.includes(p)) paths.push(p);
    await this.loadPaths(paths);
  }

  /** Demande une liste d'adresses à la table (lecture paresseuse : un écran charge ce qu'il affiche). */
  async loadPaths(paths: string[], remember = true) {
    if (remember) paths.forEach((p) => this.extra.add(p));
    // Par paquets de 8 pour ne pas saturer le Wi-Fi du téléphone.
    for (let k = 0; k < paths.length; k += 8) {
      paths.slice(k, k + 8).forEach((p) => {
        this.reading.add(p);
        this.raw(p);
      });
      await sleep(10);
    }
    await sleep(150); // laisse arriver les dernières réponses
  }

  // ---------- interne ----------

  private raw(path: string, args: OscArg[] = []) {
    dbg.oscTraffic('out', path, args.map((a) => a.v));
    this.transport.send(encode(path, args), this.host, this.port);
  }

  /** Envoi brut (écran Débogage). */
  sendRaw(path: string, args: OscArg[] = []) {
    this.raw(path, args);
  }

  private flush() {
    this.flushTimer = null;
    for (const [p, bytes] of this.pending) {
      dbg.oscTraffic('out', p, [this.state.get(p)]);
      this.transport.send(bytes, this.host, this.port);
    }
    this.pending.clear();
  }

  private keepAlive(channels: number) {
    this.raw('/xremote');
    this.raw('/xinfo'); // sert aussi de « ping »
    if (this.metersOn) this.raw('/meters', [oscS('/meters/1')]);
    const silent = this.now() - this.lastHeard;
    if (this.status === 'connecté' && silent > LOST_AFTER_MS) this.setStatus('perdu');
    void channels;
  }

  private askInfo(timeoutMs: number): Promise<TableInfo> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.infoWaiters = this.infoWaiters.filter((w) => w !== done);
        this.setStatus('déconnecté');
        dbg.error(`Pas de réponse /xinfo de ${this.host} en ${timeoutMs} ms`);
        reject(new Error('La table ne répond pas'));
      }, timeoutMs);
      const done = (inf: TableInfo) => {
        clearTimeout(t);
        resolve(inf);
      };
      this.infoWaiters.push(done);
      this.raw('/xinfo');
    });
  }

  private onPacket(bytes: Uint8Array, from: Remote) {
    const m = decode(bytes);
    if (!m) {
      dbg.warn(`Paquet illisible de ${from.address} : ${dbg.hex(bytes)}`);
      return;
    }
    this.lastHeard = this.now();
    dbg.oscTraffic('in', m.address, m.args);

    if (m.address === '/xinfo') {
      this.info = parseInfo(m.args, from);
      const w = this.infoWaiters;
      this.infoWaiters = [];
      w.forEach((fn) => fn(this.info!));
      if (this.status === 'perdu') {
        // Retour de la table : on relit son état, on n'impose pas le nôtre.
        this.setStatus('connexion');
        this.raw('/xremote');
        dbg.warn('Table revenue : relecture de l’état');
        this.loadState().then(() => {
          this.reconnections++;
          this.setStatus('connecté');
        });
      }
      return;
    }
    if (m.address === '/meters/1') {
      const blob = m.args[0];
      if (blob instanceof Uint8Array) {
        dbg.traffic.meterFrames++;
        if (!dbg.traffic.firstMeterHex) {
          dbg.traffic.firstMeterHex = dbg.hex(blob, 40);
          dbg.info(`Premier bloc de vumètres : ${blob.length} octets · ${dbg.traffic.firstMeterHex}`);
        }
      }
      if (blob instanceof Uint8Array && parseMeters(blob, this.meters)) this.meterListeners.forEach((cb) => cb(this.meters));
      return;
    }
    if (m.args.length === 0) return;

    const local = this.lastLocal.get(m.address);
    if (local !== undefined && this.now() - local < ECHO_GUARD_MS) return;

    const before = this.state.get(m.address);
    this.state.set(m.address, m.args[0]);
    this.emit(m.address);
    // Un changement venu d'ailleurs (autre téléphone, appli X AIR), pas une simple lecture
    if (before !== undefined && before !== m.args[0] && !this.reading.has(m.address)) this.changeListeners.forEach((cb) => cb(m.address, m.args[0], before, 'autre'));
    this.reading.delete(m.address);
  }

  private emit(path: string) {
    const v = this.state.get(path);
    this.listeners.get(path)?.forEach((cb) => cb(v, path));
    this.listeners.get('*')?.forEach((cb) => cb(v, path));
  }

  private setStatus(st: Status) {
    if (st === this.status) return;
    dbg.info(`État : ${this.status} → ${st}`);
    this.status = st;
    this.statusListeners.forEach((cb) => cb(st));
  }
}

function parseInfo(args: OscValue[], from: Remote): TableInfo {
  const str = (k: number) => (typeof args[k] === 'string' ? (args[k] as string) : '');
  return { ip: str(0) || from.address, name: str(1) || 'Table X Air', model: str(2), firmware: str(3) };
}

/** Blob de vumètres X Air : un entier (nombre de valeurs) puis des int16 little-endian en 1/256 dB. */
export function parseMeters(blob: Uint8Array, out: Float32Array): boolean {
  if (blob.length < 6) return false;
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let count = dv.getInt32(0, true);
  if (count <= 0 || count > 512) count = dv.getInt32(0, false); // ordre des octets selon le firmware
  if (count <= 0 || count > 512) count = (blob.length - 4) >> 1;
  const n = Math.min(count, (blob.length - 4) >> 1, out.length);
  for (let k = 0; k < n; k++) out[k] = dv.getInt16(4 + 2 * k, true) / 256;
  return n > 0;
}

/** Fabrique un blob de vumètres (simulateur, démo, tests). */
export function buildMeters(db: number[]): Uint8Array {
  const b = new Uint8Array(4 + 2 * db.length);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, db.length, true);
  db.forEach((v, k) => dv.setInt16(4 + 2 * k, Math.round(Math.max(-128, Math.min(127, v)) * 256), true));
  return b;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Petit raccourci pour renommer une voie.
export const nameArg = (name: string) => oscS(name.slice(0, 12));
