// Écran toujours allumé pendant qu'on pilote la table (sinon l'iPhone se
// verrouille au milieu d'une chanson). Module natif : si l'appli n'a pas encore
// été recompilée, on ne fait rien plutôt que de planter.
type KA = { activateKeepAwakeAsync(tag?: string): Promise<void>; deactivateKeepAwake(tag?: string): Promise<void> };
let mod: KA | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-keep-awake') as KA;
} catch {
  mod = null;
}

export function keepAwake(on: boolean) {
  try {
    const p = on ? mod?.activateKeepAwakeAsync('matable') : mod?.deactivateKeepAwake('matable');
    p?.catch(() => {});
  } catch {
    // module absent : rien
  }
}
