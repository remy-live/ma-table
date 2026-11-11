// Baguette magique : à partir de « qui joue quoi, et qui veut un retour »,
// l'appli propose où brancher chaque micro, quel retour donner à qui, et un
// premier mélange dans chaque retour. Tout est ensuite envoyé d'un coup
// (et s'annule d'un coup avec ↶).
//
// Règles simples, faciles à expliquer :
//  - les micros vont sur les prises à préampli (1-16 sur XR18, 1-8 sur XR16,
//    1-4 sur XR12), les sources ligne (basse en DI, clavier, ordi) d'abord sur
//    les prises jack quand la table en a ;
//  - les voix d'abord, puis chaque musicien dans l'ordre, la batterie à la suite ;
//  - un retour (AUX) par musicien qui en veut un, dans l'ordre ;
//  - dans son retour, chacun entend fort sa voix, bien son instrument, un peu
//    les autres voix ; le batteur et le bassiste s'entendent l'un l'autre.
import { f, s } from '../osc/osc';
import { busNamePath, chLevelPath, MAIN, MODEL } from './addresses';
import { dbToFader } from './levels';
import { applyNeed, Need } from './guide';
import { applySmartName, recognize } from './smartName';
import { XAirClient } from './XAirClient';

export type Kind = 'voix' | 'choeurs' | 'guitareAcou' | 'guitareElec' | 'basse' | 'batterie3' | 'batterie5' | 'clavier' | 'ordi' | 'cajon' | 'violon' | 'souffle';

export const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: 'voix', label: 'Chant', icon: '🎤' },
  { id: 'choeurs', label: 'Chœurs', icon: '👥' },
  { id: 'guitareAcou', label: 'Guitare acou', icon: '🪕' },
  { id: 'guitareElec', label: 'Guitare élec', icon: '🎸' },
  { id: 'basse', label: 'Basse', icon: '🎸' },
  { id: 'batterie3', label: 'Batterie (3 micros)', icon: '🥁' },
  { id: 'batterie5', label: 'Batterie (5 micros)', icon: '🥁' },
  { id: 'cajon', label: 'Cajón', icon: '🪘' },
  { id: 'clavier', label: 'Clavier', icon: '🎹' },
  { id: 'ordi', label: 'Ordi / bande', icon: '💻' },
  { id: 'violon', label: 'Violon', icon: '🎻' },
  { id: 'souffle', label: 'Sax / trompette', icon: '🎷' },
];

export interface Musician { name: string; kinds: Kind[]; retour: boolean }

/** Une prise de la proposition. */
export interface PlugPlan { plug: number; label: string; who: number; mic: boolean; phantom: boolean; voice: boolean; drum: boolean }
export interface RetourPlan { bus: number; who: number; name: string; mix: { plug: number; need: Need }[] }
export interface Plan { plugs: PlugPlan[]; retours: RetourPlan[]; warnings: string[]; drumPlugs: number[] }

type Src = { label: string; mic: boolean; phantom: boolean; voice?: boolean; drum?: boolean };
function sources(k: Kind): Src[] {
  switch (k) {
    case 'voix': return [{ label: 'Voix', mic: true, phantom: false, voice: true }];
    case 'choeurs': return [{ label: 'Chœurs', mic: true, phantom: false, voice: true }];
    case 'guitareAcou': return [{ label: 'Guitare acou', mic: false, phantom: false }];
    case 'guitareElec': return [{ label: 'Guitare élec', mic: true, phantom: false }];
    case 'basse': return [{ label: 'Basse', mic: false, phantom: false }];
    case 'batterie3': return [
      { label: 'Kick', mic: true, phantom: false, drum: true },
      { label: 'Caisse claire', mic: true, phantom: false, drum: true },
      { label: 'Overhead', mic: true, phantom: true, drum: true },
    ];
    case 'batterie5': return [
      { label: 'Kick', mic: true, phantom: false, drum: true },
      { label: 'Caisse claire', mic: true, phantom: false, drum: true },
      { label: 'Charley', mic: true, phantom: true, drum: true },
      { label: 'Toms', mic: true, phantom: false, drum: true },
      { label: 'Overhead', mic: true, phantom: true, drum: true },
    ];
    case 'cajon': return [{ label: 'Cajón', mic: true, phantom: false, drum: true }];
    case 'clavier': return [{ label: 'Clavier G', mic: false, phantom: false }, { label: 'Clavier D', mic: false, phantom: false }];
    case 'ordi': return [{ label: 'Ordi G', mic: false, phantom: false }, { label: 'Ordi D', mic: false, phantom: false }];
    case 'violon': return [{ label: 'Violon', mic: true, phantom: true }];
    case 'souffle': return [{ label: 'Sax', mic: true, phantom: false }];
  }
}

export function makePlan(band: Musician[]): Plan {
  const warnings: string[] = [];
  // 1. ce qu'il faut brancher, dans l'ordre : voix, puis instruments, batterie à la fin
  const want: (Src & { who: number })[] = [];
  band.forEach((m, who) => m.kinds.forEach((k) => sources(k).forEach((x) => { if (x.voice) want.push({ ...x, who }); })));
  band.forEach((m, who) => m.kinds.forEach((k) => sources(k).forEach((x) => { if (!x.voice && !x.drum) want.push({ ...x, who }); })));
  band.forEach((m, who) => m.kinds.forEach((k) => sources(k).forEach((x) => { if (x.drum) want.push({ ...x, who }); })));
  // le même nom deux fois (deux chanteurs) : on numérote
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  want.forEach((w) => total.set(w.label, (total.get(w.label) ?? 0) + 1));
  want.forEach((w) => { if ((total.get(w.label) ?? 0) > 1) { const n = (seen.get(w.label) ?? 0) + 1; seen.set(w.label, n); w.label = `${w.label} ${n}`; } });

  // 2. les prises : préamplis pour les micros, jacks d'abord pour les sources ligne
  const micPlugs = Array.from({ length: MODEL.preamps }, (_, k) => k + 1);
  const linePlugs = Array.from({ length: Math.max(0, Math.min(MODEL.inputs, 16) - MODEL.preamps) }, (_, k) => MODEL.preamps + k + 1);
  const free = new Set<number>(Array.from({ length: Math.min(MODEL.inputs, 16) }, (_, k) => k + 1));
  const lowest = (from: number[]) => from.find((n) => free.has(n));
  const plugs: PlugPlan[] = [];
  for (const w of want) {
    // micro : la première prise à préampli libre ; ligne : d'abord les jacks
    const p = w.mic ? lowest(micPlugs) ?? lowest([...free].sort((a, b) => a - b)) : lowest(linePlugs) ?? lowest([...free].sort((a, b) => a - b));
    if (!p) { warnings.push(`Plus de prise libre pour « ${w.label} » (${band[w.who]?.name || 'musicien'}).`); continue; }
    free.delete(p);
    if (w.mic && p > MODEL.preamps) warnings.push(`« ${w.label} » est un micro mais tombe sur la prise ${p}, sans préampli : prévois un préampli ou une DI.`);
    plugs.push({ plug: p, label: w.label, who: w.who, mic: w.mic, phantom: w.phantom, voice: !!w.voice, drum: !!w.drum });
  }
  // rangées dans l'ordre voulu (voix, instruments, batterie) sur les prises
  plugs.sort((a, b) => a.plug - b.plug);

  // 3. les retours
  const retours: RetourPlan[] = [];
  let bus = 1;
  band.forEach((m, who) => {
    if (!m.retour) return;
    if (bus > MODEL.outs) { warnings.push(`Pas assez de sorties AUX : ${m.name || 'un musicien'} n’a pas de retour (la ${MODEL.name} en a ${MODEL.outs}).`); return; }
    const mine = plugs.filter((p) => p.who === who);
    const isDrum = mine.some((p) => p.drum);
    const isBass = m.kinds.includes('basse');
    const mix: { plug: number; need: Need }[] = [];
    for (const p of plugs) {
      let need: Need = 'rien';
      if (p.who === who) need = p.voice ? 'fort' : p.drum ? 'bas' : 'moyen';
      else if (p.voice) need = 'bas';
      else if (isDrum && !p.voice && band[p.who]?.kinds.includes('basse')) need = 'moyen';
      else if (isBass && p.label.startsWith('Kick')) need = 'moyen';
      if (need !== 'rien') mix.push({ plug: p.plug, need });
    }
    retours.push({ bus, who, name: (m.name || `Retour ${bus}`).slice(0, 12), mix });
    bus++;
  });
  return { plugs, retours, warnings, drumPlugs: plugs.filter((p) => p.drum).map((p) => p.plug) };
}

/** Envoie la proposition à la table, en un seul geste (annulable avec ↶). Le 48 V n'est jamais allumé ici. */
export function applyPlan(client: XAirClient, plan: Plan) {
  const used = new Set(plan.plugs.map((p) => p.plug));
  for (let c = 1; c <= 16; c++) if (!used.has(c)) client.set(`/ch/${String(c).padStart(2, '0')}/config/name`, s(''));
  for (const p of plan.plugs) {
    applySmartName(client, p.plug, p.label, recognize(p.label), { color: true, group: true, preset: true });
    // une voie tout en bas dans la façade : on la remonte à −10 dB, un point de départ prudent
    if (Number(client.get(chLevelPath(p.plug, MAIN)) ?? 0) < 0.05) client.set(chLevelPath(p.plug, MAIN), f(dbToFader(-10)));
  }
  for (const r of plan.retours) {
    client.set(busNamePath(r.bus), s(r.name));
    const t = { kind: 'bus' as const, n: r.bus };
    for (let c = 1; c <= 16; c++) applyNeed(client, t, [c], r.mix.find((x) => x.plug === c)?.need ?? 'rien');
  }
}
