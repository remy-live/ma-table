// QR code en un seul tracé SVG : assez rapide pour le QR animé (plusieurs images par seconde).
import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrMatrix } from './qrMatrix';

export function QrSvg({ value, size }: { value: string; size: number }) {
  const { d, n } = useMemo(() => {
    const m = qrMatrix(value);
    let p = '';
    m.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        const s = c;
        while (c + 1 < row.length && row[c + 1]) c++;
        p += `M${s + 4} ${r + 4}h${c - s + 1}v1h${-(c - s + 1)}z`;
      }
    });
    return { d: p, n: m.length + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
      <Path d={d} fill="#0B0D10" />
    </Svg>
  );
}
