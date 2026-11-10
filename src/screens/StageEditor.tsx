// « Ma scène » vue de dessus, en plein écran :
//  - à gauche la palette (instruments, batterie, matériel, retours, cadre musicien)
//  - au centre la scène : des cadres (un par musicien, un pour la batterie) qu'on
//    déplace d'un bloc avec tout leur contenu, des blocs qu'on déplace, des câbles
//    jack ou XLR qu'on tire au doigt ; les câbles d'un cadre se regroupent en faisceau
//  - en bas la table (entrées, retours) ; « À emporter » en pastille dans le coin.
// Lié à la table : les voies nommées arrivent toutes seules, câblées à leur prise.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Segmented } from '../ui/kit';
import { Theme } from '../ui/theme';
import { showTip } from '../ui/tip';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath, insrcPath, insrcPlug } from '../xair/addresses';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import {
  addCable, addConfig, CableType, CONFIGS, dropAndFit, DRUM_PIECES, EMPTY, End, endLabel, family, Family, fromChannels, gear, isTableEnd, Kind, kindLabel, kindShort, KINDS,
  fitZone, membersOf, moveZone, newId, removeCable, removeObj, sameEnd, setCableType, Stage, stageText, StageObj, syncWithTable, touching, Zone, ZONE_COLORS,
  zoneFromRect, zonesOf, zoneTableCables,
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
type DragKind = 'obj' | 'zone' | 'resize' | 'wire' | 'marquee';
type Drag = { kind: DragKind; from?: End; id?: string; x: number; y: number; x0: number; y0: number; moved: boolean; start?: { x: number; y: number; w?: number; h?: number } } | null;
type PalTab = 'instr' | 'drums' | 'matos' | 'configs';
const PAL_TABS: [PalTab, string][] = [['instr', 'Instrum.'], ['drums', 'Batterie'], ['matos', 'Matos'], ['configs', 'Configs']];
const PALETTE: Record<Exclude<PalTab, 'configs'>, Kind[]> = {
  instr: ['voix', 'choeur', 'guitare', 'acoustique', 'basse', 'contrebasse', 'clavier', 'piano', 'synthe', 'violon', 'violoncelle', 'sax', 'trompette', 'trombone', 'flute', 'accordeon', 'harmonica', 'ukulele', 'mandoline', 'cajon', 'percu', 'ordi', 'autre'],
  drums: DRUM_PIECES,
  matos: ['pedalboard', 'ampli', 'micro', 'di', 'retour', 'casque', 'enceinte', 'musicien'],
};

// ---- morceaux du dessin, mémorisés : seul ce qui bouge est redessiné
const CableG = React.memo(function CableG({ d, type, dim, dash }: { d: string; type: CableType; dim?: boolean; dash?: boolean }) {
  return (
    <G opacity={dim ? 0.22 : 1}>
      {type === 'xlr' ? <>
        <Path d={d} fill="none" stroke="#0B0D10" strokeWidth={8} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
        <Path d={d} fill="none" stroke={XLR} strokeWidth={4} strokeLinecap="round" strokeDasharray={dash ? '14 10' : undefined} />
      </> : <Path d={d} fill="none" stroke={JACK} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={dash ? '12 10' : undefined} />}
    </G>
  );
});

const ObjG = React.memo(function ObjG({ kind, name, x, y, on, n, dim }: { kind: Kind; name: string; x: number; y: number; on: boolean; n: number; dim: boolean }) {
  const c = FAM[family(kind)];
  const t = name.slice(0, 14);
  const lw = Math.min(118, 16 + t.length * 7);
  return (
    <G opacity={dim ? 0.5 : 1}>
      {on && <Circle cx={x} cy={y} r={R + 7} fill="none" stroke="#FFFFFF" strokeWidth={3} />}
      <Circle cx={x} cy={y} r={R} fill="#1E2227" stroke={c} strokeWidth={3} />
      <KindIcon kind={kind} x={x} y={y} c={c} s={0.9} />
      {n > 0 && <G><Circle cx={x + R - 3} cy={y - R + 3} r={8} fill={c} /><SvgText x={x + R - 3} y={y - R + 7} textAnchor="middle" fontSize={10} fontWeight="900" fill="#0B0D10">{String(n)}</SvgText></G>}
      <Rect x={x - lw / 2} y={y + R + 3} width={lw} height={19} rx={9.5} fill="#0B0D10" opacity={0.85} />
      <SvgText x={x} y={y + R + 17} textAnchor="middle" fontSize={12} fontWeight="800" fill="#E8EAED">{t}</SvgText>
    </G>
  );
});

const ZoneG = React.memo(function ZoneG({ x1, y1, x2, y2, color, label, on, n, bundled }: { x1: number; y1: number; x2: number; y2: number; color: string; label: string; on: boolean; n: number; bundled: boolean }) {
  return (
    <G>
      <Rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={16} fill={color} fillOpacity={on ? 0.1 : 0.05} stroke={color} strokeWidth={on ? 3 : 2} strokeDasharray={on ? undefined : '8 6'} />
      <Rect x={x1} y={y1} width={Math.min(x2 - x1, 24 + label.length * 8)} height={26} rx={12} fill={color} fillOpacity={0.9} />
      <SvgText x={x1 + 12} y={y1 + 18} fontSize={13} fontWeight="900" fill="#0B0D10">{label}</SvgText>
      <Path d={`M${x2 - 16} ${y2 - 4} L${x2 - 4} ${y2 - 4} L${x2 - 4} ${y2 - 16}`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      {n > 1 && (
        <G>
          <Rect x={(x1 + x2) / 2 - 76} y={y2 - 13} width={152} height={26} rx={13} fill={bundled ? color : '#0B0D10'} stroke={color} strokeWidth={2} />
          <SvgText x={(x1 + x2) / 2} y={y2 + 5} textAnchor="middle" fontSize={12} fontWeight="900" fill={bundled ? '#0B0D10' : color}>{bundled ? `⇊ Faisceau · ${n}` : `⇈ Regrouper ${n} câbles`}</SvgText>
        </G>
      )}
    </G>
  );
});

/** Fond de scène + prises de la table : ne change que si les prises occupées changent. */
const BackG = React.memo(function BackG({ H, STAGE_H, PORT_Y, usedKey, selKey }: { H: number; STAGE_H: number; PORT_Y: number; usedKey: string; selKey: string }) {
  const used = new Set(usedKey.split(','));
  return (
    <G>
      <Rect x={0} y={0} width={W} height={H} fill="#111317" />
      <Rect x={4} y={4} width={W - 8} height={STAGE_H} rx={22} fill="#16191E" stroke="#2A3038" strokeWidth={2} />
      {[...Array(9)].map((_, k) => <Line key={k} x1={4 + (k + 1) * 99} y1={6} x2={4 + (k + 1) * 99} y2={STAGE_H + 2} stroke="#1B1F25" strokeWidth={2} />)}
      <SvgText x={20} y={24} fontSize={12} fill="#4B525C" fontWeight="700">FOND DE SCÈNE</SvgText>
      <SvgText x={W - 22} y={STAGE_H - 8} textAnchor="end" fontSize={12} fill="#4B525C" fontWeight="700">▼ PUBLIC</SvgText>
      <Rect x={14} y={STAGE_H + 12} width={W - 28} height={H - STAGE_H - 18} rx={14} fill="#15181C" stroke="#2A3038" strokeWidth={2} />
      {Array.from({ length: 18 }, (_, k) => k + 1).map((n) => {
        const u = used.has('p' + n);
        const on = selKey === 'p' + n;
        return (
          <G key={n}>
            <Circle cx={plugX(n)} cy={PORT_Y} r={11} fill="#0B0D10" stroke={on ? '#FFFFFF' : u ? '#E8EAED' : '#3A414B'} strokeWidth={on ? 4 : 2} />
            <Circle cx={plugX(n)} cy={PORT_Y} r={4} fill={u ? '#E8EAED' : '#2A3038'} />
            <SvgText x={plugX(n)} y={PORT_Y + 27} textAnchor="middle" fontSize={11} fontWeight="800" fill={u ? '#E8EAED' : '#5B636D'}>{String(n)}</SvgText>
          </G>
        );
      })}
      <SvgText x={plugX(1) - 16} y={PORT_Y + 4} textAnchor="end" fontSize={11} fontWeight="800" fill="#9AA3AD">IN</SvgText>
      {OUTS.map((id, k) => {
        const u = used.has(id);
        const on = selKey === id;
        const c = k < 6 ? MIX_COLORS[k + 1] : MIX_COLORS[0];
        return (
          <G key={id}>
            <Circle cx={outX(id)} cy={PORT_Y} r={13} fill="#0B0D10" stroke={on ? '#FFFFFF' : c} strokeWidth={on ? 4 : 2.5} />
            <Circle cx={outX(id)} cy={PORT_Y} r={5} fill={u ? c : '#2A3038'} />
            <SvgText x={outX(id)} y={PORT_Y + 29} textAnchor="middle" fontSize={10} fontWeight="800" fill={c}>{k < 6 ? `AUX${k + 1}` : id === 'mainL' ? 'MAIN L' : 'MAIN R'}</SvgText>
          </G>
        );
      })}
    </G>
  );
});

export function StageEditor({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [st, setSt] = useState<Stage>(EMPTY);
  const [palTab, setPalTab] = useState<PalTab>('instr');
  const [palH, setPalH] = useState(0);
  const { width: winW } = useWindowDimensions();
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'move' | 'wire' | 'frame'>('move');
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
  // enregistré une demi-seconde après le dernier changement (pas à chaque mouvement du doigt)
  useEffect(() => { if (!loaded) return; const t = setTimeout(() => save('scene', st), 500); return () => clearTimeout(t); }, [st, loaded]);

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
    // un bloc se prend par son rond OU par son nom dessous (zone généreuse pour le doigt)
    for (let k = st.objs.length - 1; k >= 0; k--) { const o = st.objs[k]; const p = objPos(o); if (Math.abs(x - p.x) < R + 14 && y > p.y - R - 12 && y < p.y + R + 28) return { t: 'obj', id: o.id }; }
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
  const frame = useRef(0);
  // les déplacements ne redessinent qu'une fois par image (fluide sur tablette)
  const pendingSt = useRef<((s: Stage) => Stage) | null>(null);
  const stFrame = useRef(0);
  const setStThrottled = (f: (s: Stage) => Stage) => {
    pendingSt.current = f;
    if (!stFrame.current) stFrame.current = requestAnimationFrame(() => { stFrame.current = 0; const g = pendingSt.current; pendingSt.current = null; if (g) setSt(g); });
  };
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
        // un cadre ne se dessine QUE dans le mode « ▢ Cadre », et jamais en partant d'un bloc
        if (!h) { putDrag(L.mode === 'frame' ? { ...base, kind: 'marquee' } : null); return; }
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
          if (d.kind === 'obj') setStThrottled((cur) => ({ ...cur, objs: cur.objs.map((q) => (q.id === id ? { ...q, x: Math.max(0, Math.min(1, s0.x + dx)), y: Math.max(0, Math.min(1, s0.y + dy)) } : q)) }));
          if (d.kind === 'zone') setStThrottled((cur) => { const z = zonesOf(cur).find((q) => q.id === id)!; return moveZone(cur, id, s0.x + dx - z.x, s0.y + dy - z.y); });
          if (d.kind === 'resize') setStThrottled((cur) => ({ ...cur, zones: zonesOf(cur).map((q) => (q.id === id ? { ...q, w: Math.max(0.08, Math.min(1 - q.x, (s0.w ?? 0.2) + dx)), h: Math.max(0.12, Math.min(1 - q.y, (s0.h ?? 0.3) + dy)) } : q)) }));
        }
        dref.current = { ...d, x: e.nativeEvent.locationX / s, y: e.nativeEvent.locationY / s, moved };
        // seuls le câble tiré et le cadre dessiné ont besoin de suivre le doigt à l'écran
        if ((d.kind === 'wire' || d.kind === 'marquee') && !frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setDrag(dref.current); });
      },
      onPanResponderRelease: (e) => {
        const L = latest.current;
        const d = dref.current;
        if (stFrame.current) { cancelAnimationFrame(stFrame.current); stFrame.current = 0; }
        if (pendingSt.current) { const g = pendingSt.current; pendingSt.current = null; setSt(g); }
        if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
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
        if (d.kind === 'marquee') {
          // cadre dessiné au doigt : il prend les blocs qu'il entoure
          const x1 = L.fx(Math.min(d.x0, d.x)), x2 = L.fx(Math.max(d.x0, d.x));
          const y1 = L.fy(Math.min(d.y0, d.y)), y2 = L.fy(Math.max(d.y0, d.y));
          if (x2 - x1 > 0.06 && y2 - y1 > 0.1) {
            const r = { x: Math.max(0, x1), y: Math.max(0, y1), w: Math.min(1, x2) - Math.max(0, x1), h: Math.min(1, y2) - Math.max(0, y1) };
            const out = zoneFromRect(L.st, r);
            setSt(out.st);
            setSel({ zone: out.id });
            setMode('move');
          } else showTip('Cadre trop petit : glisse en diagonale pour entourer les blocs.');
          return;
        }
        if (d.kind === 'wire' && d.from) {
          const to = endOfHit(h);
          if (to && !sameEnd(to, d.from)) { const ty = L.ctype === 'auto' ? undefined : L.ctype; const from = d.from; setSt((cur) => addCable(cur, from, to, ty)); setSel('o' in d.from ? { obj: d.from.o } : { end: d.from }); }
          return;
        }
        // après un déplacement : rien ne s'ouvre, le bloc entre (ou sort) du cadre et les cadres s'adaptent
        if (d.kind === 'obj' && d.id) { const id = d.id; setSt((cur) => dropAndFit(cur, id)); }
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

  const anySel = !!sel && !('gear' in (sel as object));
  // la carte se met du côté opposé à ce qu'on a choisi, pour ne pas le cacher
  const selX = selObj ? selObj.x : selZone ? selZone.x + selZone.w / 2 : selEnd && !('o' in selEnd) ? posOf(selEnd).x / W : 0;
  const cardLeft = selX > 0.55;
  const g = gear(st);
  const xlrN = g.find((x) => x.key === 'xlr')?.n ?? 0;
  const jackN = g.find((x) => x.key === 'jack')?.n ?? 0;
  const hov = drag && drag.moved && drag.kind === 'wire' ? endOfHit(hit(drag.x, drag.y)) : null;
  // comptes calculés une fois (et pas une fois par bloc à chaque image)
  const perEnd = useMemo(() => {
    const m = new Map<string, number>();
    const k = (e: End) => ('o' in e ? 'o:' + e.o : 'plug' in e ? 'p' + e.plug : e.out);
    for (const c of st.cables) { m.set(k(c.a), (m.get(k(c.a)) ?? 0) + 1); m.set(k(c.b), (m.get(k(c.b)) ?? 0) + 1); }
    return m;
  }, [st.cables]);
  const usedKey = [...perEnd.keys()].filter((k) => !k.startsWith('o:')).sort().join(',');
  const selKey = selEnd && !('o' in selEnd) ? ('plug' in selEnd ? 'p' + selEnd.plug : selEnd.out) : '';
  const linked = new Set(selCables.flatMap((c) => [c.a, c.b]).filter((e) => 'o' in e).map((e) => (e as { o: string }).o));

  // ---- palette : grille sans défilement, la taille des cases s'adapte à la hauteur
  const narrowPal = winW < 700;
  const cols = narrowPal ? 2 : 3;
  const palW = narrowPal ? 112 : 168;
  const inner = palW - 14; // bordures + marges
  const cellW = Math.floor((inner - (cols - 1) * 4) / cols);
  const items = palTab === 'configs' ? CONFIGS.length : PALETTE[palTab].length;
  const cCols = palTab === 'configs' ? (narrowPal ? 1 : 2) : cols;
  const rows = Math.ceil(items / cCols);
  const tabsH = 2 * 30 + 4;
  const cellH = palH ? Math.max(30, Math.min(64, Math.floor((palH - tabsH - 16 - (rows - 1) * 4) / rows))) : 52;
  const showIcon = cellH >= 40;

  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingBottom: 8 }}>
      {/* palette */}
      <View style={[styles.palette, { width: palW, backgroundColor: theme.panel, borderColor: theme.line }]} onLayout={(e) => setPalH(e.nativeEvent.layout.height)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {PAL_TABS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setPalTab(k)} onLongPress={k === 'configs' ? () => showTip('Configurations toutes prêtes : batterie complète, guitare › pédalier › ampli, basse › DI… posées dans leur cadre, déjà câblées.') : undefined} style={[styles.tab, { width: Math.floor((inner - 4) / 2) }, palTab === k ? { backgroundColor: theme.accent } : { borderColor: theme.line2, borderWidth: 1 }]}>
              <Text style={{ color: palTab === k ? theme.onAccent : theme.text, fontSize: 11, fontWeight: '900' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {palTab === 'configs' ? CONFIGS.map((c) => (
            <Pressable key={c.key} onPress={() => { const r = addConfig(st, c.key); setSt(r.st); setSel(null); }} style={[styles.pal, { width: Math.floor((inner - (cCols - 1) * 4) / cCols), height: cellH, flexDirection: 'row', gap: 4, paddingHorizontal: 4, borderColor: c.drums ? FAM.drum : theme.line2 }]}>
              {showIcon && <Svg width={24} height={24} viewBox="0 0 30 30"><KindIcon kind={c.drums ? 'batterie' : c.items[0].kind} x={15} y={15} c={FAM[family(c.drums ? 'batterie' : c.items[0].kind)]} s={0.62} /></Svg>}
              <Text numberOfLines={3} style={[styles.palT, { color: theme.text, flex: 1, textAlign: 'left' }]}>{c.label}</Text>
            </Pressable>
          )) : PALETTE[palTab].map((k) => (
            <Pressable key={k} onPress={() => addObj(k)} onLongPress={() => showTip(`Ajoute ${kindLabel(k).toLowerCase()}${selZone ? ` dans « ${selZone.name} »` : ''}, puis fais-le glisser à sa place.`)} style={[styles.pal, { width: cellW, height: cellH, borderColor: theme.line2 }]}>
              {showIcon ? <Svg width={26} height={26} viewBox="0 0 30 30"><KindIcon kind={k} x={15} y={15} c={FAM[family(k)]} s={0.62} /></Svg> : null}
              <Text numberOfLines={showIcon && cellH < 50 ? 1 : 2} style={[styles.palT, { color: theme.text, lineHeight: 11 }]}>{kindLabel(k).replace('Guitare ', 'Guit. ').replace('Contrebasse', 'Contreb.').replace('Violoncelle', 'Vlc.')}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {/* barre d'outils, une ligne */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Segmented theme={theme} value={mode} onChange={setMode} options={[['move', '✋ Déplacer'], ['wire', '🔌 Câbler'], ['frame', '▢ Cadre']] as const} />
          {mode === 'wire' && <Segmented theme={theme} value={ctype} onChange={setCtype} options={[['auto', 'Auto'], ['jack', 'Jack'], ['xlr', 'XLR']] as const} />}
          <Text style={{ flex: 1, color: mode === 'frame' ? '#60A5FA' : theme.muted, fontSize: 12, fontWeight: mode === 'frame' ? '800' : '400' }} numberOfLines={2}>
            {mode === 'wire' ? 'Glisse d’un bloc à un autre, ou jusqu’à une prise.' : mode === 'frame' ? 'Glisse en diagonale sur la scène pour entourer des blocs.' : 'Glisse un bloc · le haut d’un cadre déplace tout.'}
          </Text>
          <Pressable onPress={toggleFree} onLongPress={() => showTip('Lié à la table : les voies nommées arrivent toutes seules sur le plan, câblées à leur prise. Plan libre : tu dessines sans tenir compte de la table (autre salle, autre groupe).')} style={[styles.tool, st.free ? { borderColor: theme.line2 } : { borderColor: '#34D399', backgroundColor: '#13261E' }]}>
            <Text style={{ color: st.free ? theme.text : '#6EE7B7', fontWeight: '800', fontSize: 12 }}>{st.free ? '○ Libre' : '● Lié'}</Text>
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
                <BackG H={H} STAGE_H={STAGE_H} PORT_Y={PORT_Y} usedKey={usedKey} selKey={selKey} />
                {/* cadres */}
                {zonesOf(st).map((z) => {
                  const r = zoneRect(z);
                  return <ZoneG key={z.id} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} color={z.color} label={`${z.name}${z.drums ? ` · ${membersOf(st, z.id).length} él.` : ''}`} on={selZone?.id === z.id} n={zoneTableCables(st, z.id).length} bundled={!!z.bundled} />;
                })}
                {/* câbles */}
                {st.cables.filter((c) => !hiddenCable.has(c.id)).map((c) => <CableG key={c.id} d={cablePath(c, cableIdx[c.id] ?? 0).d} type={c.type} dim={anySel && !selIds.has(c.id)} />)}
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
                {drag && drag.kind === 'marquee' && drag.moved && (
                  <Rect x={Math.min(drag.x0, drag.x)} y={Math.min(drag.y0, drag.y)} width={Math.abs(drag.x - drag.x0)} height={Math.abs(drag.y - drag.y0)} rx={14} fill="rgba(96,165,250,0.10)" stroke="#60A5FA" strokeWidth={3} strokeDasharray="10 7" />
                )}
                {/* câble en train d'être tiré */}
                {drag && drag.moved && drag.kind === 'wire' && drag.from && (() => {
                  const a = posOf(drag.from);
                  const ok = !!hov && !sameEnd(hov, drag.from);
                  const b = ok ? posOf(hov!) : { x: drag.x, y: drag.y };
                  const ty: CableType = ctype !== 'auto' ? ctype : ok ? addCable(st, drag.from, hov!).cables.slice(-1)[0]?.type ?? 'jack' : 'jack';
                  return (
                    <G>
                      {ok && <Circle cx={b.x} cy={b.y} r={'o' in hov! ? R + 12 : 20} fill="rgba(52,211,153,0.22)" stroke="#34D399" strokeWidth={4} />}
                      <CableG d={`M${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`} type={ty} dash={!ok} />
                    </G>
                  );
                })()}
                {/* blocs */}
                {st.objs.map((o) => {
                  const p = objPos(o);
                  const on = selObj?.id === o.id;
                  return <ObjG key={o.id} kind={o.kind} name={o.name} x={p.x} y={p.y} on={on} n={perEnd.get('o:' + o.id) ?? 0} dim={anySel && !on && !linked.has(o.id) && !(selZone && o.zone === selZone.id)} />;
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

              {/* carte de la sélection : compacte, tout tient sans défiler */}
              {sel && (
                <View style={[styles.card, cardLeft ? { left: 8 } : { right: 8 }, { maxHeight: H * sc - 16, backgroundColor: theme.panel, borderColor: selZone ? selZone.color : selObj ? FAM[family(selObj.kind)] : theme.accent }]}>
                  <ScrollView contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {selObj ? (
                        <TextInput value={selObj.name} maxLength={24} onChangeText={(v) => setSt({ ...st, objs: st.objs.map((o) => (o.id === selObj.id ? { ...o, name: v } : o)) })} style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
                      ) : selZone ? (
                        <TextInput value={selZone.name} maxLength={18} onChangeText={(v) => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, name: v } : z)) })} style={[styles.input, { flex: 1, color: theme.text, borderColor: selZone.color, backgroundColor: theme.deep }]} />
                      ) : (
                        <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '900' }} numberOfLines={1}>
                          {'gear' in sel ? 'À emporter' : selEnd ? endLabel(st, selEnd, busName) : ''}
                          {selEnd && 'plug' in selEnd && plugName(selEnd.plug) ? <Text style={{ color: theme.muted, fontSize: 12 }}> · {plugName(selEnd.plug)}</Text> : null}
                        </Text>
                      )}
                      <Pressable onPress={() => setSel(null)} style={styles.x} accessibilityLabel="Fermer"><Text style={{ color: theme.muted, fontSize: 18 }}>✕</Text></Pressable>
                    </View>

                    {'gear' in sel && (
                      <>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {g.map((x) => {
                            const ok = !!packed[x.key];
                            return (
                              <Pressable key={x.key} onPress={() => setPacked((p) => ({ ...p, [x.key]: !ok }))} style={[styles.row, styles.half, { borderColor: ok ? '#34D399' : theme.line, backgroundColor: ok ? 'rgba(52,211,153,0.10)' : theme.deep }]}>
                                <Text style={{ color: ok ? '#34D399' : theme.text, fontWeight: '900', fontSize: 15, width: 24 }}>{ok ? '✓' : x.n}</Text>
                                <Text numberOfLines={2} style={{ color: ok ? theme.muted : theme.text, fontWeight: '700', fontSize: 12, flex: 1, textDecorationLine: ok ? 'line-through' : 'none' }}>{x.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {!g.length && <Text style={{ color: theme.muted, fontSize: 12 }}>Pose des blocs et tire des câbles : la liste se remplit toute seule.</Text>}
                        <Pressable onPress={exportMenu} style={[styles.btn, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>↗ Exporter la scène</Text></Pressable>
                      </>
                    )}

                    {selObj && <Text style={{ color: theme.muted, fontSize: 12 }}>{kindLabel(selObj.kind)} · {selObj.zone ? `dans « ${zonesOf(st).find((z) => z.id === selObj.zone)?.name ?? ''} »` : 'hors cadre'}{selObj.plug ? ` · prise ${selObj.plug}` : ''}</Text>}

                    {selZone && (
                      <>
                        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                          {ZONE_COLORS.map((c) => <Pressable key={c} onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, color: c } : z)) })} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: 3, borderColor: selZone.color === c ? '#FFFFFF' : 'transparent' }} />)}
                          <View style={{ flex: 1 }} />
                          <Pressable onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, drums: !z.drums } : z)) })}><Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>{selZone.drums ? '☑' : '☐'} Batterie</Text></Pressable>
                        </View>
                        {zoneTableCables(st, selZone.id).length > 1 && (
                          <Pressable onPress={() => setSt({ ...st, zones: zonesOf(st).map((z) => (z.id === selZone.id ? { ...z, bundled: !z.bundled } : z)) })} style={[styles.btn, { minHeight: 34, borderWidth: 2, borderColor: selZone.color, backgroundColor: selZone.bundled ? selZone.color : 'transparent' }]}>
                            <Text style={{ color: selZone.bundled ? '#0B0D10' : selZone.color, fontWeight: '900', fontSize: 12 }}>{selZone.bundled ? '⇊ En faisceau · déplier' : `⇈ Regrouper ${zoneTableCables(st, selZone.id).length} câbles en faisceau`}</Text>
                          </Pressable>
                        )}
                        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                          {(selZone.drums ? DRUM_PIECES : (['voix', 'guitare', 'basse', 'pedalboard', 'ampli', 'micro', 'di', 'retour', 'casque'] as Kind[])).map((k) => (
                            <Pressable key={k} onPress={() => addObj(k)} style={[styles.chip, { borderColor: FAM[family(k)] }]}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 11 }}>+ {kindLabel(k).replace('Guitare ', 'Guit. ')}</Text></Pressable>
                          ))}
                        </View>
                      </>
                    )}

                    {(selObj || selEnd || selZone) && !('gear' in sel) && (
                      <>
                        <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '900' }}>CÂBLES · {selCables.length}{selCables.length ? ' · touche Jack/XLR pour changer' : ''}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {selCables.map((c) => {
                            const from = selEnd && (sameEnd(c.a, selEnd) || sameEnd(c.b, selEnd)) ? selEnd : null;
                            const label = from ? `→ ${endLabel(st, sameEnd(c.a, from) ? c.b : c.a, busName)}` : `${endLabel(st, c.a, busName)} → ${endLabel(st, c.b, busName)}`;
                            return (
                              <View key={c.id} style={[styles.row, selCables.length > 3 ? styles.half : { width: '100%' }, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                                <Pressable onPress={() => setSt(setCableType(st, c.id, c.type === 'xlr' ? 'jack' : 'xlr'))} style={[styles.type, { backgroundColor: c.type === 'xlr' ? XLR : JACK }]}><Text style={{ color: '#0B0D10', fontWeight: '900', fontSize: 10 }}>{c.type === 'xlr' ? 'XLR' : 'Jack'}</Text></Pressable>
                                <Text style={{ color: theme.text, fontWeight: '700', flex: 1, fontSize: 11 }} numberOfLines={1}>{label}</Text>
                                <Pressable onPress={() => setSt(removeCable(st, c.id))} style={styles.xs} accessibilityLabel="Retirer ce câble"><Text style={{ color: theme.muted, fontSize: 14 }}>✕</Text></Pressable>
                              </View>
                            );
                          })}
                        </View>
                        {!selCables.length && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucun câble. Passe en « 🔌 Câbler » et glisse depuis ici.</Text>}
                        {selObj && family(selObj.kind) === 'monitor' && !selCables.some((c) => 'out' in c.a || 'out' in c.b) && <Text style={{ color: '#FCD34D', fontSize: 12 }}>Ce retour n’est relié à aucune sortie AUX.</Text>}
                        {selObj && <Pressable onPress={() => { setSt(removeObj(st, selObj.id)); setSel(null); }} style={[styles.btn, { minHeight: 34, borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 12 }}>Retirer ce bloc</Text></Pressable>}
                        {selZone && <Pressable onPress={() => { setSt({ ...st, zones: zonesOf(st).filter((z) => z.id !== selZone.id), objs: st.objs.map((o) => (o.zone === selZone.id ? { ...o, zone: undefined } : o)) }); setSel(null); }} style={[styles.btn, { minHeight: 34, borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 12 }}>Retirer le cadre (les blocs restent)</Text></Pressable>}
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

const styles = StyleSheet.create({
  palette: { borderWidth: 1, borderRadius: 14, padding: 6 },
  pal: { borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  palT: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  tab: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tool: { height: 40, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center' },
  card: { position: 'absolute', top: 8, width: 340, borderWidth: 2, borderRadius: 16, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, minHeight: 34 },
  half: { width: '49%' },
  type: { height: 24, paddingHorizontal: 7, borderRadius: 12, justifyContent: 'center' },
  input: { height: 38, borderWidth: 2, borderRadius: 10, paddingHorizontal: 8, fontSize: 15, fontWeight: '800' },
  btn: { minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chip: { height: 28, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center' },
  x: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  xs: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
});
