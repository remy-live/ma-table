// « Ma scène » : la scène vue de dessus. Des blocs (instruments, éléments de
// batterie, pédalier, ampli, micros, DI, retours…), rangés dans des cadres (un par
// musicien, un pour la batterie), et des câbles jack ou XLR entre eux et jusqu'aux
// prises de la table. Les câbles d'un cadre peuvent être regroupés en faisceau.
// Sert de plan de scène et calcule le matériel à emporter. Rien n'est envoyé à la table.

export type Kind =
  // instruments
  | 'voix' | 'choeur' | 'guitare' | 'acoustique' | 'basse' | 'contrebasse' | 'clavier' | 'piano' | 'synthe'
  | 'violon' | 'violoncelle' | 'sax' | 'trompette' | 'trombone' | 'flute' | 'accordeon' | 'harmonica'
  | 'ukulele' | 'mandoline' | 'cajon' | 'percu' | 'ordi' | 'autre' | 'batterie'
  // batterie
  | 'kick' | 'snare' | 'hihat' | 'tom' | 'floortom' | 'ride' | 'crash' | 'overhead'
  // matériel
  | 'pedalboard' | 'ampli' | 'micro' | 'di'
  // retours et diffusion
  | 'retour' | 'casque' | 'enceinte' | 'musicien';
export type CableType = 'jack' | 'xlr';
export interface StageObj { id: string; kind: Kind; x: number; y: number; name: string; zone?: string; plug?: number }
/** dca : en lien fort, le groupe (DCA 1..4) de la table qui correspond à ce cadre. */
export interface Zone { id: string; name: string; color: string; x: number; y: number; w: number; h: number; bundled?: boolean; drums?: boolean; dca?: number }
/** Bout d'un câble : un bloc, une entrée de la table (1..18) ou une sortie ('aux1'..'aux6', 'mainL', 'mainR'). */
export type End = { o: string } | { plug: number } | { out: string };
export interface StageCable { id: string; a: End; b: End; type: CableType }
/**
 * free : plan libre (ne touche jamais la table) · sinon lié (la table arrive sur le plan)
 * strong : lien fort, ce qu'on règle sur la scène agit aussi sur la table
 * ignored : prises retirées du plan à la main, qui ne reviennent pas toutes seules
 */
export interface Stage { objs: StageObj[]; cables: StageCable[]; zones?: Zone[]; free?: boolean; strong?: boolean; ignored?: number[] }

export const EMPTY: Stage = { objs: [], cables: [], zones: [] };

export type Family = 'instrument' | 'drum' | 'gear' | 'mic' | 'monitor' | 'person';
export const KINDS: { kind: Kind; label: string; fam: Family; short?: string }[] = [
  { kind: 'voix', label: 'Voix', fam: 'mic' },
  { kind: 'choeur', label: 'Chœur', fam: 'mic' },
  { kind: 'guitare', label: 'Guitare élec', fam: 'instrument' },
  { kind: 'acoustique', label: 'Guitare acou', fam: 'instrument' },
  { kind: 'basse', label: 'Basse', fam: 'instrument' },
  { kind: 'contrebasse', label: 'Contrebasse', fam: 'instrument', short: 'CB' },
  { kind: 'clavier', label: 'Clavier', fam: 'instrument' },
  { kind: 'piano', label: 'Piano', fam: 'instrument' },
  { kind: 'synthe', label: 'Synthé', fam: 'instrument' },
  { kind: 'violon', label: 'Violon', fam: 'instrument', short: 'Vln' },
  { kind: 'violoncelle', label: 'Violoncelle', fam: 'instrument', short: 'Vlc' },
  { kind: 'sax', label: 'Saxophone', fam: 'instrument', short: 'Sax' },
  { kind: 'trompette', label: 'Trompette', fam: 'instrument', short: 'Tp' },
  { kind: 'trombone', label: 'Trombone', fam: 'instrument', short: 'Tb' },
  { kind: 'flute', label: 'Flûte', fam: 'instrument', short: 'Fl' },
  { kind: 'accordeon', label: 'Accordéon', fam: 'instrument', short: 'Acc' },
  { kind: 'harmonica', label: 'Harmonica', fam: 'instrument', short: 'Hm' },
  { kind: 'ukulele', label: 'Ukulélé', fam: 'instrument', short: 'Uk' },
  { kind: 'mandoline', label: 'Mandoline', fam: 'instrument', short: 'Md' },
  { kind: 'cajon', label: 'Cajón', fam: 'instrument', short: 'Cj' },
  { kind: 'percu', label: 'Percussions', fam: 'instrument', short: 'Pc' },
  { kind: 'ordi', label: 'Ordi / DJ', fam: 'instrument', short: 'PC' },
  { kind: 'autre', label: 'Autre…', fam: 'instrument', short: '?' },
  { kind: 'batterie', label: 'Batterie', fam: 'drum' },
  { kind: 'kick', label: 'Grosse caisse', fam: 'drum' },
  { kind: 'snare', label: 'Caisse claire', fam: 'drum' },
  { kind: 'hihat', label: 'Charley', fam: 'drum' },
  { kind: 'tom', label: 'Tom', fam: 'drum' },
  { kind: 'floortom', label: 'Tom basse', fam: 'drum' },
  { kind: 'ride', label: 'Ride', fam: 'drum' },
  { kind: 'crash', label: 'Crash', fam: 'drum' },
  { kind: 'overhead', label: 'Overhead', fam: 'drum' },
  { kind: 'pedalboard', label: 'Pédalier', fam: 'gear' },
  { kind: 'ampli', label: 'Ampli', fam: 'gear' },
  { kind: 'micro', label: 'Micro', fam: 'mic' },
  { kind: 'di', label: 'Boîte DI', fam: 'gear' },
  { kind: 'retour', label: 'Retour', fam: 'monitor' },
  { kind: 'casque', label: 'Casque / intras', fam: 'monitor' },
  { kind: 'enceinte', label: 'Enceinte', fam: 'monitor' },
  { kind: 'musicien', label: 'Musicien', fam: 'person' },
];
export const DRUM_PIECES: Kind[] = ['kick', 'snare', 'hihat', 'tom', 'floortom', 'ride', 'crash', 'overhead'];
const info = (k: Kind) => KINDS.find((x) => x.kind === k);
export const kindLabel = (k: Kind) => info(k)?.label ?? k;
export const kindShort = (k: Kind) => info(k)?.short ?? kindLabel(k).slice(0, 3);
export const family = (k: Kind): Family => info(k)?.fam ?? 'instrument';

/** Les sources qu'on prend au micro (câble XLR par défaut vers la table). */
const MIKED = new Set<Kind>(['voix', 'choeur', 'micro', 'violon', 'violoncelle', 'sax', 'trompette', 'trombone', 'flute', 'accordeon', 'harmonica', 'cajon', 'percu', 'piano', ...DRUM_PIECES]);
export const isMiked = (k: Kind) => MIKED.has(k);

export const ZONE_COLORS = ['#60A5FA', '#F472B6', '#34D399', '#A78BFA', '#FB923C', '#2DD4BF', '#FACC15', '#F87171'];

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const sameEnd = (a: End, b: End) =>
  ('o' in a && 'o' in b && a.o === b.o) || ('plug' in a && 'plug' in b && a.plug === b.plug) || ('out' in a && 'out' in b && a.out === b.out);
export const isTableEnd = (e: End) => !('o' in e);

/** Le bon câble par défaut : XLR pour une source au micro, une DI ou une batterie vers la table, un retour, une sortie ; jack sinon. */
export function smartType(st: Stage, a: End, b: End): CableType {
  const kindOf = (e: End) => ('o' in e ? st.objs.find((x) => x.id === e.o)?.kind : undefined);
  const ks = [kindOf(a), kindOf(b)];
  if ('out' in a || 'out' in b) return 'xlr';
  if (ks.some((k) => k === 'retour' || k === 'enceinte' || (k && MIKED.has(k)))) return 'xlr';
  if ((isTableEnd(a) || isTableEnd(b)) && ks.some((k) => k === 'di' || k === 'batterie')) return 'xlr';
  return 'jack';
}

export function addCable(st: Stage, a: End, b: End, type?: CableType): Stage {
  if (sameEnd(a, b)) return st;
  if (isTableEnd(a) && isTableEnd(b)) return st; // pas de câble de la table à la table
  return { ...st, cables: [...st.cables, { id: newId('c'), a, b, type: type ?? smartType(st, a, b) }] };
}
export const removeCable = (st: Stage, id: string): Stage => ({ ...st, cables: st.cables.filter((c) => c.id !== id) });
export const setCableType = (st: Stage, id: string, type: CableType): Stage => ({ ...st, cables: st.cables.map((c) => (c.id === id ? { ...c, type } : c)) });
export const removeObj = (st: Stage, id: string): Stage => ({
  ...st,
  objs: st.objs.filter((o) => o.id !== id),
  cables: st.cables.filter((c) => !sameEnd(c.a, { o: id }) && !sameEnd(c.b, { o: id })),
});
export const touching = (st: Stage, e: End) => st.cables.filter((c) => sameEnd(c.a, e) || sameEnd(c.b, e));
export const zonesOf = (st: Stage) => st.zones ?? [];
export const membersOf = (st: Stage, zid: string) => st.objs.filter((o) => o.zone === zid);
/** Les câbles d'un cadre qui partent vers la table (ceux qu'on peut mettre en faisceau). */
export function zoneTableCables(st: Stage, zid: string): StageCable[] {
  const ids = new Set(membersOf(st, zid).map((o) => o.id));
  return st.cables.filter((c) => (('o' in c.a && ids.has(c.a.o) && isTableEnd(c.b)) || ('o' in c.b && ids.has(c.b.o) && isTableEnd(c.a))));
}

/** Déplace un cadre et tout ce qu'il contient. */
export function moveZone(st: Stage, zid: string, dx: number, dy: number): Stage {
  const z = zonesOf(st).find((q) => q.id === zid);
  if (!z) return st;
  const ndx = Math.max(-z.x, Math.min(1 - z.w - z.x, dx));
  const ndy = Math.max(-z.y, Math.min(1 - z.h - z.y, dy));
  return {
    ...st,
    zones: zonesOf(st).map((q) => (q.id === zid ? { ...q, x: q.x + ndx, y: q.y + ndy } : q)),
    objs: st.objs.map((o) => (o.zone === zid ? { ...o, x: o.x + ndx, y: o.y + ndy } : o)),
  };
}
/** Le cadre sous un point (le plus petit en premier). */
export function zoneAt(st: Stage, x: number, y: number): Zone | undefined {
  return [...zonesOf(st)].sort((a, b) => a.w * a.h - b.w * b.h).find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
/** Après un déplacement de bloc : il appartient au cadre dans lequel on l'a posé. */
export const dropInZone = (st: Stage, oid: string): Stage => ({
  ...st,
  objs: st.objs.map((o) => (o.id === oid ? { ...o, zone: zoneAt(st, o.x, o.y)?.id } : o)),
});

/** Le matériel à emporter, compté à partir des blocs et des câbles. */
export interface Gear { key: string; label: string; n: number }
export function gear(st: Stage): Gear[] {
  const count = (k: Kind) => st.objs.filter((o) => o.kind === k).length;
  const bundledIds = new Set(zonesOf(st).filter((z) => z.bundled && zoneTableCables(st, z.id).length > 1).flatMap((z) => zoneTableCables(st, z.id).map((c) => c.id)));
  const drumMics = st.objs.filter((o) => DRUM_PIECES.includes(o.kind) && touching(st, { o: o.id }).some((c) => isTableEnd(c.a) || isTableEnd(c.b))).length;
  const mics = count('micro') + count('voix') + count('choeur') + drumMics + st.objs.filter((o) => ['violon', 'violoncelle', 'sax', 'trompette', 'trombone', 'flute', 'accordeon', 'harmonica', 'cajon', 'percu', 'piano'].includes(o.kind) && touching(st, { o: o.id }).some((c) => c.type === 'xlr')).length;
  const snakes = zonesOf(st).filter((z) => z.bundled && zoneTableCables(st, z.id).length > 1);
  const list: Gear[] = [
    { key: 'xlr', label: 'Câbles XLR (micro)', n: st.cables.filter((c) => c.type === 'xlr' && !bundledIds.has(c.id)).length },
    { key: 'jack', label: 'Câbles jack', n: st.cables.filter((c) => c.type === 'jack' && !bundledIds.has(c.id)).length },
    ...snakes.map((z) => ({ key: 'snake-' + z.id, label: `Multipaire ${zoneTableCables(st, z.id).length} voies (${z.name})`, n: 1 })),
    { key: 'micros', label: 'Micros', n: mics },
    { key: 'pieds', label: 'Pieds de micro', n: mics },
    { key: 'di', label: 'Boîtes DI', n: count('di') },
    { key: 'pedalboard', label: 'Pédaliers (+ alim.)', n: count('pedalboard') },
    { key: 'ampli', label: 'Amplis', n: count('ampli') },
    { key: 'retour', label: 'Retours de scène', n: count('retour') },
    { key: 'casque', label: 'Casques / intras', n: count('casque') },
    { key: 'enceinte', label: 'Enceintes', n: count('enceinte') },
  ];
  return list.filter((g) => g.n > 0);
}

export function endLabel(st: Stage, e: End, busName?: (n: number) => string): string {
  if ('plug' in e) return `Prise ${e.plug}`;
  if ('out' in e) return e.out === 'mainL' ? 'MAIN gauche' : e.out === 'mainR' ? 'MAIN droite' : `AUX ${e.out.slice(3)}${busName ? ` · ${busName(Number(e.out.slice(3)))}` : ''}`;
  const o = st.objs.find((x) => x.id === e.o);
  return o ? o.name || kindLabel(o.kind) : '?';
}

export function gearText(st: Stage): string {
  const g = gear(st);
  return g.length ? ['À EMPORTER', ...g.map((x) => `  ☐ ${x.n} × ${x.label}`)].join('\n') : '';
}
export function stageText(st: Stage, busName?: (n: number) => string): string {
  const lines = ['MA SCÈNE', ''];
  for (const z of zonesOf(st)) {
    lines.push(`${z.name.toUpperCase()}${z.bundled ? ' (faisceau)' : ''}`);
    for (const o of membersOf(st, z.id)) lines.push(`  · ${o.name}${touching(st, { o: o.id }).map((c) => ` → ${endLabel(st, sameEnd(c.a, { o: o.id }) ? c.b : c.a, busName)} (${c.type === 'xlr' ? 'XLR' : 'jack'})`).join('')}`);
  }
  const loose = st.objs.filter((o) => !o.zone);
  if (loose.length) {
    lines.push('AUTRES');
    for (const o of loose) lines.push(`  · ${o.name}${touching(st, { o: o.id }).map((c) => ` → ${endLabel(st, sameEnd(c.a, { o: o.id }) ? c.b : c.a, busName)} (${c.type === 'xlr' ? 'XLR' : 'jack'})`).join('')}`);
  }
  lines.push('', gearText(st));
  return lines.join('\n');
}

// ---------- remplir et garder à jour d'après la table ----------

/** Devine l'instrument d'après le nom d'une voie. */
export function guessKind(name: string): Kind {
  const n = name.toLowerCase();
  if (/kick|grosse/.test(n)) return 'kick';
  if (/caisse|snare|\bcc\b/.test(n)) return 'snare';
  if (/charley|hat|\bhh\b/.test(n)) return 'hihat';
  if (/tom bas|floor|basse tom/.test(n)) return 'floortom';
  if (/tom/.test(n)) return 'tom';
  if (/overhead|\boh\b/.test(n)) return 'overhead';
  if (/ride/.test(n)) return 'ride';
  if (/crash|cymb/.test(n)) return 'crash';
  if (/chœur|choeur|chorus/.test(n)) return 'choeur';
  if (/voix|chant|vocal|lead/.test(n)) return 'voix';
  if (/contreb/.test(n)) return 'contrebasse';
  if (/acou|folk/.test(n)) return 'acoustique';
  if (/bass/.test(n)) return 'basse';
  if (/uku/.test(n)) return 'ukulele';
  if (/mando/.test(n)) return 'mandoline';
  if (/guit|gtr/.test(n)) return 'guitare';
  if (/piano/.test(n)) return 'piano';
  if (/synth/.test(n)) return 'synthe';
  if (/clav|key|orgue/.test(n)) return 'clavier';
  if (/violon(?!c)/.test(n)) return 'violon';
  if (/violonc|cello/.test(n)) return 'violoncelle';
  if (/sax/.test(n)) return 'sax';
  if (/tromp/.test(n)) return 'trompette';
  if (/tromb/.test(n)) return 'trombone';
  if (/fl[uû]te/.test(n)) return 'flute';
  if (/accord/.test(n)) return 'accordeon';
  if (/harmo/.test(n)) return 'harmonica';
  if (/cajon|cajón/.test(n)) return 'cajon';
  if (/percu|conga|bongo|djemb/.test(n)) return 'percu';
  if (/ordi|dj|pc|laptop|usb|playback/.test(n)) return 'ordi';
  if (/batt|drum/.test(n)) return 'batterie';
  return 'micro';
}

type Chan = { plug: number; name: string };

/** Ajoute à la scène, dans un cadre (x, w), les blocs d'une voie de la table et leur câble jusqu'à sa prise. */
function placeChannel(st: Stage, c: Chan, zone: Zone, slot: number, slots: number): Stage {
  const kind = guessKind(c.name);
  const objs: StageObj[] = [];
  const cables: [string, End, CableType][] = [];
  const cx = zone.x + zone.w * ((slot + 0.5) / Math.max(1, slots));
  const y0 = zone.y + 0.15;
  const add = (k: Kind, name: string, x: number, y: number, plug?: number) => { const o: StageObj = { id: newId('o'), kind: k, name, x, y, zone: zone.id, plug }; objs.push(o); return o; };
  if (kind === 'guitare') {
    const a = add('ampli', 'Ampli', cx - 0.03, y0);
    const m = add('micro', 'Micro ampli', cx + 0.055, y0 + 0.13, c.plug);
    const g = add('guitare', c.name, cx, y0 + 0.33);
    const p = add('pedalboard', 'Pédalier', cx, y0 + 0.5);
    st = { ...st, objs: [...st.objs, ...objs] };
    st = addCable(st, { o: g.id }, { o: p.id }, 'jack');
    st = addCable(st, { o: p.id }, { o: a.id }, 'jack');
    st = addCable(st, { o: m.id }, { plug: c.plug }, 'xlr');
    return st;
  }
  if (['basse', 'acoustique', 'clavier', 'synthe', 'contrebasse', 'ukulele', 'mandoline'].includes(kind)) {
    const i = add(kind, c.name, cx, y0 + 0.18);
    const d = add('di', 'DI', cx, y0 + 0.42, c.plug);
    st = { ...st, objs: [...st.objs, ...objs] };
    st = addCable(st, { o: i.id }, { o: d.id }, 'jack');
    st = addCable(st, { o: d.id }, { plug: c.plug }, 'xlr');
    return st;
  }
  void cables;
  const v = add(kind, c.name, cx, DRUM_PIECES.includes(kind) ? y0 + 0.12 + (slot % 2) * 0.22 : y0 + 0.3, c.plug);
  st = { ...st, objs: [...st.objs, v] };
  return addCable(st, { o: v.id }, { plug: c.plug }, kind === 'ordi' ? 'jack' : 'xlr');
}

/** Une scène de départ : un cadre par musicien (voie nommée) et un pour la batterie,
 *  chaque voie câblée à sa prise, un retour par retour nommé câblé depuis sa sortie AUX. */
export function fromChannels(chans: Chan[], buses: { n: number; name: string }[]): Stage {
  let st: Stage = { objs: [], cables: [], zones: [] };
  const drums = chans.filter((c) => DRUM_PIECES.includes(guessKind(c.name)) || guessKind(c.name) === 'batterie');
  const others = chans.filter((c) => !drums.includes(c));
  const cols = others.length + (drums.length ? 2 : 0); // la batterie prend deux colonnes
  const colW = 0.96 / Math.max(1, cols);
  let col = 0;
  others.forEach((c, k) => {
    const z: Zone = { id: newId('z'), name: c.name, color: ZONE_COLORS[k % ZONE_COLORS.length], x: 0.02 + col * colW, y: 0.02, w: colW - 0.01, h: 0.74 };
    st = { ...st, zones: [...zonesOf(st), z] };
    st = placeChannel(st, c, z, 0, 1);
    col++;
  });
  if (drums.length) {
    const z: Zone = { id: newId('z'), name: 'Batterie', color: '#F59E0B', x: 0.02 + col * colW, y: 0.02, w: colW * 2 - 0.01, h: 0.74, drums: true, bundled: drums.length > 2 };
    st = { ...st, zones: [...zonesOf(st), z] };
    drums.forEach((d, k) => { st = placeChannel(st, d, z, k, drums.length); });
  }
  buses.forEach((b, k) => {
    // le retour va devant le cadre du même nom s'il existe, sinon en ligne au bord de scène
    const z = zonesOf(st).find((q) => q.name.toLowerCase() === b.name.toLowerCase());
    const x = z ? z.x + z.w / 2 : 0.1 + (k / Math.max(1, buses.length - 1 || 1)) * 0.8;
    const r: StageObj = { id: newId('o'), kind: 'retour', name: b.name, x, y: 0.9 };
    st = addCable({ ...st, objs: [...st.objs, r] }, { out: `aux${b.n}` }, { o: r.id }, 'xlr');
  });
  return st;
}

/** Plan lié à la table : chaque voie nommée qui n'a pas encore de câble vers sa prise
 *  reçoit son bloc et son câble ; les blocs liés à une prise prennent le nom de la voie. */
export function syncWithTable(st: Stage, chans: Chan[]): { st: Stage; added: number; removed: number } {
  // une voie dont le nom a été effacé sur la table : son bloc quitte le plan
  const gone = st.objs.filter((o) => o.plug !== undefined && !chans.some((c) => c.plug === o.plug && c.name));
  let out: Stage = st;
  for (const o of gone) out = removeObj(out, o.id);
  out = { ...out, objs: out.objs.map((o) => { if (o.plug === undefined) return o; const c = chans.find((x) => x.plug === o.plug); return c && c.name && o.name !== c.name && !/^Micro /.test(o.name) && family(o.kind) !== 'gear' ? { ...o, name: c.name } : o; }) };
  const cabled = new Set(out.cables.flatMap((c) => [c.a, c.b]).filter((e): e is { plug: number } => 'plug' in e).map((e) => e.plug));
  const ign = new Set(out.ignored ?? []);
  const missing = chans.filter((c) => c.name && !cabled.has(c.plug) && !ign.has(c.plug));
  if (!missing.length) return { st: pruneZones(out), added: 0, removed: gone.length };
  // un cadre « À placer » au bord de scène pour les nouveaux venus
  let z = zonesOf(out).find((q) => q.name === 'À placer');
  if (!z) { z = { id: newId('z'), name: 'À placer', color: '#94A3B8', x: 0.02, y: 0.78, w: 0.96, h: 0.2 }; out = { ...out, zones: [...zonesOf(out), z] }; }
  missing.forEach((c, k) => {
    const kind = guessKind(c.name);
    const o: StageObj = { id: newId('o'), kind, name: c.name, x: z!.x + 0.04 + k * 0.08, y: z!.y + 0.1, zone: z!.id, plug: c.plug };
    out = addCable({ ...out, objs: [...out.objs, o] }, { o: o.id }, { plug: c.plug }, kind === 'ordi' || ['guitare', 'basse', 'clavier', 'synthe', 'acoustique'].includes(kind) ? 'jack' : 'xlr');
  });
  return { st: pruneZones(out), added: missing.length, removed: gone.length };
}

// ---------- cadres qui s'adaptent ----------

/** Le cadre épouse ses blocs (marge pour l'étiquette en haut et les noms en bas). */
export function fitZone(st: Stage, zid: string): Stage {
  const m = membersOf(st, zid);
  if (!m.length) return st;
  const xs = m.map((o) => o.x);
  const ys = m.map((o) => o.y);
  const x1 = Math.max(0, Math.min(...xs) - 0.05);
  const x2 = Math.min(1, Math.max(...xs) + 0.05);
  const y1 = Math.max(0, Math.min(...ys) - 0.13);
  const y2 = Math.min(1, Math.max(...ys) + 0.13);
  const w = Math.max(0.12, x2 - x1);
  const h = Math.max(0.24, y2 - y1);
  return { ...st, zones: zonesOf(st).map((z) => (z.id === zid ? { ...z, x: Math.min(x1, 1 - w), y: Math.min(y1, 1 - h), w, h } : z)) };
}
/** Un bloc posé : il entre dans le cadre où on l'a lâché (ou en sort), et les cadres concernés s'adaptent. */
export function dropAndFit(st: Stage, oid: string): Stage {
  const before = st.objs.find((o) => o.id === oid)?.zone;
  let out = dropInZone(st, oid);
  const after = out.objs.find((o) => o.id === oid)?.zone;
  for (const z of new Set([before, after].filter(Boolean) as string[])) out = fitZone(out, z);
  return before && before !== after ? pruneZones(out, [before]) : out;
}
/** Un cadre dessiné au doigt : il prend les blocs qu'il entoure. */
export function zoneFromRect(st: Stage, r: { x: number; y: number; w: number; h: number }, name = 'Musicien'): { st: Stage; id: string } {
  const z: Zone = { id: newId('z'), name, color: ZONE_COLORS[zonesOf(st).length % ZONE_COLORS.length], ...r };
  const inside = (o: StageObj) => o.x >= r.x && o.x <= r.x + r.w && o.y >= r.y && o.y <= r.y + r.h;
  const objs = st.objs.map((o) => (inside(o) ? { ...o, zone: z.id } : o));
  return { st: { ...st, zones: [...zonesOf(st), z], objs }, id: z.id };
}

// ---------- configurations toutes prêtes ----------

export interface Config { key: string; label: string; sub: string; drums?: boolean; items: { kind: Kind; name?: string; dx: number; dy: number }[]; links: [number, number, CableType][] }
export const CONFIGS: Config[] = [
  { key: 'drums-full', label: 'Batterie complète', sub: '7 éléments', drums: true, items: [
    { kind: 'kick', dx: 0.07, dy: 0.32 }, { kind: 'snare', dx: 0.0, dy: 0.2 }, { kind: 'hihat', dx: -0.07, dy: 0.12 }, { kind: 'tom', dx: 0.07, dy: 0.08 },
    { kind: 'floortom', dx: 0.15, dy: 0.24 }, { kind: 'overhead', name: 'OH gauche', dx: 0.0, dy: -0.02 }, { kind: 'overhead', name: 'OH droite', dx: 0.15, dy: -0.02 }], links: [] },
  { key: 'drums-light', label: 'Batterie légère', sub: 'GC, caisse, OH', drums: true, items: [
    { kind: 'kick', dx: 0.05, dy: 0.25 }, { kind: 'snare', dx: -0.03, dy: 0.12 }, { kind: 'overhead', dx: 0.05, dy: -0.02 }], links: [] },
  { key: 'gtr-amp', label: 'Guitare › pédalier › ampli', sub: 'micro sur l’ampli', items: [
    { kind: 'ampli', dx: 0, dy: 0 }, { kind: 'micro', name: 'Micro ampli', dx: 0.07, dy: 0.1 }, { kind: 'guitare', dx: 0, dy: 0.26 }, { kind: 'pedalboard', dx: 0, dy: 0.44 }],
    links: [[2, 3, 'jack'], [3, 0, 'jack']] },
  { key: 'gtr-di', label: 'Guitare › pédalier › DI', sub: 'sans ampli', items: [
    { kind: 'guitare', dx: 0, dy: 0 }, { kind: 'pedalboard', dx: 0, dy: 0.2 }, { kind: 'di', dx: 0, dy: 0.4 }], links: [[0, 1, 'jack'], [1, 2, 'jack']] },
  { key: 'bass-di', label: 'Basse › DI', sub: 'direct', items: [{ kind: 'basse', dx: 0, dy: 0 }, { kind: 'di', dx: 0, dy: 0.22 }], links: [[0, 1, 'jack']] },
  { key: 'bass-amp', label: 'Basse › ampli + DI', sub: 'DI avant l’ampli', items: [
    { kind: 'basse', dx: 0, dy: 0.26 }, { kind: 'di', dx: 0.07, dy: 0.1 }, { kind: 'ampli', dx: 0, dy: 0 }], links: [[0, 1, 'jack'], [1, 2, 'jack']] },
  { key: 'acou-di', label: 'Guitare acou › DI', sub: '', items: [{ kind: 'acoustique', dx: 0, dy: 0 }, { kind: 'di', dx: 0, dy: 0.22 }], links: [[0, 1, 'jack']] },
  { key: 'keys-st', label: 'Clavier stéréo', sub: '2 DI (G / D)', items: [
    { kind: 'clavier', dx: 0.04, dy: 0 }, { kind: 'di', name: 'DI gauche', dx: 0, dy: 0.22 }, { kind: 'di', name: 'DI droite', dx: 0.08, dy: 0.22 }], links: [[0, 1, 'jack'], [0, 2, 'jack']] },
  { key: 'singer', label: 'Chanteur', sub: 'voix + retour', items: [{ kind: 'voix', dx: 0, dy: 0 }, { kind: 'retour', dx: 0, dy: 0.26 }], links: [] },
  { key: 'singer-gtr', label: 'Chanteur guitariste', sub: 'voix, acou › DI, retour', items: [
    { kind: 'voix', dx: 0, dy: 0 }, { kind: 'acoustique', dx: 0.08, dy: 0.12 }, { kind: 'di', dx: 0.08, dy: 0.32 }, { kind: 'retour', dx: 0, dy: 0.4 }], links: [[1, 2, 'jack']] },
];

/** Pose une configuration toute prête dans un nouveau cadre, à l'endroit libre le plus proche de (x, y). */
export function addConfig(st: Stage, key: string, x?: number, y?: number): { st: Stage; zone: string } {
  const c = CONFIGS.find((q) => q.key === key)!;
  const zid = newId('z');
  const ids: string[] = [];
  const maxDx = Math.max(0, ...c.items.map((i) => i.dx));
  const maxDy = Math.max(0, ...c.items.map((i) => i.dy));
  if (x === undefined || y === undefined) {
    // la première place libre (sans chevaucher un cadre ni un bloc), de gauche à droite puis de haut en bas
    const w = Math.max(0.12, maxDx + 0.1);
    const h = Math.max(0.24, maxDy + 0.26);
    const busy = (bx: number, by: number) => zonesOf(st).some((z) => bx < z.x + z.w && bx + w > z.x && by < z.y + z.h && by + h > z.y) || st.objs.some((o) => o.x > bx - 0.02 && o.x < bx + w + 0.02 && o.y > by - 0.04 && o.y < by + h + 0.04);
    let spot: [number, number] | null = null;
    for (let yy = 0.02; yy <= 1 - h && !spot; yy += 0.08) for (let xx = 0.02; xx <= 1 - w && !spot; xx += 0.04) if (!busy(xx, yy)) spot = [xx, yy];
    const [sx, sy] = spot ?? [0.4, 0.2];
    x = sx + 0.05;
    y = sy + 0.13;
  }
  const ox = Math.max(0.05, Math.min(0.95 - maxDx, x));
  const oy = Math.max(0.12, Math.min(0.88 - maxDy, y));
  const objs = c.items.map((i) => { const o: StageObj = { id: newId('o'), kind: i.kind, name: i.name ?? kindLabel(i.kind), x: ox + i.dx, y: oy + i.dy, zone: zid }; ids.push(o.id); return o; });
  const z: Zone = { id: zid, name: c.drums ? 'Batterie' : c.label.split(' ›')[0], color: c.drums ? '#F59E0B' : ZONE_COLORS[zonesOf(st).length % ZONE_COLORS.length], x: 0, y: 0, w: 0.2, h: 0.3, drums: c.drums };
  let out: Stage = { ...st, objs: [...st.objs, ...objs], zones: [...zonesOf(st), z] };
  for (const [a, b, t] of c.links) out = addCable(out, { o: ids[a] }, { o: ids[b] }, t);
  return { st: fitZone(out, zid), zone: zid };
}

/** Retirer un bloc du plan pour de bon : sa prise ne revient plus toute seule. */
export function removeFromPlan(st: Stage, oid: string): Stage {
  const plug = st.objs.find((o) => o.id === oid)?.plug;
  const out = pruneZones(removeObj(st, oid));
  return plug === undefined ? out : { ...out, ignored: [...new Set([...(out.ignored ?? []), plug])] };
}
/** La prise de la table à laquelle un bloc est câblé (la première trouvée). */
export function plugOf(st: Stage, oid: string): number | undefined {
  for (const c of st.cables) {
    if ('o' in c.a && c.a.o === oid && 'plug' in c.b) return c.b.plug;
    if ('o' in c.b && c.b.o === oid && 'plug' in c.a) return c.a.plug;
  }
  return undefined;
}
/** Le nom à donner à la voie : pour une DI ou un micro, celui de l'instrument branché dessus. */
export function sourceName(st: Stage, oid: string): string {
  const o = st.objs.find((q) => q.id === oid);
  if (!o) return '';
  if (family(o.kind) !== 'gear') return o.name;
  for (const c of st.cables) {
    const other = 'o' in c.a && c.a.o === oid ? c.b : 'o' in c.b && c.b.o === oid ? c.a : null;
    const q = other && 'o' in other ? st.objs.find((x) => x.id === other.o) : undefined;
    if (q && family(q.kind) !== 'gear' && family(q.kind) !== 'monitor') return q.name;
  }
  return o.name;
}

// ---------- cadres et groupes de la table ----------

/** Enlève les cadres devenus vides (seulement ceux donnés, ou tous). */
export function pruneZones(st: Stage, only?: string[]): Stage {
  const empty = zonesOf(st).filter((z) => (!only || only.includes(z.id)) && !st.objs.some((o) => o.zone === z.id));
  return empty.length ? { ...st, zones: zonesOf(st).filter((z) => !empty.includes(z)) } : st;
}

/** Les prises de la table branchées dans un cadre (directement ou via une DI / un micro). */
export function zonePlugs(st: Stage, zid: string): number[] {
  const out = new Set<number>();
  for (const o of membersOf(st, zid)) { const p = o.plug ?? plugOf(st, o.id); if (p !== undefined) out.add(p); }
  return [...out].sort((a, b) => a - b);
}

export interface TableGroup { k: number; name: string; plugs: number[] }

/**
 * Lien fort, sens scène › table : chaque cadre d'au moins deux voies reçoit un groupe
 * (DCA) libre. Rend la scène (cadres numérotés) et ce que doit devenir chaque groupe.
 */
export function stageToGroups(st: Stage, tableUsed: number[], count = 4): { st: Stage; groups: TableGroup[] } {
  let zones = zonesOf(st);
  const owned = new Set(zones.map((z) => z.dca).filter(Boolean) as number[]);
  zones = zones.map((z) => {
    if (z.dca || z.name === 'À placer' || zonePlugs(st, z.id).length < 2) return z;
    for (let k = 1; k <= count; k++) if (!owned.has(k) && !tableUsed.includes(k)) { owned.add(k); return { ...z, dca: k }; }
    return z;
  });
  const out = zones.some((z, n) => z !== zonesOf(st)[n]) ? { ...st, zones } : st;
  const groups = zonesOf(out).filter((z) => z.dca).map((z) => ({ k: z.dca!, name: z.name, plugs: zonePlugs(out, z.id) }));
  return { st: out, groups };
}

/**
 * Sens table › scène : chaque groupe de la table devient (ou reste) un cadre qui
 * contient ses voies ; une voie sortie du groupe sort du cadre.
 */
export function groupsToStage(st: Stage, groups: TableGroup[]): Stage {
  let out = st;
  for (const g of groups) {
    if (!g.plugs.length) continue;
    const objs = (plugs: number[]) => out.objs.filter((o) => o.plug !== undefined && plugs.includes(o.plug));
    let z = zonesOf(out).find((q) => q.dca === g.k) ?? zonesOf(out).find((q) => !q.dca && q.name.toLowerCase() === g.name.toLowerCase());
    if (!z) {
      // un cadre là où sont déjà ses voies, sinon au bord de scène
      const m = objs(g.plugs);
      if (!m.length) continue;
      z = { id: newId('z'), name: g.name, color: /batt|drum/i.test(g.name) ? '#F59E0B' : ZONE_COLORS[zonesOf(out).length % ZONE_COLORS.length], x: 0, y: 0, w: 0.2, h: 0.3, dca: g.k, drums: /batt|drum/i.test(g.name) || undefined };
      out = { ...out, zones: [...zonesOf(out), z] };
    } else if (z.dca !== g.k || z.name !== g.name) {
      const id = z.id;
      out = { ...out, zones: zonesOf(out).map((q) => (q.id === id ? { ...q, dca: g.k, name: g.name } : q)) };
      z = zonesOf(out).find((q) => q.id === id)!;
    }
    const zid = z.id;
    const zr = z;
    // un bloc branché bouge avec ce qui est câblé à lui sans prise propre (la basse derrière sa DI)
    const buddies = (oid: string) => touching(out, { o: oid }).map((c) => ('o' in c.a && c.a.o !== oid ? c.a.o : 'o' in c.b && c.b.o !== oid ? c.b.o : '')).filter((id) => { const q = out.objs.find((x) => x.id === id); return q && q.plug === undefined && family(q.kind) !== 'monitor'; });
    const moves = new Map<string, { zone: string | undefined; dx: number; dy: number }>();
    let n = out.objs.filter((q) => q.zone === zid).length;
    for (const o of out.objs) {
      if (o.plug === undefined) continue;
      const inG = g.plugs.includes(o.plug);
      let to: { zone: string | undefined; x: number; y: number } | null = null;
      if (inG && o.zone !== zid) { to = { zone: zid, x: Math.min(0.95, zr.x + 0.05 + (n % 4) * 0.09), y: Math.min(0.9, zr.y + 0.15 + Math.floor(n / 4) * 0.2) }; n++; }
      else if (!inG && o.zone === zid) to = { zone: undefined, x: o.x, y: Math.min(1, zr.y + zr.h + 0.1) };
      if (!to) continue;
      const dx = to.x - o.x;
      const dy = to.y - o.y;
      moves.set(o.id, { zone: to.zone, dx, dy });
      for (const b of buddies(o.id)) if (!moves.has(b)) moves.set(b, { zone: to.zone, dx, dy });
    }
    out = { ...out, objs: out.objs.map((o) => { const m = moves.get(o.id); return m ? { ...o, zone: m.zone, x: Math.max(0, Math.min(1, o.x + m.dx)), y: Math.max(0, Math.min(1, o.y + m.dy)) } : o; }) };
    out = fitZone(out, zid);
  }
  return pruneZones(out);
}
