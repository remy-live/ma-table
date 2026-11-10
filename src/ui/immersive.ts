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
/** Place réservée en bas pour les boutons Android.
 *  'garde' : toujours au moins 48 (certaines tablettes ne disent pas qu'ils recouvrent l'appli),
 *  'auto'  : ce que mesure Android, 'aucune' : rien. */
export type NavRoom = 'garde' | 'auto' | 'aucune';
export const NAV_BAR = 48;
let room: NavRoom = 'garde';
export function setNavRoom(r: NavRoom | undefined) { room = r ?? 'garde'; }
export function measuredInset(): number {
  try { return Math.max(0, Math.min(80, Math.round(mod?.bottomInset?.() ?? 0))); } catch { return 0; }
}
/** La marge du bas, lue tout de suite (pour les feuilles qui s'ouvrent par-dessus). */
export function readInset(): number {
  if (Platform.OS === 'ios') return 16; // barre d'accueil
  if (Platform.OS !== 'android' || room === 'aucune') return 0;
  const m = measuredInset();
  return room === 'garde' ? Math.max(NAV_BAR, m) : m;
}

/** Marge à laisser en bas de l'écran, remesurée au démarrage, au retour dans l'appli et de temps en temps. */
export function useBottomInset(immersive: boolean, navRoom?: NavRoom): number {
  setNavRoom(navRoom);
  const [inset, setInset] = useState(readInset);
  useEffect(() => {
    const read = () => setInset(readInset());
    const timers = [300, 1000, 2500, 5000].map((ms) => setTimeout(read, ms));
    const every = setInterval(read, 4000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setTimeout(read, 500); });
    return () => { timers.forEach(clearTimeout); clearInterval(every); sub.remove(); };
  }, [immersive, navRoom]);
  useEffect(() => { setInset(readInset()); }, [navRoom]);
  return inset;
}

/** Marge basse des fenêtres plein écran (elles s'ouvrent par-dessus la barre Android) : au moins 12. */
export const bottomPad = () => Math.max(12, readInset() + 8);
