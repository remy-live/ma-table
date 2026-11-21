// « Ce qui a changé » : pendant un réglage guidé (balance auto, baguette,
// préréglage, échange de prises), on note la valeur d'avant et d'après de
// chaque réglage touché. On peut ensuite montrer, prise par prise, ce qui a
// bougé, et tout annuler ou n'annuler qu'une prise.
import { OscValue } from '../osc/osc';
import { argFor, XAirClient } from './XAirClient';
import { faderToDb } from './levels';
import { FX_SEND_BASE } from './addresses';
import { plugs } from './wiring';

export interface Change { before: OscValue; after: OscValue }
export interface ChangeSet {
  id: number;
  title: string;
  at: number;
  changes: Map<string, Change>;
  swaps: [number, number][]; // prises échangées
}

const sets: ChangeSet[] = [];
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
let nextId = 1;

export const changeSets = () => sets;
export function onChangeSets(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const same = (a: OscValue, b: OscValue) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.002 : a === b);

/** Commence à noter. `stop()` range le lot (ou rien s'il n'y a eu aucun changement). */
export function record(client: XAirClient, title: string) {
  const ch = new Map<string, Change>();
  const off = client.onChange((p, v, before, who) => {
    if (who !== 'moi' || p.startsWith('/-') || p.startsWith('/meters')) return;
    const e = ch.get(p);
    if (e) e.after = v;
    else ch.set(p, { before, after: v });
  });
  return {
    stop(swaps: [number, number][] = []): ChangeSet | null {
      off();
      for (const [p, c] of ch) if (same(c.before, c.after)) ch.delete(p);
      if (!ch.size && !swaps.length) return null;
      const set: ChangeSet = { id: nextId++, title, at: Date.now(), changes: ch, swaps };
      sets.unshift(set);
      if (sets.length > 12) sets.pop();
      tell();
      return set;
    },
    cancel() { off(); },
  };
}

export interface PlugChange { plug: number; name: string; badges: string[]; lines: string[]; paths: string[] }
export interface OutChange { bus: number; badges: string[]; lines: string[]; paths: string[] }

const gainDb = (v: OscValue) => Number(v) * 72 - 12;
const fmt = (d: number) => `${d > 0 ? '+' : ''}${Math.round(d * 2) / 2}`;
const dbTxt = (v: OscValue) => { const d = faderToDb(Number(v)); return isFinite(d) ? `${fmt(d)} dB` : '−∞'; };

/** Ce qui a bougé, rangé par prise (et par sortie AUX). */
export function describe(client: XAirClient, set: ChangeSet): { plugs: PlugChange[]; outs: OutChange[]; other: string[] } {
  const P = plugs(client);
  const plugOfCh = (c: number) => P.find((p) => p.chans.includes(c))?.n ?? c;
  const byPlug = new Map<number, PlugChange>();
  const byOut = new Map<number, OutChange>();
  const other: string[] = [];
  const sends = new Map<PlugChange, string[]>();
  const pc = (n: number) => {
    let e = byPlug.get(n);
    if (!e) byPlug.set(n, (e = { plug: n, name: P[n - 1]?.name ?? '', badges: [], lines: [], paths: [] }));
    return e;
  };
  const oc = (n: number) => {
    let e = byOut.get(n);
    if (!e) byOut.set(n, (e = { bus: n, badges: [], lines: [], paths: [] }));
    return e;
  };
  const add = (e: { badges: string[]; lines: string[]; paths: string[] }, path: string, badge: string | null, line: string) => {
    e.paths.push(path);
    if (badge && !e.badges.includes(badge)) e.badges.push(badge);
    if (!e.lines.includes(line)) e.lines.push(line);
  };
  for (const [path, c] of set.changes) {
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^\/headamp\/(\d\d)\/(gain|phantom)$/))) {
      const e = pc(Number(m[1]));
      if (m[2] === 'gain') { const d = gainDb(c.after) - gainDb(c.before); add(e, path, `Gain ${fmt(d)}`, `Gain : ${fmt(gainDb(c.before))} → ${fmt(gainDb(c.after))} dB`); }
      else add(e, path, '48 V', `48 V : ${c.after ? 'allumé' : 'éteint'}`);
      continue;
    }
    if ((m = path.match(/^\/ch\/(\d\d)\/(.*)$/))) {
      const e = pc(plugOfCh(Number(m[1])));
      const r = m[2];
      if (r === 'mix/fader') add(e, path, `Fader ${fmt(faderToDb(Number(c.after)) - faderToDb(Number(c.before)) || 0)}`, `Façade : ${dbTxt(c.before)} → ${dbTxt(c.after)}`);
      else if (/^mix\/\d\d\/level$/.test(r)) {
        const b = Number(r.slice(4, 6));
        const fx = b > FX_SEND_BASE;
        e.paths.push(path);
        const k = fx ? 'Effets' : 'Retours';
        if (!e.badges.includes(k)) e.badges.push(k);
        (sends.get(e) ?? sends.set(e, []).get(e)!).push(`${fx ? `FX${b - FX_SEND_BASE}` : `AUX ${b}`} ${dbTxt(c.after)}`);
      }
      else if (r.startsWith('gate/')) add(e, path, 'Gate', 'Gate réglé');
      else if (r.startsWith('dyn/')) add(e, path, 'Comp', 'Compresseur réglé');
      else if (r.startsWith('eq/')) add(e, path, 'EQ', 'Égaliseur réglé');
      else if (r.startsWith('preamp/hp')) add(e, path, 'Coupe-bas', 'Coupe-bas réglé');
      else if (r === 'config/name') add(e, path, 'Nom', `Nom : « ${c.before || '—'} » → « ${c.after || '—'} »`);
      else if (r === 'mix/on') add(e, path, c.after ? 'Allumée' : 'Coupée', c.after ? 'Voie rallumée' : 'Voie coupée');
      else if (r === 'grp/dca') add(e, path, 'Groupe', 'Groupes changés');
      else if (r === 'config/insrc') add(e, path, 'Prise', 'Prise d’entrée changée');
      else add(e, path, null, 'Autres réglages');
      continue;
    }
    if ((m = path.match(/^\/bus\/(\d+)\/(.*)$/))) {
      const e = oc(Number(m[1]));
      if (m[2] === 'config/name') add(e, path, 'Nom', `Nom : « ${c.after || '—'} »`);
      else if (m[2] === 'mix/fader') add(e, path, 'Niveau', `Niveau : ${dbTxt(c.before)} → ${dbTxt(c.after)}`);
      else add(e, path, null, 'Réglages du retour');
      continue;
    }
    if ((m = path.match(/^\/config\/buslink\/(\d+)-(\d+)$/))) {
      add(oc(Number(m[1])), path, c.after ? 'Stéréo' : null, c.after ? 'Jumelée en stéréo' : 'Jumelage défait');
      continue;
    }
    if (path === '/lr/mix/fader') { other.push(`Volume général : ${dbTxt(c.before)} → ${dbTxt(c.after)}`); continue; }
  }
  // les envois en une ligne, et le badge le plus parlant en premier
  const RANK = ['Gain', 'Fader', 'Nom', 'Gate', 'Comp', 'Coupe-bas', 'EQ', 'Retours', 'Effets', '48 V'];
  const rank = (b: string) => { const k = RANK.findIndex((r) => b.startsWith(r)); return k < 0 ? 99 : k; };
  for (const e of byPlug.values()) {
    const sd = sends.get(e);
    if (sd) e.lines.push(`Envois : ${sd.join(' · ')}`);
    e.badges.sort((a, b) => rank(a) - rank(b));
    e.lines = e.lines.filter((l) => l !== 'Autres réglages').concat(e.lines.includes('Autres réglages') ? ['Autres réglages'] : []);
  }
  return { plugs: [...byPlug.values()].sort((a, b) => a.plug - b.plug), outs: [...byOut.values()].sort((a, b) => a.bus - b.bus), other };
}

/** Remet les valeurs d'avant pour ces adresses (toutes si `paths` est absent). */
export function undoChanges(client: XAirClient, set: ChangeSet, paths?: string[]) {
  const list = paths ?? [...set.changes.keys()];
  for (const p of list) {
    const c = set.changes.get(p);
    if (!c) continue;
    client.set(p, argFor(p, c.before));
    set.changes.delete(p);
  }
  if (!paths) set.swaps = [];
  if (!set.changes.size) {
    const k = sets.indexOf(set);
    if (k >= 0) sets.splice(k, 1);
  }
  tell();
}

/** Range un lot à partir de valeurs « d'avant » connues (les valeurs d'après sont lues sur la table). */
export function logChanges(client: XAirClient, title: string, before: Map<string, OscValue>): ChangeSet | null {
  const ch = new Map<string, Change>();
  for (const [p, b] of before) {
    const a = client.get(p);
    if (a !== undefined && !same(a, b)) ch.set(p, { before: b, after: a });
  }
  if (!ch.size) return null;
  const set: ChangeSet = { id: nextId++, title, at: Date.now(), changes: ch, swaps: [] };
  sets.unshift(set);
  if (sets.length > 12) sets.pop();
  tell();
  return set;
}
