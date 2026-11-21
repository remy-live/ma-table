// Démo web : pas de serveur possible dans un navigateur.
import { MonConfig } from '../xair/monitor';
import { XAirClient } from '../xair/XAirClient';
export const REMOTE_PORT = 8080;
export const remoteSupported = false;
export const remoteRunning = () => false;
export const remoteGuests = () => 0;
export function onRemote(l: () => void) { void l; return () => {}; }
export function registerInvite(cfg: MonConfig): string { void cfg; return 'demo'; }
export async function myAddress(): Promise<string> { return '192.168.1.20'; }
export async function startRemote(c: XAirClient): Promise<boolean> { void c; return false; }
export function stopRemote() {}
export function prepareInvite(c: XAirClient, cfg: MonConfig) { void c; void cfg; }
