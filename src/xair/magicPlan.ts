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
import { f, i, s } from '../osc/osc';
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

/** wedge : enceinte de retour au sol ; iem : intras (écouteurs). */
export type Ecoute = 'wedge' | 'iem';
export interface Musician {
  name: string; kinds: Kind[]; retour: boolean;
  ecoute?: Ecoute; // retour de scène par défaut
  stereo?: boolean; // intras en stéréo : deux AUX jumelées
  avec?: number; // partage l'enceinte de ce musicien (son numéro dans la liste)
}

/** Une prise de la proposition. */
export interface PlugPlan { plug: number; label: string; who: number; mic: boolean; phantom: boolean; voice: boolean; drum: boolean }
export interface RetourPlan {
  bus: number; buses: number[]; who: number; listeners: number[]; name: string;
  ecoute: Ecoute; stereo: boolean; hint: string; mix: { plug: number; need: Need }[];
}
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
  const RANK: Record<Need, number> = { rien: 0, bas: 1, moyen: 2, fort: 3 };
  const mixFor = (who: number) => {
    const m = band[who];
    const isDrum = plugs.some((p) => p.who === who && p.drum);
    const isBass = m.kinds.includes('basse');
    const mix = new Map<number, Need>();
    for (const p of plugs) {
      let need: Need = 'rien';
      if (p.who === who) need = p.voice ? 'fort' : p.drum ? 'bas' : 'moyen';
      else if (p.voice) need = 'bas';
      else if (isDrum && !p.voice && band[p.who]?.kinds.includes('basse')) need = 'moyen';
      else if (isBass && p.label.startsWith('Kick')) need = 'moyen';
      if (need !== 'rien') mix.set(p.plug, need);
    }
    return mix;
  };
  const freeBus = new Set(Array.from({ length: MODEL.outs }, (_, k) => k + 1));
  const takeMono = () => { const b = [...freeBus].sort((a, c) => a - c)[0]; if (b) freeBus.delete(b); return b; };
  const takePair = () => {
    for (let b = 1; b < MODEL.outs; b += 2) if (freeBus.has(b) && freeBus.has(b + 1)) { freeBus.delete(b); freeBus.delete(b + 1); return b; }
    return undefined;
  };
  const canLink = MODEL.family !== 'ui';
  const retours: RetourPlan[] = [];
  const nm = (who: number) => band[who]?.name || `Musicien ${who + 1}`;
  // d'abord ceux qui ont leur propre retour
  band.forEach((m, who) => {
    if (!m.retour) return;
    const ecoute: Ecoute = m.ecoute ?? 'wedge';
    const host = m.avec;
    if (ecoute === 'wedge' && host !== undefined && host !== who && band[host]?.retour && (band[host].ecoute ?? 'wedge') === 'wedge' && band[host].avec === undefined) return; // partage : plus bas
    let stereo = ecoute === 'iem' && !!m.stereo;
    let bus: number | undefined;
    if (stereo) {
      bus = canLink ? takePair() : undefined;
      if (bus === undefined) {
        stereo = false;
        warnings.push(canLink ? `Pas assez de sorties pour la stéréo de ${nm(who)} : intras en mono.` : `Cette table ne jumelle pas les retours : intras de ${nm(who)} en mono.`);
      }
    }
    if (bus === undefined) bus = takeMono();
    if (!bus) { warnings.push(`Pas assez de sorties AUX : ${nm(who)} n’a pas de retour (la ${MODEL.name} en a ${MODEL.outs}). Partagez une enceinte de retour.`); return; }
    const buses = stereo ? [bus, bus + 1] : [bus];
    const hint = ecoute === 'wedge'
      ? `AUX ${bus} → enceinte de retour devant ${nm(who)} (câble XLR ou jack)`
      : stereo
        ? `AUX ${bus} (gauche) et AUX ${bus + 1} (droite) → émetteur intra stéréo ou ampli casque`
        : `AUX ${bus} → émetteur intra ou ampli casque (jamais un casque direct)`;
    const mix = mixFor(who);
    retours.push({ bus, buses, who, listeners: [who], name: nm(who).slice(0, 12), ecoute, stereo, hint, mix: [...mix].map(([plug, need]) => ({ plug, need })) });
  });
  // puis ceux qui partagent l'enceinte d'un autre
  band.forEach((m, who) => {
    if (!m.retour || (m.ecoute ?? 'wedge') !== 'wedge' || m.avec === undefined) return;
    const r = retours.find((x) => x.who === m.avec && x.ecoute === 'wedge');
    if (!r || r.who === who) return;
    r.listeners.push(who);
    // le mélange commun : pour chaque prise, ce que le plus exigeant des deux demande
    const merged = new Map(r.mix.map((x) => [x.plug, x.need] as [number, Need]));
    for (const [plug, need] of mixFor(who)) if (RANK[need] > RANK[merged.get(plug) ?? 'rien']) merged.set(plug, need);
    r.mix = [...merged].sort((a, b) => a[0] - b[0]).map(([plug, need]) => ({ plug, need }));
    r.name = r.listeners.map(nm).join('+').slice(0, 12);
    r.hint = `AUX ${r.bus} → une enceinte de retour entre ${r.listeners.map(nm).join(' et ')}`;
  });
  retours.sort((a, b) => a.bus - b.bus);
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
  // jumelage des AUX : la stéréo des intras, et on défait un jumelage qui mélangerait deux retours
  if (MODEL.family !== 'ui') {
    for (let b = 1; b < MODEL.outs; b += 2) {
      const r = plan.retours.find((x) => x.buses.includes(b) || x.buses.includes(b + 1));
      if (r) client.set(`/config/buslink/${b}-${b + 1}`, i(r.stereo ? 1 : 0));
    }
  }
  for (const r of plan.retours) {
    for (const b of r.buses) {
      client.set(busNamePath(b), s(r.stereo ? `${r.name.slice(0, 10)} ${b === r.bus ? 'G' : 'D'}` : r.name));
      const t = { kind: 'bus' as const, n: b };
      for (let c = 1; c <= 16; c++) applyNeed(client, t, [c], r.mix.find((x) => x.plug === c)?.need ?? 'rien');
    }
  }
}
