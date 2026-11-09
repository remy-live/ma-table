// Réseaux Wi-Fi vus par le téléphone. Android seulement (iOS ne le permet pas
// aux applis) ; demande la localisation, obligatoire pour lister le Wi-Fi.
import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export interface WifiNet { ssid: string; level: number; freq: number; table: boolean }
type Native = { scan(): Promise<{ ssid: string; level: number; freq: number }[]>; current(): string };

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

export async function scanWifi(): Promise<WifiNet[]> {
  if (!mod) return [];
  await askWifiPermission();
  const raw = await mod.scan();
  const best = new Map<string, WifiNet>();
  for (const n of raw) {
    if (!n.ssid) continue;
    const cur = best.get(n.ssid);
    if (!cur || n.level > cur.level) best.set(n.ssid, { ...n, table: looksLikeTable(n.ssid) });
  }
  return Array.from(best.values()).sort((a, b) => Number(b.table) - Number(a.table) || b.level - a.level);
}

export function currentWifi(): string {
  try { return mod ? mod.current() : ''; } catch { return ''; }
}

/** 0..4 barres selon la force (dBm). */
export const wifiBars = (dbm: number) => (dbm >= -55 ? 4 : dbm >= -67 ? 3 : dbm >= -78 ? 2 : 1);
