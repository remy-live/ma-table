// « 1 enceinte » ou « 2 enceintes » : se redessine quand le choix change.
import { useEffect, useState } from 'react';
import { isMono, onMonoChange } from '../xair/mono';
import { XAirClient } from '../xair/XAirClient';

export function useMono(client: XAirClient): boolean {
  const [m, setM] = useState(() => isMono(client));
  useEffect(() => onMonoChange(setM), []);
  return m;
}
