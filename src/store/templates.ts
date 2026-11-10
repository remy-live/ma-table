// Modèles de mixage : un point de départ tout prêt (artiste solo, groupe rock…).
// Un modèle règle les noms des voies, les groupes, les noms des retours, les
// coupe-bas, un mix de base (façade + retours) et dessine le plan de scène.
// Il ne touche JAMAIS aux gains ni au 48 V (on ne veut pas abîmer un micro).
import { f, i, s } from '../osc/osc';
import { busNamePath, CH_COUNT, chDcaPath, chLevelPath, chNamePath, dcaNamePath, hpfHzToF, hpfPath, hpOnPath, insrcPath, MAIN } from '../xair/addresses';
import { dbToFader } from '../xair/levels';
import { capture, restore, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from './persist';
import { blankTable } from './sessions';
import { EMPTY, fromChannels, Stage } from './stage';

export interface TplChan { plug: number; name: string; hpf?: number; main?: number; sends?: Record<number, number> }
export interface MixTemplate {
  key: string;
  name: string;
  desc: string;
  icon: string; // un mot : solo, duo, rock, acou, dj, talk
  chans: TplChan[];
  groups?: { name: string; plugs: number[] }[];
  buses: string[]; // noms des retours AUX 1, 2…
}

/** Modèles livrés avec l'appli. sends : { n° de retour : dB } */
export const TEMPLATES: MixTemplate[] = [
  {
    key: 'solo', name: 'Artiste solo', desc: 'Voix + guitare acoustique, un retour', icon: 'solo',
    chans: [
      { plug: 1, name: 'Voix', hpf: 100, main: 0, sends: { 1: 0 } },
      { plug: 2, name: 'Guitare acou', hpf: 80, main: -3, sends: { 1: -6 } },
    ],
    buses: ['Mon retour'],
  },
  {
    key: 'duo', name: 'Duo', desc: '2 voix, guitare, clavier, 2 retours', icon: 'duo',
    chans: [
      { plug: 1, name: 'Voix 1', hpf: 100, main: 0, sends: { 1: 0, 2: -6 } },
      { plug: 2, name: 'Voix 2', hpf: 100, main: 0, sends: { 1: -6, 2: 0 } },
      { plug: 3, name: 'Guitare acou', hpf: 80, main: -3, sends: { 1: -3, 2: -8 } },
      { plug: 4, name: 'Clavier', hpf: 40, main: -3, sends: { 1: -8, 2: -3 } },
    ],
    buses: ['Retour 1', 'Retour 2'],
  },
  {
    key: 'rock', name: 'Groupe rock', desc: 'Voix, 2 guitares, basse, batterie (5), 4 retours', icon: 'rock',
    chans: [
      { plug: 1, name: 'Voix', hpf: 100, main: 0, sends: { 1: 0, 2: -3, 3: -3, 4: -3 } },
      { plug: 2, name: 'Guitare 1', hpf: 100, main: -3, sends: { 1: -6, 2: 0 } },
      { plug: 3, name: 'Guitare 2', hpf: 100, main: -3, sends: { 1: -6, 3: 0 } },
      { plug: 4, name: 'Basse', hpf: 40, main: -2, sends: { 4: -3, 2: -8 } },
      { plug: 5, name: 'Kick', hpf: 40, main: -2, sends: { 4: -3 } },
      { plug: 6, name: 'Caisse claire', hpf: 80, main: -4, sends: { 4: -6 } },
      { plug: 7, name: 'Charley', hpf: 200, main: -10 },
      { plug: 8, name: 'Toms', hpf: 80, main: -6 },
      { plug: 9, name: 'Overhead', hpf: 150, main: -8 },
    ],
    groups: [{ name: 'Batterie', plugs: [5, 6, 7, 8, 9] }, { name: 'Guitares', plugs: [2, 3] }],
    buses: ['Chanteur', 'Guitare 1', 'Guitare 2', 'Bassiste'],
  },
  {
    key: 'acou', name: 'Groupe acoustique', desc: 'Voix, chœurs, guitares, contrebasse, cajon', icon: 'acou',
    chans: [
      { plug: 1, name: 'Voix', hpf: 100, main: 0, sends: { 1: 0, 2: -3, 3: -3 } },
      { plug: 2, name: 'Chœur', hpf: 120, main: -4, sends: { 1: -6, 2: 0 } },
      { plug: 3, name: 'Guitare acou', hpf: 80, main: -3, sends: { 1: -3, 2: -6 } },
      { plug: 4, name: 'Guitare 2', hpf: 80, main: -4, sends: { 2: -3 } },
      { plug: 5, name: 'Contrebasse', hpf: 40, main: -3, sends: { 3: -3 } },
      { plug: 6, name: 'Cajon', hpf: 50, main: -5, sends: { 3: -6 } },
    ],
    groups: [{ name: 'Voix', plugs: [1, 2] }],
    buses: ['Chanteur', 'Guitares', 'Rythmique'],
  },
  {
    key: 'dj', name: 'Karaoké / DJ', desc: 'Ordi en LINE 17/18 et 2 micros', icon: 'dj',
    chans: [
      { plug: 1, name: 'Micro 1', hpf: 120, main: 0, sends: { 1: -3 } },
      { plug: 2, name: 'Micro 2', hpf: 120, main: 0, sends: { 1: -3 } },
      { plug: 17, name: 'Ordi G', main: -6, sends: { 1: -10 } },
      { plug: 18, name: 'Ordi D', main: -6, sends: { 1: -10 } },
    ],
    groups: [{ name: 'Ordi', plugs: [17, 18] }, { name: 'Micros', plugs: [1, 2] }],
    buses: ['Retour scène'],
  },
  {
    key: 'talk', name: 'Conférence', desc: '4 micros, sans effets', icon: 'talk',
    chans: [1, 2, 3, 4].map((n) => ({ plug: n, name: `Micro ${n}`, hpf: 120, main: -2 })),
    groups: [{ name: 'Micros', plugs: [1, 2, 3, 4] }],
    buses: [],
  },
];

/** La voie qui reçoit une prise : la même (1..16) ; LINE 17/18 sur les voies 15 et 16. */
const chanFor = (plug: number) => (plug <= 16 ? plug : plug - 2);

/** Met la table dans l'état du modèle (après une table vide) et dessine le plan de scène. */
export async function applyTemplate(client: XAirClient, t: MixTemplate) {
  await blankTable(client);
  for (const c of t.chans) {
    const ch = chanFor(c.plug);
    if (ch < 1 || ch > CH_COUNT) continue;
    client.set(insrcPath(ch), i(c.plug - 1));
    client.set(chNamePath(ch), s(c.name.slice(0, 12)));
    if (c.hpf) { client.set(hpOnPath(ch), i(1)); client.set(hpfPath(ch), f(hpfHzToF(c.hpf))); }
    client.set(chLevelPath(ch, MAIN), f(dbToFader(c.main ?? -6)));
    for (const [b, db] of Object.entries(c.sends ?? {})) client.set(chLevelPath(ch, { kind: 'bus', n: Number(b) }), f(dbToFader(db)));
  }
  (t.groups ?? []).slice(0, 4).forEach((g, k) => {
    client.set(dcaNamePath(k + 1), s(g.name.slice(0, 12)));
    for (const p of g.plugs) { const ch = chanFor(p); const m = Number(client.get(chDcaPath(ch)) ?? 0); client.set(chDcaPath(ch), i(m | (1 << k))); }
  });
  t.buses.forEach((nm, k) => client.set(busNamePath(k + 1), s(nm.slice(0, 12))));
  const scene: Stage = { ...fromChannels(t.chans.map((c) => ({ plug: c.plug, name: c.name })), t.buses.map((name, k) => ({ n: k + 1, name }))), free: false, strong: true };
  await save('scene', scene);
}

// ---------- mes modèles (un mixage enregistré comme point de départ) ----------
export interface MyTemplate { key: string; name: string; desc: string; savedAt: number; snap: Snapshot; scene: Stage }
export async function listMyTemplates(): Promise<MyTemplate[]> {
  return (await load<MyTemplate[]>('mixTemplates', [])) ?? [];
}
export async function saveAsTemplate(client: XAirClient, name: string): Promise<MyTemplate[]> {
  const snap = await capture(client, name);
  const scene = (await load<Stage>('scene', EMPTY)) ?? EMPTY;
  const n = Object.keys(snap.values).filter((p) => /\/config\/name$/.test(p) && /^\/ch\//.test(p) && String(snap.values[p] ?? '').trim()).length;
  const t: MyTemplate = { key: 'my' + Date.now().toString(36), name: name.trim() || 'Mon modèle', desc: `${n} voie${n > 1 ? 's' : ''} nommée${n > 1 ? 's' : ''}`, savedAt: Date.now(), snap, scene };
  const list = [t, ...(await listMyTemplates())].slice(0, 20);
  await save('mixTemplates', list);
  return list;
}
export async function deleteMyTemplate(key: string): Promise<MyTemplate[]> {
  const list = (await listMyTemplates()).filter((t) => t.key !== key);
  await save('mixTemplates', list);
  return list;
}
export async function applyMyTemplate(client: XAirClient, t: MyTemplate) {
  restore(client, t.snap);
  await save('scene', t.scene);
}
