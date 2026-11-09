// Sauvegarde locale (balance, ordre des voies, réglages de l'appli).
// Utilise AsyncStorage sur le téléphone ; si le module natif n'est pas
// encore compilé dans l'appli, on garde en mémoire et on le signale.

type Backend = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };

const memory = new Map<string, string>();
const memoryBackend: Backend = {
  async getItem(k) {
    return memory.get(k) ?? null;
  },
  async setItem(k, v) {
    memory.set(k, v);
  },
};

let backend: Backend = memoryBackend;
let persistent = false;
export const isPersistent = () => persistent;

/** Appelé une fois au démarrage de l'appli. */
export async function initStorage(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    const store: Backend = mod.default ?? mod;
    await store.setItem('__test', '1');
    backend = store;
    persistent = true;
  } catch {
    backend = memoryBackend;
    persistent = false;
  }
  return persistent;
}

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await backend.getItem('matable:' + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function save<T>(key: string, value: T): Promise<void> {
  try {
    await backend.setItem('matable:' + key, JSON.stringify(value));
  } catch {
    // ignoré : la sauvegarde ne doit jamais bloquer le son
  }
}

/** Pour les tests : repartir de zéro. */
export function _resetMemory() {
  memory.clear();
}
