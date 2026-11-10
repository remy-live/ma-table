// Hook React : lit une adresse de la table et la met à jour en direct.
import { useCallback, useEffect, useState } from 'react';
import { f, i, s, OscValue } from '../osc/osc';
import { XAirClient } from './XAirClient';

export function useParam<T extends OscValue>(client: XAirClient, path: string, fallback: T) {
  const [value, setValue] = useState<T>((client.get(path) as T) ?? fallback);
  useEffect(() => {
    setValue((client.get(path) as T) ?? fallback);
    return client.on(path, (v) => setValue((v as T) ?? fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, path]);
  return value;
}

export function useFader(client: XAirClient, path: string) {
  const v = useParam<number>(client, path, 0);
  const set = useCallback((x: number) => client.set(path, f(Math.max(0, Math.min(1, x)))), [client, path]);
  return [v, set] as const;
}

/** Sur la X Air, mix/on = 1 veut dire « voie active » (0 = coupée). */
export function useMute(client: XAirClient, path: string) {
  const on = useParam<number>(client, path, 1);
  const toggle = useCallback(() => client.set(path, i(on ? 0 : 1)), [client, path, on]);
  return [on === 0, toggle] as const;
}

export function useName(client: XAirClient, path: string) {
  const v = useParam<string>(client, path, '');
  const set = useCallback((n: string) => client.set(path, s(n.slice(0, 12))), [client, path]);
  return [v, set] as const;
}

/** Comme useParam, mais renvoie undefined tant que la table n'a pas répondu
 *  (ex. pas de préampli micro sur cette entrée). */
export function useParamOpt(client: XAirClient, path: string): OscValue | undefined {
  const [value, setValue] = useState<OscValue | undefined>(client.get(path));
  useEffect(() => {
    setValue(client.get(path));
    return client.on(path, (v) => setValue(v));
  }, [client, path]);
  return value;
}

/** Solo : 1 = la voie est écoutée seule au casque. */
export function useSolo(client: XAirClient, path: string) {
  const on = Number(useParam<number>(client, path, 0)) === 1;
  const toggle = useCallback(() => client.set(path, i(on ? 0 : 1)), [client, path, on]);
  return [on, toggle] as const;
}
