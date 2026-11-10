// Avant / Après : on garde l'état d'un groupe de réglages quand l'écran s'ouvre.
// Un appui sur « Avant » remet ces valeurs (on entend la différence), un autre
// appui revient aux nouveaux réglages. Toucher un réglage pendant « Avant »
// repart de là.
import { useEffect, useRef, useState } from 'react';
import { OscValue } from '../osc/osc';
import { argFor, XAirClient } from '../xair/XAirClient';

type Snap = Map<string, OscValue>;
const snap = (client: XAirClient, paths: string[]): Snap => {
  const m: Snap = new Map();
  for (const p of paths) { const v = client.get(p); if (v !== undefined) m.set(p, v); }
  return m;
};
const differs = (a: Snap, b: Snap) => [...a].some(([p, v]) => b.get(p) !== v);

export function useAB(client: XAirClient, paths: string[], key: string) {
  const before = useRef<Snap | null>(null);
  const after = useRef<Snap | null>(null);
  const applying = useRef(false);
  const [mode, setMode] = useState<'apres' | 'avant'>('apres');
  const [changed, setChanged] = useState(false);
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  useEffect(() => {
    // l'état « avant » est pris un instant après l'ouverture (le temps que la table réponde)
    before.current = null;
    after.current = null;
    setMode('apres');
    setChanged(false);
    const t = setTimeout(() => { before.current = snap(client, pathsRef.current); }, 700);
    const set = new Set(pathsRef.current);
    const off = client.on('*', (_v, p) => {
      if (!set.has(p) || applying.current || !before.current) return;
      // un vrai réglage : on est forcément sur « Après »
      setMode('apres');
      after.current = null;
      setChanged(differs(before.current, snap(client, pathsRef.current)));
    });
    return () => { clearTimeout(t); off(); };
  }, [client, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (m: Snap) => {
    applying.current = true;
    m.forEach((v, p) => client.set(p, argFor(p, v)));
    setTimeout(() => { applying.current = false; }, 300);
  };
  const toggle = () => {
    if (!before.current) return;
    if (mode === 'apres') {
      after.current = snap(client, pathsRef.current);
      apply(before.current);
      setMode('avant');
    } else if (after.current) {
      apply(after.current);
      setMode('apres');
    }
  };
  return { mode, changed: changed || mode === 'avant', toggle };
}
