// Renommage intelligent : « Kick » -> couleur, groupe Batterie, préréglage Kick.

import { i, s } from '../osc/osc';
import { CH_COUNT, chDcaPath, DCA_COUNT, dcaNamePath, inDca } from './addresses';
import { ch2 } from './levels';
import { applyPreset, PRESETS } from './presets';
import { XAirClient } from './XAirClient';

/** Couleurs de bandeau X Air : 1 rouge, 2 vert, 3 jaune, 4 bleu, 5 magenta, 6 cyan, 7 blanc. */
export const TABLE_COLORS: Record<number, string> = {
  0: '#3A424C', 1: '#F87171', 2: '#34D399', 3: '#F59E0B', 4: '#60A5FA', 5: '#F472B6', 6: '#2DD4BF', 7: '#E8EAED',
};
export const colorOf = (idx: number) => TABLE_COLORS[idx & 7] ?? '#3A424C';

export interface Recognized {
  label: string; // nom propre
  color: number; // couleur table
  group: string | null; // groupe proposé
  preset: string | null; // préréglage à appliquer
  phantom: boolean; // micro statique probable
}

const DICT: [string[], Recognized][] = [
  [['kick', 'grosse caisse', 'grosse', 'gc', 'bd'], { label: 'Kick', color: 3, group: 'Batterie', preset: 'Kick', phantom: false }],
  [['caisse claire', 'c. claire', 'c claire', 'snare', 'cc', 'sn'], { label: 'Caisse claire', color: 3, group: 'Batterie', preset: 'Caisse claire', phantom: false }],
  [['charley', 'hihat', 'hi-hat', 'hh'], { label: 'Charley', color: 3, group: 'Batterie', preset: 'Charley', phantom: true }],
  [['tom', 'toms', 'floor'], { label: 'Toms', color: 3, group: 'Batterie', preset: 'Toms', phantom: false }],
  [['overhead', 'oh', 'cymbales', 'ride', 'crash'], { label: 'Overhead', color: 3, group: 'Batterie', preset: 'Overhead', phantom: true }],
  [['choeur', 'chœur', 'choeurs', 'backing'], { label: 'Chœurs', color: 5, group: 'Voix', preset: 'Voix', phantom: false }],
  [['voix', 'chant', 'lead', 'micro chant'], { label: 'Voix', color: 5, group: 'Voix', preset: 'Voix', phantom: false }],
  [['guitare élec', 'guitare elec', 'elec', 'électrique'], { label: 'Guitare élec', color: 6, group: 'Guitares', preset: 'Guitare élec', phantom: false }],
  [['guitare', 'gtr', 'acoustique', 'guitare acou'], { label: 'Guitare acou', color: 6, group: 'Guitares', preset: 'Guitare acou', phantom: false }],
  [['basse', 'bass'], { label: 'Basse', color: 4, group: null, preset: 'Basse', phantom: false }],
  [['clavier', 'piano', 'synthé', 'synthe', 'keys'], { label: 'Clavier', color: 2, group: null, preset: null, phantom: false }],
];

export function recognize(name: string): Recognized | null {
  const t = name.trim().toLowerCase();
  if (!t) return null;
  for (const [keys, rec] of DICT) if (keys.some((k) => t === k || t.startsWith(k + ' ') || t.startsWith(k))) return rec;
  return null;
}

/** Trouve le groupe DCA du nom donné, ou le crée dans le premier groupe libre. Renvoie son numéro ou null. */
export function findOrCreateGroup(client: XAirClient, name: string): number | null {
  for (let k = 1; k <= DCA_COUNT; k++) if (String(client.get(dcaNamePath(k)) ?? '').toLowerCase() === name.toLowerCase()) return k;
  for (let k = 1; k <= DCA_COUNT; k++) {
    const used = Array.from({ length: CH_COUNT }, (_, c) => Number(client.get(chDcaPath(c + 1)) ?? 0)).some((m) => inDca(m, k));
    if (!used && !String(client.get(dcaNamePath(k)) ?? '')) {
      client.set(dcaNamePath(k), s(name));
      return k;
    }
  }
  return null;
}

export interface SmartChoices {
  color: boolean;
  group: boolean;
  preset: boolean;
}

/** Applique nom + choix. Le 48 V n'est JAMAIS activé ici : l'écran demande confirmation à part. */
export function applySmartName(client: XAirClient, ch: number, typed: string, rec: Recognized | null, choices: SmartChoices) {
  const n = ch2(ch);
  client.set(`/ch/${n}/config/name`, s((rec && choices.color ? rec.label : typed).slice(0, 12)));
  if (!rec) return;
  if (choices.color) client.set(`/ch/${n}/config/color`, i(rec.color));
  if (choices.group && rec.group) {
    const k = findOrCreateGroup(client, rec.group);
    if (k) {
      const mask = Number(client.get(chDcaPath(ch)) ?? 0);
      client.set(chDcaPath(ch), i(mask | (1 << (k - 1))));
    }
  }
  if (choices.preset && rec.preset) {
    const p = PRESETS.find((x) => x.name === rec.preset);
    if (p) applyPreset(client, ch, p);
  }
}
