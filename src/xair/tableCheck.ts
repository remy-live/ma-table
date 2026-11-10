// « Vérifier ma table » : on essaie chaque fonction de l'appli sur la vraie table.
// Pour chaque réglage : on écrit une valeur, on la redemande à la table, on
// regarde si elle l'a bien gardée, puis on remet la valeur d'avant.
// Tout se fait sur la voie 16 et par de tout petits pas : on n'entend rien.
import { requireOptionalNativeModule } from 'expo';
import { f, i, OscArg, OscValue, s } from '../osc/osc';
import { canImmersive } from '../ui/immersive';
import { canScanWifi } from './wifiScan';
import { XAirClient } from './XAirClient';

export interface CheckResult { id: string; label: string; ok: boolean | null; detail: string }
export interface CheckStep { id: string; label: string; run: (c: XAirClient) => Promise<{ ok: boolean | null; detail: string }> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Redemande une adresse à la table et attend sa réponse. */
export function ask(client: XAirClient, path: string, ms = 1200): Promise<OscValue | undefined> {
  return new Promise((res) => {
    let done = false;
    const off = client.on(path, (v) => { if (done) return; done = true; clearTimeout(t); off(); res(v); });
    const t = setTimeout(() => { if (done) return; done = true; off(); res(undefined); }, ms);
    client.query(path);
  });
}

const same = (a: OscValue | undefined, b: OscValue) =>
  a !== undefined && (typeof b === 'number' ? Math.abs(Number(a) - b) < 0.02 : String(a) === String(b));

/** Écrit, relit, remet comme avant. */
async function writeRead(client: XAirClient, path: string, make: (old: OscValue | undefined) => OscArg, fallback?: OscValue) {
  const old = client.get(path) ?? (await ask(client, path)) ?? fallback;
  const arg = make(old);
  client.set(path, arg);
  await sleep(450); // laisse partir l'envoi et passer la garde anti-écho
  const got = await ask(client, path);
  if (old !== undefined) client.set(path, typeof old === 'string' ? s(old) : Number.isInteger(old) && arg.t === 'i' ? i(Number(old)) : f(Number(old)));
  await sleep(150);
  if (got === undefined) return { ok: false, detail: 'la table ne répond pas à cette adresse' };
  return same(got, arg.v as OscValue) ? { ok: true, detail: 'gardé par la table' } : { ok: false, detail: `envoyé ${String(arg.v)}, la table dit ${String(got)}` };
}

const nudge = (old: OscValue | undefined) => { const v = Number(old ?? 0.5); return f(v > 0.5 ? v - 0.01 : v + 0.01); };

export const CHECKS: CheckStep[] = [
  { id: 'reply', label: 'La table répond', run: async (c) => {
    const t0 = Date.now();
    const v = await ask(c, '/lr/mix/on', 2000);
    return v === undefined ? { ok: false, detail: 'pas de réponse en 2 s' } : { ok: true, detail: `${Date.now() - t0} ms` };
  } },
  { id: 'name', label: 'Noms des voies', run: (c) => writeRead(c, '/ch/16/config/name', () => s('TEST')) },
  { id: 'dca', label: 'Groupes (DCA)', run: (c) => writeRead(c, '/ch/16/grp/dca', (o) => i(Number(o ?? 0) ^ 8)) },
  { id: 'dcaname', label: 'Noms des groupes', run: (c) => writeRead(c, '/dca/4/config/name', (o) => s(String(o ?? '') === 'TEST' ? 'TEST2' : 'TEST')) },
  { id: 'main', label: 'Volume de la façade', run: (c) => writeRead(c, '/lr/mix/fader', nudge) },
  { id: 'bus', label: 'Volume d’un retour', run: (c) => writeRead(c, '/bus/1/mix/fader', nudge) },
  { id: 'send', label: 'Envoi d’une voie vers un retour', run: (c) => writeRead(c, '/ch/16/mix/01/level', nudge) },
  { id: 'pan', label: 'Gauche / droite (L/R)', run: (c) => writeRead(c, '/ch/16/mix/pan', nudge) },
  { id: 'eq', label: 'Égaliseur', run: (c) => writeRead(c, '/ch/16/eq/1/g', nudge) },
  { id: 'busname', label: 'Noms des retours', run: (c) => writeRead(c, '/bus/6/config/name', (o) => s(String(o ?? '') === 'TEST' ? 'TEST2' : 'TEST')) },
  { id: 'solo', label: 'Écoute au casque (solo)', run: (c) => writeRead(c, '/-stat/solosw/16', (o) => i(Number(o ?? 0) ? 0 : 1), 0) },
  { id: 'meters', label: 'Vumètres', run: async (c) => {
    let n = 0;
    c.startMeters();
    const off = c.onMeters(() => { n++; });
    await sleep(2000);
    off(); c.stopMeters();
    return n >= 5 ? { ok: true, detail: `${Math.round(n / 2)} images/s` } : { ok: false, detail: n ? `seulement ${n} images en 2 s` : 'rien reçu' };
  } },
  { id: 'rta', label: 'Analyseur (larsen, égaliseur)', run: async (c) => {
    let n = 0;
    c.startRta();
    const off = c.onRta(() => { n++; });
    await sleep(2000);
    off(); c.stopRta();
    return n >= 3 ? { ok: true, detail: `${Math.round(n / 2)} images/s` } : { ok: false, detail: n ? `seulement ${n} images en 2 s` : 'rien reçu' };
  } },
  { id: 'immersive', label: 'Cacher les boutons Android', run: async () => ({ ok: canImmersive ? true : null, detail: canImmersive ? 'module présent' : 'absent (normal hors Android)' }) },
  { id: 'wifi', label: 'Recherche des réseaux Wi-Fi', run: async () => ({ ok: canScanWifi ? true : null, detail: canScanWifi ? 'module présent' : 'absent (normal hors Android)' }) },
  { id: 'camera', label: 'Appareil photo (QR code)', run: async () => {
    const cam = requireOptionalNativeModule('ExpoCamera');
    return { ok: cam ? true : null, detail: cam ? 'module présent' : 'absent (normal sur le web)' };
  } },
];

/** Rapport en texte, à envoyer. */
export function reportText(client: XAirClient, res: CheckResult[], version: string): string {
  const inf = client.info;
  const lines = res.map((r) => `${r.ok === true ? '✓' : r.ok === false ? '✗' : '–'} ${r.label} : ${r.detail}`);
  return [`Ma table ${version} · ${inf?.model ?? '?'} ${inf?.name ?? ''} (${client.hostAddress}) · firmware ${inf?.firmware ?? '?'}`, new Date().toLocaleString('fr-FR'), ...lines].join('\n');
}
