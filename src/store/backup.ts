// Sauvegarde complète en un fichier : toutes les soirées, la scène, mes effets,
// les réglages de l'appli. On l'envoie où on veut (Google Drive, mail…) avec le
// menu de partage du téléphone, et on la reprend sur un autre appareil.
import { dumpAll, restoreAll } from './persist';

export interface FullBackup { app: 'Ma table'; kind: 'complète'; version: 1; date: string; data: Record<string, unknown> }

export async function makeBackup(): Promise<FullBackup> {
  return { app: 'Ma table', kind: 'complète', version: 1, date: new Date().toISOString(), data: await dumpAll() };
}

export const backupName = (d = new Date()) => `ma-table-${d.toISOString().slice(0, 10)}.json`;

/** Envoie la sauvegarde dans un fichier, via le menu de partage (Drive, mail…). */
export async function shareBackup(): Promise<void> {
  const b = await makeBackup();
  const text = JSON.stringify(b);
  try {
    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const f = new File(Paths.cache, backupName());
    f.create({ overwrite: true });
    f.writeSync(text);
    await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Sauvegarder Ma table', UTI: 'public.json' });
  } catch {
    // sans module de fichiers (aperçu, ancienne version) : on partage le texte
    const { Share } = await import('react-native');
    await Share.share({ message: text, title: backupName() });
  }
}

/** Choisit un fichier de sauvegarde et le reprend. Renvoie le nombre d'éléments repris, ou null si annulé. */
export async function pickAndRestore(): Promise<number | null> {
  const { File } = await import('expo-file-system');
  const r = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] } as never);
  if (!r || (r as { canceled?: boolean }).canceled) return null;
  const file = (r as { result: InstanceType<typeof File> }).result;
  return restoreText(await file.text());
}

export async function restoreText(text: string): Promise<number> {
  const b = JSON.parse(text) as FullBackup;
  if (b.app !== 'Ma table' || b.kind !== 'complète' || !b.data) throw new Error('format');
  return restoreAll(b.data);
}
