// Partager TOUT entre deux téléphones : un fichier .matable ou un QR code animé.
//
// Le « paquet » contient la photo de la table (si on est connecté), le plan de
// scène, les soirées, la balance, mes réglages, mes effets, les modèles de
// mixage… Chez l'ami, rien n'est envoyé tout de suite à sa table : la photo
// devient une « préparation », proposée à la prochaine connexion (sans les
// gains ni le 48 V, comme toujours). Ses propres réglages sont mis de côté
// avant d'être remplacés (« avantImport »), pour pouvoir revenir en arrière.
//
// QR animé : le paquet est compressé (deflate), découpé en morceaux de
// ~250 caractères ; chaque image dit « MT3|id|k|n|morceau ». Le lecteur garde
// les morceaux reçus, dans n'importe quel ordre, jusqu'à les avoir tous.
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Snapshot } from '../xair/snapshot';
import { load, save } from './persist';

export const SHARE_KEYS = ['scene', 'soirees', 'soiree', 'balance', 'ordre', 'mesPresets', 'mixTemplates', 'mesEffets', 'jeuxEffets', 'fxNoms', 'salles', 'sceneShowOut', 'vueBranchements'] as const;
/** Listes qu'on fusionne au lieu de remplacer (les siennes restent). */
const MERGE = new Set(['soirees', 'mesPresets', 'mixTemplates', 'mesEffets', 'jeuxEffets', 'salles']);

export interface Bundle {
  app: 'Ma table';
  version: 3;
  date: string;
  /** la table de celui qui envoie (XR18, X32…) et son prénom s'il l'a donné */
  from: { model?: string; who?: string };
  snap?: Snapshot | null;
  keys: Partial<Record<(typeof SHARE_KEYS)[number], unknown>>;
}

export async function makeBundle(snap: Snapshot | null, model?: string, who?: string): Promise<Bundle> {
  const keys: Bundle['keys'] = {};
  for (const k of SHARE_KEYS) {
    const v = await load<unknown>(k, null);
    if (v !== null && v !== undefined) keys[k] = v;
  }
  return { app: 'Ma table', version: 3, date: new Date().toISOString(), from: { model, who }, snap, keys };
}

/** Ce que contient un paquet, en mots, pour la fenêtre « Garder ? ». */
export function describe(b: Bundle): string[] {
  const out: string[] = [];
  const n = b.snap ? Object.keys(b.snap.values).length : 0;
  if (n) out.push(`la table réglée (${n} réglages${b.from.model ? `, faite sur ${b.from.model}` : ''})`);
  if (b.keys.scene) out.push('le plan de scène et les câbles');
  const so = Array.isArray(b.keys.soirees) ? b.keys.soirees.length : 0;
  if (so) out.push(`${so} soirée${so > 1 ? 's' : ''}`);
  if (b.keys.balance) out.push('la balance');
  const mp = Array.isArray(b.keys.mesPresets) ? b.keys.mesPresets.length : 0;
  if (mp) out.push(`${mp} réglage${mp > 1 ? 's' : ''} perso`);
  if (b.keys.mixTemplates) out.push('les modèles de mixage');
  if (b.keys.mesEffets || b.keys.jeuxEffets) out.push('les effets');
  if (b.keys.salles) out.push('les salles');
  return out;
}

export function parseBundle(text: string): Bundle {
  const t = text.trim();
  const data = JSON.parse(t);
  if (data?.app !== 'Ma table') throw new Error('Ce n’est pas un fichier Ma table');
  if (data.version === 2) {
    // ancien export (une soirée) : on le range dans le nouveau format
    return { app: 'Ma table', version: 3, date: data.date, from: {}, snap: data.session?.snap ?? null, keys: { soirees: data.session ? [data.session] : undefined, balance: data.balance ?? undefined, ordre: data.ordre ?? undefined, mesPresets: data.mesPresets ?? undefined } };
  }
  if (data.version !== 3) throw new Error('Version de fichier inconnue : mets l’appli à jour');
  return data as Bundle;
}

const idOf = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : JSON.stringify(x));

/** Range le paquet chez soi. Renvoie la liste de ce qui a été gardé. */
export async function applyBundle(b: Bundle, savePrep: (snap: Snapshot) => Promise<void>): Promise<string[]> {
  // ses propres réglages d'abord mis de côté
  const before: Record<string, unknown> = {};
  for (const k of SHARE_KEYS) before[k] = await load<unknown>(k, null);
  await save('avantImport', { at: Date.now(), keys: before });
  for (const [k, v] of Object.entries(b.keys)) {
    if (v === undefined || v === null) continue;
    if (MERGE.has(k) && Array.isArray(v)) {
      const mine = (await load<unknown[]>(k, [])) ?? [];
      const ids = new Set(v.map(idOf));
      await save(k, [...v, ...mine.filter((x) => !ids.has(idOf(x)))].slice(0, 80));
    } else await save(k, v);
  }
  if (b.snap && Object.keys(b.snap.values).length) await savePrep({ ...b.snap, name: b.snap.name || 'Reçu' });
  return describe(b);
}

/** Revenir à ce qu'on avait avant le dernier import. */
export async function undoImport(): Promise<boolean> {
  const a = await load<{ keys: Record<string, unknown> } | null>('avantImport', null);
  if (!a) return false;
  for (const [k, v] of Object.entries(a.keys)) await save(k, v ?? null);
  await save('avantImport', null);
  return true;
}

// ---------- QR code animé ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(u: Uint8Array): string {
  let s = '';
  for (let k = 0; k < u.length; k += 3) {
    const a = u[k], b = u[k + 1] ?? 0, c = u[k + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (k + 1 < u.length ? B64[(n >> 6) & 63] : '=') + (k + 2 < u.length ? B64[n & 63] : '=');
  }
  return s;
}
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let k = 0; k < clean.length; k += 4) {
    const n = (B64.indexOf(clean[k]) << 18) | (B64.indexOf(clean[k + 1]) << 12) | ((B64.indexOf(clean[k + 2]) & 63) << 6) | (B64.indexOf(clean[k + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (k + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (k + 3 < clean.length) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

export const QR_CHUNK = 250; // QR moyen (~65 modules) : se lit vite, même de loin
/** Les images du QR animé pour un paquet. */
export function qrFrames(b: Bundle, chunk = QR_CHUNK): string[] {
  const z = toB64(deflateSync(strToU8(JSON.stringify(b)), { level: 9 }));
  const id = Math.random().toString(36).slice(2, 6);
  const n = Math.ceil(z.length / chunk);
  return Array.from({ length: n }, (_, k) => `MT3|${id}|${k + 1}|${n}|${z.slice(k * chunk, (k + 1) * chunk)}`);
}

/** Le lecteur : on lui donne chaque QR lu ; il dit où il en est et rend le paquet quand tout est là. */
export class QrCollector {
  private id = '';
  private n = 0;
  private parts = new Map<number, string>();
  /** null = ce QR n'est pas un morceau Ma table */
  add(text: string): { got: number; total: number; bundle?: Bundle } | null {
    const m = text.match(/^MT3\|([a-z0-9]+)\|(\d+)\|(\d+)\|(.*)$/s);
    if (!m) return null;
    const [, id, k, n, data] = m;
    if (id !== this.id) { this.id = id; this.n = Number(n); this.parts.clear(); }
    this.parts.set(Number(k), data);
    const res: { got: number; total: number; bundle?: Bundle } = { got: this.parts.size, total: this.n };
    if (this.parts.size === this.n) {
      const z = Array.from({ length: this.n }, (_, j) => this.parts.get(j + 1) ?? '').join('');
      res.bundle = parseBundle(strFromU8(inflateSync(fromB64(z))));
    }
    return res;
  }
  missing(): number[] { return Array.from({ length: this.n }, (_, j) => j + 1).filter((j) => !this.parts.has(j)); }
}
