// Petits dessins des étapes d'une voie (onglets) : plus fiables que des
// symboles de police, qui s'affichent mal sur certaines tablettes Android.
import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type BlockKind = 'preset' | 'in' | 'hpf' | 'gate' | 'eq' | 'comp' | 'fx' | 'qui';

export function BlockIcon({ kind, color, size = 22 }: { kind: BlockKind; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'preset' && (
        // préréglages : des fiches rangées, avec une étoile
        <>
          <Rect x={3} y={6} width={13} height={15} rx={2} {...p} />
          <Path d="M7 3 H19 a2 2 0 0 1 2 2 V17" {...p} />
          <Path d="M9.5 10 L10.6 12.4 L13 12.7 L11.2 14.3 L11.7 16.8 L9.5 15.5 L7.3 16.8 L7.8 14.3 L6 12.7 L8.4 12.4 Z" fill={color} stroke="none" />
        </>
      )}
      {kind === 'in' && (
        <>
          {/* micro */}
          <Rect x={8.5} y={2.5} width={7} height={11} rx={3.5} {...p} />
          <Path d="M5.5 11a6.5 6.5 0 0 0 13 0" {...p} />
          <Line x1={12} y1={17.5} x2={12} y2={21} {...p} />
          <Line x1={8.5} y1={21} x2={15.5} y2={21} {...p} />
        </>
      )}
      {kind === 'hpf' && (
        // coupe-bas : la courbe monte puis reste à plat
        <>
          <Path d="M2.5 20 C6 20 7 9 11 8 L21.5 8" {...p} />
          <Line x1={2.5} y1={22} x2={21.5} y2={22} {...p} strokeWidth={1.2} opacity={0.5} />
        </>
      )}
      {kind === 'gate' && (
        // gate : une porte qui ne laisse passer que les sons assez forts
        <>
          <Rect x={4} y={3} width={16} height={18} rx={2} {...p} />
          <Path d="M9 3 V21" {...p} />
          <Circle cx={15.5} cy={12} r={1.3} fill={color} />
        </>
      )}
      {kind === 'eq' && (
        // égaliseur : trois curseurs
        <>
          {[6, 12, 18].map((x) => <Line key={x} x1={x} y1={3} x2={x} y2={21} {...p} strokeWidth={1.4} opacity={0.6} />)}
          <Rect x={3.5} y={12} width={5} height={3.4} rx={1.2} fill={color} />
          <Rect x={9.5} y={6} width={5} height={3.4} rx={1.2} fill={color} />
          <Rect x={15.5} y={15} width={5} height={3.4} rx={1.2} fill={color} />
        </>
      )}
      {kind === 'comp' && (
        // compresseur : deux flèches qui resserrent le niveau
        <>
          <Path d="M12 2.5 V9 M8.5 6 L12 9.5 L15.5 6" {...p} />
          <Path d="M12 21.5 V15 M8.5 18 L12 14.5 L15.5 18" {...p} />
          <Line x1={4} y1={12} x2={20} y2={12} {...p} />
        </>
      )}
      {kind === 'fx' && (
        // effets : une étoile et ses échos
        <>
          <Path d="M10 3 L11.6 8.4 L17 10 L11.6 11.6 L10 17 L8.4 11.6 L3 10 L8.4 8.4 Z" {...p} />
          <Circle cx={18} cy={18} r={1.6} fill={color} />
          <Circle cx={20.5} cy={13.5} r={1} fill={color} />
        </>
      )}
      {kind === 'qui' && (
        // qui entend : un casque
        <>
          <Path d="M4 15 V12 a8 8 0 0 1 16 0 V15" {...p} />
          <Rect x={3} y={14} width={4.5} height={7} rx={1.8} {...p} />
          <Rect x={16.5} y={14} width={4.5} height={7} rx={1.8} {...p} />
        </>
      )}
    </Svg>
  );
}
