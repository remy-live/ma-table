// Voix du téléphone (synthèse vocale) : l'appli dit qui doit jouer.
// Module natif : sans recompilation, on se tait au lieu de planter.
type SP = { speak(text: string, o?: { language?: string; rate?: number; onDone?: () => void; onError?: () => void }): void; stop(): Promise<void> };
let mod: SP | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-speech') as SP;
} catch {
  mod = null;
}

export const canSpeak = () => !!mod;

export function say(text: string, onDone?: () => void) {
  if (!mod) {
    onDone?.();
    return;
  }
  try {
    mod.stop().catch(() => {});
    mod.speak(text, { language: 'fr-FR', rate: 1.0, onDone, onError: onDone });
  } catch {
    onDone?.();
  }
}

export function hush() {
  try {
    mod?.stop().catch(() => {});
  } catch {
    // rien
  }
}
