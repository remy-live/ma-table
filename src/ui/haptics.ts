// Petite vibration quand un réglage passe par 0 dB (comme le cran d'un vrai potentiomètre).
import { Vibration } from 'react-native';

let enabled = true;
let last = 0;
export const setHaptics = (on: boolean) => { enabled = on; };
export function tick() {
  const now = Date.now();
  if (!enabled || now - last < 120) return;
  last = now;
  try { Vibration.vibrate(12); } catch { /* rien */ }
}
