// Réseau de la table : la faire rejoindre un Wi-Fi existant (partage de connexion
// du téléphone ou routeur), et la retrouver ensuite sur ce réseau.
//
// Adresses X Air (liste communautaire des commandes OSC) :
//   /-prefs/is/ssid      s  nom du Wi-Fi à rejoindre (« is » = infrastructure = client)
//   /-prefs/is/key       s  mot de passe
//   /-prefs/is/security  i  0 OPEN, 1 WEP, 2 WPA, 3 WPA2
//   /-prefs/is/mode      i  0 DHCP, 1 STATIC
// Le mode actif (point d'accès / client Wi-Fi / câble) se choisit avec
// l'interrupteur REMOTE à l'arrière de la table.

import { decode, encode, i, s } from '../osc/osc';
import { TableInfo, XAIR_PORT } from './XAirClient';
import { Remote, Transport } from './transport';
import { XAirClient } from './XAirClient';

export const IS = {
  ssid: '/-prefs/is/ssid',
  key: '/-prefs/is/key',
  security: '/-prefs/is/security',
  mode: '/-prefs/is/mode',
};

export const SECURITY = { open: 0, wep: 1, wpa: 2, wpa2: 3 } as const;

/** Enregistre dans la table le Wi-Fi qu'elle devra rejoindre en mode « client Wi-Fi ». */
export function writeWifiClient(client: XAirClient, ssid: string, key: string, security: number = SECURITY.wpa2) {
  client.set(IS.ssid, s(ssid.slice(0, 32)));
  client.set(IS.key, s(key.slice(0, 64)));
  client.set(IS.security, i(key ? security : SECURITY.open));
  client.set(IS.mode, i(0)); // DHCP : le téléphone ou le routeur donne l'adresse
}

export async function readWifiClient(client: XAirClient): Promise<{ ssid: string; security: number }> {
  await client.loadPaths([IS.ssid, IS.security], false);
  return { ssid: String(client.get(IS.ssid) ?? ''), security: Number(client.get(IS.security) ?? 3) };
}

/** Réseaux habituels d'un partage de connexion (iPhone, Android) + saisies de l'utilisateur. */
export const HOTSPOT_PREFIXES = ['172.20.10', '192.168.43', '192.168.49', '10.42.0'];

/**
 * Cherche une table en interrogeant chaque adresse d'un ou plusieurs réseaux /24.
 * Utile quand la diffusion ne passe pas (téléphone en point d'accès, iPhone).
 */
export async function sweep(transport: Transport, prefixes: string[], timeoutMs = 1200, port = XAIR_PORT): Promise<TableInfo[]> {
  const found = new Map<string, TableInfo>();
  await transport.open((bytes, from: Remote) => {
    const m = decode(bytes);
    if (m && m.address === '/xinfo') {
      const str = (k: number) => (typeof m.args[k] === 'string' ? (m.args[k] as string) : '');
      // L'adresse qui répond est la bonne, même si la table annonce autre chose.
      found.set(from.address, { ip: from.address, name: str(1) || 'Table X Air', model: str(2), firmware: str(3) });
    }
  });
  const q = encode('/xinfo');
  for (const p of prefixes) {
    for (let h = 1; h <= 254; h++) {
      transport.send(q, `${p}.${h}`, port);
      if (h % 32 === 0) await new Promise((r) => setTimeout(r, 5));
    }
  }
  await new Promise((r) => setTimeout(r, timeoutMs));
  transport.close();
  return [...found.values()];
}
