// L'enregistreur de concert : la tablette lit la table par l'USB et écrit un
// fichier par voie choisie. Ici : l'état partagé (l'enregistrement continue
// quand on ferme l'écran), les repères de morceaux et les notes de chaque concert.
import { i } from '../osc/osc';
import { load, save } from '../store/persist';
import { chNamePath, chOnPath, fToPan, MODEL, panPath } from './addresses';
import { guessRole, ROLES } from './listen';
import { RecSummary, usbListen as usbAudio } from './usbAudio';
import { XAirClient } from './XAirClient';

export interface RecTrack { ch: number; name: string; file: string; stereo?: boolean; pan: number }
export interface Marker { t: number; label: string }
export interface RecMeta { name: string; startedAt: number; tracks: RecTrack[]; markers: Marker[]; facade: boolean; seconds?: number; rate?: number; clips?: number[]; peakDb?: number[]; reason?: string; holes?: number; maxGapMs?: number; usbErrors?: number; mix?: import('./listen').MixState }
export interface RecState { on: boolean; starting: boolean; id: string; dir: string; isPublic: boolean; t: number; peaks: number[]; clips: number[]; hot: number[]; usbErrors: number; writeErrors: number; free: number; meta: RecMeta | null; error: string; armed: { name: string; chans: number[]; facade: boolean } | null; askName: string | null; last: { id: string; reason: string; seconds: number } | null }

const empty = (): RecState => ({ on: false, starting: false, id: '', dir: '', isPublic: true, t: 0, peaks: [], clips: [], hot: [], usbErrors: 0, writeErrors: 0, free: 0, meta: null, error: '', armed: null, askName: null, last: null });
let st: RecState = empty();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const put = (p: Partial<RecState>) => { st = { ...st, ...p }; emit(); };

export const recState = () => st;
export const onRec = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const recAvailable = () => !!usbAudio;

const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (s: number) => { const x = Math.max(0, Math.floor(s)); const h = Math.floor(x / 3600); return `${h ? h + ':' : ''}${h ? pad2(Math.floor(x / 60) % 60) : Math.floor(x / 60)}:${pad2(x % 60)}`; };
export const defaultName = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}h${pad2(d.getMinutes())} Concert`;

/** Octets par seconde pour une liste de pistes (24 bits, 48 kHz). */
export const bytesPerSec = (tracks: { stereo?: boolean }[]) => tracks.reduce((a, t) => a + (t.stereo ? 2 : 1) * 144000, 0);
export const hoursLeft = (free: number, tracks: { stereo?: boolean }[]) => { const b = bytesPerSec(tracks); return b ? free / b / 3600 : 0; };

export interface Candidate { ch: number; name: string; named: boolean; muted: boolean }
/** Les 16 voies de la table, avec celles qui ont un nom (donc utilisées) en premier choix. */
export function candidates(client: XAirClient): Candidate[] {
  return Array.from({ length: 16 }, (_, k) => {
    const name = String(client.get(chNamePath(k + 1)) ?? '').trim();
    return { ch: k + 1, name, named: !!name, muted: Number(client.get(chOnPath(k + 1)) ?? 1) === 0 };
  });
}

// Façade sur les pistes USB 17-18 : la table y envoie son mélange général (L = 36, R = 37 dans sa liste de sources).
const USB17 = '/routing/usb/17/src';
const USB18 = '/routing/usb/18/src';
export const facadePossible = () => MODEL.family === 'xair';
export async function setFacade(client: XAirClient, on: boolean) {
  if (!facadePossible()) return;
  try {
    await client.loadPaths([USB17, USB18], false);
    const cur: [number, number] = [Number(client.get(USB17) ?? 16), Number(client.get(USB18) ?? 17)];
    const prev = await load<[number, number] | null>('usbFacadePrev', null);
    if (on) {
      if (cur[0] !== 36 || cur[1] !== 37) {
        if (!prev) await save('usbFacadePrev', cur);
        client.set(USB17, i(36));
        client.set(USB18, i(37));
      }
    } else if (prev && cur[0] === 36 && cur[1] === 37) {
      client.set(USB17, i(prev[0]));
      client.set(USB18, i(prev[1]));
      await save('usbFacadePrev', null);
    }
  } catch {
    // table muette : on enregistre quand même les voies
  }
}

const saveMeta = () => { if (st.id && st.meta) usbAudio?.metaSave(st.id, JSON.stringify(st.meta)); };

let wired = false;
function wire() {
  if (wired || !usbAudio) return;
  wired = true;
  usbAudio.addListener('onRec', (e) => {
    if (e.ended) {
      const s = e.summary;
      if (st.meta && s) { st.meta = { ...st.meta, seconds: s.seconds, rate: s.rate, clips: s.clips, peakDb: s.peakDb, reason: s.reason, holes: s.holes, maxGapMs: s.maxGapMs, usbErrors: s.usbErrors }; saveMeta(); }
      put({ on: false, starting: false, askName: st.on && s && s.seconds > 3 ? st.id : st.askName, last: st.on ? { id: st.id, reason: s?.reason || e.error || '', seconds: s?.seconds ?? st.t } : st.last, error: e.error ?? '' });
      return;
    }
    if (!st.on) return;
    const clips = e.clips ?? [];
    // voies qui viennent de saturer (depuis le dernier point)
    const hot = clips.map((c, k) => (c > (st.clips[k] ?? 0) ? k : -1)).filter((k) => k >= 0 && st.meta?.tracks.some((t) => t.ch === k || (t.stereo && t.ch + 1 === k)));
    put({ t: e.t ?? st.t, peaks: e.peaks ?? st.peaks, clips, hot: hot.length ? hot : st.t - lastHot > 4 ? [] : st.hot, usbErrors: e.usbErrors ?? 0, writeErrors: e.writeErrors ?? 0, free: e.free ?? st.free });
    if (hot.length) lastHot = st.t;
  });
}
let lastHot = 0;

/** Lance l'enregistrement des voies choisies (numéros 1-16), avec ou sans la façade en stéréo. */
export async function startRec(client: XAirClient, name: string, chans: number[], facade: boolean, aux: boolean): Promise<string> {
  if (!usbAudio) return 'Enregistrement possible seulement sur la tablette Android.';
  if (st.on || st.starting) return 'Un enregistrement est déjà en cours.';
  wire();
  put({ ...empty(), starting: true, armed: st.armed });
  await client.loadPaths(chans.map(panPath), false).catch(() => {});
  if (facade) await setFacade(client, true);
  const tracks: RecTrack[] = chans.map((ch) => {
    const nm = String(client.get(chNamePath(ch)) ?? '').trim();
    const pan = fToPan(Number(client.get(panPath(ch)) ?? 0.5)) / 100;
    return { ch: ch - 1, name: nm || `Piste ${ch}`, file: `${pad2(ch)} ${nm || 'Piste'}`, pan };
  });
  if (facade) tracks.push({ ch: 16, name: 'Façade', file: 'Façade (stéréo)', stereo: true, pan: 0 });
  else if (aux) tracks.push({ ch: 16, name: 'Entrée ligne 17-18', file: '17-18 Entrée ligne (stéréo)', stereo: true, pan: 0 });
  const r = await usbAudio.recStart({ name, tracks: tracks.map((t) => ({ file: t.file, a: t.ch, b: t.stereo ? t.ch + 1 : -1 })) });
  if (!r.ok) { put({ starting: false, error: r.error }); return r.error || 'Impossible de démarrer.'; }
  const meta: RecMeta = { name, startedAt: Date.now(), tracks, markers: [{ t: 0, label: 'Morceau 1' }], facade, rate: r.rate };
  put({ on: true, starting: false, armed: null, id: r.id ?? name, dir: r.dir ?? '', isPublic: !!r.public, meta, t: 0 });
  saveMeta();
  return '';
}

// « Armer » : tout est choisi, on retourne sur la table, et on démarre depuis la télécommande.
let armedClient: XAirClient | null = null;
export function arm(client: XAirClient, name: string, chans: number[], facade: boolean) {
  if (st.on || st.starting) return;
  armedClient = client;
  put({ armed: { name, chans, facade }, error: '' });
}
export function disarm() { armedClient = null; put({ armed: null }); }
export async function startArmed(): Promise<string> {
  const a = st.armed;
  if (!a || !armedClient) return 'Rien n’est prêt.';
  const err = await startRec(armedClient, a.name, a.chans, a.facade, false);
  if (err) put({ armed: a }); // raté (câble ?) : on reste prêt pour réessayer
  return err;
}

/** À l'arrêt d'une prise, l'appli propose de lui donner un nom : c'est fait (ou refusé). */
export const clearAskName = () => put({ askName: null });

export async function stopRec(): Promise<RecSummary | null> {
  if (!usbAudio || !st.on) return null;
  return usbAudio.recStop();
}

/** « Morceau suivant » : pose un repère à l'instant présent. */
export function mark() {
  if (!st.on || !st.meta) return;
  const last = st.meta.markers[st.meta.markers.length - 1];
  if (last && st.t - last.t < 3) return; // double appui
  st.meta = { ...st.meta, markers: [...st.meta.markers, { t: st.t, label: `Morceau ${st.meta.markers.length + 1}` }] };
  saveMeta();
  emit();
}

export const currentSong = () => st.meta?.markers[st.meta.markers.length - 1] ?? null;

/** Réglage de départ du mixage automatique, selon l'instrument reconnu au nom. */
export const autoTrim = (name: string): number => ROLES[guessRole(name)].trim;

export function parseMeta(json: string): RecMeta | null {
  try { const m = JSON.parse(json) as RecMeta; return m && Array.isArray(m.tracks) ? m : null; } catch { return null; }
}
