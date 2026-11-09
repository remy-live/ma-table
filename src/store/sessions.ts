// « Mes soirées » et sauvegardes en couches.
//  1. Soirée en cours (nom, début) + soirées enregistrées, nommées
//  2. Sauvegardes automatiques : à la connexion, toutes les 10 min, et avant
//     chaque opération risquée (les 12 dernières)
//  3. Export / import texte (fichier ou partage)
//  4. Snapshots internes de la table (64 emplacements) : le filet si le
//     téléphone meurt — l'appli X AIR officielle sait les rappeler
import { i, s as oscS } from '../osc/osc';
import { SNAP_LOAD, SNAP_SAVE, snapNamePath, SNAP_COUNT } from '../xair/addresses';
import { capture, restore, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from './persist';

export interface Session {
  id: string;
  name: string;
  startedAt: number;
  savedAt: number;
  snap: Snapshot;
  tableSlot?: number; // emplacement interne de la table utilisé (1..64)
}

export interface Current {
  id: string;
  name: string;
  startedAt: number;
}

export const AUTO_KEY = 'autos';
export const AUTO_MAX = 12;
export const AUTO_EVERY_MS = 10 * 60 * 1000;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function defaultName(d = new Date()): string {
  const j = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `Soirée du ${j} · ${h}`;
}

// ---------- soirée en cours ----------
export async function current(): Promise<Current> {
  const c = await load<Current | null>('soiree', null);
  if (c) return c;
  const n: Current = { id: newId(), name: defaultName(), startedAt: Date.now() };
  await save('soiree', n);
  return n;
}
export async function renameCurrent(name: string): Promise<Current> {
  const c = await current();
  const n = { ...c, name: name.trim() || c.name };
  await save('soiree', n);
  return n;
}

// ---------- soirées enregistrées ----------
export async function listSessions(): Promise<Session[]> {
  return (await load<Session[]>('soirees', [])) ?? [];
}
export async function saveCurrentSession(client: XAirClient, name?: string): Promise<Session> {
  const c = await current();
  const snap = await capture(client, name ?? c.name);
  const list = await listSessions();
  const existing = list.find((x) => x.id === c.id);
  const sess: Session = { id: c.id, name: name ?? c.name, startedAt: c.startedAt, savedAt: Date.now(), snap, tableSlot: existing?.tableSlot };
  await save('soirees', [sess, ...list.filter((x) => x.id !== c.id)].slice(0, 40));
  if (name && name !== c.name) await save('soiree', { ...c, name });
  return sess;
}
export type StartFrom = 'same' | 'balance' | 'blank';
/** Enregistre la soirée en cours, puis en démarre une nouvelle. */
export async function startNewSession(client: XAirClient, from: StartFrom): Promise<Current> {
  await saveCurrentSession(client);
  const n: Current = { id: newId(), name: defaultName(), startedAt: Date.now() };
  await save('soiree', n);
  if (from === 'balance') {
    const bal = await load<Snapshot | null>('balance', null);
    if (bal) restore(client, bal);
  } else if (from === 'blank') {
    await blankTable(client);
  }
  return n;
}
export async function deleteSession(id: string): Promise<Session[]> {
  const list = (await listSessions()).filter((x) => x.id !== id);
  await save('soirees', list);
  return list;
}
export async function renameSession(id: string, name: string): Promise<Session[]> {
  const list = (await listSessions()).map((x) => (x.id === id ? { ...x, name } : x));
  await save('soirees', list);
  return list;
}

/** Table « vide » : noms effacés, envois à zéro, faders à −∞, groupes vidés. Les gains ne bougent pas. */
export async function blankTable(client: XAirClient) {
  const { CH_COUNT, chNamePath, chLevelPath, chDcaPath, dcaNamePath, busNamePath, BUS_COUNT, FX_COUNT, MAIN } = await import('../xair/addresses');
  const { f } = await import('../osc/osc');
  for (let c = 1; c <= CH_COUNT; c++) {
    client.set(chNamePath(c), oscS(''));
    client.set(chDcaPath(c), i(0));
    client.set(chLevelPath(c, MAIN), f(0));
    for (let b = 1; b <= BUS_COUNT; b++) client.set(chLevelPath(c, { kind: 'bus', n: b }), f(0));
    for (let k = 1; k <= FX_COUNT; k++) client.set(chLevelPath(c, { kind: 'fx', n: k }), f(0));
  }
  for (let k = 1; k <= 4; k++) client.set(dcaNamePath(k), oscS(''));
  for (let b = 1; b <= BUS_COUNT; b++) client.set(busNamePath(b), oscS(''));
}

// ---------- sauvegardes automatiques ----------
export interface Auto extends Snapshot {
  reason: string; // « connexion », « toutes les 10 min », « avant balance automatique »…
}
export async function listAutos(): Promise<Auto[]> {
  return (await load<Auto[]>(AUTO_KEY, [])) ?? [];
}
export async function addAuto(snap: Snapshot, reason: string): Promise<Auto[]> {
  const list = [{ ...snap, reason }, ...(await listAutos())].slice(0, AUTO_MAX);
  await save(AUTO_KEY, list);
  return list;
}
/** Photo de sécurité. Renvoie null si la table est muette ou en démo. */
export async function safetyBackup(client: XAirClient, reason: string): Promise<Auto | null> {
  if (client.hostAddress === 'demo') return null;
  const snap = await capture(client, reason);
  if (Object.keys(snap.values).length < 10) return null;
  const list = await addAuto(snap, reason);
  return list[0];
}

/** Toutes les 10 minutes tant que la table est connectée. Renvoie la fonction d'arrêt. */
export function startPeriodicBackup(client: XAirClient, everyMs = AUTO_EVERY_MS, onDone?: (a: Auto | null) => void): () => void {
  const t = setInterval(() => {
    if (client.status !== 'connecté') return;
    safetyBackup(client, 'toutes les 10 min').then((a) => onDone?.(a)).catch(() => onDone?.(null));
  }, everyMs);
  return () => clearInterval(t);
}

// ---------- export / import ----------
export interface ExportFile {
  app: 'Ma table';
  version: 2;
  date: string;
  session?: Session;
  balance?: Snapshot | null;
  ordre?: number[] | null;
  mesPresets?: unknown;
}
export async function exportSession(sess?: Session): Promise<string> {
  const data: ExportFile = { app: 'Ma table', version: 2, date: new Date().toISOString(), session: sess, balance: await load('balance', null), ordre: await load('ordre', null), mesPresets: await load('mesPresets', null) };
  return JSON.stringify(data);
}
export async function importText(text: string): Promise<{ session?: Session; restored: string[] }> {
  const data = JSON.parse(text) as ExportFile;
  if (data.app !== 'Ma table') throw new Error('format');
  const restored: string[] = [];
  if (data.balance) { await save('balance', data.balance); restored.push('balance'); }
  if (data.ordre) { await save('ordre', data.ordre); restored.push('ordre des voies'); }
  if (data.mesPresets) { await save('mesPresets', data.mesPresets); restored.push('mes réglages'); }
  if (data.session) {
    const list = await listSessions();
    await save('soirees', [data.session, ...list.filter((x) => x.id !== data.session!.id)].slice(0, 40));
    restored.push(`soirée « ${data.session.name} »`);
  }
  return { session: data.session, restored };
}

// ---------- snapshots internes de la table ----------
/** Enregistre l'état actuel de la table dans son emplacement interne `slot`, sous `name` (12 car. max). */
export function saveToTable(client: XAirClient, slot: number, name: string) {
  const n = Math.max(1, Math.min(SNAP_COUNT, slot));
  client.set(snapNamePath(n), oscS(name.slice(0, 12)));
  client.sendRaw(SNAP_SAVE, [i(n)]);
}
export function loadFromTable(client: XAirClient, slot: number) {
  client.sendRaw(SNAP_LOAD, [i(Math.max(1, Math.min(SNAP_COUNT, slot)))]);
}
export const tableSnapPaths = () => Array.from({ length: SNAP_COUNT }, (_, k) => snapNamePath(k + 1));
/** Premier emplacement libre (sans nom), ou null. */
export function freeTableSlot(client: XAirClient): number | null {
  for (let n = 1; n <= SNAP_COUNT; n++) if (!String(client.get(snapNamePath(n)) ?? '')) return n;
  return null;
}
