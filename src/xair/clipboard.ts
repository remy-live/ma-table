// Copier / coller / échanger les réglages d'une voie.
// On lit d'abord toutes les adresses de la voie dans la table, puis on les
// réécrit sur les voies cibles en remplaçant seulement le numéro de voie.

import { f, i, OscArg, OscValue, s } from '../osc/osc';
import { ch2 } from './levels';
import { XAirClient } from './XAirClient';

export type Category = 'entree' | 'eq' | 'dyn' | 'fx' | 'envois' | 'nom';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'entree', label: 'Entrée (gain, 48 V, Ø)' },
  { id: 'eq', label: 'Égaliseur' },
  { id: 'dyn', label: 'Coupe-bas, gate, compresseur' },
  { id: 'fx', label: 'Effets' },
  { id: 'envois', label: 'Envois retours + pan' },
  { id: 'nom', label: 'Nom et couleur' },
];

/** Adresses d'une voie par catégorie. « {n} » = numéro de voie sur deux chiffres. */
const TEMPLATES: Record<Category, string[]> = {
  entree: ['/headamp/{n}/gain', '/headamp/{n}/phantom', '/ch/{n}/preamp/invert'],
  eq: ['/ch/{n}/eq/on', ...[1, 2, 3, 4].flatMap((b) => ['type', 'f', 'g', 'q'].map((p) => `/ch/{n}/eq/${b}/${p}`))],
  dyn: ['/ch/{n}/preamp/hpon', '/ch/{n}/preamp/hpf', '/ch/{n}/gate/on', '/ch/{n}/gate/thr', '/ch/{n}/dyn/on', '/ch/{n}/dyn/thr'],
  fx: [7, 8, 9, 10].map((b) => `/ch/{n}/mix/${ch2(b)}/level`),
  envois: [...[1, 2, 3, 4, 5, 6].map((b) => `/ch/{n}/mix/${ch2(b)}/level`), '/ch/{n}/mix/pan'],
  nom: ['/ch/{n}/config/name', '/ch/{n}/config/color'],
};

/** Type OSC de chaque paramètre (la table refuse un mauvais type). */
function argFor(path: string, v: OscValue): OscArg {
  if (path.endsWith('/config/name')) return s(String(v));
  if (/\/(on|type|phantom|invert|hpon|color)$/.test(path)) return i(Number(v));
  return f(Number(v));
}

export const pathsFor = (ch: number, cats: Category[]) =>
  cats.flatMap((c) => TEMPLATES[c].map((t) => t.replace('{n}', ch2(ch))));

export interface Clip {
  from: number;
  values: Record<Category, Record<string, OscValue>>; // modèle (avec {n}) -> valeur
}

/** Lit la voie dans la table et garde ses réglages. */
export async function copyChannel(client: XAirClient, ch: number): Promise<Clip> {
  const cats = CATEGORIES.map((c) => c.id);
  await client.loadPaths(pathsFor(ch, cats), false);
  const values = {} as Clip['values'];
  for (const c of cats) {
    values[c] = {};
    for (const t of TEMPLATES[c]) {
      const v = client.get(t.replace('{n}', ch2(ch)));
      if (v !== undefined) values[c][t] = v;
    }
  }
  return { from: ch, values };
}

/** Applique les catégories choisies du presse-papiers aux voies cibles. Renvoie le nombre de réglages envoyés. */
export function pasteChannel(client: XAirClient, clip: Clip, targets: number[], cats: Category[]): number {
  let n = 0;
  for (const ch of targets) {
    if (ch === clip.from) continue;
    for (const c of cats) {
      for (const [t, v] of Object.entries(clip.values[c] ?? {})) {
        const p = t.replace('{n}', ch2(ch));
        client.set(p, argFor(p, v));
        n++;
      }
    }
  }
  return n;
}

/** Échange tous les réglages de deux voies (nom compris). */
export async function swapChannels(client: XAirClient, a: number, b: number) {
  const all = CATEGORIES.map((c) => c.id);
  const ca = await copyChannel(client, a);
  const cb = await copyChannel(client, b);
  pasteChannel(client, ca, [b], all);
  pasteChannel(client, cb, [a], all);
}
