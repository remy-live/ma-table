// Redessine au plus toutes les `ms` quand une valeur de la table change.
import { useEffect, useState } from 'react';
import { XAirClient } from '../xair/XAirClient';

export function useAnyTick(client: XAirClient, ms = 80) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let p: ReturnType<typeof setTimeout> | null = null;
    const off = client.on('*', () => {
      if (p) return;
      p = setTimeout(() => { p = null; setT((x) => x + 1); }, ms);
    });
    return () => { off(); if (p) clearTimeout(p); };
  }, [client, ms]);
  return t;
}

