// Hook vumètre : lit une (ou deux) valeur(s) de /meters/1, à ~15 images/s
// pour ne pas surcharger le téléphone, avec retombée douce et témoin de saturation.
import { useEffect, useState } from 'react';
import { XAirClient } from './XAirClient';

export interface MeterState {
  level: number; // 0..1 (échelle -60..0 dB)
  db: number;
  clip: boolean; // a touché 0 dB dans les 1,5 dernières secondes
}

const FLOOR = -60;
const CLIP_DB = -0.5;

export const dbToMeter = (db: number) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR));

export function useMeter(client: XAirClient, indices: number[], frameMs = 66): MeterState {
  const [st, setSt] = useState<MeterState>({ level: 0, db: -90, clip: false });
  const key = indices.join(',');

  useEffect(() => {
    let shown = 0;
    let last = 0;
    let clipUntil = 0;
    const off = client.onMeters((m) => {
      const db = Math.max(...indices.map((k) => m[k] ?? -90));
      const now = Date.now();
      if (db >= CLIP_DB) clipUntil = now + 1500;
      const target = dbToMeter(db);
      // Monte tout de suite, redescend doucement (comme une vraie LED).
      shown = target > shown ? target : shown * 0.85 + target * 0.15;
      if (now - last < frameMs) return;
      last = now;
      setSt({ level: shown, db, clip: now < clipUntil });
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, frameMs]);

  return st;
}
