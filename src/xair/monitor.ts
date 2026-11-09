// Mode « Mon retour » : un musicien règle son propre retour, et rien d'autre.
// Tout ce qui est ici ne touche QUE les envois vers un bus (le sien) et, si le
// propriétaire l'autorise, le limiteur de ce bus.
//
// Adresses X Air utilisées (à confirmer par le rapport de débogage) :
//  - /ch/NN/mix/BB/level      envoi voie NN → bus BB
//  - /rtn/aux/mix/BB/level    envoi entrée Aux → bus BB
//  - /rtn/K/mix/BB/level      envoi retour d'effet K → bus BB
//  - /config/chlink/1-2 …     voies liées en stéréo (0/1)
//  - /bus/B/dyn/{on,thr,ratio,attack,release}  compresseur du bus, utilisé en limiteur
//  - /bus/B/mix/fader         niveau général du retour

import { f, i } from '../osc/osc';
import { CH_COUNT, chDcaPath, chNamePath, compDbToF, DCA_COUNT, dcaNamePath, FX_COUNT, inDca, meterIndex } from './addresses';
import { ch2, dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';

/** Une source que le musicien entend : voie (ou paire stéréo), entrée Aux ou retour d'effet. */
export interface MonSource {
  id: string; // 'ch5', 'ch1-2', 'aux', 'fx1'
  label: string;
  paths: string[]; // une adresse par côté (2 pour une paire stéréo)
  channels: number[]; // voies de la table (vide pour aux/fx)
  stereo: boolean;
}

export interface MonGroup {
  k: number;
  name: string;
  sources: MonSource[];
}

/** Droits donnés par le propriétaire de la table. */
export interface MonRights {
  groups: boolean; // voir les groupes Batterie, Guitares…
  save: boolean; // garder sa balance
  limiterOff: boolean; // pouvoir couper le protège-oreilles
  fx: boolean; // régler les retours d'effets dans son casque
}

export const DEFAULT_RIGHTS: MonRights = { groups: true, save: true, limiterOff: false, fx: false };

export interface MonConfig {
  host: string; // IP de la table, ou 'demo'
  bus: number; // 1..6, verrouillé
  name: string; // « Bassiste »
  me: number[]; // ses voies à lui (Plus de moi)
  rights: MonRights;
}

export const sendPath = (ch: number, bus: number) => `/ch/${ch2(ch)}/mix/${ch2(bus)}/level`;
export const auxSendPath = (bus: number) => `/rtn/aux/mix/${ch2(bus)}/level`;
export const fxRtnSendPath = (k: number, bus: number) => `/rtn/${k}/mix/${ch2(bus)}/level`;
export const linkPath = (odd: number) => `/config/chlink/${odd}-${odd + 1}`;
export const busFaderPath = (b: number) => `/bus/${b}/mix/fader`;
export const busDyn = (b: number, p: 'on' | 'thr' | 'ratio' | 'attack' | 'release' | 'mode') => `/bus/${b}/dyn/${p}`;

/** Seuil du protège-oreilles : le casque ne dépasse jamais ~ −6 dB. */
export const LIMIT_DB = -6;
/** Index du rapport « ∞ » dans la liste des rapports X Air (1.1 … 100) : le dernier, 11. À vérifier. */
export const RATIO_INF = 11;

/** Adresses à lire pour afficher le retour d'un bus. */
export function monitorPaths(bus: number): string[] {
  const p: string[] = [busFaderPath(bus), `/bus/${bus}/config/name`, busDyn(bus, 'on'), busDyn(bus, 'thr'), busDyn(bus, 'ratio'), '/rtn/aux/config/name', auxSendPath(bus)];
  for (let c = 1; c <= CH_COUNT; c++) p.push(sendPath(c, bus), chNamePath(c), chDcaPath(c));
  for (let o = 1; o < CH_COUNT; o += 2) p.push(linkPath(o));
  for (let k = 1; k <= FX_COUNT; k++) p.push(fxRtnSendPath(k, bus), `/rtn/${k}/config/name`);
  for (let k = 1; k <= DCA_COUNT; k++) p.push(dcaNamePath(k));
  return p;
}

const linked = (client: XAirClient, odd: number) => Number(client.get(linkPath(odd)) ?? 0) === 1;
const chLabel = (client: XAirClient, ch: number) => String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`;

/** Liste des sources du retour : les paires liées deviennent une seule ligne stéréo. */
export function monitorSources(client: XAirClient, bus: number, withFx: boolean): MonSource[] {
  const out: MonSource[] = [];
  for (let c = 1; c <= CH_COUNT; c++) {
    if (c % 2 === 1 && c < CH_COUNT && linked(client, c)) {
      const a = chLabel(client, c);
      const b = chLabel(client, c + 1);
      out.push({ id: `ch${c}-${c + 1}`, label: commonName(a, b), paths: [sendPath(c, bus), sendPath(c + 1, bus)], channels: [c, c + 1], stereo: true });
      c++;
      continue;
    }
    out.push({ id: `ch${c}`, label: chLabel(client, c), paths: [sendPath(c, bus)], channels: [c], stereo: false });
  }
  out.push({ id: 'aux', label: String(client.get('/rtn/aux/config/name') ?? '') || 'Entrée Aux', paths: [auxSendPath(bus)], channels: [], stereo: true });
  if (withFx) {
    for (let k = 1; k <= FX_COUNT; k++) {
      out.push({ id: `fx${k}`, label: String(client.get(`/rtn/${k}/config/name`) ?? '') || `Effet ${k}`, paths: [fxRtnSendPath(k, bus)], channels: [], stereo: true });
    }
  }
  return out;
}

/** « Clavier G » + « Clavier D » → « Clavier » ; sinon « A / B ». */
export function commonName(a: string, b: string): string {
  const strip = (x: string) => x.replace(/\s*(G|D|L|R|gauche|droite|\d)$/i, '').trim();
  if (strip(a) && strip(a) === strip(b)) return strip(a);
  return a === b ? a : `${a} / ${b}`;
}

/** Regroupe les sources selon les groupes DCA de la table (un groupe = une ligne dépliable). */
export function monitorGroups(client: XAirClient, sources: MonSource[]): { groups: MonGroup[]; loose: MonSource[] } {
  const used = new Set<string>();
  const groups: MonGroup[] = [];
  for (let k = 1; k <= DCA_COUNT; k++) {
    const members = sources.filter((s) => s.channels.length > 0 && s.channels.every((c) => inDca(Number(client.get(chDcaPath(c)) ?? 0), k)) && !used.has(s.id));
    if (!members.length) continue;
    members.forEach((m) => used.add(m.id));
    groups.push({ k, name: String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`, sources: members });
  }
  return { groups, loose: sources.filter((s) => !used.has(s.id)) };
}

/** Niveau affiché d'une source (le plus fort des deux côtés pour une paire). */
export function sourceDb(client: XAirClient, s: MonSource): number {
  return Math.max(...s.paths.map((p) => faderToDb(Number(client.get(p) ?? 0))));
}

/**
 * Décale des envois de `db` dB en gardant leur équilibre.
 * Une source coupée (−∞) reste coupée, sauf `wake` : on la rallume à −30 dB
 * (utile quand le musicien touche + sur une source qu'il n'entend pas du tout).
 */
export function shift(client: XAirClient, paths: string[], db: number, wake = false) {
  for (const p of paths) {
    const cur = Number(client.get(p) ?? 0);
    let d = faderToDb(cur);
    if (!isFinite(d) || cur <= 0) {
      if (!wake || db <= 0) continue;
      d = -30 - db;
    }
    const n = d + db;
    client.set(p, f(n < -40 ? 0 : dbToFader(Math.min(10, n))));
  }
}

export const pathsOf = (list: MonSource[]) => list.flatMap((s) => s.paths);

/** « Plus de moi » : mes voies montent, le reste ne bouge pas. */
export function plusDeMoi(client: XAirClient, sources: MonSource[], me: number[], db = 2) {
  shift(client, pathsOf(sources.filter((s) => s.channels.some((c) => me.includes(c)))), db, true);
}

/** « Plus des autres » : tout sauf mes voies monte. */
export function plusDesAutres(client: XAirClient, sources: MonSource[], me: number[], db = 2) {
  shift(client, pathsOf(sources.filter((s) => !s.channels.some((c) => me.includes(c)))), db);
}

/** Protège-oreilles : le compresseur du bus en limiteur (seuil −6 dB, rapport ∞, attaque rapide). */
export function setLimiter(client: XAirClient, bus: number, on: boolean) {
  if (on) {
    client.set(busDyn(bus, 'thr'), f(compDbToF(LIMIT_DB)));
    client.set(busDyn(bus, 'ratio'), i(RATIO_INF));
    client.set(busDyn(bus, 'attack'), f(0));
  }
  client.set(busDyn(bus, 'on'), i(on ? 1 : 0));
}

export const limiterOn = (client: XAirClient, bus: number) => Number(client.get(busDyn(bus, 'on')) ?? 0) === 1;

/** Balance d'un retour : les envois de CE bus seulement, avec le numéro du bus. */
export interface MonBalance {
  bus: number;
  at: number;
  values: Record<string, number>;
}

export function captureMonitor(client: XAirClient, bus: number, sources: MonSource[]): MonBalance {
  const values: Record<string, number> = {};
  for (const p of [...pathsOf(sources), busFaderPath(bus)]) values[p] = Number(client.get(p) ?? 0);
  return { bus, at: Date.now(), values };
}

/** Restaure une balance — refusée si elle appartient à un autre bus (le défaut de MXBus). */
export function restoreMonitor(client: XAirClient, bal: MonBalance, bus: number): boolean {
  if (bal.bus !== bus) return false;
  for (const [p, v] of Object.entries(bal.values)) {
    if (!p.includes(`/mix/${ch2(bus)}/level`) && p !== busFaderPath(bus)) continue; // garde-fou
    client.set(p, f(v));
  }
  return true;
}

export function monitorChanges(client: XAirClient, bal: MonBalance): number {
  return Object.entries(bal.values).filter(([p, v]) => Math.abs(Number(client.get(p) ?? 0) - v) > 0.004).length;
}

export const busMeter = (bus: number) => meterIndex.bus(bus);

// ---------- Invitation ----------

/** Lien d'invitation : matable://retour?ip=…&bus=…&nom=…&moi=4&d=gs */
export function inviteLink(c: Omit<MonConfig, 'rights'> & { rights: MonRights }): string {
  const d = (c.rights.groups ? 'g' : '') + (c.rights.save ? 's' : '') + (c.rights.limiterOff ? 'l' : '') + (c.rights.fx ? 'f' : '');
  const q = [`ip=${encodeURIComponent(c.host)}`, `bus=${c.bus}`, `nom=${encodeURIComponent(c.name)}`, `moi=${c.me.join('.')}`, `d=${d || '-'}`];
  return `matable://retour?${q.join('&')}`;
}

export function parseInvite(url: string): MonConfig | null {
  const m = /^matable:\/\/retour\?(.*)$/.exec(url.trim());
  if (!m) return null;
  const q: Record<string, string> = {};
  for (const kv of m[1].split('&')) {
    const [k, v = ''] = kv.split('=');
    q[k] = decodeURIComponent(v);
  }
  const bus = Number(q.bus);
  if (!q.ip || !(bus >= 1 && bus <= 6)) return null;
  const d = q.d ?? 'gs';
  return {
    host: q.ip,
    bus,
    name: q.nom || `Retour ${bus}`,
    me: (q.moi ?? '').split('.').map(Number).filter((n) => n >= 1 && n <= CH_COUNT),
    rights: { groups: d.includes('g'), save: d.includes('s'), limiterOff: d.includes('l'), fx: d.includes('f') },
  };
}

/** Code court à taper à la main : « 172.20.10.2 · 1 » (IP + bus). */
export function parseShortCode(code: string): { host: string; bus: number } | null {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s*[·.\s/:-]+\s*([1-6])\s*$/.exec(code);
  return m ? { host: m[1], bus: Number(m[2]) } : null;
}
