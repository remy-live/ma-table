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
import { BUS_COUNT, busNamePath, CH_COUNT, MAIN, chDcaPath, chLevelPath, chNamePath, chOnPath, DCA_COUNT, dcaNamePath, inDca, insrcPath, insrcPlug } from '../xair/addresses';
import { readGroups } from '../xair/groups';
import { onSide } from '../xair/wiring';
import { goMono, isMono, monoPaths, onMonoChange } from '../xair/mono';
import { chColor } from '../xair/smartName';
import { f as oscF, i as oscI, s as oscS } from '../osc/osc';
import { useAnyTick } from '../ui/useTick';
import { LevelKnob } from './ChannelDrawer';
import { dbToFader, faderToDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from '../store/persist';
import {
  addCable, addConfig, CableType, CONFIGS, dropAndFit, DRUM_PIECES, EMPTY, End, endLabel, family, Family, fromChannels, gear, isTableEnd, Kind, kindLabel, kindShort, KINDS,
  fitZone, membersOf, moveZone, newId, removeCable, removeObj, sameEnd, setCableType, Stage, stageText, StageObj, syncWithTable, touching, Zone, ZONE_COLORS,
  groupsToStage, zonePlugs, plugOf, pruneZones, removeFromPlan, sourceName, stageToGroups, TableGroup, zoneAt, zoneFromRect, zonesOf, zoneTableCables,
} from '../store/stage';
import { MIX_COLORS } from './MixPicker';

const W = 1000;
const R = 24;
const OUTS = ['aux1', 'aux2', 'aux3', 'aux4', 'aux5', 'aux6', 'mainL', 'mainR'];
// la table : les entrées sur une rangée, les sorties (AUX, MAIN L / R) sur la rangée du dessous
const plugX = (n: number) => 80 + (n - 1) * 50;
const outX = (id: string) => { const k = OUTS.indexOf(id); return k < 6 ? 110 + k * 100 : 740 + (k - 6) * 70; };
const LR_X = 900; // la cible « L + R », à droite de MAIN R, sur la même rangée
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

const ObjG = React.memo(function ObjG({ kind, name, x, y, on, n, dim, color }: { kind: Kind; name: string; x: number; y: number; on: boolean; n: number; dim: boolean; color: string }) {
  const c = color;
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

/** Nom court sous une prise : « Guitare acou » › « G.acou », « Overhead » › « Overh. ». */
const shortName = (n: string, max = 6) => {
  const t = n.trim();
  if (t.length <= max) return t;
  const w = t.split(/\s+/);
  if (w.length > 1) return (w[0][0] + '.' + w[1]).slice(0, max);
  return t.slice(0, max - 1) + '.';
};
const zoneTitleW = (label: string) => 26 + label.length * 7.6;
const ZoneG = React.memo(function ZoneG({ x1, y1, x2, y2, color, label, on, n, bundled }: { x1: number; y1: number; x2: number; y2: number; color: string; label: string; on: boolean; n: number; bundled: boolean }) {
  return (
    <G>
      <Rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={16} fill={color} fillOpacity={on ? 0.1 : 0.05} stroke={color} strokeWidth={on ? 3 : 2} strokeDasharray={on ? undefined : '8 6'} />
      {/* titre centré en haut, à cheval sur la ligne du cadre */}
      <Rect x={(x1 + x2) / 2 - zoneTitleW(label) / 2} y={y1 - 13} width={zoneTitleW(label)} height={26} rx={13} fill={color} stroke="#16191E" strokeWidth={3} />
      <SvgText x={(x1 + x2) / 2} y={y1 + 5} textAnchor="middle" fontSize={13} fontWeight="900" fill="#0B0D10">{label}</SvgText>
      <Path d={`M${x2 - 16} ${y2 - 4} L${x2 - 4} ${y2 - 4} L${x2 - 4} ${y2 - 16}`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      {n > 1 && (
        <G>
          <Rect x={(x1 + x2) / 2 - 76} y={y2 + 4} width={152} height={24} rx={12} fill={bundled ? color : '#0B0D10'} stroke={color} strokeWidth={2} />
          <SvgText x={(x1 + x2) / 2} y={y2 + 20} textAnchor="middle" fontSize={12} fontWeight="900" fill={bundled ? '#0B0D10' : color}>{bundled ? `⇊ Faisceau · ${n}` : `⇈ Regrouper ${n} câbles`}</SvgText>
        </G>
      )}
    </G>
  );
});

/** Fond de scène + prises de la table : ne change que si les prises occupées changent. */
const BackG = React.memo(function BackG({ H, STAGE_H, IN_Y, OUT_Y, usedKey, selKey, namesKey, relKey }: { H: number; STAGE_H: number; IN_Y: number; OUT_Y: number; usedKey: string; selKey: string; namesKey: string; relKey: string }) {
  const used = new Set(usedKey.split(','));
  // « p3=Guitare|#60A5FA » : nom et couleur de ce qui est branché sur chaque prise
  const parse = (key: string) => new Map(key.split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); const [n, c] = l.slice(i + 1).split('|'); return [l.slice(0, i), { n, c }] as const; }));
  const names = parse(namesKey);
  // qui entend quoi : rp<prise> = entendue par le retour choisi, ro<sortie> = entend la prise choisie, d<sortie> = couleurs entendues
  const rel = parse(relKey);
  const anyRel = rel.has('sel');
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
        const nm = names.get('p' + n);
        const ring = rel.get('rp' + n); // entendue par le retour choisi
        const c = nm?.c ?? '#3A414B';
        const op = anyRel && !on && !ring ? 0.35 : 1;
        return (
          <G key={n} opacity={op}>
            <Rect x={plugX(n) - 23} y={IN_Y - 20} width={46} height={60} rx={8} fill={on ? '#22272D' : u ? '#181B20' : '#121417'} stroke={on ? '#FFFFFF' : ring ? c : u ? '#3A414B' : '#262B31'} strokeWidth={on || ring ? 2.5 : 1.2} strokeDasharray={u || n >= 17 ? undefined : '4 3'} />
            {u && <Rect x={plugX(n) - 13} y={IN_Y - 16} width={26} height={3} rx={1.5} fill={c} />}
            <Circle cx={plugX(n)} cy={IN_Y} r={8} fill="#0B0D10" stroke={u ? '#E8EAED' : '#3A414B'} strokeWidth={2} />
            <Circle cx={plugX(n)} cy={IN_Y} r={3} fill={u ? '#E8EAED' : '#2A3038'} />
            <SvgText x={plugX(n)} y={IN_Y + 22} textAnchor="middle" fontSize={11} fontWeight="900" fill={u ? '#E8EAED' : '#5B636D'}>{String(n)}</SvgText>
            <SvgText x={plugX(n)} y={IN_Y + 34} textAnchor="middle" fontSize={8.5} fontWeight="800" fill={nm ? c : '#4B525C'}>{nm ? shortName(nm.n, 8) : n >= 17 ? 'Ordi' : 'libre'}</SvgText>
            {ring && <SvgText x={plugX(n)} y={IN_Y - 24} textAnchor="middle" fontSize={8.5} fontWeight="900" fill="#FCD34D">{ring.n}</SvgText>}
          </G>
        );
      })}
      <SvgText x={plugX(1) - 28} y={IN_Y + 4} textAnchor="end" fontSize={11} fontWeight="800" fill="#9AA3AD">IN</SvgText>
      <Line x1={30} y1={(IN_Y + OUT_Y) / 2 + 4} x2={W - 30} y2={(IN_Y + OUT_Y) / 2 + 4} stroke="#2A3038" strokeWidth={1.5} />
      <SvgText x={outX('aux1') - 28} y={OUT_Y + 4} textAnchor="end" fontSize={11} fontWeight="800" fill="#9AA3AD">OUT</SvgText>
      <Rect x={LR_X - 30} y={OUT_Y - 14} width={60} height={28} rx={14} fill="#0B0D10" stroke={MIX_COLORS[0]} strokeWidth={1.5} strokeDasharray="4 3" />
      <SvgText x={LR_X} y={OUT_Y + 4} textAnchor="middle" fontSize={12} fontWeight="900" fill={MIX_COLORS[0]}>L + R</SvgText>
      {names.get('mono') && <SvgText x={(outX('mainL') + outX('mainR')) / 2} y={OUT_Y + 39} textAnchor="middle" fontSize={9} fontWeight="900" fill={names.get('mono')!.n === '1' ? '#FCD34D' : '#9AA3AD'}>{names.get('mono')!.n === '1' ? 'MONO · 1 ENCEINTE' : 'STÉRÉO'}</SvgText>}
      {OUTS.map((id, k) => {
        const u = used.has(id);
        const on = selKey === id;
        const c = k < 6 ? MIX_COLORS[k + 1] : MIX_COLORS[0];
        const x = outX(id);
        const main = k >= 6;
        const hl = rel.get('ro' + id); // entend l'entrée choisie
        const dots = (rel.get('d' + id)?.n ?? '').split(',').filter(Boolean);
        const op = anyRel && !on && !hl ? 0.35 : 1;
        return (
          <G key={id} opacity={op}>
            <Rect x={x - 20} y={OUT_Y - 24} width={main ? 62 : 92} height={64} rx={10} fill={on ? '#22272D' : '#181B20'} stroke={on ? '#FFFFFF' : hl ? c : u ? c : '#3A414B'} strokeWidth={on || hl ? 2.5 : 1.5} strokeDasharray={u || main ? undefined : '4 3'} />
            <Circle cx={x} cy={OUT_Y} r={10} fill="#0B0D10" stroke={c} strokeWidth={2.5} />
            <Circle cx={x} cy={OUT_Y} r={4} fill={u ? c : '#2A3038'} />
            <SvgText x={x + 15} y={OUT_Y - 9} fontSize={9.5} fontWeight="900" fill={c}>{main ? (id === 'mainL' ? 'L' : 'R') : `AUX ${k + 1}`}</SvgText>
            {!main && <SvgText x={x + 15} y={OUT_Y + 4} fontSize={10} fontWeight="800" fill="#E8EAED">{shortName(names.get(id)?.n ?? `Retour ${k + 1}`, 9)}</SvgText>}
            {main && <SvgText x={x + 15} y={OUT_Y + 4} fontSize={9} fontWeight="800" fill="#E8EAED">MAIN</SvgText>}
            {!main && dots.slice(0, 9).map((dc, j) => <Circle key={j} cx={x - 12 + j * 9} cy={OUT_Y + 22} r={3.2} fill={dc} />)}
            {hl ? <SvgText x={x - 15} y={OUT_Y + 35} fontSize={8.5} fontWeight="900" fill="#FCD34D">{main ? hl.n.replace('l’entend ', '') : hl.n}</SvgText>
              : !main && <SvgText x={x - 15} y={OUT_Y + 35} fontSize={8.5} fontWeight="700" fill="#9AA3AD">{dots.length ? `entend ${dots.length} voie${dots.length > 1 ? 's' : ''}` : u ? 'n’entend rien' : 'libre'}</SvgText>}
          </G>
        );
      })}
    </G>
  );
});

/** Case de la palette : un appui ajoute, un glissé dépose où on lâche. */
type Pt = { x: number; y: number };
function PalCell({ style, onTap, onTip, onStart, onMove, onDrop, children }: { style: object; onTap: () => void; onTip?: () => void; onStart: (p: Pt) => void; onMove: (p: Pt) => void; onDrop: (p: Pt | null) => void; children: React.ReactNode }) {
  const cb = useRef({ onTap, onTip, onStart, onMove, onDrop });
  cb.current = { onTap, onTip, onStart, onMove, onDrop };
  const [down, setDown] = useState(false);
  const pan = useRef((() => {
    let dragging = false;
    let tip: ReturnType<typeof setTimeout> | null = null;
    let tipped = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !dragging,
      onPanResponderGrant: () => { dragging = false; tipped = false; setDown(true); tip = setTimeout(() => { tipped = true; cb.current.onTip?.(); }, 600); },
      onPanResponderMove: (e, g) => {
        const p = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        if (!dragging && Math.abs(g.dx) + Math.abs(g.dy) > 8) { dragging = true; if (tip) clearTimeout(tip); cb.current.onStart(p); }
        if (dragging) cb.current.onMove(p);
      },
      onPanResponderRelease: (e) => {
        if (tip) clearTimeout(tip);
        setDown(false);
        if (dragging) cb.current.onDrop({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        else if (!tipped) cb.current.onTap();
        dragging = false;
      },
      onPanResponderTerminate: () => { if (tip) clearTimeout(tip); setDown(false); if (dragging) cb.current.onDrop(null); dragging = false; },
    });
  })()).current;
  return <View style={[style, down && { opacity: 0.6 }]} {...pan.panHandlers}>{children}</View>;
}

/** Ce qu'entend un retour (AUX n). Replié : la liste des voies qu'il reçoit ; déplié : un potentiomètre par voie. */
let mixOpen = false; // gardé d'un retour à l'autre
function RetourMix({ client, theme, n }: { client: XAirClient; theme: Theme; n: number }) {
  useAnyTick(client, 120);
  const [open, setOpen] = useState(mixOpen);
  const t = { kind: 'bus' as const, n };
  const chans = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(chNamePath(c)) ?? '').trim());
  useEffect(() => { client.loadPaths(chans.map((c) => chLevelPath(c, t))); }, [client, n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!chans.length) return <Text style={{ color: theme.muted, fontSize: 12 }}>Aucune voie nommée sur la table.</Text>;
  const heard = chans.filter((c) => Number(client.get(chLevelPath(c, t)) ?? 0) > 0);
  const toggle = () => { mixOpen = !open; setOpen(!open); };
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={toggle} style={[styles.row, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
        <Text style={{ color: theme.text, fontWeight: '900', fontSize: 12, flex: 1 }}>🎧 Ce qu’il entend · AUX {n} · {heard.length} voie{heard.length > 1 ? 's' : ''}</Text>
        <Text style={{ color: theme.accent, fontWeight: '900', fontSize: 12 }}>{open ? '▴ Replier' : '▾ Régler'}</Text>
      </Pressable>
      {!open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {heard.map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, height: 22, borderRadius: 11, borderWidth: 1, borderColor: chColor(client, c) }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: chColor(client, c) }} />
              <Text style={{ color: theme.text, fontSize: 10, fontWeight: '800' }}>{String(client.get(chNamePath(c)) ?? '').slice(0, 12)}</Text>
            </View>
          ))}
          {!heard.length && <Text style={{ color: theme.muted, fontSize: 12 }}>N’entend rien pour l’instant · touche « Régler ».</Text>}
        </View>
      )}
      {open && (
        <>
          <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '800' }}>Tourne pour régler · touche un nom pour l’ajouter / l’enlever</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' }}>
            {chans.map((c) => {
              const path = chLevelPath(c, t);
              const v = Number(client.get(path) ?? 0);
              return (
                <LevelKnob key={c} size={40} theme={theme} wide={false} value={v} label={String(client.get(chNamePath(c)) ?? '')} kicker={`VOIE ${c}`} color={chColor(client, c)} off="n’entend pas"
                  onToggle={() => client.set(path, oscF(v > 0 ? 0 : dbToFader(-10)))} onSet={(x) => client.set(path, oscF(x))} />
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

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
  // glisser-déposer depuis la palette : un « fantôme » suit le doigt
  type Ghost = { kind?: Kind; config?: string; x: number; y: number; over: boolean; zone?: string } | null;
  const [ghost, setGhost] = useState<Ghost>(null);
  const rootRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const boxRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const origin = useRef({ root: { x: 0, y: 0 }, box: { x: 0, y: 0 } });
  const ghostFrame = useRef(0);
  const ghostNext = useRef<Ghost>(null);

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
  const plugOfChan = (c: number) => insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1));
  /** Les groupes (DCA) de la table, en prises. */
  const tableGroups = (): TableGroup[] => readGroups(client).filter((g) => g.members.length).map((g) => ({ k: g.k, name: g.name, plugs: g.members.map(plugOfChan) }));
  const tableBuses = () => Array.from({ length: BUS_COUNT }, (_, k) => ({ n: k + 1, name: String(client.get(busNamePath(k + 1)) ?? '').trim() })).filter((b) => b.name);
  const plugName = (n: number) => tableChans().find((c) => c.plug === n)?.name ?? '';

  useEffect(() => {
    const chs = Array.from({ length: CH_COUNT }, (_, k) => k + 1);
    const paths = [...chs.map(chNamePath), ...chs.map(insrcPath), ...chs.map(chDcaPath), ...chs.map((c) => `/ch/${String(c).padStart(2, '0')}/config/color`), ...Array.from({ length: BUS_COUNT }, (_, k) => busNamePath(k + 1)), ...Array.from({ length: DCA_COUNT }, (_, k) => dcaNamePath(k + 1)), ...monoPaths(), ...chs.flatMap((c) => [chLevelPath(c, MAIN), ...Array.from({ length: BUS_COUNT }, (_, k) => chLevelPath(c, { kind: 'bus', n: k + 1 }))])];
    Promise.all([load<Stage>('scene', EMPTY), client.loadPaths(paths).catch(() => {})]).then(([s]) => {
      let cur = s ?? EMPTY;
      // plan lié à la table : les pistes déjà occupées arrivent toutes seules, câblées
      if (!cur.free) {
        if (!cur.objs.length) { const ch = tableChans(); if (ch.length) cur = fromChannels(ch, tableBuses()); }
        else cur = syncWithTable(cur, tableChans()).st;
        cur = groupsToStage(cur, tableGroups()); // les groupes de la table deviennent des cadres
      }
      setSt(cur);
      setLoaded(true);
    });
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  // enregistré une demi-seconde après le dernier changement (pas à chaque mouvement du doigt)
  useEffect(() => { if (!loaded) return; const t = setTimeout(() => save('scene', st), 500); return () => clearTimeout(t); }, [st, loaded]);
  // lien fort : les cadres deviennent les groupes de la table (au repos, pas pendant un glissé)
  const owned = useRef<number[]>([]);
  const lastWrite = useRef(0);
  const [monoV, setMonoV] = useState(() => isMono(client));
  const [mixTick, setMixTick] = useState(0);
  // les câbles des retours et de la façade peuvent être cachés (le plan reste léger)
  const [showOut, setShowOut] = useState(true);
  useEffect(() => { load<boolean>('sceneShowOut', true).then((v) => setShowOut(v !== false)); }, []);
  const toggleOut = () => setShowOut((v) => { save('sceneShowOut', !v); return !v; });
  useEffect(() => onMonoChange(setMonoV), []);
  const dirty = useRef(false);
  const stRef = useRef(st);
  stRef.current = st;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  /** Écrit sur la table ce que la scène doit y changer. Rend la scène (cadres numérotés). */
  const write = (path: string, arg: Parameters<XAirClient['set']>[1]) => { lastWrite.current = Date.now(); client.set(path, arg); };
  const pushGroups = (cur: Stage): Stage => {
    if (!cur.strong) { owned.current = []; return cur; }
    const mine = zonesOf(cur).map((z) => z.dca).filter(Boolean) as number[];
    const used = readGroups(client).filter((g) => g.members.length && !mine.includes(g.k)).map((g) => g.k);
    const r = stageToGroups(cur, used, DCA_COUNT);
    const now = r.groups.map((g) => g.k);
    const setBit = (c: number, k: number, on: boolean) => {
      const m = Number(client.get(chDcaPath(c)) ?? 0);
      const want = on ? m | (1 << (k - 1)) : m & ~(1 << (k - 1));
      if (want !== m) write(chDcaPath(c), oscI(want));
    };
    for (const g of r.groups) {
      const chans = new Set(g.plugs.map(chanOfPlug).filter(Boolean));
      for (let c = 1; c <= CH_COUNT; c++) setBit(c, g.k, chans.has(c));
      const nm = g.name.slice(0, 12);
      if (String(client.get(dcaNamePath(g.k)) ?? '') !== nm) write(dcaNamePath(g.k), oscS(nm));
    }
    // un cadre disparu : son groupe est vidé
    for (const k of owned.current) if (!now.includes(k)) for (let c = 1; c <= CH_COUNT; c++) setBit(c, k, false);
    owned.current = now;
    return r.st;
  };
  const pushRef = useRef(pushGroups);
  pushRef.current = pushGroups;
  useEffect(() => {
    if (!loaded) return;
    dirty.current = true;
    const t = setTimeout(() => { const n = pushGroups(st); dirty.current = false; if (n !== st) setSt(n); }, 500);
    return () => clearTimeout(t);
  }, [st, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // on quitte l'écran : rien ne se perd, la scène est enregistrée et la table mise à jour tout de suite
  useEffect(() => () => {
    if (!loadedRef.current || !dirty.current) return;
    const cur = stRef.current;
    const push = pushRef.current;
    save('scene', cur);
    // juste après : l'écran suivant (Table…) écoute déjà, il voit le changement arriver
    setTimeout(() => save('scene', push(cur)), 0);
  }, []);
  // la table change (autre appareil, écran Table…) : le plan suit en direct
  useEffect(() => {
    if (!loaded) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let mt: ReturnType<typeof setTimeout> | null = null;
    const off = client.on('*', (_v, path) => {
      if (/\/mix\/(\d\d\/level|fader)$/.test(String(path))) { if (!mt) mt = setTimeout(() => { mt = null; setMixTick((x) => x + 1); }, 150); return; }
      if (!/\/(config\/name|grp\/dca|config\/insrc)$/.test(String(path))) return;
      if (Date.now() - lastWrite.current < 1200 || dirty.current) return; // c'est nous qui venons d'écrire
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        setSt((cur) => {
          if (cur.free) return cur;
          const n = groupsToStage(syncWithTable(cur, tableChans()).st, tableGroups());
          return JSON.stringify(n) === JSON.stringify(cur) ? cur : n;
        });
      }, 400);
    });
    return () => { off(); if (t) clearTimeout(t); };
  }, [client, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- géométrie : la scène prend toute la place disponible
  const H = size.w ? Math.max(520, Math.min(1000, Math.round((W * size.h) / size.w))) : 600;
  const sc = size.w && size.h ? Math.min(size.w / W, size.h / H) : 0;
  const STAGE_H = H - 184;
  const IN_Y = H - 148;
  const OUT_Y = H - 62;
  const SY = STAGE_H - 64;
  const px = (x: number) => 30 + x * 940;
  const py = (y: number) => 30 + y * SY;
  const fx = (X: number) => (X - 30) / 940;
  const fy = (Y: number) => (Y - 30) / SY;
  const zoneRect = (z: Zone) => ({ x1: px(z.x), y1: py(z.y), x2: px(z.x + z.w), y2: py(z.y + z.h) });
  const objPos = (o: StageObj) => ({ x: px(o.x), y: py(o.y) });
  const posOf = (e: End) => {
    if ('plug' in e) return { x: plugX(e.plug), y: IN_Y };
    if ('out' in e) return e.out === 'mainLR' ? { x: LR_X, y: OUT_Y } : { x: outX(e.out), y: OUT_Y };
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
      if (n > 1 && Math.abs(x - (r.x1 + r.x2) / 2) < 80 && Math.abs(y - (r.y2 + 16)) < 15) return { t: 'bundle', id: z.id };
      const tw = zoneTitleW(`${z.name}${z.drums ? ` · ${membersOf(st, z.id).length} él.` : ''}`);
      if (Math.abs(x - (r.x1 + r.x2) / 2) < tw / 2 + 10 && Math.abs(y - r.y1) < 20) return { t: 'zone', id: z.id };
    }
    if (Math.abs(y - IN_Y) < 24) for (let n = 1; n <= 18; n++) if (Math.abs(x - plugX(n)) < 23) return { t: 'end', e: { plug: n } };
    if (Math.abs(y - OUT_Y) < 26) {
      // MAIN L et MAIN R d'abord : la pastille « L + R » ne prend que sa propre surface
      for (const id of OUTS) if (Math.abs(x - outX(id)) < 28) return { t: 'end', e: { out: id } };
      if (Math.abs(x - LR_X) < 32) return { t: 'end', e: { out: 'mainLR' } };
    }
    return null;
  };
  const endOfHit = (h: Hit): End | null => (!h ? null : h.t === 'obj' ? { o: h.id } : h.t === 'end' ? h.e : null);

  // ---- gestes
  const latest = useRef({ sc, st, mode, ctype, hit, sel, fx, fy, SY, onCabled: (x: Stage, _a: End, _b: End) => x, afterMain: (_x: Stage, _e: End[]) => {} });
  latest.current = { sc, st, mode, ctype, hit, sel, fx, fy, SY, onCabled: (x: Stage, a: End, b: End) => onCabledRef.current(x, a, b), afterMain: (x: Stage, e: End[]) => afterMainRef.current(x, e) };
  const onCabledRef = useRef((x: Stage, _a: End, _b: End) => x);
  const afterMainRef = useRef((_x: Stage, _e: End[]) => {});
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
        if ('out' in end && end.out === 'mainLR' && L.mode !== 'wire') { putDrag(null); return; }
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
          if (to && !sameEnd(to, d.from)) {
            const ty = L.ctype === 'auto' ? undefined : L.ctype;
            const from = d.from;
            // « L + R » : un câble vers chaque sortie de façade
            const lr = (e: End): End[] => ('out' in e && e.out === 'mainLR' ? [{ out: 'mainL' }, { out: 'mainR' }] : [e]);
            let next = L.st;
            for (const a of lr(from)) for (const b of lr(to)) { next = addCable(next, a, b, ty); next = L.onCabled(next, a, b); }
            setSt(next);
            L.afterMain(next, [from, to]);
            const keep = 'o' in from ? { obj: from.o } : 'out' in from && from.out === 'mainLR' ? null : { end: from };
            setSel(keep);
          }
          return;
        }
        // après un déplacement : rien ne s'ouvre, le bloc entre (ou sort) du cadre et les cadres s'adaptent
        if (d.kind === 'obj' && d.id) { const id = d.id; setSt((cur) => dropAndFit(cur, id)); }
      },
      onPanResponderTerminate: () => putDrag(null),
    }),
  ).current;

  // ---- lien fort : ce qu'on règle sur la scène agit sur la table
  const [linkBox, setLinkBox] = useState(false);
  const linkMode: 'free' | 'read' | 'strong' = st.free ? 'free' : st.strong ? 'strong' : 'read';
  /** La voie de la table branchée sur une prise (par défaut la voie du même numéro). */
  const chanOfPlug = (plug: number) => {
    for (let c = 1; c <= CH_COUNT; c++) if (insrcPlug(Number(client.get(insrcPath(c)) ?? c - 1)) === plug) return c;
    return plug <= CH_COUNT ? plug : 0;
  };
  const nameOnTable = (plug: number, name: string) => { const c = chanOfPlug(plug); if (c) write(chNamePath(c), oscS(name.trim().slice(0, 12))); };
  const freeOnTable = (plug: number) => { const c = chanOfPlug(plug); if (c) { write(chNamePath(c), oscS('')); write(chOnPath(c), oscI(0)); } };
  /** Un câble vient d'être tiré : en lien fort, la voie (ou le retour) prend le nom du bloc. */
  const onCabled = (cur: Stage, a: End, b: End): Stage => {
    if (!cur.strong) return cur;
    const objEnd = 'o' in a ? a : 'o' in b ? b : null;
    const other = objEnd === a ? b : a;
    if (!objEnd) return cur;
    const o = cur.objs.find((q) => q.id === objEnd.o);
    if (!o) return cur;
    if ('plug' in other) {
      const nm = sourceName(cur, o.id);
      nameOnTable(other.plug, nm);
      showTip(`Voie ${chanOfPlug(other.plug)} de la table nommée « ${nm.slice(0, 12)} ».`);
      return { ...cur, objs: cur.objs.map((q) => (q.id === o.id ? { ...q, plug: other.plug } : q)), ignored: (cur.ignored ?? []).filter((n) => n !== other.plug) };
    }
    if ('out' in other && other.out.startsWith('aux')) {
      const n = Number(other.out.slice(3));
      const z = o.zone ? zonesOf(cur).find((q) => q.id === o.zone) : undefined;
      const nm = (z && !['Musicien', 'À placer'].includes(z.name) ? z.name : o.name).slice(0, 12);
      write(busNamePath(n), oscS(nm));
      showTip(`Retour ${n} de la table nommé « ${nm} ».`);
    }
    return cur;
  };
  onCabledRef.current = onCabled;
  /** Une seule enceinte de façade branchée : la table doit passer en « 1 enceinte ». */
  afterMainRef.current = (cur: Stage, ends: End[]) => {
    if (!cur.strong || !ends.some((e) => 'out' in e && e.out.startsWith('main'))) return;
    const l = touching(cur, { out: 'mainL' }).length > 0;
    const r = touching(cur, { out: 'mainR' }).length > 0;
    if (l !== r && !isMono(client)) {
      Alert.alert('Une seule enceinte en façade', `Seul MAIN ${l ? 'L' : 'R'} est branché : les sons placés de l’autre côté seraient perdus. Passer la table en « 1 enceinte » (tout au centre) ?`, [
        { text: 'Passer en 1 enceinte', onPress: () => { lastWrite.current = Date.now(); goMono(client).then(() => showTip('Table en « 1 enceinte » : tout est au centre.')); } },
        { text: 'Non, laisser', style: 'cancel' },
      ]);
    }
  };
  const renameObj = (o: StageObj, v: string) => {
    setSt({ ...st, objs: st.objs.map((q) => (q.id === o.id ? { ...q, name: v } : q)) });
    if (!st.strong || !v.trim()) return;
    if (family(o.kind) === 'monitor') {
      const aux = touching(st, { o: o.id }).map((c) => ('out' in c.a ? c.a.out : 'out' in c.b ? c.b.out : '')).find((x) => x.startsWith('aux'));
      if (aux) write(busNamePath(Number(aux.slice(3))), oscS(v.trim().slice(0, 12)));
      return;
    }
    // la prise du bloc, ou celle de la DI / du micro sur lequel il est branché
    let plug = o.plug ?? plugOf(st, o.id);
    if (plug === undefined) for (const c of touching(st, { o: o.id })) {
      const e = sameEnd(c.a, { o: o.id }) ? c.b : c.a;
      const q = 'o' in e ? st.objs.find((x) => x.id === e.o) : undefined;
      if (q && family(q.kind) === 'gear') { plug = q.plug ?? plugOf(st, q.id); if (plug !== undefined) break; }
    }
    if (plug !== undefined) nameOnTable(plug, v);
  };
  const deleteObj = (o: StageObj) => {
    const plug = o.plug ?? (st.strong ? plugOf(st, o.id) : undefined);
    const done = (next: Stage) => { setSt(next); setSel(null); };
    const aux = touching(st, { o: o.id }).map((c) => ('out' in c.a ? c.a.out : 'out' in c.b ? c.b.out : '')).find((x) => x.startsWith('aux'));
    if (st.strong && family(o.kind) === 'monitor' && aux) {
      const n = Number(aux.slice(3));
      Alert.alert(`Retirer « ${o.name} » ?`, `Ce retour est branché sur AUX ${n} (« ${busName(n)} » sur la table).`, [
        { text: 'Retirer du plan seulement', onPress: () => done(pruneZones(removeObj(st, o.id))) },
        { text: `Remettre AUX ${n} à « Retour ${n} »`, style: 'destructive', onPress: () => { write(busNamePath(n), oscS('')); done(pruneZones(removeObj(st, o.id))); } },
        { text: 'Annuler', style: 'cancel' },
      ]);
      return;
    }
    if (linkMode === 'free' || plug === undefined) { done(pruneZones(removeObj(st, o.id))); return; }
    if (linkMode === 'read') { done(removeFromPlan(st, o.id)); return; }
    const c = chanOfPlug(plug);
    Alert.alert(`Retirer « ${o.name} » ?`, `Il est branché sur la prise ${plug} (voie ${c} de la table).`, [
      { text: 'Retirer du plan seulement', onPress: () => done(removeFromPlan(st, o.id)) },
      { text: `Libérer aussi la voie ${c} (nom effacé, coupée)`, style: 'destructive', onPress: () => { freeOnTable(plug); done(removeFromPlan(st, o.id)); } },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };
  const setLink = (m: 'free' | 'read' | 'strong') => {
    setLinkBox(false);
    if (m === 'free') { setSt({ ...st, free: true, strong: false }); return; }
    const r = syncWithTable({ ...st, free: false, strong: m === 'strong' }, tableChans());
    setSt(groupsToStage(r.st, tableGroups()));
    if (r.added || r.removed) showTip(`${r.added ? `${r.added} voie${r.added > 1 ? 's' : ''} de la table ajoutée${r.added > 1 ? 's' : ''} au plan` : ''}${r.added && r.removed ? ' · ' : ''}${r.removed ? `${r.removed} bloc${r.removed > 1 ? 's' : ''} sans voie retiré${r.removed > 1 ? 's' : ''}` : ''}.`);
  };

  // ---- glisser depuis la palette
  const measure = () => {
    rootRef.current?.measureInWindow((x, y) => { origin.current.root = { x, y }; });
    boxRef.current?.measureInWindow((x, y) => { origin.current.box = { x, y }; });
  };
  /** Où tombe le doigt sur la scène (coordonnées 0..1), ou null hors de la scène. */
  const dropAt = (p: { x: number; y: number }) => {
    const s = sc || 1;
    const X = (p.x - origin.current.box.x) / s;
    const Y = (p.y - origin.current.box.y) / s;
    if (X < 0 || X > W || Y < 0 || Y > STAGE_H) return null;
    return { x: Math.max(0, Math.min(1, fx(X))), y: Math.max(0, Math.min(1, fy(Y))) };
  };
  const ghostStart = (what: { kind?: Kind; config?: string }) => (p: { x: number; y: number }) => {
    measure();
    setSel(null);
    const g0 = { ...what, x: p.x - origin.current.root.x, y: p.y - origin.current.root.y, over: false };
    ghostNext.current = g0;
    setGhost(g0);
  };
  const ghostMove = (p: { x: number; y: number }) => {
    const at = dropAt(p);
    if (!ghostNext.current) return;
    ghostNext.current = { ...ghostNext.current, x: p.x - origin.current.root.x, y: p.y - origin.current.root.y, over: !!at, zone: at ? zoneAt(st, at.x, at.y)?.id : undefined };
    if (!ghostFrame.current) ghostFrame.current = requestAnimationFrame(() => { ghostFrame.current = 0; setGhost(ghostNext.current); });
  };
  const ghostDrop = (what: { kind?: Kind; config?: string }) => (p: { x: number; y: number } | null) => {
    if (ghostFrame.current) { cancelAnimationFrame(ghostFrame.current); ghostFrame.current = 0; }
    ghostNext.current = null;
    setGhost(null);
    const at = p ? dropAt(p) : null;
    if (!at) return; // lâché hors de la scène : rien
    if (what.config) {
      const c = CONFIGS.find((q) => q.key === what.config)!;
      const w = Math.max(0, ...c.items.map((i) => i.dx));
      const h = Math.max(0, ...c.items.map((i) => i.dy));
      const r = addConfig(st, what.config, at.x - w / 2, at.y - h / 2);
      setSt(r.st);
      return;
    }
    const k = what.kind!;
    const o: StageObj = { id: newId('o'), kind: k, name: k === 'autre' ? 'Instrument' : kindLabel(k), x: at.x, y: at.y };
    setSt(dropAndFit({ ...st, objs: [...st.objs, o] }, o.id));
  };

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
    Alert.alert('Refaire d’après la table ?', 'La scène est remplacée par une scène faite d’après tes voies et tes retours.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Refaire', onPress: () => { setSt({ ...fromChannels(ch, tableBuses()), free: st.free, strong: st.strong }); setSel(null); } }]);
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
  // qui entend quoi, lu sur la table : les retours montrent leurs voies, la sélection s'allume
  void mixTick;
  const relKey = (() => {
    if (linkMode === 'free') return '';
    const tOf = (id: string) => (id.startsWith('aux') ? { kind: 'bus' as const, n: Number(id.slice(3)) } : MAIN);
    const lv = (c: number, id: string) => (id.startsWith('main') && !monoV && !onSide(client, [c], id === 'mainL' ? 'L' : 'R') ? 0 : Number(client.get(chLevelPath(c, tOf(id))) ?? 0));
    const dbs = (v: number) => { const d = Math.round(faderToDb(v)); return `${d > 0 ? '+' : ''}${d} dB`; };
    const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(chNamePath(c)) ?? '').trim());
    const lines: string[] = [];
    for (const id of OUTS) lines.push(`d${id}=${named.filter((c) => lv(c, id) > 0).map((c) => chColor(client, c)).join(',')}`);
    const selPlug = selEnd && 'plug' in selEnd ? selEnd.plug : selObj ? selObj.plug ?? plugOf(st, selObj.id) : undefined;
    const selOutId = selEnd && 'out' in selEnd ? selEnd.out : selObj && family(selObj.kind) === 'monitor' ? touching(st, { o: selObj.id }).map((c) => ('out' in c.a ? c.a.out : 'out' in c.b ? c.b.out : '')).find(Boolean) : undefined;
    if (selOutId && selOutId !== 'mainLR') {
      lines.push('sel=1');
      for (const c of named) { const v = lv(c, selOutId); if (v > 0) lines.push(`rp${plugOfChan(c)}=${dbs(v)}`); }
    } else if (selPlug !== undefined) {
      lines.push('sel=1');
      const c = chanOfPlug(selPlug);
      if (c) for (const id of OUTS) { const v = lv(c, id); if (v > 0) lines.push(`ro${id}=l’entend ${dbs(v)}`); }
    }
    return lines.join('\n');
  })();
  // une couleur par voie, la même que sur la table ; un retour a la couleur de son AUX
  const objColor = (o: StageObj): string => {
    if (linkMode === 'free') return FAM[family(o.kind)];
    const near = (oid: string) => touching(st, { o: oid }).map((c) => (sameEnd(c.a, { o: oid }) ? c.b : c.a));
    for (const e of near(o.id)) if ('out' in e) { const k = OUTS.indexOf(e.out); return k < 6 ? MIX_COLORS[k + 1] : MIX_COLORS[0]; }
    // on suit la chaîne (guitare › pédalier › ampli › micro › prise) jusqu'à la table
    let plug = o.plug ?? plugOf(st, o.id);
    const seen = new Set([o.id]);
    let front = [o.id];
    for (let depth = 0; plug === undefined && depth < 5 && front.length; depth++) {
      const next: string[] = [];
      for (const id of front) for (const e of near(id)) {
        if (!('o' in e) || seen.has(e.o)) continue;
        const q = st.objs.find((x) => x.id === e.o);
        if (!q || family(q.kind) === 'monitor') continue;
        seen.add(q.id);
        const p2 = q.plug ?? plugOf(st, q.id);
        if (p2 !== undefined) { plug = p2; break; }
        next.push(q.id);
      }
      front = next;
    }
    // le micro devant l'ampli n'est pas un câble : dans un cadre d'une seule voie, tout prend sa couleur
    if (plug === undefined && o.zone) { const zp = zonePlugs(st, o.zone); if (zp.length === 1) plug = zp[0]; }
    if (plug === undefined) return '#6B7280'; // pas branché à la table
    const c = chanOfPlug(plug);
    return c ? chColor(client, c) : '#6B7280';
  };
  // un cadre d'une seule voie a la couleur de cette voie (comme sur la table)
  const zoneColor = (z: Zone) => {
    if (linkMode === 'free') return z.color;
    const zp = zonePlugs(st, z.id);
    const c = zp.length === 1 ? chanOfPlug(zp[0]) : 0;
    return c ? chColor(client, c) : z.color;
  };
  const namesKey = [
    ...Array.from({ length: 18 }, (_, k) => k + 1).filter((n) => perEnd.has('p' + n)).map((n) => `p${n}=${plugName(n) || (st.objs.find((o) => o.plug === n)?.name ?? '')}|${chanOfPlug(n) ? chColor(client, chanOfPlug(n)) : '#9AA3AD'}`),
    ...(linkMode === 'free' ? [] : Array.from({ length: BUS_COUNT }, (_, k) => `aux${k + 1}=${busName(k + 1)}|`)),
    ...(linkMode === 'free' ? [] : [`mono=${monoV ? '1' : '0'}|`]),
  ].join('\n');
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
    <View ref={rootRef} style={{ flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingBottom: 8 }}>
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
            <PalCell key={c.key} onTap={() => { const r = addConfig(st, c.key); setSt(r.st); setSel(null); }} onStart={ghostStart({ config: c.key })} onMove={ghostMove} onDrop={ghostDrop({ config: c.key })} style={[styles.pal, { width: Math.floor((inner - (cCols - 1) * 4) / cCols), height: cellH, flexDirection: 'row', gap: 4, paddingHorizontal: 4, borderColor: c.drums ? FAM.drum : theme.line2 }]}>
              {showIcon && <Svg width={24} height={24} viewBox="0 0 30 30"><KindIcon kind={c.drums ? 'batterie' : c.items[0].kind} x={15} y={15} c={FAM[family(c.drums ? 'batterie' : c.items[0].kind)]} s={0.62} /></Svg>}
              <Text numberOfLines={3} style={[styles.palT, { color: theme.text, flex: 1, textAlign: 'left' }]}>{c.label}</Text>
            </PalCell>
          )) : PALETTE[palTab].map((k) => (
            <PalCell key={k} onTap={() => addObj(k)} onTip={() => showTip(`Glisse ${kindLabel(k).toLowerCase()} sur la scène, à sa place (dans un cadre, il y entre). Un simple appui le pose au milieu.`)} onStart={ghostStart({ kind: k })} onMove={ghostMove} onDrop={ghostDrop({ kind: k })} style={[styles.pal, { width: cellW, height: cellH, borderColor: theme.line2 }]}>
              {showIcon ? <Svg width={26} height={26} viewBox="0 0 30 30"><KindIcon kind={k} x={15} y={15} c={FAM[family(k)]} s={0.62} /></Svg> : null}
              <Text numberOfLines={showIcon && cellH < 50 ? 1 : 2} style={[styles.palT, { color: theme.text, lineHeight: 11 }]}>{kindLabel(k).replace('Guitare ', 'Guit. ').replace('Contrebasse', 'Contreb.').replace('Violoncelle', 'Vlc.')}</Text>
            </PalCell>
          ))}
        </View>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {/* barre d'outils, une ligne */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Segmented theme={theme} value={mode} onChange={setMode} options={[['move', '✋ Déplacer'], ['wire', '🔌 Câbler'], ['frame', '▢ Cadre']] as const} />
          {mode === 'wire' && <Segmented theme={theme} value={ctype} onChange={setCtype} options={[['auto', 'Auto'], ['jack', 'Jack'], ['xlr', 'XLR']] as const} />}
          <Text style={{ flex: 1, color: mode === 'frame' ? '#60A5FA' : theme.muted, fontSize: 12, fontWeight: mode === 'frame' ? '800' : '400' }} numberOfLines={2}>
            {mode === 'wire' ? 'Glisse d’un bloc à un autre, ou jusqu’à une prise.' : mode === 'frame' ? 'Glisse en diagonale sur la scène pour entourer des blocs.' : 'Glisse un instrument de la palette sur la scène · glisse un bloc pour le bouger · le titre d’un cadre le déplace.'}
          </Text>
          <Pressable onPress={() => setLinkBox(true)} style={[styles.tool, linkMode === 'free' ? { borderColor: theme.line2 } : linkMode === 'strong' ? { borderColor: '#F59E0B', backgroundColor: '#2A1E0A' } : { borderColor: '#34D399', backgroundColor: '#13261E' }]}>
            <Text style={{ color: linkMode === 'free' ? theme.text : linkMode === 'strong' ? '#FCD34D' : '#6EE7B7', fontWeight: '800', fontSize: 12 }}>{linkMode === 'free' ? '○ Libre' : linkMode === 'strong' ? '⇄ Lien fort' : '● Lié'}</Text>
          </Pressable>
          <Pressable onPress={() => setSel(sel && 'gear' in sel ? null : { gear: true })} style={[styles.tool, { borderColor: theme.accent }]}>
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 12 }}>🎒 {xlrN} XLR · {jackN} jack</Text>
          </Pressable>
          <Pressable onPress={exportMenu} style={[styles.tool, { borderColor: theme.accent, backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 12 }}>↗ Exporter</Text></Pressable>
          <Pressable onPress={toggleOut} onLongPress={() => showTip('Montre ou cache les câbles qui vont aux retours et à la façade. Cachés, ceux d’un retour réapparaissent quand tu le touches.')} accessibilityState={{ selected: showOut }} style={[styles.tool, showOut ? { borderColor: theme.line2 } : { borderColor: theme.accent, backgroundColor: 'rgba(245,158,11,0.12)' }]}>
            <Text style={{ color: showOut ? theme.text : theme.accent, fontWeight: '800', fontSize: 12 }}>{showOut ? '◉ Câbles retours' : '○ Retours cachés'}</Text>
          </Pressable>
          <Pressable onPress={more} accessibilityLabel="Plus" style={[styles.tool, { borderColor: theme.line2, paddingHorizontal: 12 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }}>⋯</Text></Pressable>
        </View>

        {/* la scène */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {sc > 0 && (
            <View ref={boxRef} style={{ width: W * sc, height: H * sc }}>
              <Svg ref={svgRef} width={W * sc} height={H * sc} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
                <BackG H={H} STAGE_H={STAGE_H} IN_Y={IN_Y} OUT_Y={OUT_Y} usedKey={usedKey} selKey={selKey} namesKey={namesKey} relKey={relKey} />
                {/* cadres */}
                {zonesOf(st).map((z) => {
                  const r = zoneRect(z);
                  return <ZoneG key={z.id} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} color={zoneColor(z)} label={`${z.name}${z.drums ? ` · ${membersOf(st, z.id).length} él.` : ''}`} on={selZone?.id === z.id || ghost?.zone === z.id} n={zoneTableCables(st, z.id).length} bundled={!!z.bundled} />;
                })}
                {/* câbles */}
                {st.cables.filter((c) => !hiddenCable.has(c.id) && (showOut || selIds.has(c.id) || !('out' in c.a || 'out' in c.b))).map((c) => <CableG key={c.id} d={cablePath(c, cableIdx[c.id] ?? 0).d} type={c.type} dim={anySel && !selIds.has(c.id)} />)}
                {/* faisceaux : un gros câble par cadre, jusqu'à ses prises */}
                {bundles.map(({ z, cables }) => {
                  const r = zoneRect(z);
                  const ports = cables.map((c) => posOf(isTableEnd(c.a) ? c.a : c.b).x);
                  const lo = Math.min(...ports);
                  const hi = Math.max(...ports);
                  const ax = (r.x1 + r.x2) / 2;
                  const y0 = STAGE_H + 4;
                  const yb = IN_Y - 22;
                  return (
                    <G key={'b' + z.id} opacity={anySel && selZone?.id !== z.id ? 0.35 : 1}>
                      <Path d={`M${ax} ${r.y2 + 28} L${ax} ${y0} C ${ax} ${y0 + 18}, ${(lo + hi) / 2} ${yb - 16}, ${(lo + hi) / 2} ${yb}`} stroke="#0B0D10" strokeWidth={16} fill="none" strokeLinecap="round" />
                      <Path d={`M${ax} ${r.y2 + 28} L${ax} ${y0} C ${ax} ${y0 + 18}, ${(lo + hi) / 2} ${yb - 16}, ${(lo + hi) / 2} ${yb}`} stroke={z.color} strokeWidth={11} fill="none" strokeLinecap="round" />
                      <Line x1={lo} y1={yb} x2={hi} y2={yb} stroke={z.color} strokeWidth={6} strokeLinecap="round" />
                      {ports.map((x, k) => <Line key={k} x1={x} y1={yb} x2={x} y2={IN_Y - 11} stroke={z.color} strokeWidth={3} />)}
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
                      {ok && ('out' in hov! && hov.out === 'mainLR' ? ['mainL', 'mainR'].map((m) => <Circle key={m} cx={outX(m)} cy={OUT_Y} r={20} fill="rgba(52,211,153,0.22)" stroke="#34D399" strokeWidth={4} />) : <Circle cx={b.x} cy={b.y} r={'o' in hov! ? R + 12 : 20} fill="rgba(52,211,153,0.22)" stroke="#34D399" strokeWidth={4} />)}
                      <CableG d={`M${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`} type={ty} dash={!ok} />
                    </G>
                  );
                })()}
                {/* blocs */}
                {st.objs.map((o) => {
                  const p = objPos(o);
                  const on = selObj?.id === o.id;
                  return <ObjG key={o.id} kind={o.kind} name={o.name} x={p.x} y={p.y} on={on} n={perEnd.get('o:' + o.id) ?? 0} dim={anySel && !on && !linked.has(o.id) && !(selZone && o.zone === selZone.id)} color={objColor(o)} />;
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
                <View style={[styles.card, cardLeft ? { left: 8 } : { right: 8 }, { maxHeight: H * sc - 16, backgroundColor: theme.panel, borderColor: selZone ? zoneColor(selZone) : selObj ? objColor(selObj) : theme.accent }]}>
                  <ScrollView contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {selObj ? (
                        <TextInput value={selObj.name} maxLength={24} onChangeText={(v) => renameObj(selObj, v)} style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
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
                    {(() => {
                      // un retour (ou une sortie AUX) : son mix, sans quitter le plan
                      const aux = selObj && family(selObj.kind) === 'monitor' ? touching(st, { o: selObj.id }).map((c) => ('out' in c.a ? c.a.out : 'out' in c.b ? c.b.out : '')).find((x) => x.startsWith('aux')) : selEnd && 'out' in selEnd && selEnd.out.startsWith('aux') ? selEnd.out : undefined;
                      return aux ? <RetourMix client={client} theme={theme} n={Number(aux.slice(3))} /> : null;
                    })()}

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
                        {selObj && <Pressable onPress={() => deleteObj(selObj)} style={[styles.btn, { minHeight: 34, borderWidth: 1, borderColor: '#7F1D1D' }]}><Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 12 }}>Retirer ce bloc</Text></Pressable>}
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
      {linkBox && (
        <Pressable onPress={() => setLinkBox(false)} style={styles.veil}>
          <Pressable onPress={() => {}} style={[styles.linkBox, { backgroundColor: theme.panel, borderColor: theme.line2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, color: theme.text, fontSize: 18, fontWeight: '900' }}>Le plan et la table</Text>
              <Pressable onPress={() => setLinkBox(false)} style={styles.x} accessibilityLabel="Fermer"><Text style={{ color: theme.muted, fontSize: 18 }}>✕</Text></Pressable>
            </View>
            {([
              ['free', '○ Plan libre', '#94A3B8', 'Le plan ne touche jamais la table, et la table ne touche pas le plan.', ['Pour préparer une autre salle ou un autre groupe.']],
              ['read', '● Lié', '#34D399', 'La table arrive sur le plan, mais le plan ne change rien sur la table.', ['Une voie nommée sur la table apparaît sur le plan, câblée à sa prise.', 'Une voie effacée sur la table quitte le plan.', 'Retirer un bloc l’enlève du plan seulement.']],
              ['strong', '⇄ Lien fort', '#F59E0B', 'Ce que tu règles sur la scène agit aussi sur la table.', ['Câbler un bloc à une prise nomme la voie (Sax › voie 7 « Sax »).', 'Renommer un bloc renomme la voie.', 'Câbler un retour à AUX 3 nomme le retour 3.', 'Retirer un bloc demande : du plan seulement, ou libérer la voie.', 'Le volume, l’EQ et les effets ne sont jamais touchés.']],
            ] as const).map(([k, title, c, sub, pts]) => {
              const on = linkMode === k;
              return (
                <Pressable key={k} onPress={() => setLink(k)} style={[styles.linkCard, { borderColor: on ? c : theme.line, backgroundColor: on ? c + '1A' : theme.deep }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: c, fontSize: 16, fontWeight: '900', flex: 1 }}>{title}</Text>
                    {on && <Text style={{ color: c, fontSize: 12, fontWeight: '900' }}>✓ ACTIF</Text>}
                  </View>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{sub}</Text>
                  {pts.map((t) => <Text key={t} style={{ color: theme.muted, fontSize: 12 }}>• {t}</Text>)}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      )}
      {ghost && (() => {
        const k: Kind = ghost.kind ?? (CONFIGS.find((q) => q.key === ghost.config)?.drums ? 'batterie' : CONFIGS.find((q) => q.key === ghost.config)?.items[0].kind ?? 'autre');
        const c = FAM[family(k)];
        const d = Math.max(40, R * 2 * (sc || 1) + 8);
        const label = ghost.kind ? kindLabel(ghost.kind) : CONFIGS.find((q) => q.key === ghost.config)?.label ?? '';
        return (
          <View pointerEvents="none" style={{ position: 'absolute', left: ghost.x - d / 2, top: ghost.y - d / 2 - 20, alignItems: 'center' }}>
            <Svg width={d} height={d} viewBox="-30 -30 60 60">
              <Circle cx={0} cy={0} r={27} fill="#1E2227" stroke={ghost.over ? c : '#5B636D'} strokeWidth={3} strokeDasharray={ghost.over ? undefined : '6 5'} />
              <KindIcon kind={k} x={0} y={0} c={c} s={1} />
            </Svg>
            <View style={{ marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, backgroundColor: ghost.over ? '#0B0D10' : '#3A1414' }}>
              <Text style={{ color: ghost.over ? '#E8EAED' : '#FCA5A5', fontSize: 11, fontWeight: '800' }}>{ghost.over ? label : 'Lâche sur la scène'}</Text>
            </View>
          </View>
        );
      })()}
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
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  linkBox: { width: 520, maxWidth: '94%', borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  linkCard: { borderWidth: 2, borderRadius: 14, padding: 10, gap: 3 },
  x: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  xs: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
});
