// « Ma scène » vue de dessus, en plein écran :
//  - à gauche la palette (instruments, batterie, matériel, retours, cadre musicien)
//  - au centre la scène : des cadres (un par musicien, un pour la batterie) qu'on
//    déplace d'un bloc avec tout leur contenu, des blocs qu'on déplace, des câbles
//    jack ou XLR qu'on tire au doigt ; les câbles d'un cadre se regroupent en faisceau
//  - en bas la table (entrées, retours) ; « À emporter » en pastille dans le coin.
// Lié à la table : les voies nommées arrivent toutes seules, câblées à leur prise.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Segmented } from '../ui/kit';
import { Theme } from '../ui/theme';
import { showTip } from '../ui/tip';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath, insrcPath, insrcPlug } from '../xair/addresses';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import {
  addCable, CableType, dropInZone, DRUM_PIECES, EMPTY, End, endLabel, family, Family, fromChannels, gear, isTableEnd, Kind, kindLabel, kindShort, KINDS,
  membersOf, moveZone, newId, removeCable, removeObj, sameEnd, setCableType, Stage, stageText, StageObj, syncWithTable, touching, Zone, ZONE_COLORS,
  zoneAt, zonesOf, zoneTableCables,
} from '../store/stage';
import { MIX_COLORS } from './MixPicker';

const W = 1000;
const R = 24;
const OUTS = ['aux1', 'aux2', 'aux3', 'aux4', 'aux5', 'aux6', 'mainL', 'mainR'];
const plugX = (n: number) => 70 + (n - 1) * 29;
const outX = (id: string) => { const k = OUTS.indexOf(id); return k < 6 ? 640 + k * 42 : 910 + (k - 6) * 42; };
const FAM: Record<Family, string> = { instrument: '#FBBF24', drum: '#F59E0B', gear: '#94A3B8', mic: '#F472B6', monitor: '#34D399', person: '#60A5FA' };
const JACK = '#60A5FA';
const XLR = '#E5E7EB';

/** Dessin d'un bloc, centré en (x, y), dans un rond d'environ 22 de rayon. */
export function KindIcon({ kind, x, y, c, s = 1 }: { kind: Kind; x: number; y: number; c: string; s?: number }) {
  const st = { stroke: c, strokeWidth: 2.4 / s, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const ci = { ...st, strokeWidth: 2.4 };
  const P = (d: string) => <Path d={d} {...st} transform={`translate(${x} ${y}) scale(${s})`} />;
  const C = (dx: number, dy: number, r: number) => <Circle cx={x + dx * s} cy={y + dy * s} r={r * s} {...ci} />;
  switch (kind) {
    case 'voix': case 'choeur': return <G>{P('M-5 -12 a5 5 0 0 1 10 0 v8 a5 5 0 0 1 -10 0 z')}{P('M-9 -4 a9 9 0 0 0 18 0 M0 5 v9 M-6 14 h12')}{kind === 'choeur' && P('M10 -12 v8 M-10 -12 v8')}</G>;
    case 'micro': case 'overhead': return <G>{C(0, -8, 4)}{P('M0 -4 v18 M-8 14 h16')}{kind === 'overhead' && P('M-12 -14 l6 4 M12 -14 l-6 4')}</G>;
    case 'guitare': return <G>{P('M-3 2 a8 8 0 1 0 6 0 a6 6 0 1 0 -6 0 z')}{P('M0 -2 l6 -12 M4 -16 l4 2')}</G>;
    case 'acoustique': case 'ukulele': case 'mandoline': return <G>{P('M-4 4 a9 9 0 1 0 8 0 a7 7 0 1 0 -8 0 z')}{C(0, 6, 2.5)}{P('M0 -2 v-14')}</G>;
    case 'basse': case 'contrebasse': return <G>{P('M-4 3 a8 9 0 1 0 8 0 a6 7 0 1 0 -8 0 z')}{P('M0 -2 v-15 M-3 -17 h6')}</G>;
    case 'violon': case 'violoncelle': return <G>{P('M-5 -6 a5 5 0 0 1 10 0 a4 4 0 0 0 0 6 a6 6 0 0 1 -10 0 a4 4 0 0 0 0 -6 z')}{P('M0 -6 v-10 M-12 10 l24 -18')}</G>;
    case 'clavier': case 'synthe': case 'piano': return <G>{P('M-15 -7 h30 v14 h-30 z')}{P('M-9 -7 v8 M-3 -7 v8 M3 -7 v8 M9 -7 v8')}</G>;
    case 'sax': return <G>{P('M4 -15 v18 a6 6 0 0 1 -12 0 v-3 M4 -15 l-5 -2')}</G>;
    case 'trompette': case 'trombone': return <G>{P('M-15 0 h18 M3 -5 l12 -5 v20 l-12 -5 z M-8 0 v-6 M-3 0 v-6')}</G>;
    case 'batterie': return <G>{C(-8, 4, 7)}{C(8, -6, 5)}{C(9, 8, 5)}</G>;
    case 'kick': return <G>{C(0, 0, 13)}{C(0, 0, 5)}</G>;
    case 'snare': return <G>{C(0, 0, 11)}{P('M-8 -3 h16 M-8 3 h16')}</G>;
    case 'hihat': return <G><Ellipse cx={x} cy={y - 3 * s} rx={13 * s} ry={4 * s} {...ci} /><Ellipse cx={x} cy={y + 4 * s} rx={13 * s} ry={4 * s} {...ci} /></G>;
    case 'tom': case 'floortom': return <G>{C(0, 0, kind === 'floortom' ? 12 : 9)}{C(0, 0, 2)}</G>;
    case 'ride': case 'crash': return <G>{C(0, 0, 12)}{P('M-6 -6 l12 12 M6 -6 l-12 12')}</G>;
    case 'pedalboard': return <G>{P('M-15 -8 h30 v16 h-30 z')}{C(-8, 0, 2.5)}{C(0, 0, 2.5)}{C(8, 0, 2.5)}</G>;
    case 'ampli': return <G>{P('M-14 -12 h28 v24 h-28 z')}{C(0, 2, 6)}{P('M-9 -8 h4')}</G>;
    case 'di': return <G>{P('M-11 -8 h22 v16 h-22 z')}<SvgText x={x} y={y + 4 * s} textAnchor="middle" fontSize={9 * s} fontWeight="900" fill={c}>DI</SvgText></G>;
    case 'retour': return <G>{P('M-14 6 l5 -14 h18 l5 14 z')}{C(0, -2, 4)}</G>;
    case 'casque': return <G>{P('M-11 4 v-4 a11 11 0 0 1 22 0 v4')}{P('M-14 2 h5 v10 h-5 z M9 2 h5 v10 h-5 z')}</G>;
    case 'enceinte': return <G>{P('M-10 -14 h20 v28 h-20 z')}{C(0, 4, 5)}{C(0, -8, 2)}</G>;
    case 'musicien': return <G>{C(0, -6, 6)}{P('M-11 13 a11 11 0 0 1 22 0')}</G>;
    default: return <SvgText x={x} y={y + 5 * s} textAnchor="middle" fontSize={14 * s} fontWeight="900" fill={c}>{kindShort(kind)}</SvgText>;
  }
}

type Sel = { obj: string } | { zone: string } | { end: End } | { gear: true } | null;
type DragKind = 'obj' | 'zone' | 'resize' | 'wire';
type Drag = { kind: DragKind; from?: End; id?: string; x: number; y: number; x0: number; y0: number; moved: boolean; start?: { x: number; y: number; w?: number; h?: number } } | null;
const PALETTE: { title: string; kinds: Kind[] }[] = [
  { title: 'Voix', kinds: ['voix', 'choeur'] },
  { title: 'Instruments', kinds: ['guitare', 'acoustique', 'basse', 'contrebasse', 'clavier', 'piano', 'synthe', 'violon', 'violoncelle', 'sax', 'trompette', 'trombone', 'flute', 'accordeon', 'harmonica', 'ukulele', 'mandoline', 'cajon', 'percu', 'ordi', 'autre'] },
  { title: 'Batterie', kinds: DRUM_PIECES },
  { title: 'Matériel', kinds: ['pedalboard', 'ampli', 'micro', 'di'] },
  { title: 'Retours', kinds: ['retour', 'casque', 'enceinte'] },
];

export function StageEditor({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [st, setSt] = useState<Stage>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'move' | 'wire'>('move');
  const [ctype, setCtype] = useState<'auto' | CableType>('auto');
  const [sel, setSel] = useState<Sel>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const svgRef = useRef<Svg | null>(null);

  // ---- la table : noms des voies et des retours
  const busName = (n: number) => String(client.get(busNamePath(n)) ?? '') || `Retour ${n}`;
  const tableChans = () => {
    const out: { plug: number; name: string }[] = [];
    for (let c = 1; c <= CH_COUNT; c++) {
      const nm = String(client.get(chNamePath(c)) ?? '').trim();
      if (nm) out.push({ plug: insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)), name: nm });
    }
    return out;
  };
  const tableBuses = () => Array.from({ length: BUS_COUNT }, (_, k) => ({ n: k + 1, name: String(client.get(busNamePath(k + 1)) ?? '').trim() })).filter((b) => b.name);
  const plugName = (n: number) => tableChans().find((c) => c.plug === n)?.name ?? '';

  useEffect(() => {
    const paths = [...Array.from({ length: CH_COUNT }, (_, k) => chNamePath(k + 1)), ...Array.from({ length: CH_COUNT }, (_, k) => insrcPath(k + 1)), ...Array.from({ length: BUS_COUNT }, (_, k) => busNamePath(k + 1))];
    Promise.all([load<Stage>('scene', EMPTY), client.loadPaths(paths).catch(() => {})]).then(([s]) => {
      let cur = s ?? EMPTY;
      // plan lié à la table : les pistes déjà occupées arrivent toutes seules, câblées
      if (!cur.free) {
        if (!cur.objs.length) { const ch = tableChans(); if (ch.length) cur = fromChannels(ch, tableBuses()); }
        else cur = syncWithTable(cur, tableChans()).st;
      }
      setSt(cur);
      setLoaded(true);
    });
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) save('scene', st); }, [st, loaded]);

  // ---- géométrie : la scène prend toute la place disponible
  const H = size.w ? Math.max(520, Math.min(1000, Math.round((W * size.h) / size.w))) : 600;
  const sc = size.w && size.h ? Math.min(size.w / W, size.h / H) : 0;
  const STAGE_H = H - 112;
  const PORT_Y = H - 62;
  const SY = STAGE_H - 64;
  const px = (x: number) => 30 + x * 940;
  const py = (y: number) => 30 + y * SY;
  const fx = (X: number) => (X - 30) / 940;
  const fy = (Y: number) => (Y - 30) / SY;
  const zoneRect = (z: Zone) => ({ x1: px(z.x), y1: py(z.y), x2: px(z.x + z.w), y2: py(z.y + z.h) });
  const objPos = (o: StageObj) => ({ x: px(o.x), y: py(o.y) });
  const posOf = (e: End) => {
    if ('plug' in e) return { x: plugX(e.plug), y: PORT_Y };
    if ('out' in e) return { x: outX(e.out), y: PORT_Y };
    const o = st.objs.find((q) => q.id === e.o);
    return o ? objPos(o) : { x: 0, y: 0 };
  };

  // ---- faisceaux : câbles cachés et gros câble à dessiner
  const bundles = useMemo(() => zonesOf(st).filter((z) => z.bundled).map((z) => ({ z, cables: zoneTableCables(st, z.id) })).filter((b) => b.cables.length > 1), [st]);
  const hiddenCable = useMemo(() => new Set(bundles.flatMap((b) => b.cables.map((c) => c.id))), [bundles]);
  const selObj = sel && 'obj' in sel ? st.objs.find((o) => o.id === sel.obj) ?? null : null;
  const selZone = sel && 'zone' in sel ? zonesOf(st).find((z) => z.id === sel.zone) ?? null : null;
  const selEnd: End | null = selObj ? { o: selObj.id } : sel && 'end' in sel ? sel.end : null;
  const selCables = selEnd ? touching(st, selEnd) : selZone ? st.cables.filter((c) => membersOf(st, selZone.id).some((o) => sameEnd(c.a, { o: o.id }) || sameEnd(c.b, { o: o.id }))) : [];
  const selIds = new Set(selCables.map((c) => c.id));

  const cablePath = (c: { a: End; b: End }, k: number) => {
    const a = posOf(c.a);
    const b = posOf(c.b);
    if (isTableEnd(c.a) !== isTableEnd(c.b)) {
      const obj = isTableEnd(c.a) ? b : a;
      const port = isTableEnd(c.a) ? a : b;
      const x = obj.x + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 7 : 0);
      const y0 = STAGE_H + 4;
      return { d: `M${obj.x} ${obj.y} L${x} ${obj.y + R} L${x} ${y0} C ${x} ${y0 + 22}, ${port.x} ${port.y - 40}, ${port.x} ${port.y - 12}`, mid: { x, y: Math.min(STAGE_H - 14, obj.y + R + 30) } };
    }
    const my = (a.y + b.y) / 2;
    const ox = k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 18 : 0;
    return { d: `M${a.x} ${a.y} C ${a.x + ox} ${my}, ${b.x + ox} ${my}, ${b.x} ${b.y}`, mid: { x: (a.x + b.x) / 2 + ox * 0.75, y: my } };
  };
  const cableIdx = useMemo(() => {
    const per = new Map<string, number>();
    const out: Record<string, number> = {};
    for (const c of st.cables) {
      const key = isTableEnd(c.a) !== isTableEnd(c.b) ? 'o' + ('o' in c.a ? c.a.o : (c.b as { o: string }).o) : [JSON.stringify(c.a), JSON.stringify(c.b)].sort().join('|');
      const n = per.get(key) ?? 0;
      out[c.id] = n;
      per.set(key, n + 1);
    }
    return out;
  }, [st.cables]);
  // pastilles Jack / XLR des câbles de la sélection (on touche pour changer)
  const pills = st.cables.filter((c) => selIds.has(c.id) && !hiddenCable.has(c.id)).map((c) => ({ id: c.id, type: c.type, ...cablePath(c, cableIdx[c.id] ?? 0).mid }));

  // ---- qu'y a-t-il sous le doigt ?
  type Hit = { t: 'obj'; id: string } | { t: 'zone'; id: string } | { t: 'resize'; id: string } | { t: 'bundle'; id: string } | { t: 'pill'; id: string } | { t: 'end'; e: End } | null;
  const hit = (x: number, y: number): Hit => {
    for (const p of pills) if (Math.abs(x - p.x) < 24 && Math.abs(y - p.y) < 14) return { t: 'pill', id: p.id };
    for (let k = st.objs.length - 1; k >= 0; k--) { const o = st.objs[k]; const p = objPos(o); if (Math.hypot(x - p.x, y - p.y) < R + 8) return { t: 'obj', id: o.id }; }
    for (const z of zonesOf(st)) {
      const r = zoneRect(z);
      if (Math.hypot(x - r.x2, y - r.y2) < 22) return { t: 'resize', id: z.id };
      const n = zoneTableCables(st, z.id).length;
      if (n > 1 && Math.abs(x - (r.x1 + r.x2) / 2) < 80 && Math.abs(y - r.y2) < 16) return { t: 'bundle', id: z.id };
      if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y1 + 28) return { t: 'zone', id: z.id };
    }
    if (Math.abs(y - PORT_Y) < 22) {
      for (let n = 1; n <= 18; n++) if (Math.abs(x - plugX(n)) < 14) return { t: 'end', e: { plug: n } };
      for (const id of OUTS) if (Math.abs(x - outX(id)) < 19) return { t: 'end', e: { out: id } };
    }
    return null;
  };
  const endOfHit = (h: Hit): End | null => (!h ? null : h.t === 'obj' ? { o: h.id } : h.t === 'end' ? h.e : null);

  // ---- gestes
  const latest = useRef({ sc, st, mode, ctype, hit, sel, fx, fy, SY });
  latest.current = { sc, st, mode, ctype, hit, sel, fx, fy, SY };
  const dref = useRef<Drag>(null);
  const putDrag = (d: Drag) => { dref.current = d; setDrag(d); };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const L = latest.current;
        const s = L.sc || 1;
        const x = e.nativeEvent.locationX / s;
        const y = e.nativeEvent.locationY / s;
        const h = L.hit(x, y);
        const base = { x, y, x0: x, y0: y, moved: false };
        if (!h) { putDrag(null); return; }
        if (h.t === 'pill' || h.t === 'bundle') { putDrag({ ...base, kind: 'obj', id: h.t + ':' + h.id }); return; }
        if (h.t === 'zone') { const z = zonesOf(L.st).find((q) => q.id === h.id)!; putDrag({ ...base, kind: 'zone', id: h.id, start: { x: z.x, y: z.y } }); return; }
        if (h.t === 'resize') { const z = zonesOf(L.st).find((q) => q.id === h.id)!; putDrag({ ...base, kind: 'resize', id: h.id, start: { x: z.x, y: z.y, w: z.w, h: z.h } }); return; }
        const end = endOfHit(h)!;
        if (L.mode === 'wire') { putDrag({ ...base, kind: 'wire', from: end }); return; }
        if (h.t === 'obj') { const o = L.st.objs.find((q) => q.id === h.id)!; putDrag({ ...base, kind: 'obj', id: h.id, from: end, start: { x: o.x, y: o.y } }); return; }
        putDrag({ ...base, kind: 'wire', from: end }); // une prise : on ne la déplace pas, on câble depuis elle
      },
      onPanResponderMove: (e, g) => {
        const L = latest.current;
        const d = dref.current;
        if (!d) return;
        const s = L.sc || 1;
        const moved = d.moved || Math.abs(g.dx) + Math.abs(g.dy) > 8;
        const dx = g.dx / s / 940;
        const dy = g.dy / s / L.SY;
        if (moved && d.start && d.id && !d.id.includes(':')) {
          const id = d.id;
          const s0 = d.start;
          if (d.kind === 'obj') setSt((cur) => ({ ...cur, objs: cur.objs.map((q) => (q.id === id ? { ...q, x: Math.max(0, Math.min(1, s0.x + dx)), y: Math.max(0, Math.min(1, s0.y + dy)) } : q)) }));
          if (d.kind === 'zone') setSt((cur) => { const z = zonesOf(cur).find((q) => q.id === id)!; return moveZone(cur, id, s0.x + dx - z.x, s0.y + dy - z.y); });
          if (d.kind === 'resize') setSt((cur) => ({ ...cur, zones: zonesOf(cur).map((q) => (q.id === id ? { ...q, w: Math.max(0.08, Math.min(1 - q.x, (s0.w ?? 0.2) + dx)), h: Math.max(0.12, Math.min(1 - q.y, (s0.h ?? 0.3) + dy)) } : q)) }));
        }
        putDrag({ ...d, x: e.nativeEvent.locationX / s, y: e.nativeEvent.locationY / s, moved });
      },
      onPanResponderRelease: (e) => {
        const L = latest.current;
        const d = dref.current;
        putDrag(null);
        if (!d) { setSel(null); return; }
        const s = L.sc || 1;
        const h = L.hit(e.nativeEvent.locationX / s, e.nativeEvent.locationY / s);
        if (d.id?.startsWith('pill:')) { const id = d.id.slice(5); setSt((cur) => setCableType(cur, id, cur.cables.find((c) => c.id === id)?.type === 'xlr' ? 'jack' : 'xlr')); return; }
        if (d.id?.startsWith('bundle:')) { const id = d.id.slice(7); setSt((cur) => ({ ...cur, zones: zonesOf(cur).map((z) => (z.id === id ? { ...z, bundled: !z.bundled } : z)) })); return; }
        if (!d.moved) {
          const next: Sel = d.kind === 'zone' || d.kind === 'resize' ? { zone: d.id! } : d.from && 'o' in d.from ? { obj: d.from.o } : d.from ? { end: d.from } : null;
          setSel((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? null : next));
          return;
        }
        if (d.kind === 'wire' && d.from) {
          const to = endOfHit(h);
          if (to && !sameEnd(to, d.from)) { const ty = L.ctype === 'auto' ? undefined : L.ctype; const from = d.from; setSt((cur) => addCable(cur, from, to, ty)); setSel('o' in d.from ? { obj: d.from.o } : { end: d.from }); }
          return;
        }
        if (d.kind === 'obj' && d.id) { const id = d.id; setSt((cur) => dropInZone(cur, id)); setSel({ obj: id }); }
        if (d.kind === 'zone' || d.kind === 'resize') setSel({ zone: d.id! });
      },
      onPanResponderTerminate: () => putDrag(null),
    }),
  ).current;

  // ---- actions
  const addObj = (kind: Kind) => {
    const z = selZone ?? (selObj?.zone ? zonesOf(st).find((q) => q.id === selObj.zone) : undefined);
    const n = z ? membersOf(st, z.id).length : st.objs.length;
    const x = z ? z.x + 0.04 + ((n * 0.07) % Math.max(0.05, z.w - 0.08)) : 0.3 + ((n * 0.09) % 0.4);
    const y = z ? z.y + 0.12 + Math.floor((n * 0.07) / Math.max(0.05, z.w - 0.08)) * 0.18 : 0.3 + ((n * 0.13) % 0.4);
    const o: StageObj = { id: newId('o'), kind, name: kind === 'autre' ? 'Instrument' : kindLabel(kind), x: Math.min(1, x), y: Math.min(1, y), zone: z?.id };
    setSt({ ...st, objs: [...st.objs, o] });
    setSel({ obj: o.id });
  };
  const addZone = () => {
    const k = zonesOf(st).length;
    const z: Zone = { id: newId('z'), name: 'Musicien', color: ZONE_COLORS[k % ZONE_COLORS.length], x: 0.3, y: 0.15, w: 0.22, h: 0.5 };
    setSt({ ...st, zones: [...zonesOf(st), z] });
    setSel({ zone: z.id });
  };
  const redo = () => {
    const ch = tableChans();
    if (!ch.length) { Alert.alert('Aucune voie nommée', 'Nomme d’abord tes voies (Table › touche un nom), ou pose les blocs à la main.'); return; }
    Alert.alert('Refaire d’après la table ?', 'La scène est remplacée par une scène faite d’après tes voies et tes retours.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Refaire', onPress: () => { setSt({ ...fromChannels(ch, tableBuses()), free: st.free }); setSel(null); } }]);
  };
  const more = () => Alert.alert('Ma scène', '', [
    { text: 'Refaire d’après la table', onPress: redo },
    { text: 'Tout effacer', style: 'destructive', onPress: () => Alert.alert('Effacer la scène ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Effacer', style: 'destructive', onPress: () => { setSt({ ...EMPTY, free: true }); setSel(null); } }]) },
    { text: 'Fermer', style: 'cancel' },
  ]);
  const shareText = () => Share.share({ message: `${stageText(st, busName)}\n\nFait avec Ma table`, title: 'Ma scène' });
  const shareImage = () => {
    const ref = svgRef.current as unknown as { toDataURL?: (cb: (b64: string) => void) => void } | null;
    if (!ref?.toDataURL) { shareText(); return; }
    ref.toDataURL(async (b64) => {
      try {
        const { File, Paths } = await import('expo-file-system');
        const Sharing = await import('expo-sharing');
        const f = new File(Paths.cache, `ma-scene-${new Date().toISOString().slice(0, 10)}.png`);
        f.create({ overwrite: true });
        f.writeSync(b64, { encoding: 'base64' });
        await Sharing.shareAsync(f.uri, { mimeType: 'image/png', dialogTitle: 'Plan de scène' });
      } catch { shareText(); }
    });
  };
  const exportMenu = () => Alert.alert('Exporter la scène', 'Pour l’envoyer au groupe ou à la salle.', [
    { text: 'Image du plan', onPress: shareImage },
    { text: 'Texte (câbles + matériel)', onPress: shareText },
    { text: 'Annuler', style: 'cancel' },
  ]);
  const toggleFree = () => {
    if (st.free) { const r = syncWithTable({ ...st, free: false }, tableChans()); setSt(r.st); if (r.added) showTip(`${r.added} piste${r.added > 1 ? 's' : ''} de la table ajoutée${r.added > 1 ? 's' : ''} au plan, câblée${r.added > 1 ? 's' : ''} à leur prise.`); }
    else setSt({ ...st, free: true });
  };

  const Cable = ({ d, type, dim, dash }: { d: string; type: CableType; dim?: boolean; dash?: boolean }) => (
    <G opacity={dim ? 0.22 : 1}>
      {type === 'xlr' ? <>
        <Path d={d} fill="none" stroke="#0B0D10" strokeWidth={8} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
        <Path d={d} fill="none" stroke={XLR} strokeWidth={4} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
      </> : <Path d={d} fill="none" stroke={JACK} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={dash ? '12 10' : undefined} />}
    </G>
  );
  const anySel = !!sel && !('gear' in (sel as object));
  const g = gear(st);
  const xlrN = g.find((x) => x.key === 'xlr')?.n ?? 0;
  const jackN = g.find((x) => x.key === 'jack')?.n ?? 0;
  const hov = drag && drag.moved && drag.kind === 'wire' ? endOfHit(hit(drag.x, drag.y)) : null;

  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingBottom: 8 }}>
      {/* palette */}
      <View style={[styles.palette, { backgroundColor: theme.panel, borderColor: theme.line }]}>
        <ScrollView contentContainerStyle={{ gap: 4, paddingVertical: 6, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
          <Pressable onPress={addZone} onLongPress={() => showTip('Un cadre par musicien : tu y ranges ses blocs, et le cadre se déplace d’un coup avec tout son contenu.')} style={[styles.pal, { borderColor: theme.accent, borderStyle: 'dashed' }]}>
            <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '900' }}>▢</Text>
            <Text style={[styles.palT, { color: theme.accent }]}>Cadre</Text>
          </Pressable>
          {PALETTE.map((sec) => (
            <React.Fragment key={sec.title}>
              <Text style={{ color: theme.muted, fontSize: 9, fontWeight: '900', marginTop: 6 }}>{sec.title.toUpperCase()}</Text>
              {sec.kinds.map((k) => (
                <Pressable key={k} onPress={() => addObj(k)} onLongPress={() => showTip(`Ajoute ${kindLabel(k).toLowerCase()}${selZone ? ` dans « ${selZone.name} »` : ''}, puis fais-le glisser à sa place.`)} style={[styles.pal, { borderColor: theme.line2 }]}>
                  <Svg width={30} height={30} viewBox="0 0 30 30"><KindIcon kind={k} x={15} y={15} c={FAM[family(k)]} s={0.62} /></Svg>
                  <Text numberOfLines={1} style={[styles.palT, { color: theme.text }]}>{kindLabel(k).replace('Guitare ', 'Guit. ')}</Text>
                </Pressable>
              ))}
            </React.Fragment>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {/* barre d'outils, une ligne */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Segmented theme={theme} value={mode} onChange={setMode} options={[['move', '✋ Déplacer'], ['wire', '🔌 Câbler']] as const} />
          {mode === 'wire' && <Segmented theme={theme} value={ctype} onChange={setCtype} options={[['auto', 'Auto'], ['jack', 'Jack'], ['xlr', 'XLR']] as const} />}
          <Text style={{ flex: 1, color: theme.muted, fontSize: 12 }} numberOfLines={2}>
            {mode === 'wire' ? 'Glisse d’un bloc à un autre, ou jusqu’à une prise.' : 'Glisse un bloc, ou le haut d’un cadre pour tout déplacer. Coin du cadre = taille.'}
          </Text>
          <Pressable onPress={toggleFree} onLongPress={() => showTip('Lié à la table : les voies nommées arrivent toutes seules sur le plan, câblées à leur prise. Plan libre : tu dessines sans tenir compte de la table (autre salle, autre groupe).')} style={[styles.tool, st.free ? { borderColor: theme.line2 } : { borderColor: '#34D399', backgroundColor: '#13261E' }]}>
            <Text style={{ color: st.free ? theme.text : '#6EE7B7', fontWeight: '800', fontSize: 12 }}>{st.free ? '○ Plan libre' : '● Lié à la table'}</Text>
          </Pressable>
          <Pressable onPress={() => setSel(sel && 'gear' in sel ? null : { gear: true })} style={[styles.tool, { borderColor: theme.accent }]}>
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 12 }}>🎒 {xlrN} XLR · {jackN} jack</Text>
          </Pressable>
          <Pressable onPress={exportMenu} style={[styles.tool, { borderColor: theme.accent, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 12 }}>↗ Exporter</Text></Pressable>
          <Pressable onPress={more} accessibilityLabel="Plus" style={[styles.tool, { borderColor: theme.line2, paddingHorizontal: 12 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }}>⋯</Text></Pressable>
        </View>

        {/* la scène */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {sc > 0 && (
            <View style={{ width: W * sc, height: H * sc }}>
              <Svg ref={svgRef} width={W * sc} height={H * sc} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
                <Rect x={0} y={0} width={W} height={H} fill="#111317" />
                <Rect x={4} y={4} width={W - 8} height={STAGE_H} rx={22} fill="#16191E" stroke="#2A3038" strokeWidth={2} />
                {[...Array(9)].map((_, k) => <Line key={k} x1={4 + (k + 1) * 99} y1={6} x2={4 + (k + 1) * 99} y2={STAGE_H + 2} stroke="#1B1F25" strokeWidth={2} />)}
                <SvgText x={20} y={24} fontSize={12} fill="#4B525C" fontWeight="700">FOND DE SCÈNE</SvgText>
                <SvgText x={W - 22} y={STAGE_H - 8} textAnchor="end" fontSize={12} fill="#4B525C" fontWeight="700">▼ PUBLIC</SvgText>
                {/* cadres */}
                {zonesOf(st).map((z) => {
                  const r = zoneRect(z);
                  const on = selZone?.id === z.id;
                  const n = zoneTableCables(st, z.id).length;
                  return (
                    <G key={z.id}>
                      <Rect x={r.x1} y={r.y1} width={r.x2 - r.x1} height={r.y2 - r.y1} rx={16} fill={z.color} fillOpacity={on ? 0.1 : 0.05} stroke={z.color} strokeWidth={on ? 3 : 2} strokeDasharray={on ? undefined : '8 6'} />
                      <Rect x={r.x1} y={r.y1} width={Math.min(r.x2 - r.x1, 24 + z.name.length * 8 + (z.drums ? 72 : 0))} height={26} rx={12} fill={z.color} fillOpacity={0.9} />
                      <SvgText x={r.x1 + 12} y={r.y1 + 18} fontSize={13} fontWeight="900" fill="#0B0D10">{`${z.name}${z.drums ? ` · ${membersOf(st, z.id).length} él.` : ''}`}</SvgText>
                      <Path d={`M${r.x2 - 16} ${r.y2 - 4} L${r.x2 - 4} ${r.y2 - 4} L${r.x2 - 4} ${r.y2 - 16}`} stroke={z.color} strokeWidth={3} fill="none" strokeLinecap="round" />
                      {n > 1 && (
                        <G>
                          <Rect x={(r.x1 + r.x2) / 2 - 76} y={r.y2 - 13} width={152} height={26} rx={13} fill={z.bundled ? z.color : '#0B0D10'} stroke={z.color} strokeWidth={2} />
                          <SvgText x={(r.x1 + r.x2) / 2} y={r.y2 + 5} textAnchor="middle" fontSize={12} fontWeight="900" fill={z.bundled ? '#0B0D10' : z.color}>{z.bundled ? `⇊ Faisceau · ${n}` : `⇈ Regrouper ${n} câbles`}</SvgText>
                        </G>
                      )}
                    </G>
                  );
                })}
                {/* la table */}
                <Rect x={14} y={STAGE_H + 12} width={W - 28} height={H - STAGE_H - 18} rx={14} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
                {Array.from({ length: 18 }, (_, k) => k + 1).map((n) => {
                  const used = touching(st, { plug: n }).length > 0;
                  const on = !!selEnd && 'plug' in selEnd && selEnd.plug === n;
                  return (
                    <G key={n}>
                      <Circle cx={plugX(n)} cy={PORT_Y} r={11} fill="#0B0D10" stroke={on ? '#FFFFFF' : used ? '#E8EAED' : '#3A414B'} strokeWidth={on ? 4 : 2} />
                      <Circle cx={plugX(n)} cy={PORT_Y} r={4} fill={used ? '#E8EAED' : '#2A3038'} />
                      <SvgText x={plugX(n)} y={PORT_Y + 27} textAnchor="middle" fontSize={11} fontWeight="800" fill={used ? '#E8EAED' : '#5B636D'}>{String(n)}</SvgText>
                    </G>
                  );
                })}
                <SvgText x={plugX(1) - 16} y={PORT_Y + 4} textAnchor="end" fontSize={11} fontWeight="800" fill="#9AA3AD">IN</SvgText>
                {OUTS.map((id, k) => {
                  const used = touching(st, { out: id }).length > 0;
                  const on = !!selEnd && 'out' in selEnd && selEnd.out === id;
                  const c = k < 6 ? MIX_COLORS[k + 1] : MIX_COLORS[0];
                  return (
                    <G key={id}>
                      <Circle cx={outX(id)} cy={PORT_Y} r={13} fill="#0B0D10" stroke={on ? '#FFFFFF' : c} strokeWidth={on ? 4 : 2.5} />
                      <Circle cx={outX(id)} cy={PORT_Y} r={5} fill={used ? c : '#2A3038'} />
                      <SvgText x={outX(id)} y={PORT_Y + 29} textAnchor="middle" fontSize={10} fontWeight="800" fill={c}>{k < 6 ? `AUX${k + 1}` : id === 'mainL' ? 'MAIN L' : 'MAIN R'}</SvgText>
                    </G>
                  );
                })}
                {/* câbles */}
                {st.cables.filter((c) => !hiddenCable.has(c.id)).map((c) => <Cable key={c.id} d={cablePath(c, cableIdx[c.id] ?? 0).d} type={c.type} dim={anySel && !selIds.has(c.id)} />)}
                {/* faisceaux : un gros câble par cadre, jusqu'à ses prises */}
                {bundles.map(({ z, cables }) => {
                  const r = zoneRect(z);
                  const ports = cables.map((c) => posOf(isTableEnd(c.a) ? c.a : c.b).x);
                  const lo = Math.min(...ports);
                  const hi = Math.max(...ports);
                  const ax = (r.x1 + r.x2) / 2;
                  const y0 = STAGE_H + 4;
                  const yb = PORT_Y - 22;
                  return (
                    <G key={'b' + z.id} opacity={anySel && selZone?.id !== z.id ? 0.35 : 1}>
                      <Path d={`M${ax} ${r.y2 + 13} L${ax} ${y0} C ${ax} ${y0 + 18}, ${(lo + hi) / 2} ${yb - 16}, ${(lo + hi) / 2} ${yb}`} stroke="#0B0D10" strokeWidth={16} fill="none" strokeLinecap="round" />
                      <Path d={`M${ax} ${r.y2 + 13} L${ax} ${y0} C ${ax} ${y0 + 18}, ${(lo + hi) / 2} ${yb - 16}, ${(lo + hi) / 2} ${yb}`} stroke={z.color} strokeWidth={11} fill="none" strokeLinecap="round" />
                      <Line x1={lo} y1={yb} x2={hi} y2={yb} stroke={z.color} strokeWidth={6} strokeLinecap="round" />
                      {ports.map((x, k) => <Line key={k} x1={x} y1={yb} x2={x} y2={PORT_Y - 11} stroke={z.color} strokeWidth={3} />)}
                    </G>
                  );
                })}
                {/* câble en train d'être tiré */}
                {drag && drag.moved && drag.kind === 'wire' && drag.from && (() => {
                  const a = posOf(drag.from);
                  const ok = !!hov && !sameEnd(hov, drag.from);
                  const b = ok ? posOf(hov!) : { x: drag.x, y: drag.y };
                  const ty: CableType = ctype !== 'auto' ? ctype : ok ? addCable(st, drag.from, hov!).cables.slice(-1)[0]?.type ?? 'jack' : 'jack';
                  return (
                    <G>
                      {ok && <Circle cx={b.x} cy={b.y} r={'o' in hov! ? R + 12 : 20} fill="rgba(52,211,153,0.22)" stroke="#34D399" strokeWidth={4} />}
                      <Cable d={`M${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`} type={ty} dash={!ok} />
                    </G>
                  );
                })()}
                {/* blocs */}
                {st.objs.map((o) => {
                  const c = FAM[family(o.kind)];
                  const p = objPos(o);
                  const on = selObj?.id === o.id;
                  const n = touching(st, { o: o.id }).length;
                  const t = o.name.slice(0, 14);
                  const lw = Math.min(118, 16 + t.length * 7);
                  return (
                    <G key={o.id} opacity={anySel && !on && !selCables.some((cb) => sameEnd(cb.a, { o: o.id }) || sameEnd(cb.b, { o: o.id })) && !(selZone && o.zone === selZone.id) ? 0.5 : 1}>
                      {on && <Circle cx={p.x} cy={p.y} r={R + 7} fill="none" stroke="#FFFFFF" strokeWidth={3} />}
                      <Circle cx={p.x} cy={p.y} r={R} fill="#1E2227" stroke={c} strokeWidth={3} />
                      <KindIcon kind={o.kind} x={p.x} y={p.y} c={c} s={0.9} />
                      {n > 0 && <G><Circle cx={p.x + R - 3} cy={p.y - R + 3} r={8} fill={c} /><SvgText x={p.x + R - 3} y={p.y - R + 7} textAnchor="middle" fontSize={10} fontWeight="900" fill="#0B0D10">{String(n)}</SvgText></G>}
                      <Rect x={p.x - lw / 2} y={p.y + R + 3} width={lw} height={19} rx={9.5} fill="#0B0D10" opacity={0.85} />
                      <SvgText x={p.x} y={p.y + R + 17} textAnchor="middle" fontSize={12} fontWeight="800" fill="#E8EAED">{t}</SvgText>
                    </G>
                  );
                })}
                {/* pastilles Jack / XLR à toucher */}
                {pills.map((p) => (
                  <G key={'p' + p.id}>
                    <Rect x={p.x - 22} y={p.y - 11} width={44} height={22} rx={11} fill={p.type === 'xlr' ? XLR : JACK} stroke="#0B0D10" strokeWidth={2} />
                    <SvgText x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight="900" fill="#0B0D10">{p.type === 'xlr' ? 'XLR' : 'Jack'}</SvgText>
                  </G>
                ))}
                {!st.objs.length && (
                  <SvgText x={W / 2} y={STAGE_H / 2} textAnchor="middle" fontSize={20} fill="#5B636D" fontWeight="700">Scène vide · ajoute des blocs à gauche, ou ⋯ › Refaire d’après la table</SvgText>
                )}
              </Svg>
              <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

              {/* carte de la sélection */}
              {sel && (
                <View style={[styles.card, { backgroundColor: theme.panel, borderColor: selZone ? selZone.color : selObj ? FAM[family(selObj.kind)] : theme.accent }]}>
                  <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                        {'gear' in sel ? 'À emporter' : selZone ? 'Cadre' : selObj ? kindLabel(selObj.kind) : selEnd ? endLabel(st, selEnd, busName) : ''}
                        {selEnd && 'plug' in selEnd && plugName(selEnd.plug) ? <Text style={{ color: theme.muted, fontSize: 12 }}> · {plugName(selEnd.plug)}</Text> : null}
                      </Text>
                      <Pressable onPress={() => setSel(null)} style={styles.x} accessibilityLabel="Fermer"><Text style={{ color: theme.muted, fontSize: 20 }}>✕</Text></Pressable>
                    </View>

                    {'gear' in sel && (
                      <>
                        {g.map((x) => {
                          const ok = !!packed[x.key];
                          return (
                            <Pressable key={x.key} onPress={() => setPacked((p) => ({ ...p, [x.key]: !ok }))} style={[styles.row, { borderColor: ok ? '#34D399' : theme.line, backgroundColor: ok ? 'rgba(52,211,153,0.10)' : theme.deep }]}>
                              <Text style={{ color: ok ? '#34D399' : theme.text, fontWeight: '900', fontSize: 18, width: 30 }}>{ok ? '✓' : x.n}</Text>
                              <Text style={{ color: ok ? theme.muted : theme.text, fontWeight: '700', flex: 1, textDecorationLine: ok ? 'line-through' : 'none' }}>{x.label}</Text>
                            </Pressable>
                          );
                        })}
                        {!g.length && <Text style={{ color: theme.muted }}>Pose des blocs et tire des câbles : la liste se remplit toute seule.</Text>}
                        <Pressable onPress={exportMenu} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>↗ Exporter la scène</Text></Pressable>
                      </>
                    )}

                    {selObj && (
                      <>
                        <TextInput value={selObj.name} maxLength={24} onChangeText={(v) => setSt({ ...st, objs: st.objs.map((o) => (o.id === selObj.id ? { ...o, name: v } : o)) })} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                        <Text style={{ color: theme.muted, fontSize: 12 }}>{selObj.zone ? `Dans « ${zonesOf(st).find((z) => z.id === selObj.zone)?.name ?? ''} »` : 'Hors cadre'}{selObj.plug ? ` · prise ${selObj.plug} de la table` : ''}</Text>
                      </>
                    )}

                    {selZone && (
                      <>
                        <TextInput value={selZone.name} maxLength={18} onChangeText={(v) => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, name: v } : z)) })} style={[styles.input, { color: theme.text, borderColor: selZone.color, backgroundColor: theme.deep }]} />
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {ZONE_COLORS.map((c) => <Pressable key={c} onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, color: c } : z)) })} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 3, borderColor: selZone.color === c ? '#FFFFFF' : 'transparent' }} />)}
                        </View>
                        {zoneTableCables(st, selZone.id).length > 1 && (
                          <Pressable onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, bundled: !z.bundled } : z)) })} style={[styles.btn, { borderWidth: 2, borderColor: selZone.color, backgroundColor: selZone.bundled ? selZone.color : 'transparent' }]}>
                            <Text style={{ color: selZone.bundled ? '#0B0D10' : selZone.color, fontWeight: '900' }}>{selZone.bundled ? '⇊ En faisceau · déplier les câbles' : `⇈ Regrouper ses ${zoneTableCables(st, selZone.id).length} câbles en faisceau`}</Text>
                          </Pressable>
                        )}
                        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800' }}>{selZone.drums ? 'AJOUTER À LA BATTERIE' : 'AJOUTER DANS CE CADRE'} · ou touche la palette</Text>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {(selZone.drums ? DRUM_PIECES : (['voix', 'guitare', 'basse', 'pedalboard', 'ampli', 'micro', 'di', 'retour', 'casque'] as Kind[])).map((k) => (
                            <Pressable key={k} onPress={() => addObj(k)} style={[styles.chip, { borderColor: FAM[family(k)] }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>+ {kindLabel(k)}</Text></Pressable>
                          ))}
                        </View>
                        <Pressable onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, drums: !z.drums } : z)) })}><Text style={{ color: theme.muted, fontSize: 12 }}>{selZone.drums ? '☑' : '☐'} C’est une batterie (propose ses éléments)</Text></Pressable>
                      </>
                    )}

                    {(selObj || selEnd || selZone) && !('gear' in sel) && (
                      <>
                        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800' }}>CÂBLES · {selCables.length}</Text>
                        {selCables.map((c) => {
                          const from = selEnd && (sameEnd(c.a, selEnd) || sameEnd(c.b, selEnd)) ? selEnd : null;
                          const label = from ? `→ ${endLabel(st, sameEnd(c.a, from) ? c.b : c.a, busName)}` : `${endLabel(st, c.a, busName)} → ${endLabel(st, c.b, busName)}`;
                          return (
                            <View key={c.id} style={[styles.row, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                              <Text style={{ color: theme.text, fontWeight: '800', flex: 1, fontSize: 13 }} numberOfLines={1}>{label}</Text>
                              <Pressable onPress={() => setSt(setCableType(st, c.id, c.type === 'xlr' ? 'jack' : 'xlr'))} style={[styles.type, { backgroundColor: c.type === 'xlr' ? XLR : JACK }]}><Text style={{ color: '#0B0D10', fontWeight: '900', fontSize: 12 }}>{c.type === 'xlr' ? 'XLR' : 'Jack'} ⇄</Text></Pressable>
                              <Pressable onPress={() => setSt(removeCable(st, c.id))} style={styles.x} accessibilityLabel="Retirer ce câble"><Text style={{ color: theme.muted, fontSize: 18 }}>✕</Text></Pressable>
                            </View>
                          );
                        })}
                        {!selCables.length && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucun câble. Passe en « 🔌 Câbler » et glisse depuis ici.</Text>}
                        {selObj && family(selObj.kind) === 'monitor' && !selCables.some((c) => 'out' in c.a || 'out' in c.b) && <Text style={{ color: '#FCD34D', fontSize: 12 }}>Ce retour n’est relié à aucune sortie AUX de la table.</Text>}
                        {selObj && <Pressable onPress={() => { setSt(removeObj(st, selObj.id)); setSel(null); }} style={[styles.btn, { borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800' }}>Retirer ce bloc</Text></Pressable>}
                        {selZone && <Pressable onPress={() => { setSt({ ...st, zones: zonesOf(st).filter((z) => z.id !== selZone.id), objs: st.objs.map((o) => (o.zone === selZone.id ? { ...o, zone: undefined } : o)) }); setSel(null); }} style={[styles.btn, { borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800' }}>Retirer le cadre (les blocs restent)</Text></Pressable>}
                      </>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

void zoneAt;

const styles = StyleSheet.create({
  palette: { width: 78, borderWidth: 1, borderRadius: 14 },
  pal: { width: 66, minHeight: 52, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  palT: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  tool: { height: 40, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center' },
  card: { position: 'absolute', right: 10, top: 10, bottom: 10, width: 320, borderWidth: 2, borderRadius: 18, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minHeight: 46 },
  type: { height: 32, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center' },
  input: { height: 44, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, fontSize: 16, fontWeight: '800' },
  btn: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chip: { height: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1.5, justifyContent: 'center' },
  x: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
