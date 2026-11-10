// « Ma scène » : la scène vue de dessus. Des objets (instruments, pédalier,
// ampli, micros, DI, retours…) et des câbles jack ou XLR entre eux et jusqu'aux
// prises de la table. Sert de plan de scène et calcule le matériel à emporter.
// Purement descriptif : rien n'est envoyé à la table.

export type Kind =
  | 'musicien' | 'voix' | 'guitare' | 'acoustique' | 'basse' | 'clavier' | 'batterie'
  | 'pedalboard' | 'ampli' | 'micro' | 'di' | 'retour' | 'casque' | 'enceinte';
export type CableType = 'jack' | 'xlr';
export interface StageObj { id: string; kind: Kind; x: number; y: number; name: string }
/** Bout d'un câble : un objet, une entrée de la table (1..18) ou une sortie ('aux1'..'aux6', 'mainL', 'mainR'). */
export type End = { o: string } | { plug: number } | { out: string };
export interface StageCable { id: string; a: End; b: End; type: CableType }
export interface Stage { objs: StageObj[]; cables: StageCable[] }

export const EMPTY: Stage = { objs: [], cables: [] };

export const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'voix', label: 'Voix' },
  { kind: 'guitare', label: 'Guitare élec' },
  { kind: 'acoustique', label: 'Guitare acou' },
  { kind: 'basse', label: 'Basse' },
  { kind: 'clavier', label: 'Clavier' },
  { kind: 'batterie', label: 'Batterie' },
  { kind: 'pedalboard', label: 'Pédalier' },
  { kind: 'ampli', label: 'Ampli' },
  { kind: 'micro', label: 'Micro' },
  { kind: 'di', label: 'Boîte DI' },
  { kind: 'retour', label: 'Retour' },
  { kind: 'casque', label: 'Casque' },
  { kind: 'enceinte', label: 'Enceinte' },
  { kind: 'musicien', label: 'Musicien' },
];
export const kindLabel = (k: Kind) => KINDS.find((x) => x.kind === k)?.label ?? k;

/** Familles (pour les couleurs) : instrument, matériel, micro, retour/diffusion. */
export function family(k: Kind): 'instrument' | 'gear' | 'mic' | 'monitor' | 'person' {
  if (k === 'musicien') return 'person';
  if (k === 'voix' || k === 'micro') return 'mic';
  if (k === 'retour' || k === 'casque' || k === 'enceinte') return 'monitor';
  if (k === 'pedalboard' || k === 'ampli' || k === 'di') return 'gear';
  return 'instrument';
}

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const sameEnd = (a: End, b: End) =>
  ('o' in a && 'o' in b && a.o === b.o) || ('plug' in a && 'plug' in b && a.plug === b.plug) || ('out' in a && 'out' in b && a.out === b.out);

/** Le bon câble par défaut : XLR pour un micro, une DI vers la table, un retour, une sortie ; jack sinon. */
export function smartType(st: Stage, a: End, b: End): CableType {
  const kindOf = (e: End) => ('o' in e ? st.objs.find((x) => x.id === e.o)?.kind : undefined);
  const ka = kindOf(a);
  const kb = kindOf(b);
  if ('out' in a || 'out' in b) return 'xlr';
  const ks = [ka, kb];
  if (ks.some((k) => k === 'voix' || k === 'micro' || k === 'retour' || k === 'enceinte')) return 'xlr';
  if (('plug' in a || 'plug' in b) && ks.some((k) => k === 'di' || k === 'batterie')) return 'xlr';
  return 'jack';
}

export function addCable(st: Stage, a: End, b: End, type?: CableType): Stage {
  if (sameEnd(a, b)) return st;
  if (!('o' in a) && !('o' in b)) return st; // pas de câble de la table à la table
  return { ...st, cables: [...st.cables, { id: newId('c'), a, b, type: type ?? smartType(st, a, b) }] };
}
export const removeCable = (st: Stage, id: string): Stage => ({ ...st, cables: st.cables.filter((c) => c.id !== id) });
export const setCableType = (st: Stage, id: string, type: CableType): Stage => ({ ...st, cables: st.cables.map((c) => (c.id === id ? { ...c, type } : c)) });
export const removeObj = (st: Stage, id: string): Stage => ({
  objs: st.objs.filter((o) => o.id !== id),
  cables: st.cables.filter((c) => !sameEnd(c.a, { o: id }) && !sameEnd(c.b, { o: id })),
});
export const touching = (st: Stage, e: End) => st.cables.filter((c) => sameEnd(c.a, e) || sameEnd(c.b, e));

/** Le matériel à emporter, compté à partir des objets et des câbles. */
export interface Gear { key: string; label: string; n: number }
export function gear(st: Stage): Gear[] {
  const count = (k: Kind) => st.objs.filter((o) => o.kind === k).length;
  const mics = count('micro') + count('voix');
  const list: Gear[] = [
    { key: 'xlr', label: 'Câbles XLR (micro)', n: st.cables.filter((c) => c.type === 'xlr').length },
    { key: 'jack', label: 'Câbles jack', n: st.cables.filter((c) => c.type === 'jack').length },
    { key: 'micros', label: 'Micros', n: mics },
    { key: 'pieds', label: 'Pieds de micro', n: mics },
    { key: 'di', label: 'Boîtes DI', n: count('di') },
    { key: 'pedalboard', label: 'Pédaliers (+ alimentation)', n: count('pedalboard') },
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

// ---------- remplir depuis les voies nommées ----------

/** Devine l'instrument d'après le nom d'une voie. */
export function guessKind(name: string): Kind | 'drum' {
  const n = name.toLowerCase();
  if (/voix|chant|vocal|chœur|choeur|lead/.test(n)) return 'voix';
  if (/acou|folk/.test(n)) return 'acoustique';
  if (/bass/.test(n)) return 'basse';
  if (/guit|gtr/.test(n)) return 'guitare';
  if (/clav|piano|key|synth|orgue/.test(n)) return 'clavier';
  if (/kick|grosse|caisse|snare|charley|hat|tom|overhead|\boh\b|batt|cymb/.test(n)) return 'drum';
  return 'micro';
}

/** Construit une scène de départ : un objet par voie nommée, câblé à sa prise,
 *  et un retour par retour nommé, câblé depuis sa sortie AUX. */
export function fromChannels(chans: { plug: number; name: string }[], buses: { n: number; name: string }[]): Stage {
  let st: Stage = { objs: [], cables: [] };
  const add = (kind: Kind, name: string, x: number, y: number) => {
    const o: StageObj = { id: newId('o'), kind, name, x, y };
    st = { ...st, objs: [...st.objs, o] };
    return o;
  };
  const cols = chans.filter((c) => guessKind(c.name) !== 'drum');
  const drums = chans.filter((c) => guessKind(c.name) === 'drum');
  const slots = cols.length + (drums.length ? 1 : 0);
  let col = 0;
  const xAt = (k: number) => 0.08 + (slots <= 1 ? 0.42 : (k / Math.max(1, slots - 1)) * 0.84);
  for (const c of cols) {
    const x = xAt(col++);
    const kind = guessKind(c.name) as Kind;
    if (kind === 'guitare') {
      const g = add('guitare', c.name, x, 0.54);
      const p = add('pedalboard', 'Pédalier', x, 0.76);
      const a = add('ampli', 'Ampli', x, 0.06);
      const m = add('micro', 'Micro ampli', x + 0.07, 0.28);
      st = addCable(st, { o: g.id }, { o: p.id }, 'jack');
      st = addCable(st, { o: p.id }, { o: a.id }, 'jack');
      st = addCable(st, { o: m.id }, { plug: c.plug }, 'xlr');
    } else if (kind === 'basse' || kind === 'acoustique' || kind === 'clavier') {
      const i = add(kind, c.name, x, 0.5);
      const d = add('di', 'DI', x, 0.74);
      st = addCable(st, { o: i.id }, { o: d.id }, 'jack');
      st = addCable(st, { o: d.id }, { plug: c.plug }, 'xlr');
    } else {
      const v = add(kind, c.name, x, 0.5);
      st = addCable(st, { o: v.id }, { plug: c.plug }, 'xlr');
    }
  }
  if (drums.length) {
    const x = Math.max(0.1, Math.min(0.9, xAt(col)));
    add('batterie', 'Batterie', x, 0.08);
    drums.forEach((d, k) => {
      const m = add('micro', d.name, x - 0.09 + (k % 3) * 0.09, 0.32 + Math.floor(k / 3) * 0.22);
      st = addCable(st, { o: m.id }, { plug: d.plug }, 'xlr');
    });
  }
  buses.forEach((b, k) => {
    const r = add('retour', b.name, buses.length === 1 ? 0.5 : 0.12 + (k / (buses.length - 1)) * 0.76, 0.97);
    st = addCable(st, { out: `aux${b.n}` }, { o: r.id }, 'xlr');
  });
  return st;
}
