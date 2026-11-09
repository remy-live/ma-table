// Réseaux Wi-Fi vus par le téléphone. Android seulement (iOS ne le permet pas
// aux applis) ; demande la localisation, obligatoire pour lister le Wi-Fi.
import { requireOptionalNativeModule } from 'expo';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

export interface WifiNet { ssid: string; level: number; freq: number; table: boolean }
type Raw = { ssid: string; level: number; freq: number };
type Native = { scan(): Promise<Raw[]>; scanFull?(): Promise<{ nets: Raw[]; started: boolean; fresh: boolean; locationOn: boolean; wifiOn: boolean }>; current(): string };
export interface ScanInfo { nets: WifiNet[]; hidden: number; note: string; fix?: 'location' | 'wifi' | 'permission' }

const mod: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('WifiScan') : null;
export const canScanWifi = !!mod;

/** Ressemble au Wi-Fi d'une table X Air (XR18-…, XR16-…, XR12-…, MR18-…). */
export const looksLikeTable = (ssid: string) => /^(XR|MR|X18)[-_ ]?\d{0,2}/i.test(ssid);

export async function askWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const perms: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const near = (PermissionsAndroid.PERMISSIONS as Record<string, string>).NEARBY_WIFI_DEVICES;
  if (Number(Platform.Version) >= 33 && near) perms.push(near);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(r).some((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

export async function scanWifi(): Promise<ScanInfo> {
  if (!mod) return { nets: [], hidden: 0, note: '' };
  const granted = await askWifiPermission();
  let raw: Raw[] = [];
  let note = '';
  let fix: ScanInfo['fix'];
  if (mod.scanFull) {
    const r = await mod.scanFull();
    raw = r.nets;
    if (!r.wifiOn) { note = 'Le Wi-Fi du téléphone est éteint.'; fix = 'wifi'; }
    else if (!r.locationOn) { note = 'Android cache les Wi-Fi tant que la localisation du téléphone est éteinte (il ne laisse aucune appli l’allumer elle-même).'; fix = 'location'; }
    else if (!r.started || !r.fresh) note = 'Android limite les recherches (4 toutes les 2 minutes) : liste de la dernière recherche.';
  } else raw = await mod.scan();
  if (!granted) { note = 'Autorise « Position » pour Ma table, sinon Android cache les Wi-Fi.'; fix = 'permission'; }
  const hidden = raw.filter((n) => !n.ssid).length;
  const best = new Map<string, WifiNet>();
  for (const n of raw) {
    if (!n.ssid) continue;
    const cur = best.get(n.ssid);
    if (!cur || n.level > cur.level) best.set(n.ssid, { ...n, table: looksLikeTable(n.ssid) });
  }
  return { nets: Array.from(best.values()).sort((a, b) => Number(b.table) - Number(a.table) || b.level - a.level), hidden, note, fix };
}

export function currentWifi(): string {
  try { return mod ? mod.current() : ''; } catch { return ''; }
}

/** 0..4 barres selon la force (dBm). */
export const wifiBars = (dbm: number) => (dbm >= -55 ? 4 : dbm >= -67 ? 3 : dbm >= -78 ? 2 : 1);

/** Ouvre l'écran Android qui règle le problème (localisation, Wi-Fi, ou la fiche de l'appli). */
export function openFix(fix: ScanInfo['fix']) {
  if (Platform.OS !== 'android') return;
  const intent = fix === 'location' ? 'android.settings.LOCATION_SOURCE_SETTINGS' : fix === 'wifi' ? 'android.settings.WIFI_SETTINGS' : null;
  if (intent) Linking.sendIntent(intent).catch(() => Linking.openSettings());
  else Linking.openSettings();
}
