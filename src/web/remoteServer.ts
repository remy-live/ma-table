// « Sans l'appli » : la tablette reliée à la table sert une petite page web sur
// le Wi-Fi. Le musicien scanne un QR code, son navigateur ouvre « Mon retour »,
// et c'est la tablette qui parle à la table pour lui. Rien à installer.
//
// Serveur HTTP minimal sur un socket TCP (react-native-tcp-socket). Chaque
// invitation a une clé : sans elle, la page ne peut rien toucher.
import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
import { MonConfig, monitorPaths } from '../xair/monitor';
import { XAirClient } from '../xair/XAirClient';
import { handleRemote } from './remoteApi';

export const REMOTE_PORT = 8080;
let server: ReturnType<typeof TcpSocket.createServer> | null = null;
let client: XAirClient | null = null;
const invites = new Map<string, MonConfig>();
const listeners = new Set<() => void>();
let guests = 0;

export const remoteSupported = true;
export const remoteRunning = () => !!server;
export const remoteGuests = () => guests;
export function onRemote(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const tell = () => listeners.forEach((l) => l());

const key = () => Math.random().toString(36).slice(2, 8);

/** Une clé d'invitation pour ce musicien (la même tant que la config ne change pas). */
export function registerInvite(cfg: MonConfig): string {
  for (const [k, c] of invites) if (c.bus === cfg.bus) { invites.set(k, cfg); return k; }
  const k = key();
  invites.set(k, cfg);
  return k;
}

export async function myAddress(): Promise<string> {
  try { return await Network.getIpAddressAsync(); } catch { return ''; }
}

export async function startRemote(c: XAirClient): Promise<boolean> {
  client = c;
  if (server) return true;
  return new Promise((resolve) => {
    try {
      const s = TcpSocket.createServer((sock) => {
        let buf = '';
        sock.on('data', (d) => {
          buf += typeof d === 'string' ? d : d.toString('utf8');
          const end = buf.indexOf('\r\n\r\n');
          if (end < 0) return;
          const head = buf.slice(0, end);
          const len = Number(/content-length:\s*(\d+)/i.exec(head)?.[1] ?? 0);
          if (buf.length < end + 4 + len) return;
          const line = head.split('\r\n')[0] ?? '';
          const [method, url = '/'] = line.split(' ');
          buf = '';
          const { status, type, body } = handleRemote(client, invites, method, url);
          sock.write(`HTTP/1.1 ${status}\r\nContent-Type: ${type}; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${utf8Len(body)}\r\n\r\n${body}`, 'utf8', () => sock.end());
        });
        sock.on('error', () => {});
      });
      s.on('error', () => { server = null; tell(); resolve(false); });
      s.listen({ port: REMOTE_PORT, host: '0.0.0.0', reuseAddress: true }, () => { server = s; tell(); resolve(true); });
    } catch {
      resolve(false);
    }
  });
}

export function stopRemote() {
  try { server?.close(); } catch { /* déjà fermé */ }
  server = null;
  tell();
}

function utf8Len(s: string) {
  let n = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; k++; }
    else n += 3;
  }
  return n;
}

/** Charge ce dont la page a besoin (envois du bus). */
export function prepareInvite(c: XAirClient, cfg: MonConfig) {
  c.loadPaths(monitorPaths(cfg.bus));
}
