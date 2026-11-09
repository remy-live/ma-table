// Barre de navigation Android : on essaie de la cacher (plein écran) et, comme
// certaines tablettes refusent, on mesure la place qu'elle prend pour remonter
// le contenu au-dessus. Rien de tout ça sur iPhone.
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

type Native = { set(on: boolean): void; bottomInset?(): number };
const mod: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('Immersive') : null;
export const canImmersive = !!mod;
export function setImmersive(on: boolean) {
  try { mod?.set(on); } catch { /* ignoré */ }
}
/** La marge du bas, lue tout de suite (pour les feuilles qui s'ouvrent par-dessus). */
export function readInset(): number {
  if (Platform.OS === 'ios') return 16; // barre d'accueil
  try { return Math.max(0, Math.min(80, Math.round(mod?.bottomInset?.() ?? 0))); } catch { return 0; }
}

/** Marge à laisser en bas de l'écran, remesurée au démarrage, au retour dans l'appli et de temps en temps. */
export function useBottomInset(immersive: boolean): number {
  const [inset, setInset] = useState(readInset);
  useEffect(() => {
    const read = () => setInset(readInset());
    const timers = [300, 1000, 2500, 5000].map((ms) => setTimeout(read, ms));
    const every = setInterval(read, 4000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setTimeout(read, 500); });
    return () => { timers.forEach(clearTimeout); clearInterval(every); sub.remove(); };
  }, [immersive]);
  return inset;
}
