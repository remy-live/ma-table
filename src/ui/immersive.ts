// Cache les boutons de navigation Android (mode immersif). Rien sur iPhone.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type Native = { set(on: boolean): void };
const mod: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('Immersive') : null;
export const canImmersive = !!mod;
export function setImmersive(on: boolean) {
  try { mod?.set(on); } catch { /* ignoré */ }
}
